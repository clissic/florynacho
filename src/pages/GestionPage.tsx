import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { FloorBoard } from '../admin/FloorBoard';
import { BudgetBoard } from '../admin/BudgetBoard';
import { ValidationBoard } from '../admin/ValidationBoard';
import { Icon } from '../components/Icon';
import { RsvpForm } from '../components/RsvpForm';
import { DIETARY_OPTIONS, type Dietary } from '../content/defaultSite';
import { useApi } from '../lib/api';
import { downloadCsv, parseGuestCsv, toCsv } from '../lib/csv';
import type { FloorPlan, FloorSeatPerson, GuestRow, InvitationData, SongRow } from '../lib/models';
import { seatKey } from '../lib/floor';
import { dietaryLabel, summarizeGuests } from '../lib/stats';
import { SetupNotice } from './SetupNotice';

const PAGE_SIZE = 25;
const emptyPlan: FloorPlan = { tables: [], chairs: [], walls: [], openings: [], objects: [] };

function attendanceLabel(guest: GuestRow) {
  if (guest.status === 'revoked') return 'Desactivada';
  if (!guest.rsvp) return 'Pendiente';
  if (guest.rsvp.attendance === 'no') return 'No asiste';
  return guest.rsvp.confirmedCount === 2 ? 'Confirmaron los dos' : 'Confirmó';
}

function attendanceMark(guest: GuestRow) {
  if (guest.status === 'revoked') return { icon: 'priority_high', tone: 'is-off' };
  if (!guest.rsvp) return { icon: 'hourglass_empty', tone: 'is-wait' };
  if (guest.rsvp.attendance === 'no') return { icon: 'close', tone: 'is-no' };
  if (guest.rsvp.attendance === 'yes_two') return { icon: 'done_all', tone: 'is-yes' };
  return { icon: 'check', tone: 'is-yes' };
}

function dietText(guest: GuestRow) {
  if (!guest.rsvp || guest.rsvp.confirmedCount < 1) return '—';
  const guestDiet = dietaryLabel(guest.rsvp.guestDietary, guest.rsvp.guestDietaryNote);
  if (guest.rsvp.confirmedCount < 2) return guestDiet || '—';
  const companionDiet = dietaryLabel(guest.rsvp.companionDietary, guest.rsvp.companionDietaryNote);
  return `${guestDiet || '—'} / ${companionDiet || '—'}`;
}

function allergyText(guest: GuestRow) {
  if (!guest.rsvp || guest.rsvp.confirmedCount < 1) return '—';
  const parts = [(guest.rsvp.guestAllergies ?? '').trim() || '—'];
  if (guest.rsvp.confirmedCount >= 2) parts.push((guest.rsvp.companionAllergies ?? '').trim() || '—');
  const children = (guest.rsvp.children ?? [])
    .map((child) => {
      const text = (child.allergies ?? '').trim();
      if (!text) return '';
      return `${child.name || 'Menor'}: ${text}`;
    })
    .filter(Boolean);
  const adults = parts.every((part) => part === '—') ? '' : parts.join(' / ');
  return [adults, ...children].filter(Boolean).join(' · ') || '—';
}

function hasAllergy(guest: GuestRow) {
  if (!guest.rsvp) return false;
  if ((guest.rsvp.guestAllergies ?? '').trim()) return true;
  if ((guest.rsvp.companionAllergies ?? '').trim()) return true;
  return (guest.rsvp.children ?? []).some((child) => (child.allergies ?? '').trim());
}

