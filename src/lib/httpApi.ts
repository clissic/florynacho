import type { InvitationStatus, SiteContent } from '../content/defaultSite';
import type {
  AdminGuestInput,
  CheckInBoard,
  CheckInResult,
  GuestRow,
  FloorPlan,
  PartyBudget,
  InvitationData,
  MessageRow,
  PublicSite,
  SongRow,
  SubmitResult,
  WeddingApi,
} from './models';
import type { RsvpPayload } from './validation';

type ErrorBody = { message?: string; ok?: boolean; error?: string; errors?: SubmitResult extends { ok: false } ? SubmitResult['errors'] : never };

async function readJson<T>(response: Response): Promise<T & ErrorBody> {
  return (await response.json().catch(() => ({}))) as T & ErrorBody;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('No pudimos conectar. Revisá tu conexión e intentá de nuevo.');
  }
  const data = await readJson<T>(response);
  if (!response.ok) throw new Error(data.message || 'No pudimos completar la acción.');
  return data;
}

export function createServerApi(): WeddingApi {
  return {
    mode: 'server',
    getPublicSite() {
      return request<PublicSite>('/api/site');
    },
    async getInvitation(token) {
      try {
        const response = await fetch(`/api/invitations/${token}`, { credentials: 'include' });
        const data = await readJson<InvitationData & { ok: boolean }>(response);
        if (!response.ok) return { ok: false, error: 'network' };
        if (!data.ok) return { ok: false, error: 'unavailable' };
        return {
          ok: true,
          invitation: {
            guestName: data.guestName,
            givenName: data.givenName,
            slots: data.slots,
            rsvp: data.rsvp,
            songs: data.songs,
            message: data.message,
          },
        };
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    async submitRsvp(token, payload: RsvpPayload): Promise<SubmitResult> {
      try {
        const response = await fetch(`/api/invitations/${token}/rsvp`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await readJson<SubmitResult & InvitationData>(response);
        if (response.status === 429 || response.status === 400 || (response.ok && data.ok === false)) {
          return {
            ok: false,
            error: data.error === 'rate_limited' || data.error === 'invalid' || data.error === 'unavailable' ? data.error : 'server',
            message: data.message,
            errors: data.errors,
          };
        }
        if (!response.ok || !data.ok) {
          return { ok: false, error: 'server', message: data.message || 'No pudimos guardar tu respuesta. Intentá de nuevo.' };
        }
        return {
          ok: true,
          invitation: {
            guestName: data.guestName,
            givenName: data.givenName,
            slots: data.slots,
            rsvp: data.rsvp,
            songs: data.songs,
            message: data.message,
          },
        };
      } catch {
        return {
          ok: false,
          error: 'network',
          message: 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.',
        };
      }
    },
    async getSession() {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'include' });
        if (!response.ok) return null;
        const data = await readJson<{ email?: string }>(response);
        return data.email ? { email: data.email } : null;
      } catch {
        return null;
      }
    },
    async signIn(email, password) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await readJson<{ ok?: boolean; email?: string; message?: string }>(response);
        if (!response.ok || !data.email) return { ok: false, message: data.message || 'El usuario o la contraseña no coinciden.' };
        return { ok: true, email: data.email };
      } catch {
        return { ok: false, message: 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.' };
      }
    },
    async signOut() {
      await request('/api/auth/logout', { method: 'POST' });
    },
    listGuests() {
      return request<GuestRow[]>('/api/admin/guests');
    },
    async saveGuest(id, input: AdminGuestInput) {
      if (!id) return request<GuestRow>('/api/admin/guests', { method: 'POST', body: JSON.stringify(input) });
      await request(`/api/admin/guests/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
      const guests = await request<GuestRow[]>('/api/admin/guests');
      const saved = guests.find((guest) => guest.id === id);
      if (!saved) throw new Error('Guardamos el cambio, pero no pudimos mostrarlo. Actualizá la página.');
      return saved;
    },
    async setGuestStatus(id, status: InvitationStatus) {
      await request(`/api/admin/guests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    deleteGuest(id) {
      return request(`/api/admin/guests/${id}`, { method: 'DELETE' });
    },
    getGuestResponse(id) {
      return request<InvitationData>(`/api/admin/guests/${id}/response`);
    },
    async saveGuestResponse(id, payload: RsvpPayload): Promise<SubmitResult> {
      try {
        const response = await fetch(`/api/admin/guests/${id}/response`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await readJson<SubmitResult & InvitationData>(response);
        if (response.status === 400 || (response.ok && data.ok === false)) {
          return {
            ok: false,
            error: 'invalid',
            message: data.message,
            errors: data.errors,
          };
        }
        if (!response.ok || !data.ok) {
          return { ok: false, error: 'server', message: data.message || 'No pudimos guardar la respuesta.' };
        }
        return {
          ok: true,
          invitation: {
            guestName: data.guestName,
            givenName: data.givenName,
            slots: data.slots,
            rsvp: data.rsvp,
            songs: data.songs,
            message: data.message,
          },
        };
      } catch {
        return { ok: false, error: 'network', message: 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.' };
      }
    },
    getFloor() {
      return request<FloorPlan>('/api/admin/floor');
    },
    saveFloor(plan: FloorPlan) {
      return request<FloorPlan>('/api/admin/floor', { method: 'PUT', body: JSON.stringify(plan) });
    },
    getBudget() {
      return request<PartyBudget>('/api/admin/budget');
    },
    saveBudget(budget) {
      return request<PartyBudget>('/api/admin/budget', { method: 'PUT', body: JSON.stringify(budget) });
    },
    importGuests(guests) {
      return request<{ created: number }>('/api/admin/guests/import', { method: 'POST', body: JSON.stringify({ guests }) });
    },
    listSongs() {
      return request<SongRow[]>('/api/admin/songs');
    },
    listCheckIns() {
      return request<CheckInBoard>('/api/admin/check-ins');
    },
    checkIn(token) {
      return request<CheckInResult>('/api/admin/check-in', { method: 'POST', body: JSON.stringify({ token }) });
    },
    listMessages() {
      return request<MessageRow[]>('/api/admin/messages');
    },
    getDraft() {
      return request<SiteContent>('/api/admin/draft');
    },
    async saveDraft(content: SiteContent) {
      await request('/api/admin/draft', { method: 'PUT', body: JSON.stringify(content) });
    },
    async publish() {
      await request('/api/admin/publish', { method: 'POST' });
    },
    async uploadImage(file, folder) {
      const body = new FormData();
      body.append('file', file);
      const data = await request<{ path: string }>(`/api/admin/media/image?folder=${folder}`, { method: 'POST', body });
      return data.path;
    },
    async uploadMusic(file) {
      const body = new FormData();
      body.append('file', file);
      const data = await request<{ path: string }>('/api/admin/media/audio', { method: 'POST', body });
      return data.path;
    },
    async deleteMedia(mediaPath) {
      if (!mediaPath || mediaPath.startsWith('data:') || mediaPath.startsWith('http') || mediaPath.startsWith('/')) return;
      await request('/api/admin/media', { method: 'DELETE', body: JSON.stringify({ path: mediaPath }) });
    },
  };
}
