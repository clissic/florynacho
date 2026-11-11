import { useRef, useState, type FormEvent } from 'react';
import { DIETARY_OPTIONS, MAX_SONGS, type Dietary } from '../content/defaultSite';
import { formatDeadline, deadlineHasPassed } from '../lib/dates';
import type { InvitationData, SubmitResult } from '../lib/models';
import { EntryPass } from './EntryPass';
import { Icon } from './Icon';
import { dietaryLabel } from '../lib/stats';
import { emptyAttendee, emptyRsvp, joinGuestName, readSongDraft, splitGuestName, validateRsvp, type FieldErrors, type RsvpPayload } from '../lib/validation';

type Props = {
  invitation: InvitationData;
  entryToken?: string;
  deadline: string;
  songsEnabled: boolean;
  messagesEnabled: boolean;
  disabled?: boolean;
  admin?: boolean;
  onSubmit: (payload: RsvpPayload) => Promise<SubmitResult>;
};

function fromInvitation(invitation: InvitationData): RsvpPayload {
  const saved = invitation.rsvp;
  return {
    ...emptyRsvp(),
    attendance: saved?.attendance ?? '',
    guestDietary: saved?.guestDietary ?? '',
    guestDietaryNote: saved?.guestDietaryNote ?? '',
    guestAllergies: saved?.guestAllergies ?? '',
    companionName: saved?.companionName ?? '',
    companionGivenName: splitGuestName(saved?.companionName ?? '').givenName,
    companionFamilyName: splitGuestName(saved?.companionName ?? '').familyName,
    companionDietary: saved?.companionDietary ?? '',
    companionDietaryNote: saved?.companionDietaryNote ?? '',
    companionAllergies: saved?.companionAllergies ?? '',
    childrenUnder12: saved?.childrenUnder12 ?? 0,
    children: saved?.children?.length
        ? saved.children.map((child) => {
            const parts = splitGuestName(child.name);
            return {
              name: child.name,
              givenName: child.givenName || parts.givenName,
              familyName: child.familyName || parts.familyName,
              dietary: child.dietary ?? '',
              dietaryNote: child.dietaryNote ?? '',
              allergies: child.allergies ?? '',
            };
          })
      : Array.from({ length: saved?.childrenUnder12 ?? 0 }, () => emptyAttendee()),
    songs: invitation.songs
      .filter((song) => song.title)
      .map((song) => ({ title: song.title, artist: song.artist, comment: song.comment, link: song.link })),
    message: invitation.message,
  };
}

