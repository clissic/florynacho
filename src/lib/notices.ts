import { deadlineHasPassed } from './dates';
import type { GuestRow, MessageRow, SongRow } from './models';

export type NoticeKind = 'pending' | 'confirmed' | 'declined' | 'late' | 'song' | 'message' | 'deadline';

export type NoticeSection = 'invitados' | 'canciones' | 'mensajes' | 'resumen' | 'personalizar';

export type AppNotice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  at: string;
  section: NoticeSection;
};

export type NoticePrefs = {
  seenIds: string[];
  hiddenInDropdown: string[];
};

const STORAGE_KEY = 'fi_notice_prefs_v1';
const DROPDOWN_LIMIT = 10;

export const NOTICE_ICONS: Record<NoticeKind, string> = {
  pending: 'hourglass_empty',
  confirmed: 'check_circle',
  declined: 'cancel',
  late: 'event_busy',
  song: 'music_note',
  message: 'mail',
  deadline: 'schedule',
};

export function emptyNoticePrefs(): NoticePrefs {
  return { seenIds: [], hiddenInDropdown: [] };
}

export function loadNoticePrefs(): NoticePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyNoticePrefs();
    const parsed = JSON.parse(raw) as Partial<NoticePrefs>;
    return {
      seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds.filter((id) => typeof id === 'string') : [],
      hiddenInDropdown: Array.isArray(parsed.hiddenInDropdown)
        ? parsed.hiddenInDropdown.filter((id) => typeof id === 'string')
        : [],
    };
  } catch {
    return emptyNoticePrefs();
  }
}

export function saveNoticePrefs(prefs: NoticePrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function buildNotices(input: {
  guests: GuestRow[];
  songs: SongRow[];
  messages: MessageRow[];
  deadline: string;
}): AppNotice[] {
  const notices: AppNotice[] = [];

  for (const guest of input.guests) {
    if (guest.status !== 'active') continue;
    if (!guest.rsvp) {
      notices.push({
        id: `pending:${guest.id}`,
        kind: 'pending',
        title: 'Sin confirmar',
        body: `${guest.guestName} todavía no confirmó.`,
        at: guest.createdAt,
        section: 'invitados',
      });
      continue;
    }

    if (guest.rsvp.attendance === 'no') {
      notices.push({
        id: `declined:${guest.id}:${guest.rsvp.updatedAt}`,
        kind: 'declined',
        title: 'No asiste',
        body: `${guest.guestName} respondió que no puede venir.`,
        at: guest.rsvp.updatedAt,
        section: 'invitados',
      });
    } else if (guest.rsvp.confirmedCount > 0) {
      const late = guest.rsvp.afterDeadline;
      notices.push({
        id: `${late ? 'late' : 'confirmed'}:${guest.id}:${guest.rsvp.updatedAt}`,
        kind: late ? 'late' : 'confirmed',
        title: late ? 'Confirmó fuera de fecha' : 'Nueva confirmación',
        body:
          guest.rsvp.confirmedCount === 2
            ? `${guest.guestName} confirmaron asistencia${late ? ' fuera de fecha' : ''}.`
            : `${guest.guestName} confirmó asistencia${late ? ' fuera de fecha' : ''}.`,
        at: guest.rsvp.updatedAt,
        section: 'invitados',
      });
    }
  }

  for (const song of input.songs) {
    notices.push({
      id: `song:${song.id}`,
      kind: 'song',
      title: 'Canción sugerida',
      body: `${song.guestName} pidió “${song.title}”${song.artist ? ` · ${song.artist}` : ''}.`,
      at: song.createdAt,
      section: 'canciones',
    });
  }

  for (const message of input.messages) {
    const who = message.authors?.length ? message.authors.join(' y ') : message.guestName;
    notices.push({
      id: `message:${message.id}`,
      kind: 'message',
      title: 'Mensaje para los novios',
      body: `${who}: ${message.body.slice(0, 120)}${message.body.length > 120 ? '…' : ''}`,
      at: message.updatedAt,
      section: 'mensajes',
    });
  }

  if (deadlineHasPassed(input.deadline)) {
    notices.push({
      id: `deadline:${input.deadline}`,
      kind: 'deadline',
      title: 'Confirmaciones cerradas',
      body: 'Ya pasó el límite para confirmar. Revisá pendientes y respuestas fuera de fecha.',
      at: `${input.deadline}T23:59:59-03:00`,
      section: 'resumen',
    });
  }

  return notices.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}

export function unreadCount(notices: AppNotice[], prefs: NoticePrefs) {
  const seen = new Set(prefs.seenIds);
  return notices.reduce((count, notice) => count + (seen.has(notice.id) ? 0 : 1), 0);
}

export function dropdownNotices(notices: AppNotice[], prefs: NoticePrefs) {
  const hidden = new Set(prefs.hiddenInDropdown);
  return notices.filter((notice) => !hidden.has(notice.id)).slice(0, DROPDOWN_LIMIT);
}

export function markSeen(prefs: NoticePrefs, ids: string[]): NoticePrefs {
  const seen = new Set(prefs.seenIds);
  for (const id of ids) seen.add(id);
  return { ...prefs, seenIds: [...seen] };
}

export function hideFromDropdown(prefs: NoticePrefs, ids: string[]): NoticePrefs {
  const hidden = new Set(prefs.hiddenInDropdown);
  for (const id of ids) hidden.add(id);
  return { ...prefs, hiddenInDropdown: [...hidden] };
}

export { DROPDOWN_LIMIT };
