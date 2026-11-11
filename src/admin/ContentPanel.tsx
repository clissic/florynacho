import { useEffect, useState } from 'react';
import { MAX_GALLERY, type SiteContent } from '../content/defaultSite';
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

  const cover = mediaUrl(draft.coverImagePath, 'images');
  const music = mediaUrl(draft.musicPath, 'audio');

  return (
    <section className="admin-section">
      <div className="section-head">
        <h2>Personalizar</h2>
        <div className="action-row">
          <button type="button" className="btn btn-outline-primary button button-secondary" disabled={busy} onClick={() => persist(draft, 'Guardamos el borrador.')}>
            Guardar borrador
          </button>
          <button
            type="button"
            className="btn btn-outline-primary button button-secondary"
            disabled={busy}
            onClick={async () => {
              await persist(draft, 'Borrador listo para previsualizar.');
              window.open('/admin/preview', '_blank', 'noopener');
            }}
          >
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
            Publicar
          </button>
        </div>
      </div>
      <p className="status" role="status">{message}</p>
      <div className="stack-form">
        <label className="field">Primer nombre
          <input value={draft.couple.first} onChange={(event) => patch({ couple: { ...draft.couple, first: event.target.value } })} />
        </label>
        <label className="field">Segundo nombre
          <input value={draft.couple.second} onChange={(event) => patch({ couple: { ...draft.couple, second: event.target.value } })} />
        </label>
        <label className="field">Fecha y hora
          <input
            type="datetime-local"
            value={toDateTimeLocal(draft.eventDate)}
            onChange={(event) => patch({ eventDate: fromDateTimeLocal(event.target.value) })}
          />
        </label>
        <label className="field">Límite para confirmar
          <input type="date" value={draft.rsvpDeadline} onChange={(event) => patch({ rsvpDeadline: event.target.value })} />
        </label>
        <label className="field">Lugar
          <input value={draft.venue.name} onChange={(event) => patch({ venue: { ...draft.venue, name: event.target.value } })} />
        </label>
        <label className="field">Ciudad
          <input value={draft.venue.city} onChange={(event) => patch({ venue: { ...draft.venue, city: event.target.value } })} />
        </label>
        <label className="field">Enlace de Google Maps
          <input value={draft.venue.mapsUrl} onChange={(event) => patch({ venue: { ...draft.venue, mapsUrl: event.target.value } })} />
        </label>
        <label className="field">Vestimenta
          <input value={draft.dressCode.label} onChange={(event) => patch({ dressCode: { ...draft.dressCode, label: event.target.value } })} />
        </label>
        <label className="field">Nota para mujeres
          <textarea value={draft.dressCode.women} onChange={(event) => patch({ dressCode: { ...draft.dressCode, women: event.target.value } })} rows={2} />
        </label>
        <label className="field">Nota para hombres
          <textarea value={draft.dressCode.men} onChange={(event) => patch({ dressCode: { ...draft.dressCode, men: event.target.value } })} rows={2} />
        </label>
        <label className="field">Historia
          <textarea value={draft.story} onChange={(event) => patch({ story: event.target.value })} rows={6} />
        </label>
        <label className="field">Cierre
          <textarea value={draft.closing} onChange={(event) => patch({ closing: event.target.value })} rows={3} />
        </label>
        <label className="field">Texto de regalos
          <textarea value={draft.gifts.intro} onChange={(event) => patch({ gifts: { ...draft.gifts, intro: event.target.value } })} rows={3} />
        </label>
        {draft.gifts.accounts.map((account, index) => (
          <fieldset key={index}>
            <legend>Cuenta {index + 1}</legend>
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
          </fieldset>
        ))}
        <fieldset>
          <legend>Secciones visibles</legend>
          {sectionLabels.map((section) => (
            <label className="check" key={section.key}>
              <input
                type="checkbox"
                checked={draft.sections[section.key]}
                onChange={(event) => patch({ sections: { ...draft.sections, [section.key]: event.target.checked } })}
              />
              {section.label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Portada</legend>
          {cover ? <img className="admin-thumb" src={cover} alt="" /> : <p className="hint">Ahora se muestra la ilustración.</p>}
          <label className="file-field">
            Subir imagen
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
              className="btn btn-link text-button"
              onClick={async () => {
                if (!api || !draft.coverImagePath) return;
                await api.deleteMedia(draft.coverImagePath, 'image');
                await persist({ ...draft, coverImagePath: null }, 'Volvimos a la ilustración.');
              }}
            >
              Quitar portada
            </button>
          ) : null}
        </fieldset>
        <fieldset>
          <legend>Música</legend>
          <p className="hint">Subí un archivo que tengan derecho a usar. No incluimos música protegida. Se escucha solo después de que el invitado toca la invitación.</p>
          <label className="field">
            Nombre de la pista
            <input value={draft.musicTitle} onChange={(event) => patch({ musicTitle: event.target.value })} />
          </label>
          {music ? <audio controls src={music} preload="none" /> : null}
          <label className="file-field">
            Subir audio
            <input
              type="file"
              accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.aac,.ogg,.wav"
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
              className="btn btn-link text-button"
              onClick={async () => {
                if (!api || !draft.musicPath) return;
                await api.deleteMedia(draft.musicPath, 'audio');
                await persist({ ...draft, musicPath: null }, 'Quitamos la música.');
              }}
            >
              Quitar música
            </button>
          ) : null}
        </fieldset>
        <fieldset>
          <legend>Galería</legend>
          <p className="hint">Hasta {MAX_GALLERY} fotos. JPG, PNG o WebP, de hasta 8 MB. Las achicamos antes de guardarlas. Se publican junto con el resto.</p>
          {draft.gallery.map((photo, index) => (
            <div className="gallery-edit" key={`${photo.path}-${index}`}>
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
              <div className="action-row">
                <button type="button" className="btn btn-outline-primary button button-secondary" disabled={index === 0} onClick={() => move(index, -1)}>Subir</button>
                <button type="button" className="btn btn-outline-primary button button-secondary" disabled={index === draft.gallery.length - 1} onClick={() => move(index, 1)}>Bajar</button>
                <button
                  type="button"
                  className="btn btn-link text-button"
                  onClick={async () => {
                    if (!api) return;
                    await api.deleteMedia(photo.path, 'image');
                    await persist({ ...draft, gallery: draft.gallery.filter((_, itemIndex) => itemIndex !== index) }, 'Quitamos la fotografía.');
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          <label className="file-field">
            Agregar fotografía
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
        </fieldset>
      </div>
    </section>
  );

  function move(index: number, direction: -1 | 1) {
    if (!draft) return;
    const gallery = [...draft.gallery];
    const target = index + direction;
    const current = gallery[index];
    const swap = gallery[target];
    if (!current || !swap) return;
    gallery[index] = swap;
    gallery[target] = current;
    patch({ gallery });
  }
}