export function RsvpForm({ invitation, entryToken = '', deadline, songsEnabled, messagesEnabled, disabled = false, admin = false, onSubmit }: Props) {
  const [form, setForm] = useState<RsvpPayload>(() => fromInvitation(invitation));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: '', artist: '', comment: '', link: '' });
  const [editingAnswer, setEditingAnswer] = useState(!invitation.rsvp);
  const [sent, setSent] = useState(Boolean(invitation.rsvp));
  const [showMissing, setShowMissing] = useState(false);
  const lock = useRef(false);
  const slots = invitation.slots;
  const attending = form.attendance === 'yes_one' || form.attendance === 'yes_two';
  const withCompanion = slots === 2 && form.attendance === 'yes_two';
  const late = deadlineHasPassed(deadline);

  function update(partial: Partial<RsvpPayload>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabled || lock.current) return;
    const pending = readSongDraft(draft);
    const songs = pending.ok ? [...form.songs, pending.song] : form.songs;
    if (!pending.ok && (draft.title || draft.artist || draft.comment || draft.link)) {
      setErrors({ songs: pending.message });
      setShowMissing(true);
      setStatus('Revisá los campos marcados.');
      return;
    }
    const payload = { ...form, songs };
    const validated = validateRsvp(slots, payload);
    if (!validated.ok) {
      setErrors(validated.errors);
      setShowMissing(true);
      setStatus('Revisá los campos marcados.');
      return;
    }
    setErrors({});
    setShowMissing(false);
    setSaving(true);
    setStatus('Guardando tu respuesta…');
    lock.current = true;
    try {
      const result = await onSubmit(payload);
      if (!result.ok) {
        if (result.errors) setErrors(result.errors);
        if (result.field) setErrors((current) => ({ ...current, [result.field as keyof FieldErrors]: result.message }));
        setStatus(result.message || 'No pudimos guardar tu respuesta. Intentá de nuevo.');
        return;
      }
      setForm(fromInvitation(result.invitation));
      setDraft({ title: '', artist: '', comment: '', link: '' });
      if (admin) return;
      setSent(true);
      setEditingAnswer(false);
      setStatus('');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  async function saveSong() {
    if (form.songs.length >= MAX_SONGS) {
      setErrors({ songs: 'Podés sugerir hasta 5 canciones.' });
      return;
    }
    const read = readSongDraft(draft);
    if (!read.ok) {
      setErrors({ songs: read.message });
      return;
    }
    const songs = [...form.songs, read.song];
    update({ songs });
    setDraft({ title: '', artist: '', comment: '', link: '' });
    setErrors({});
    if (!sent) return;
    setSaving(true);
    lock.current = true;
    try {
      const result = await onSubmit({ ...form, songs });
      if (!result.ok) {
        setErrors({ songs: result.message || 'No pudimos guardar la canción.' });
        return;
      }
      setForm(fromInvitation(result.invitation));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  const songBlock = songsEnabled ? (
    <fieldset className="rsvp-songs" disabled={disabled || saving} onKeyDown={(event) => {
      if (event.key !== 'Enter' || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      void saveSong();
    }}>
      <legend>¿Qué canción no puede faltar en nuestra fiesta?</legend>
      <p className="hint">Es opcional. Guardá cada canción y podés sumar hasta cinco.</p>
      {form.songs.length ? (
        <div className="song-cards">
          {form.songs.map((song, index) => (
            <article className="song-card" key={`${song.title}-${song.artist}-${index}`}>
              <button type="button" className="song-remove" aria-label={`Quitar ${song.title}`} onClick={() => removeSong(index)}>
                <Icon name="close" />
              </button>
              <div className={song.link ? 'song-player' : 'song-player is-quiet'}>
                <div className="song-cover" aria-hidden="true">
                  <Icon name="music_note" />
                </div>
                <div className="song-meta">
                  <h3>{song.title}</h3>
                  <p>{song.artist}</p>
                </div>
                {song.link ? (
                  <a className="song-play" href={song.link} target="_blank" rel="noreferrer" aria-label={`Reproducir ${song.title}`}>
                    <Icon name="play_arrow" />
                  </a>
                ) : null}
              </div>
              {song.comment ? <p className="song-note">{song.comment}</p> : null}
              <div className="song-track" aria-hidden="true"><span /></div>
            </article>
          ))}
        </div>
      ) : null}
      {form.songs.length < MAX_SONGS ? (
        <div className="song-draft">
          <div className="song-main">
            <label className="field">
              Canción
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="field">
              Artista
              <input value={draft.artist} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} />
            </label>
            <label className="field">
              Comentario, si querés
              <input value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} />
            </label>
          </div>
          <label className="field">
            Enlace a la canción, si querés
            <input
              type="url"
              inputMode="url"
              placeholder="YouTube, Spotify u otro enlace"
              value={draft.link}
              onChange={(event) => setDraft({ ...draft, link: event.target.value })}
            />
          </label>
          <button type="button" className="btn btn-outline-primary button button-secondary" onClick={saveSong}>
            <Icon name="save" />
            Guardar canción
          </button>
        </div>
      ) : null}
      {errors.songs ? <p className="field-error">{errors.songs}</p> : null}
    </fieldset>
  ) : null;

  return (
    <form className="rsvp" onSubmit={handleSubmit} noValidate>
      {admin ? null : (
      <div className="rsvp-intro">
        <p className={late ? 'note' : 'lede'}>
          {late
            ? 'La fecha que pedimos para confirmar ya pasó. Si todavía podés avisarnos, completá el formulario.'
            : `Te pedimos confirmar antes del ${formatDeadline(deadline)}.`}
        </p>
      </div>
      )}
      {editingAnswer ? (
      <>
      <fieldset disabled={disabled || saving}>
        <legend className="rsvp-question">{slots === 1 ? '¿Nos acompañás en nuestro gran día?' : '¿Cómo nos vas a acompañar?'}</legend>
        <div className="choices">
          {slots === 1 ? (
            <>
              <Choice name="attendance" value="yes_one" icon="celebration" current={form.attendance} missing={showMissing && !form.attendance} onChange={(attendance) => update({ attendance })}>
                ¡Sí, allí estaré!
              </Choice>
              <Choice name="attendance" value="no" icon="sentiment_dissatisfied" current={form.attendance} missing={showMissing && !form.attendance} onChange={(attendance) => update({ attendance })}>
                Lamentablemente no podré asistir.
              </Choice>
            </>
          ) : (
            <>
              <Choice name="attendance" value="yes_two" icon="group" current={form.attendance} missing={showMissing && !form.attendance} onChange={(attendance) => update({ attendance })}>
                ¡Vamos los dos!
              </Choice>
              <Choice name="attendance" value="yes_one" icon="person" current={form.attendance} missing={showMissing && !form.attendance} onChange={(attendance) => update({ attendance })}>
                ¡Voy solo/a!
              </Choice>
              <Choice name="attendance" value="no" icon="sentiment_dissatisfied" current={form.attendance} missing={showMissing && !form.attendance} onChange={(attendance) => update({ attendance })}>
                Lamentablemente no podremos asistir.
              </Choice>
            </>
          )}
        </div>
        {errors.attendance && form.attendance ? <p className="field-error">{errors.attendance}</p> : null}

        {attending ? (
          <div className="question-swap" key={form.attendance}>
            <DietaryFields
              legend="Tu alimentación"
              dietary={form.guestDietary}
              note={form.guestDietaryNote}
              allergies={form.guestAllergies}
              errors={errors}
              markMissing={showMissing}
              dietaryKey="guestDietary"
              noteKey="guestDietaryNote"
              allergiesKey="guestAllergies"
              onDietary={(guestDietary) => update({ guestDietary })}
              onNote={(guestDietaryNote) => update({ guestDietaryNote })}
              onAllergies={(guestAllergies) => update({ guestAllergies })}
            />

            {withCompanion ? (
              <div className="rsvp-child">
                <h3>Acompañante</h3>
                <div className="rsvp-child-line">
                  <label className="field">
                    Nombre
                    <input
                      className={missingName(showMissing, form.companionGivenName)}
                      value={form.companionGivenName ?? ''}
                      onChange={(event) => {
                        const companionGivenName = event.target.value;
                        update({
                          companionGivenName,
                          companionName: joinGuestName(companionGivenName, form.companionFamilyName ?? ''),
                        });
                      }}
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label className="field">
                    Apellido
                    <input
                      className={missingName(showMissing, form.companionFamilyName)}
                      value={form.companionFamilyName ?? ''}
                      onChange={(event) => {
                        const companionFamilyName = event.target.value;
                        update({
                          companionFamilyName,
                          companionName: joinGuestName(form.companionGivenName ?? '', companionFamilyName),
                        });
                      }}
                      autoComplete="family-name"
                      required
                    />
                  </label>
                  <label className="field">
                    Alimentación
                    <select
                      className={missingChoice(showMissing, form.companionDietary)}
                      value={form.companionDietary}
                      onChange={(event) => update({ companionDietary: event.target.value as Dietary })}
                      required
                    >
                      <option value="">Elegí una opción</option>
                      {DIETARY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {form.companionDietary === 'other' ? (
                  <label className="field">
                    Contanos la restricción
                    <input
                      className={missingName(showMissing, form.companionDietaryNote)}
                      value={form.companionDietaryNote}
                      onChange={(event) => update({ companionDietaryNote: event.target.value })}
                    />
                  </label>
                ) : null}
                <label className="field">
                  Alergias o intolerancias, si hay
                  <textarea
                    value={form.companionAllergies}
                    onChange={(event) => update({ companionAllergies: event.target.value })}
                    rows={3}
                    maxLength={300}
                    placeholder="En caso de no existir condiciones, dejar en blanco"
                  />
                </label>
                {errors.companionAllergies ? <p className="field-error">{errors.companionAllergies}</p> : null}
              </div>
            ) : null}

          </div>
        ) : null}
      </fieldset>

      {songBlock}

      {messagesEnabled ? (
        <fieldset disabled={disabled || saving}>
          <legend>¿Querés dejarnos unas palabras?</legend>
          <p className="hint">También es opcional. El mensaje queda solo para nosotros.</p>
          <label className="field">
            Mensaje
            <textarea
              value={form.message}
              onChange={(event) => update({ message: event.target.value })}
              rows={3}
              maxLength={1000}
            />
          </label>
          {errors.message ? <p className="field-error">{errors.message}</p> : null}
        </fieldset>
      ) : null}

      <p className="status" role="status" aria-live="polite">{status}</p>
      <button className="btn btn-primary button" type="submit" disabled={disabled || saving}>
        {saving ? 'Guardando…' : sent ? 'Actualizar respuesta' : 'Enviar respuesta'}
      </button>
      </>
      ) : (
        <>
          <AnswerSummary form={form} slots={slots} entryToken={entryToken} onEdit={() => setEditingAnswer(true)} />
          {songBlock}
        </>
      )}
    </form>
  );

  async function removeSong(index: number) {
    const songs = form.songs.filter((_, songIndex) => songIndex !== index);
    update({ songs });
    if (!sent) return;
    setSaving(true);
    lock.current = true;
    try {
      const result = await onSubmit({ ...form, songs });
      if (!result.ok) {
        setErrors({ songs: result.message || 'No pudimos quitar la canción.' });
        return;
      }
      setForm(fromInvitation(result.invitation));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
}

function AnswerSummary({ form, slots, entryToken, onEdit }: { form: RsvpPayload; slots: 1 | 2; entryToken: string; onEdit: () => void }) {
  const attending = form.attendance === 'yes_one' || form.attendance === 'yes_two';
  const attendance =
    form.attendance === 'yes_two'
      ? '¡Vamos los dos!'
      : form.attendance === 'yes_one'
        ? slots === 1
          ? '¡Sí, allí estaré!'
          : '¡Voy solo/a!'
        : slots === 1
          ? 'Lamentablemente no podré asistir.'
          : 'Lamentablemente no podremos asistir.';
  return (
    <div className="rsvp-summary">
      <p className="lede">Recibimos tu respuesta. Gracias.</p>
      <div className="rsvp-summary-board">
      <dl>
        <div>
          <dt>Asistencia</dt>
          <dd>{attendance}</dd>
        </div>
        {attending ? (
          <>
            <div>
              <dt>Tu alimentación</dt>
              <dd>{dietaryLabel(form.guestDietary || null, form.guestDietaryNote)}</dd>
            </div>
            {form.guestAllergies ? (
              <div>
                <dt>Tus alergias</dt>
                <dd>{form.guestAllergies}</dd>
              </div>
            ) : null}
            {form.attendance === 'yes_two' ? (
              <>
                <div>
                  <dt>Acompañante</dt>
                  <dd>{form.companionName}</dd>
                </div>
                <div>
                  <dt>Alimentación del acompañante</dt>
                  <dd>{dietaryLabel(form.companionDietary || null, form.companionDietaryNote)}</dd>
                </div>
                {form.companionAllergies ? (
                  <div>
                    <dt>Alergias del acompañante</dt>
                    <dd>{form.companionAllergies}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            {form.childrenUnder12 > 0 ? (
            <div>
              <dt>Menores de 12</dt>
              <dd>{form.childrenUnder12}</dd>
            </div>
            ) : null}
            {form.children.map((child, index) => (
              <div key={`${child.givenName}-${index}`}>
                <dt>Menor {index + 1}</dt>
                <dd>
                  {joinGuestName(child.givenName ?? '', child.familyName ?? '') || child.name}
                  {' · '}
                  {dietaryLabel(child.dietary || null, child.dietaryNote)}
                  {child.allergies ? ` · ${child.allergies}` : ''}
                </dd>
              </div>
            ))}
          </>
        ) : null}
        {form.message ? (
          <div>
            <dt>Mensaje</dt>
            <dd>{form.message}</dd>
          </div>
        ) : null}
      </dl>
      {attending && entryToken ? <EntryPass token={entryToken} /> : null}
      </div>
      <button type="button" className="btn btn-outline-primary button button-secondary" onClick={onEdit}>
        <Icon name="edit" />
        Editar
      </button>
    </div>
  );
}

function Choice({
  name,
  value,
  icon,
  current,
  missing = false,
  onChange,
  children,
}: {
  name: string;
  value: RsvpPayload['attendance'];
  icon: string;
  current: string;
  missing?: boolean;
  onChange: (value: RsvpPayload['attendance']) => void;
  children: string;
}) {
  return (
    <label className={`choice ${current === value ? 'is-selected' : ''} ${missing ? 'is-missing' : ''}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />
      <Icon name={icon} />
      <span>{children}</span>
    </label>
  );
}

function DietaryFields({
  legend,
  dietary,
  note,
  allergies,
  errors,
  markMissing = false,
  allergiesKey,
  onDietary,
  onNote,
  onAllergies,
}: {
  legend: string;
  dietary: Dietary | '';
  note: string;
  allergies: string;
  errors: FieldErrors;
  markMissing?: boolean;
  dietaryKey: keyof FieldErrors;
  noteKey: keyof FieldErrors;
  allergiesKey: keyof FieldErrors;
  onDietary: (value: Dietary) => void;
  onNote: (value: string) => void;
  onAllergies: (value: string) => void;
}) {
  return (
    <div className="diet">
      <div className="rsvp-split">
        <div>
          <label className="field">
            {legend}
            <select className={missingChoice(markMissing, dietary)} value={dietary} onChange={(event) => onDietary(event.target.value as Dietary)} required>
              <option value="">Elegí una opción</option>
              {DIETARY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {dietary === 'other' ? (
            <label className="field">
              Contanos la restricción
              <input className={missingName(markMissing, note)} value={note} onChange={(event) => onNote(event.target.value)} />
            </label>
          ) : null}
        </div>
        <div>
          <label className="field">
            Alergias o intolerancias, si hay
            <input value={allergies} onChange={(event) => onAllergies(event.target.value)} />
          </label>
          {errors[allergiesKey] ? <p className="field-error">{errors[allergiesKey]}</p> : null}
        </div>
      </div>
    </div>
  );
}

function missingName(show: boolean, value: string | undefined) {
  if (!show) return '';
  const text = (value ?? '').trim();
  return text.length < 2 || text.length > 40 ? 'is-missing' : '';
}

function missingChoice(show: boolean, value: string) {
  return show && !value ? 'is-missing' : '';
}
