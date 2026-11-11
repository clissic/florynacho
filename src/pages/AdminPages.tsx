import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ContentPanel } from '../admin/ContentPanel';
import { GuestPanel } from '../admin/GuestPanel';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';
import type { GuestRow, MessageRow, SongRow } from '../lib/models';
import { downloadCsv, toCsv } from '../lib/csv';
import { formatDateTime } from '../lib/dates';
import { summarizeGuests } from '../lib/stats';
import { SetupNotice } from './SetupNotice';

type Tab = 'resumen' | 'invitados' | 'canciones' | 'mensajes' | 'contenido';

function gestionNext(value: string | null) {
  if (value === '/gestion') return value;
  const match = value?.match(/^\/gestion\?entrada=([a-f0-9]{32})$/i);
  return match ? `/gestion?entrada=${match[1]}` : '/admin';
}

export function AdminLoginPage() {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [params] = useSearchParams();
  const next = gestionNext(params.get('next'));

  useEffect(() => {
    document.title = 'Ingreso · Florencia & Ignacio';
    if (!api) return;
    api.getSession().then((current) => setSession(current?.email ?? null));
  }, [api]);

  if (!api) return <SetupNotice />;
  if (session) return <Navigate to={next} replace />;
  if (session === undefined) return <p className="loading">Cargando…</p>;

  return (
    <main className="admin-login">
      <div className="login-card">
        <span className="login-mark">
          <Icon name="lock" />
        </span>
        <p className="eyebrow">Administración</p>
        <h1>Florencia & Ignacio</h1>
        <p className="login-lede">Ingresá para gestionar la invitación.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSending(true);
            setMessage('');
            const result = await api.signIn(email, password);
            setSending(false);
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            setSession(result.email);
          }}
        >
          <label className="field">
            Usuario
            <span className="login-input">
              <Icon name="person" />
              <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </span>
          </label>
          <label className="field">
            Contraseña
            <span className="login-input">
              <Icon name="key" />
              <input type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button
                type="button"
                className="login-reveal"
                aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((current) => !current)}
              >
                <Icon name={passwordVisible ? 'visibility_off' : 'visibility'} />
              </button>
            </span>
          </label>
          <button className="btn btn-primary button" type="submit" disabled={sending}>
            <Icon name="lock" />
            {sending ? 'Ingresando…' : 'Entrar'}
          </button>
          <p className="status" role="status">{message}</p>
        </form>
        {import.meta.env.DEV ? (
          <p className="hint">
            Si todavía no definiste ADMIN_EMAIL y ADMIN_PASSWORD, el ingreso de esta computadora es novios@florenciaeignacio.local / cambiar-esta-clave.
          </p>
        ) : null}
      </div>
    </main>
  );
}

export function AdminPage() {
  const api = useApi();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('resumen');
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [error, setError] = useState('');

  async function reload() {
    if (!api) return;
    const [nextGuests, nextSongs, nextMessages] = await Promise.all([api.listGuests(), api.listSongs(), api.listMessages()]);
    setGuests(nextGuests);
    setSongs(nextSongs);
    setMessages(nextMessages);
  }

  useEffect(() => {
    document.title = 'Administración · Florencia & Ignacio';
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

  if (!api) return <SetupNotice />;
  if (email === undefined) return <p className="loading">Cargando…</p>;
  if (!email) return <Navigate to="/admin/login" replace />;

  const stats = summarizeGuests(guests.map((guest) => ({ status: guest.status, rsvp: guest.rsvp })));

  return (
    <div className="admin">
      <header className="admin-bar">
        <div>
          <p className="eyebrow">Panel</p>
          <strong>Florencia & Ignacio</strong>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary button button-secondary"
          onClick={async () => {
            await api.signOut();
            setEmail(null);
          }}
        >
          Salir
        </button>
      </header>
      <div className="tabs" role="tablist" aria-label="Secciones del panel">
        {(
          [
            ['resumen', 'Resumen'],
            ['invitados', 'Invitados'],
            ['canciones', 'Canciones'],
            ['mensajes', 'Mensajes'],
            ['contenido', 'Personalizar'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-selected' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="field-error">{error}</p> : null}
      {tab === 'resumen' ? (
        <section className="admin-section">
          <div className="stat-grid">
            <Stat label="Enviadas" value={stats.sent} />
            <Stat label="Pendientes" value={stats.pending} />
            <Stat label="Confirmadas" value={stats.confirmed} />
            <Stat label="Rechazadas" value={stats.declined} />
            <Stat label="Asistentes" value={stats.attendees} />
            <Stat label="Acompañantes" value={stats.companions} />
          </div>
          <h2>Restricciones alimentarias</h2>
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
      {tab === 'invitados' ? <GuestPanel guests={guests} onChange={reload} /> : null}
      {tab === 'canciones' ? (
        <DataTable
          title="Canciones sugeridas"
          onExport={() =>
            downloadCsv(
              'canciones-florencia-ignacio.csv',
              toCsv(
                ['invitado', 'cancion', 'artista', 'comentario', 'enlace', 'fecha'],
                songs.map((song) => [song.guestName, song.title, song.artist, song.comment, song.link, formatDateTime(song.createdAt)]),
              ),
            )
          }
          columns={['Invitado', 'Canción', 'Artista', 'Comentario', 'Enlace', 'Fecha']}
          rows={songs.map((song) => [song.guestName, song.title, song.artist, song.comment, song.link, formatDateTime(song.createdAt)])}
          empty="Todavía no hay canciones."
        />
      ) : null}
      {tab === 'mensajes' ? (
        <DataTable
          title="Mensajes para los novios"
          onExport={() =>
            downloadCsv(
              'mensajes-florencia-ignacio.csv',
              toCsv(
                ['invitado', 'mensaje', 'fecha'],
                messages.map((message) => [message.guestName, message.body, formatDateTime(message.updatedAt)]),
              ),
            )
          }
          columns={['Invitado', 'Mensaje', 'Fecha']}
          rows={messages.map((message) => [message.guestName, message.body, formatDateTime(message.updatedAt)])}
          empty="Todavía no hay mensajes."
        />
      ) : null}
      {tab === 'contenido' ? <ContentPanel /> : null}
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

function DataTable({
  title,
  columns,
  rows,
  empty,
  onExport,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  empty: string;
  onExport: () => void;
}) {
  return (
    <section className="admin-section">
      <div className="section-head">
        <h2>{title}</h2>
        <button type="button" className="btn btn-outline-primary button button-secondary" onClick={onExport} disabled={rows.length === 0}>
          Exportar CSV
        </button>
      </div>
      {rows.length === 0 ? <p>{empty}</p> : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} data-label={columns[cellIndex]}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
