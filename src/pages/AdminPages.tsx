import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';
import { SetupNotice } from './SetupNotice';

function loginNext(value: string | null) {
  if (value === '/admin/preview' || value === '/gestion') return value;
  const match = value?.match(/^\/gestion\?entrada=([a-f0-9]{32})$/i);
  return match ? `/gestion?entrada=${match[1]}` : '/gestion';
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
  const next = loginNext(params.get('next'));

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