function seatPeople(guests: GuestRow[]): FloorSeatPerson[] {
  const people: FloorSeatPerson[] = [];
  for (const guest of guests) {
    if (guest.status !== 'active' || !guest.rsvp) continue;
    const attending = guest.rsvp.attendance === 'yes_one' || guest.rsvp.attendance === 'yes_two';
    if (!attending) continue;
    people.push({ invitationId: guest.id, role: 'guest', childIndex: null, label: guest.guestName, accredited: guest.accredited });
    if (guest.rsvp.attendance === 'yes_two') {
      people.push({
        invitationId: guest.id,
        role: 'companion',
        childIndex: null,
        label: guest.rsvp.companionName || 'Acompañante',
        accredited: guest.accredited,
      });
    }
    const minors = Math.min(10, Math.max(0, guest.rsvp.childrenUnder12 || 0));
    for (let index = 0; index < minors; index += 1) {
      const child = guest.rsvp.children[index];
      people.push({
        invitationId: guest.id,
        role: 'child',
        childIndex: index,
        label: child?.name || `Menor ${index + 1}`,
        accredited: guest.accredited,
      });
    }
  }
  return people;
}

function keepEligible(plan: FloorPlan, people: FloorSeatPerson[]): FloorPlan {
  const allowed = new Set(people.map((person) => seatKey(person)));
  return {
    tables: plan.tables ?? [],
    walls: plan.walls ?? [],
    openings: plan.openings ?? [],
    objects: plan.objects ?? [],
    chairs: (plan.chairs ?? []).map((chair) => {
      if (!chair.invitationId || !chair.role || !allowed.has(seatKey(chair))) {
        return { ...chair, invitationId: null, role: null, childIndex: null };
      }
      return chair;
    }),
  };
}

