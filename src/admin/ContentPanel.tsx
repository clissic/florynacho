import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { MAX_GALLERY, type Gathering, type SiteContent } from '../content/defaultSite';
import { useApi } from '../lib/api';
import { parseSiteContent } from '../lib/content';
import { fromDateTimeLocal, toDateTimeLocal } from '../lib/dates';
import { mediaUrl } from '../lib/media';

const sectionLabels: { key: keyof SiteContent['sections']; label: string }[] = [
  { key: 'story', label: 'Historia' },
  { key: 'gallery', label: 'Galería' },
  { key: 'countdown', label: 'Cuenta regresiva' },
  { key: 'event', label: 'Fecha y lugar' },
  { key: 'dressCode', label: 'Vestimenta' },
  { key: 'rsvp', label: 'Confirmación' },
  { key: 'songs', label: 'Canciones' },
  { key: 'messages', label: 'Mensajes' },
  { key: 'gifts', label: 'Regalos' },
];

export function ContentPanel() {
  const api = useApi();
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.getDraft().then(setDraft).catch((reason: Error) => setMessage(reason.message));
  }, [api]);

  if (!api || !draft) return <p className="loading">Cargando la personalización…</p>;

  function patch(partial: Partial<SiteContent>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  function patchGathering(kind: 'ceremony' | 'party', partial: Partial<Gathering>) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current[kind], ...partial };
      if (kind === 'party') {
        return {
          ...current,
          party: next,
          venue: { name: next.place, city: next.city, mapsUrl: next.mapsUrl },
          eventDate: partial.date !== undefined ? next.date : current.eventDate,
        };
      }
      return { ...current, ceremony: next };
    });
  }

  async function persist(next: SiteContent, note: string) {
    const parsed = parseSiteContent(next);
    if (!parsed) {
      setMessage('Revisá los textos. Hay un campo vacío o un enlace de mapa que no es de Google.');
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      await api?.saveDraft(parsed);
      setDraft(parsed);
      setMessage(note);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No pudimos guardar.');
    } finally {
      setBusy(false);
    }
  }

  const content = draft;
  function move(index: number, direction: -1 | 1) {
    const gallery = [...content.gallery];
    const target = index + direction;
    const current = gallery[index];
    const swap = gallery[target];
    if (!current || !swap) return;
    gallery[index] = swap;
    gallery[target] = current;
    patch({ gallery });
  }

  const cover = mediaUrl(content.coverImagePath, 'images');
  const music = mediaUrl(content.musicPath, 'audio');

  return (
    <section className="canvas-section customize">
      <header className="canvas-head">
        <div>
          <p className="eyebrow">Personalizar</p>
          <h2>La invitación</h2>
        </div>
        <div className="canvas-tools">
          <button type="button" className="canvas-tool" disabled={busy} onClick={() => persist(draft, 'Guardamos el borrador.')}>
            <Icon name="save" />
            Guardar borrador
          </button>
          <button
            type="button"
            className="canvas-tool"
            disabled={busy}
            onClick={async () => {
              await persist(draft, 'Borrador listo para previsualizar.');
              window.open('/admin/preview', '_blank', 'noopener');
            }}
          >
            <Icon name="visibility" />
            Vista previa
          </button>
          <button
            type="button"
            className="btn btn-primary button"
            disabled={busy}
            onClick={async () => {
              const parsed = parseSiteContent(draft);
              if (!parsed || !api) {
                setMessage('Revisá los textos antes de publicar.');
                return;
              }
              setBusy(true);
              try {
                await api.saveDraft(parsed);
                await api.publish();
                setMessage('Publicamos los cambios. Ya se ven en la invitación.');
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : 'No pudimos publicar.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="publish" />
            Publicar
          </button>
        </div>
      </header>

      {message ? <p className="status" role="status">{message}</p> : null}

      <div className="customize-stack">
        <section className="customize-block">
          <h3 className="canvas-sub">Novios y plazos</h3>
          <div className="customize-fields is-split">
            <label className="field">
              Primer nombre
              <input value={draft.couple.first} onChange={(event) => patch({ couple: { ...draft.couple, first: event.target.value } })} />
            </label>
            <label className="field">
              Segundo nombre
              <input value={draft.couple.second} onChange={(event) => patch({ couple: { ...draft.couple, second: event.target.value } })} />
            </label>
            <label className="field">
              Fecha y hora de la fiesta
              <input
                type="datetime-local"
                value={toDateTimeLocal(draft.eventDate)}
                onChange={(event) => {
                  const eventDate = fromDateTimeLocal(event.target.value);
                  patch({ eventDate, party: { ...draft.party, date: eventDate } });
                }}
              />
            </label>
            <label className="field">
              Límite para confirmar
              <input type="date" value={draft.rsvpDeadline} onChange={(event) => patch({ rsvpDeadline: event.target.value })} />
            </label>
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Ceremonia</h3>
          <GatheringFields value={draft.ceremony} onChange={(partial) => patchGathering('ceremony', partial)} />
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Fiesta</h3>
          <GatheringFields value={draft.party} onChange={(partial) => patchGathering('party', partial)} />
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Vestimenta</h3>
          <div className="customize-fields">
            <label className="field">
              Etiqueta
              <input value={draft.dressCode.label} onChange={(event) => patch({ dressCode: { ...draft.dressCode, label: event.target.value } })} />
            </label>
            <div className="customize-fields is-split">
              <label className="field">
                Nota para mujeres
                <textarea value={draft.dressCode.women} onChange={(event) => patch({ dressCode: { ...draft.dressCode, women: event.target.value } })} rows={2} />
              </label>
              <label className="field">
                Nota para hombres
                <textarea value={draft.dressCode.men} onChange={(event) => patch({ dressCode: { ...draft.dressCode, men: event.target.value } })} rows={2} />
              </label>
            </div>
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Textos</h3>
          <div className="customize-fields">
            <label className="field">
              Historia
              <textarea value={draft.story} onChange={(event) => patch({ story: event.target.value })} rows={6} />
            </label>
            <label className="field">
              Cierre
              <textarea value={draft.closing} onChange={(event) => patch({ closing: event.target.value })} rows={3} />
            </label>
            <label className="field">
              Texto de regalos
              <textarea value={draft.gifts.intro} onChange={(event) => patch({ gifts: { ...draft.gifts, intro: event.target.value } })} rows={3} />
            </label>
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Cuentas para regalos</h3>
          <div className="customize-accounts">
            {draft.gifts.accounts.map((account, index) => (
              <div className="customize-account" key={index}>
                <p className="customize-account-label">Cuenta {index + 1}</p>
                <div className="customize-fields is-split">
                  {(['bank', 'currency', 'holder', 'account'] as const).map((key) => (
                    <label className="field" key={key}>
                      {key === 'bank' ? 'Banco' : key === 'currency' ? 'Moneda' : key === 'holder' ? 'Titular' : 'Cuenta'}
                      <input
                        value={account[key]}
                        onChange={(event) => {
                          const accounts = draft.gifts.accounts.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, [key]: event.target.value } : item,
                          );
                          patch({ gifts: { ...draft.gifts, accounts } });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Secciones visibles</h3>
          <p className="hint">Elegí qué partes se muestran en la invitación publicada.</p>
          <div className="customize-checks">
            {sectionLabels.map((section) => (
              <label className="customize-check" key={section.key}>
                <input
                  type="checkbox"
                  checked={draft.sections[section.key]}
                  onChange={(event) => patch({ sections: { ...draft.sections, [section.key]: event.target.checked } })}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Portada</h3>
          <p className="hint">Si no subís imagen, se muestra la ilustración Delft.</p>
          <div className="customize-media">
            {cover ? <img className="customize-thumb" src={cover} alt="" /> : <div className="customize-thumb is-empty">Ilustración</div>}
            <div className="customize-media-actions">
              <label className="canvas-tool customize-file">
                <Icon name="upload" />
                Subir imagen
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file || !api) return;
                    setBusy(true);
                    try {
                      const path = await api.uploadImage(file, 'cover');
                      if (draft.coverImagePath) await api.deleteMedia(draft.coverImagePath, 'image');
                      await persist({ ...draft, coverImagePath: path }, 'Actualizamos la portada en el borrador.');
                    } catch (reason) {
                      setMessage(reason instanceof Error ? reason.message : 'No pudimos subir la portada.');
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {draft.coverImagePath ? (
                <button
                  type="button"
                  className="canvas-tool is-danger"
                  onClick={async () => {
                    if (!api || !draft.coverImagePath) return;
                    await api.deleteMedia(draft.coverImagePath, 'image');
                    await persist({ ...draft, coverImagePath: null }, 'Volvimos a la ilustración.');
                  }}
                >
                  <Icon name="delete" />
                  Quitar portada
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Música</h3>
          <p className="hint">Subí un archivo que tengan derecho a usar. Se escucha solo después de que el invitado abre la invitación.</p>
          <div className="customize-fields">
            <label className="field">
              Nombre de la pista
              <input value={draft.musicTitle} onChange={(event) => patch({ musicTitle: event.target.value })} />
            </label>
          </div>
          <div className="customize-media">
            {music ? <audio className="customize-audio" controls src={music} preload="none" /> : <p className="hint">Todavía no hay música.</p>}
            <div className="customize-media-actions">
              <label className="canvas-tool customize-file">
                <Icon name="upload" />
                Subir audio
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.wav"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file || !api) return;
                    setBusy(true);
                    try {
                      const path = await api.uploadMusic(file);
                      if (draft.musicPath) await api.deleteMedia(draft.musicPath, 'audio');
                      await persist({ ...draft, musicPath: path }, 'Actualizamos la música en el borrador.');
                    } catch (reason) {
                      setMessage(reason instanceof Error ? reason.message : 'No pudimos subir la música.');
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {draft.musicPath ? (
                <button
                  type="button"
                  className="canvas-tool is-danger"
                  onClick={async () => {
                    if (!api || !draft.musicPath) return;
                    await api.deleteMedia(draft.musicPath, 'audio');
                    await persist({ ...draft, musicPath: null }, 'Quitamos la música.');
                  }}
                >
                  <Icon name="delete" />
                  Quitar música
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="customize-block">
          <h3 className="canvas-sub">Galería</h3>
          <p className="hint">Hasta {MAX_GALLERY} fotos. JPG, PNG o WebP, de hasta 8 MB. Se publican junto con el resto.</p>
          <div className="customize-gallery">
            {draft.gallery.map((photo, index) => (
              <article className="gallery-edit" key={`${photo.path}-${index}`}>
                <img src={mediaUrl(photo.path, 'images') ?? ''} alt="" />
                <label className="field">
                  Descripción
                  <input
                    value={photo.alt}
                    onChange={(event) => {
                      const gallery = draft.gallery.map((item, itemIndex) => (itemIndex === index ? { ...item, alt: event.target.value } : item));
                      patch({ gallery });
                    }}
                  />
                </label>
                <div className="gallery-edit-actions">
                  <button type="button" className="icon-action" aria-label="Subir" title="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                    <Icon name="arrow_upward" />
                  </button>
                  <button type="button" className="icon-action" aria-label="Bajar" title="Bajar" disabled={index === draft.gallery.length - 1} onClick={() => move(index, 1)}>
                    <Icon name="arrow_downward" />
                  </button>
                  <button
                    type="button"
                    className="icon-action is-danger"
                    aria-label="Eliminar"
                    title="Eliminar"
                    onClick={async () => {
                      if (!api) return;
                      await api.deleteMedia(photo.path, 'image');
                      await persist({ ...draft, gallery: draft.gallery.filter((_, itemIndex) => itemIndex !== index) }, 'Quitamos la fotografía.');
                    }}
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <label className="canvas-tool customize-file">
            <Icon name="add_photo_alternate" />
            Agregar fotografía
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file || !api) return;
                if (draft.gallery.length >= MAX_GALLERY) {
                  setMessage('La galería admite hasta 24 fotografías.');
                  return;
                }
                setBusy(true);
                try {
                  const path = await api.uploadImage(file, 'gallery');
                  await persist({ ...draft, gallery: [...draft.gallery, { path, alt: '' }] }, 'Agregamos la fotografía al borrador.');
                } catch (reason) {
                  setMessage(reason instanceof Error ? reason.message : 'No pudimos subir la fotografía.');
                  setBusy(false);
                }
              }}
            />
          </label>
        </section>
      </div>
    </section>
  );
}

function GatheringFields({ value, onChange }: { value: Gathering; onChange: (partial: Partial<Gathering>) => void }) {
  return (
    <div className="customize-fields is-split">
      <label className="field">
        Fecha y hora
        <input type="datetime-local" value={toDateTimeLocal(value.date)} onChange={(event) => onChange({ date: fromDateTimeLocal(event.target.value) })} />
      </label>
      <label className="field">
        Lugar
        <input value={value.place} onChange={(event) => onChange({ place: event.target.value })} />
      </label>
      <label className="field">
        Ciudad
        <input value={value.city} onChange={(event) => onChange({ city: event.target.value })} />
      </label>
      <label className="field">
        Enlace de Google Maps
        <input value={value.mapsUrl} onChange={(event) => onChange({ mapsUrl: event.target.value })} />
      </label>
    </div>
  );
}
