import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { InvitationView } from '../components/InvitationView';
import { useApi } from '../lib/api';
import type { InvitationData, PublicSite } from '../lib/models';
import { SetupNotice } from './SetupNotice';

export function HomePage() {
  const api = useApi();
  const loaded = usePublicSite(api);
  useEffect(() => {
    document.title = 'Florencia & Ignacio';
  }, []);
  if (!api) return <SetupNotice />;
  return <SiteState {...loaded} render={(site) => <InvitationView site={site} mode="home" />} />;
}

export function InvitePage() {
  const api = useApi();
  const { token = '' } = useParams();
  const loaded = usePublicSite(api);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [inviteState, setInviteState] = useState<'loading' | 'ready' | 'unavailable' | 'network'>('loading');

  useEffect(() => {
    document.title = 'Florencia & Ignacio';
  }, []);

  useEffect(() => {
    if (!api || !token) return;
    let active = true;
    api.getInvitation(token).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setInviteState(result.error === 'network' ? 'network' : 'unavailable');
        return;
      }
      setInvitation(result.invitation);
      setInviteState('ready');
    });
    return () => {
      active = false;
    };
  }, [api, token]);

  if (!api) return <SetupNotice />;
  if (inviteState === 'network') {
    return <Notice title="No pudimos abrir tu invitación" text="Revisá tu conexión e intentá de nuevo." action={() => window.location.reload()} />;
  }
  if (inviteState === 'loading' || !loaded.site) {
    if (loaded.error) return <Notice title="No pudimos abrir la invitación" text={loaded.error} action={() => window.location.reload()} />;
    return <p className="loading">Cargando la invitación…</p>;
  }
  return (
    <InvitationView
      key={token}
      site={loaded.site}
      mode={inviteState === 'ready' ? 'guest' : 'unavailable'}
      invitation={invitation}
      entryToken={token}
      onSubmit={
        invitation
          ? async (payload) => {
              const result = await api.submitRsvp(token, payload);
              if (result.ok) setInvitation(result.invitation);
              return result;
            }
          : undefined
      }
    />
  );
}

export function PreviewPage() {
  const api = useApi();
  const [site, setSite] = useState<PublicSite | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Vista previa · Florencia & Ignacio';
    if (!api) return;
    api
      .getSession()
      .then(async (session) => {
        if (!session) {
          window.location.replace('/admin/login');
          return;
        }
        const draft = await api.getDraft();
        setSite({
          content: draft,
          gallery: draft.gallery.map((item, index) => ({ id: String(index), path: item.path, alt: item.alt, sortOrder: index })),
        });
      })
      .catch((reason: Error) => setError(reason.message));
  }, [api]);

  if (!api) return <SetupNotice />;
  if (error) return <Notice title="No pudimos abrir la vista previa" text={error} />;
  if (!site) return <p className="loading">Preparando la vista previa…</p>;
  return <InvitationView site={site} mode="preview" />;
}

function usePublicSite(api: ReturnType<typeof useApi>) {
  const [site, setSite] = useState<PublicSite | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!api) return;
    api
      .getPublicSite()
      .then(setSite)
      .catch((reason: Error) => setError(reason.message || 'No pudimos cargar la invitación.'));
  }, [api]);
  return { site, error };
}

function SiteState({
  site,
  error,
  render,
}: {
  site: PublicSite | null;
  error: string;
  render: (site: PublicSite) => ReactNode;
}) {
  if (error) return <Notice title="No pudimos abrir la invitación" text={error} action={() => window.location.reload()} />;
  if (!site) return <p className="loading">Cargando la invitación…</p>;
  return render(site);
}

function Notice({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return (
    <main className="notice">
      <p className="eyebrow">Florencia & Ignacio</p>
      <h1>{title}</h1>
      <p>{text}</p>
      {action ? (
        <button type="button" className="btn btn-primary button" onClick={action}>
          Reintentar
        </button>
      ) : null}
    </main>
  );
}