export function GestionPage() {
  const api = useApi();
  const [params] = useSearchParams();
  const entrada = /^[a-f0-9]{32}$/i.test(params.get('entrada') ?? '') ? (params.get('entrada') ?? '') : '';
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [section, setSection] = useState<'resumen' | 'invitados' | 'mesas' | 'canciones' | 'validacion' | 'administracion'>(entrada ? 'validacion' : 'invitados');
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [plan, setPlan] = useState<FloorPlan>(emptyPlan);
  const [nameQuery, setNameQuery] = useState('');
  const [dietary, setDietary] = useState('');
  const [attendance, setAttendance] = useState('');
  const [children, setChildren] = useState('');
  const [allergiesOnly, setAllergiesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [songPage, setSongPage] = useState(1);
  const [editing, setEditing] = useState<GuestRow | null>(null);
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [slots, setSlots] = useState<1 | 2>(1);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<GuestRow | null>(null);
  const [response, setResponse] = useState<InvitationData | null>(null);
  const [responseError, setResponseError] = useState('');
  const [formFlags, setFormFlags] = useState({ songs: true, messages: true, deadline: '2026-11-19' });
  const csvHelpRef = useRef<HTMLDialogElement>(null);
  const responseRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvHelpTitle = useId();
  const responseTitle = useId();

  async function reload() {
    if (!api) return;
    const [nextGuests, nextPlan, nextSongs] = await Promise.all([api.listGuests(), api.getFloor(), api.listSongs()]);
    setGuests(nextGuests);
    setSongs(nextSongs);
    setPlan(keepEligible(nextPlan, seatPeople(nextGuests)));
  }

  async function openConfirm(guest: GuestRow) {
    if (!api) return;
    setResponse(null);
    setResponseError('');
    setConfirming(guest);
    try {
      setResponse(await api.getGuestResponse(guest.id));
    } catch (reason) {
      setResponseError(reason instanceof Error ? reason.message : 'No pudimos abrir la confirmación.');
    }
  }

  useEffect(() => {
    const dialog = responseRef.current;
    if (!dialog) return;
    if (!confirming) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
  }, [confirming]);

  useEffect(() => {
    if (!api || !email) return;
    api.getPublicSite()
      .then((site) => {
        setFormFlags({
          songs: site.content.sections.songs,
          messages: site.content.sections.messages,
          deadline: site.content.rsvpDeadline,
        });
      })
      .catch(() => undefined);
  }, [api, email]);

  useEffect(() => {
    document.title = 'Gestión de invitados · Florencia & Ignacio';
    if (!api) return;
    api
      .getSession()
      .then(async (session) => {
        if (!session) {
          setEmail(null);
          return;
        }
        setEmail(session.email);
        await reload();
      })
      .catch((reason: Error) => setError(reason.message));
  }, [api]);

  const filtered = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    return guests.filter((guest) => {
      if (query) {
        const blob = `${guest.guestName} ${guest.rsvp?.companionName ?? ''}`.toLowerCase();
        if (!blob.includes(query)) return false;
      }
      if (dietary) {
        const values = [guest.rsvp?.guestDietary, guest.rsvp?.companionDietary];
        if (!values.includes(dietary as Dietary)) return false;
      }
      if (attendance === 'pending' && attendanceLabel(guest) !== 'Pendiente') return false;
      if (attendance === 'confirmed' && attendanceLabel(guest) !== 'Confirmó' && attendanceLabel(guest) !== 'Confirmaron los dos') return false;
      if (attendance === 'revoked' && attendanceLabel(guest) !== 'Desactivada') return false;
      if (children !== '') {
        if (!guest.rsvp || guest.rsvp.childrenUnder12 !== Number(children)) return false;
      }
      if (allergiesOnly && !hasAllergy(guest)) return false;
      return true;
    });
  }, [guests, nameQuery, dietary, attendance, children, allergiesOnly]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const songPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE));
  const currentSongPage = Math.min(songPage, songPages);
  const visibleSongs = songs.slice((currentSongPage - 1) * PAGE_SIZE, currentSongPage * PAGE_SIZE);

  function beginCreate() {
    setEditing(null);
    setName('');
    setFamilyName('');
    setSlots(1);
    setNotes('');
    setMessage('');
  }

  function beginEdit(guest: GuestRow) {
    setEditing(guest);
    const parts = guest.guestName.trim().split(/\s+/);
    setName(guest.givenName || parts[0] || '');
    setFamilyName(guest.familyName || parts.slice(1).join(' '));
    setSlots(guest.slots);
    setNotes(guest.notes);
    setMessage('');
    setSection('invitados');
  }

  if (!api) return <SetupNotice />;
  if (email === undefined && !error) return <p className="loading">Cargando…</p>;
  if (!email) return <Navigate to={`/admin/login?next=${encodeURIComponent(entrada ? `/gestion?entrada=${entrada}` : '/gestion')}`} replace />;

  const pending = guests.filter((guest) => guest.status === 'active' && !guest.rsvp);
  const stats = summarizeGuests(guests.map((guest) => ({ status: guest.status, rsvp: guest.rsvp })));

  function openSection(next: 'resumen' | 'invitados' | 'mesas' | 'canciones' | 'validacion' | 'administracion') {
    setSection(next);
    setMenuOpen(false);
    setNoticesOpen(false);
  }

  return (
    <div className="admin platform">
      <aside className={menuOpen ? 'platform-side is-open' : 'platform-side'}>
        <div className="platform-brand-row">
          <span className="platform-mark" aria-hidden="true">
            <Icon name="admin_panel_settings" />
          </span>
          <strong className="platform-brand">Área de Gestión</strong>
        </div>
        <nav className="platform-nav" aria-label="Secciones">
          <button type="button" className={section === 'invitados' ? 'is-on' : ''} onClick={() => openSection('invitados')}>
            <Icon name="group" />
            Invitados
          </button>
          <button type="button" className={section === 'mesas' ? 'is-on' : ''} onClick={() => openSection('mesas')}>
            <Icon name="event_seat" />
            Mesas
          </button>
          <button type="button" className={section === 'canciones' ? 'is-on' : ''} onClick={() => openSection('canciones')}>
            <Icon name="music_note" />
            Canciones
          </button>
          <button type="button" className={section === 'validacion' ? 'is-on' : ''} onClick={() => openSection('validacion')}>
            <Icon name="qr_code_scanner" />
            Validación
          </button>
          <button type="button" className={section === 'administracion' ? 'is-on' : ''} onClick={() => openSection('administracion')}>
            <Icon name="payments" />
            Administración
          </button>
        </nav>
        <div className="platform-side-foot">
          <button type="button" className={section === 'resumen' ? 'is-on' : ''} onClick={() => openSection('resumen')}>
            <Icon name="dashboard" />
            Resumen
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.signOut();
              setEmail(null);
            }}
          >
            <Icon name="logout" />
            Salir
          </button>
        </div>
      </aside>
      {menuOpen ? <button type="button" className="platform-backdrop" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} /> : null}
      <div className="platform-main">
        <header className="platform-top">
          <button type="button" className="platform-menu" aria-label="Abrir secciones" onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <p className="platform-wedding">Florencia & Ignacio</p>
          <p className="platform-user">
            <Icon name="person" />
            <span>{email}</span>
          </p>
          <div className="platform-notices">
            <button
              type="button"
              className="platform-bell"
              aria-label="Notificaciones"
              aria-expanded={noticesOpen}
              onClick={() => setNoticesOpen((open) => !open)}
            >
              <Icon name="notifications" />
              {pending.length > 0 ? <span className="platform-badge">{pending.length}</span> : null}
            </button>
            {noticesOpen ? (
              <div className="platform-notice-list" role="region" aria-label="Avisos">
                {pending.length === 0 ? <p>No hay avisos nuevos.</p> : null}
                {pending.slice(0, 6).map((guest) => (
                  <p key={guest.id}>{guest.guestName} todavía no confirmó.</p>
                ))}
                {pending.length > 6 ? <p>Y {pending.length - 6} más.</p> : null}
              </div>
            ) : null}
          </div>
        </header>
        <div className="platform-body">
      {error ? <p className="status">{error}</p> : null}

      {section === 'resumen' ? (
        <section className="canvas-section">
          <header className="canvas-head">
            <div>
              <p className="eyebrow">Resumen</p>
              <h2>La invitación</h2>
            </div>
          </header>
          <div className="stat-grid">
            <Stat label="Enviadas" value={stats.sent} />
            <Stat label="Pendientes" value={stats.pending} />
            <Stat label="Confirmadas" value={stats.confirmed} />
            <Stat label="Rechazadas" value={stats.declined} />
            <Stat label="Asistentes" value={stats.attendees} />
            <Stat label="Acompañantes" value={stats.companions} />
          </div>
          <h3 className="canvas-sub">Restricciones alimentarias</h3>
          <ul className="diet-stats">
            {stats.dietary.map((item) => (
              <li key={item.key}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {section === 'invitados' ? (
        <section className="canvas-section">
          <header className="canvas-head">
            <div>
              <p className="eyebrow">Invitados</p>
              <h2>{editing ? 'Editar invitación' : 'Nueva invitación'}</h2>
            </div>
            <div className="canvas-tools">
              <button type="button" className="canvas-tool" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" />
                Importar
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const parsed = parseGuestCsv(await file.text());
                  setImportNotes(parsed.errors);
                  if (parsed.guests.length === 0) return;
                  try {
                    const result = await api.importGuests(parsed.guests);
                    setImportNotes([`Se crearon ${result.created} invitaciones.`, ...parsed.errors]);
                    await reload();
                  } catch (reason) {
                    setImportNotes([reason instanceof Error ? reason.message : 'No pudimos importar.']);
                  }
                }}
              />
              <button type="button" className="canvas-tool" onClick={() => exportGuests(filtered)}>
                <Icon name="download" />
                Exportar
              </button>
              <button
                type="button"
                className="canvas-info"
                aria-label="Información sobre importar y exportar"
                onClick={() => csvHelpRef.current?.showModal()}
              >
                <Icon name="info" />
              </button>
            </div>
          </header>
          <dialog ref={csvHelpRef} className="rental-dialog csv-help" aria-labelledby={csvHelpTitle}>
            <div className="rental-sheet">
              <button type="button" className="rental-close" aria-label="Cerrar" onClick={() => csvHelpRef.current?.close()}>
                <Icon name="close" />
              </button>
              <p className="rental-kicker">Invitados</p>
              <h2 id={csvHelpTitle}>Importar y exportar</h2>
              <h3>Importar</h3>
              <p>
                Carga un archivo CSV y crea una invitación nueva por cada fila válida. Cada una queda activa y recibe su propio enlace.
                El archivo lleva cuatro columnas: nombre, apellido, cupos (1 o 2) y observaciones. Si la primera fila dice nombre, se toma como encabezado.
                Las filas con un nombre inválido, un apellido incompleto, cupos distintos de 1 o 2, u observaciones de más de 500 caracteres se omiten, y el aviso indica cuántas invitaciones se crearon y qué filas fallaron. El apellido puede quedar vacío.
              </p>
              <div className="csv-sample">
                <table>
                  <caption>Ejemplo para importar</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Apellido</th>
                      <th scope="col">Cupos</th>
                      <th scope="col">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Ana</td>
                      <td>Pereira</td>
                      <td>1</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td>Martín</td>
                      <td>Silva</td>
                      <td>2</td>
                      <td>Llega después de la ceremonia</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3>Exportar</h3>
              <p>
                Descarga confirmaciones-florencia-ignacio.csv con los invitados que coinciden con los filtros de nombre, alimentación, asistencia, menores y alergias, de todas las páginas.
                Cada fila incluye nombre, cupos, asistencia, alimentación, menores de 12, estado, enlace personal y observaciones.
                Ese archivo es el informe de las respuestas. Para importar invitados nuevos, el CSV lleva nombre, apellido, cupos y observaciones.
              </p>
              <div className="csv-sample">
                <table>
                  <caption>Ejemplo de la exportación</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Cupos</th>
                      <th scope="col">Asistencia</th>
                      <th scope="col">Alimentación</th>
                      <th scope="col">Menores de 12</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Enlace</th>
                      <th scope="col">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Ana Pereira</td>
                      <td>1</td>
                      <td>Pendiente</td>
                      <td>—</td>
                      <td></td>
                      <td>Activa</td>
                      <td>/i/…</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </dialog>
          <form
            className="canvas-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage('');
              try {
                await api.saveGuest(editing?.id ?? null, {
                  name: `${name} ${familyName}`.replace(/\s+/g, ' ').trim(),
                  givenName: name,
                  familyName,
                  slots,
                  notes,
                  status: editing?.status,
                });
                beginCreate();
                setMessage('Guardamos la invitación.');
                await reload();
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : 'No pudimos guardar.');
              }
            }}
          >
            <label className="field">
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="field">
              Apellido
              <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
            </label>
            <label className="field">
              Cupos
              <select value={slots} onChange={(event) => setSlots(Number(event.target.value) === 2 ? 2 : 1)}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <label className="field">
              Observaciones
              <input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="canvas-form-actions">
              <button className="btn btn-primary button" type="submit">
                <Icon name="save" />
                {editing ? 'Guardar' : 'Crear'}
              </button>
              {editing ? (
                <button className="btn btn-outline-primary button button-secondary" type="button" onClick={beginCreate}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
          {message ? <p className="status" role="status">{message}</p> : null}
          {importNotes.map((note) => (
            <p key={note} className="hint">{note}</p>
          ))}

          <div className="canvas-filters">
            <label className="field">
              Nombre
              <input
                value={nameQuery}
                onChange={(event) => {
                  setNameQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar invitado"
              />
            </label>
            <label className="field">
              Alimentación
              <select
                value={dietary}
                onChange={(event) => {
                  setDietary(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Cualquiera</option>
                {DIETARY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Asistencia
              <select
                value={attendance}
                onChange={(event) => {
                  setAttendance(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Cualquiera</option>
                <option value="pending">Pendiente</option>
                <option value="confirmed">Confirmó</option>
                <option value="revoked">Desactivada</option>
              </select>
            </label>
            <label className="field">
              Menores de 12
              <select
                value={children}
                onChange={(event) => {
                  setChildren(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Cualquiera</option>
                {Array.from({ length: 11 }, (_, count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>
            <label className="field filter-switch">
              Alergias
              <input
                type="checkbox"
                role="switch"
                checked={allergiesOnly}
                onChange={(event) => {
                  setAllergiesOnly(event.target.checked);
                  setPage(1);
                }}
              />
            </label>
          </div>

          <div className="table-scroll canvas-table guests-table">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Asistencia</th>
                  <th>Alimentación</th>
                  <th>Alergias</th>
                  <th>Menores</th>
                  <th>Cupos</th>
                  <th>Observaciones</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((guest) => {
                  const link = `${window.location.origin}/i/${guest.token}`;
                  return (
                    <tr key={guest.id} className={guest.status === 'revoked' ? 'is-revoked' : undefined}>
                      <td>{guest.guestName}</td>
                      <td>
                        <span className={`attendance-mark ${attendanceMark(guest).tone}`} title={attendanceLabel(guest)} aria-label={attendanceLabel(guest)}>
                          <Icon name={attendanceMark(guest).icon} />
                        </span>
                      </td>
                      <td>{dietText(guest)}</td>
                      <td>{allergyText(guest)}</td>
                      <td className="is-num">{guest.rsvp ? guest.rsvp.childrenUnder12 : '—'}</td>
                      <td className="is-num">{guest.slots}</td>
                      <td className="notes-cell">{guest.notes.trim() ? guest.notes : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-action"
                            aria-label={copiedId === guest.id ? 'Enlace copiado' : 'Copiar enlace'}
                            title={copiedId === guest.id ? 'Enlace copiado' : 'Copiar enlace'}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(link);
                              } catch {
                                const field = document.createElement('textarea');
                                field.value = link;
                                document.body.appendChild(field);
                                field.select();
                                document.execCommand('copy');
                                field.remove();
                              }
                              setCopiedId(guest.id);
                              window.setTimeout(() => setCopiedId((current) => (current === guest.id ? null : current)), 1600);
                            }}
                          >
                            <Icon name={copiedId === guest.id ? 'check' : 'content_copy'} />
                          </button>
                          <button type="button" className="icon-action" aria-label="Editar" title="Editar" onClick={() => beginEdit(guest)}>
                            <Icon name="edit" />
                          </button>
                          <button type="button" className="icon-action" aria-label="Confirmar asistencia" title="Confirmar asistencia" onClick={() => void openConfirm(guest)}>
                            <Icon name="fact_check" />
                          </button>
                          <button
                            type="button"
                            className="icon-action"
                            aria-label={guest.status === 'active' ? 'Desactivar' : 'Activar'}
                            title={guest.status === 'active' ? 'Desactivar' : 'Activar'}
                            onClick={async () => {
                              await api.setGuestStatus(guest.id, guest.status === 'active' ? 'revoked' : 'active');
                              await reload();
                            }}
                          >
                            <Icon name={guest.status === 'active' ? 'person_off' : 'how_to_reg'} />
                          </button>
                          <button
                            type="button"
                            className="icon-action is-danger"
                            aria-label="Eliminar"
                            title="Eliminar"
                            onClick={async () => {
                              if (!window.confirm(`¿Eliminar la invitación de ${guest.guestName}?`)) return;
                              await api.deleteGuest(guest.id);
                              await reload();
                            }}
                          >
                            <Icon name="delete" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="canvas-pages">
            <button type="button" className="icon-action" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              <Icon name="arrow_back" />
            </button>
            <p>{filtered.length} invitados · Página {currentPage} de {pages}</p>
            <button type="button" className="icon-action" aria-label="Página siguiente" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>
              <Icon name="arrow_forward" />
            </button>
          </div>
        </section>
      ) : section === 'mesas' ? (
        <section className="canvas-section">
          <header className="canvas-head">
            <div>
              <p className="eyebrow">Mesas</p>
              <h2>El plano</h2>
            </div>
            <button
              type="button"
              className="btn btn-primary button"
              onClick={async () => {
                setMessage('');
                try {
                  const saved = await api.saveFloor(plan);
                  setPlan(saved);
                  setMessage('Guardamos el plano.');
                } catch (reason) {
                  setMessage(reason instanceof Error ? reason.message : 'No pudimos guardar el plano.');
                }
              }}
            >
              <Icon name="save" />
              Guardar plano
            </button>
          </header>
          <p className="hint">Dibujá el salón, acercá el plano y sentá a cada grupo. Las sillas grises están libres, las rojas todavía no acreditaron y las verdes ya pasaron por el QR.</p>
          <FloorBoard people={seatPeople(guests)} plan={plan} onChange={setPlan} />
          {message ? <p className="status" role="status">{message}</p> : null}
        </section>
      ) : section === 'canciones' ? (
        <section className="canvas-section">
          <header className="canvas-head">
            <div>
              <p className="eyebrow">Canciones</p>
              <h2>Lo que pidieron</h2>
            </div>
          </header>
          {songs.length ? (
            <>
            <div className="table-scroll canvas-table">
              <table>
                <thead>
                  <tr>
                    <th>Invitado</th>
                    <th>Canción</th>
                    <th>Artista</th>
                    <th>Comentario</th>
                    <th className="is-center">Enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSongs.map((song) => (
                    <tr key={song.id}>
                      <td>{song.guestName}</td>
                      <td>{song.title}</td>
                      <td>{song.artist}</td>
                      <td>{song.comment || '—'}</td>
                      <td className="is-center">
                        {song.link ? (
                          <a className="icon-action" href={song.link} target="_blank" rel="noreferrer" aria-label={`Reproducir ${song.title}`} title="Reproducir">
                            <Icon name="play_arrow" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="canvas-pages">
              <button type="button" className="icon-action" aria-label="Página anterior" disabled={currentSongPage <= 1} onClick={() => setSongPage(currentSongPage - 1)}>
                <Icon name="arrow_back" />
              </button>
              <p>{songs.length} canciones · Página {currentSongPage} de {songPages}</p>
              <button type="button" className="icon-action" aria-label="Página siguiente" disabled={currentSongPage >= songPages} onClick={() => setSongPage(currentSongPage + 1)}>
                <Icon name="arrow_forward" />
              </button>
            </div>
            </>
          ) : (
            <p className="hint">Todavía no hay canciones guardadas.</p>
          )}
        </section>
      ) : section === 'validacion' ? (
        <ValidationBoard api={api} pendingToken={entrada} />
      ) : section === 'administracion' ? (
        <BudgetBoard api={api} />
      ) : null}
        </div>
      </div>
      <dialog
        ref={responseRef}
        className="response-dialog"
        aria-labelledby={responseTitle}
        onClose={() => setConfirming(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) responseRef.current?.close();
        }}
      >
        {confirming ? (
          <>
            <h2 id={responseTitle}>Confirmar asistencia de {confirming.guestName}</h2>
            {responseError ? <p className="status">{responseError}</p> : null}
            {!response && !responseError ? <p className="loading">Cargando…</p> : null}
            {response ? (
              <RsvpForm
                key={confirming.id}
                admin
                invitation={response}
                deadline={formFlags.deadline}
                songsEnabled={formFlags.songs}
                messagesEnabled={formFlags.messages}
                onSubmit={async (payload) => {
                  if (!api) return { ok: false, error: 'network', message: 'No pudimos guardar la respuesta.' };
                  const result = await api.saveGuestResponse(confirming.id, payload);
                  if (result.ok) {
                    await reload();
                    setConfirming(null);
                  }
                  return result;
                }}
              />
            ) : null}
          </>
        ) : null}
      </dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function exportGuests(guests: GuestRow[]) {
  downloadCsv(
    'confirmaciones-florencia-ignacio.csv',
    toCsv(
      ['nombre', 'cupos', 'asistencia', 'alimentacion', 'menores_de_12', 'estado', 'enlace', 'observaciones'],
      guests.map((guest) => [
        guest.guestName,
        guest.slots,
        attendanceLabel(guest),
        dietText(guest),
        guest.rsvp ? guest.rsvp.childrenUnder12 : '',
        guest.status === 'active' ? 'Activa' : 'Desactivada',
        `${window.location.origin}/i/${guest.token}`,
        guest.notes,
      ]),
    ),
  );
}
