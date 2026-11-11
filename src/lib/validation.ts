import { MAX_SONGS, type Attendance, type Dietary } from '../content/defaultSite';
import { seatKey } from './floor';
import type { FloorChair, FloorObject, FloorOpening, FloorPlan, FloorSeatRole, FloorShape, FloorTable, FloorWall } from './models';

export const DIETARY_VALUES: Dietary[] = ['none', 'celiac', 'vegetarian', 'vegan', 'other'];

export type SongInput = {
  title: string;
  artist: string;
  comment: string;
  link?: string;
};

export type AttendeeInput = {
  name?: string;
  givenName?: string;
  familyName?: string;
  dietary: Dietary | '';
  dietaryNote: string;
  allergies: string;
};

export type RsvpPayload = {
  attendance: Attendance | '';
  guestDietary: Dietary | '';
  guestDietaryNote: string;
  guestAllergies: string;
  companionName: string;
  companionGivenName?: string;
  companionFamilyName?: string;
  companionDietary: Dietary | '';
  companionDietaryNote: string;
  companionAllergies: string;
  childrenUnder12: number;
  children: AttendeeInput[];
  songs: SongInput[];
  message: string;
};

export type NormalizedRsvp = {
  attendance: Attendance;
  confirmedCount: 0 | 1 | 2;
  guestDietary: Dietary | null;
  guestDietaryNote: string | null;
  guestAllergies: string | null;
  companionName: string | null;
  companionDietary: Dietary | null;
  companionDietaryNote: string | null;
  companionAllergies: string | null;
  childrenUnder12: number;
  children: { name: string; givenName: string; familyName: string; dietary: Dietary | null; dietaryNote: string | null; allergies: string | null }[];
  songs: { title: string; artist: string; comment: string | null; link: string | null }[];
  message: string | null;
};

export type FieldErrors = Partial<
  Record<
    | 'attendance'
    | 'guestDietary'
    | 'guestDietaryNote'
    | 'guestAllergies'
    | 'companionName'
    | 'companionDietary'
    | 'companionDietaryNote'
    | 'companionAllergies'
    | 'childrenUnder12'
    | 'children'
    | 'songs'
    | 'message',
    string
  >
>;

export function emptyRsvp(): RsvpPayload {
  return {
    attendance: '',
    guestDietary: '',
    guestDietaryNote: '',
    guestAllergies: '',
    companionName: '',
    companionGivenName: '',
    companionFamilyName: '',
    companionDietary: '',
    companionDietaryNote: '',
    companionAllergies: '',
    childrenUnder12: 0,
    children: [],
    songs: [],
    message: '',
  };
}

export function emptyAttendee(): AttendeeInput {
  return { givenName: '', familyName: '', name: '', dietary: '', dietaryNote: '', allergies: '' };
}

export function splitGuestName(full: string): { givenName: string; familyName: string } {
  const clean = cleanText(full);
  const space = clean.indexOf(' ');
  if (space === -1) return { givenName: clean, familyName: '' };
  return { givenName: clean.slice(0, space), familyName: clean.slice(space + 1) };
}

export function joinGuestName(givenName: string, familyName: string): string {
  return cleanText(`${givenName} ${familyName}`);
}

export function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isDietary(value: string): value is Dietary {
  return DIETARY_VALUES.includes(value as Dietary);
}

function isSongLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function readSongDraft(input: SongInput): { ok: true; song: { title: string; artist: string; comment: string; link: string } } | { ok: false; message: string } {
  const title = cleanText(input.title);
  const artist = cleanText(input.artist);
  const comment = cleanText(input.comment);
  const link = cleanText(input.link);
  if (!title || !artist) return { ok: false, message: 'Cada canción necesita nombre y artista, o podés dejarla vacía.' };
  if (title.length > 120 || artist.length > 120 || comment.length > 300 || link.length > 500) {
    return { ok: false, message: 'Algún texto de la canción es demasiado largo.' };
  }
  if (link && !isSongLink(link)) return { ok: false, message: 'El enlace tiene que empezar con http:// o https://.' };
  return { ok: true, song: { title, artist, comment, link } };
}

export function validateRsvp(
  slots: 1 | 2,
  input: RsvpPayload,
): { ok: true; value: NormalizedRsvp } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const attendance = input.attendance;

  if (attendance !== 'yes_one' && attendance !== 'yes_two' && attendance !== 'no') {
    errors.attendance = 'Elegí una respuesta para continuar.';
  } else if (slots === 1 && attendance === 'yes_two') {
    errors.attendance = 'No es posible confirmar esa cantidad de personas.';
  } else if (slots === 1 && attendance !== 'yes_one' && attendance !== 'no') {
    errors.attendance = 'Elegí una respuesta para continuar.';
  }

  if (errors.attendance || (attendance !== 'yes_one' && attendance !== 'yes_two' && attendance !== 'no')) {
    return { ok: false, errors };
  }

  const confirmedCount: 0 | 1 | 2 = attendance === 'yes_two' ? 2 : attendance === 'yes_one' ? 1 : 0;
  if (confirmedCount > slots) {
    return { ok: false, errors: { attendance: 'No es posible confirmar esa cantidad de personas.' } };
  }

  let guestDietary: Dietary | null = null;
  let guestDietaryNote: string | null = null;
  let guestAllergies: string | null = null;
  let companionName: string | null = null;
  let companionDietary: Dietary | null = null;
  let companionDietaryNote: string | null = null;
  let companionAllergies: string | null = null;
  let childrenUnder12 = 0;
  const children: NormalizedRsvp['children'] = [];

  if (confirmedCount > 0) {
    if (!isDietary(input.guestDietary)) {
      errors.guestDietary = 'Contanos si hay alguna preferencia o necesidad alimentaria.';
    } else {
      guestDietary = input.guestDietary;
      const note = cleanText(input.guestDietaryNote);
      if (guestDietary === 'other') {
        if (note.length < 2) errors.guestDietaryNote = 'Contanos cuál es la restricción.';
        else if (note.length > 200) errors.guestDietaryNote = 'El detalle es demasiado largo.';
        else guestDietaryNote = note;
      }
    }

    const allergies = cleanText(input.guestAllergies);
    if (allergies.length > 300) errors.guestAllergies = 'El texto de alergias es demasiado largo.';
    else guestAllergies = allergies || null;

    const rawChildren = (input as { childrenUnder12?: unknown }).childrenUnder12;
    if (rawChildren === undefined || rawChildren === null || rawChildren === '') {
      childrenUnder12 = 0;
    } else {
      const count = Number(rawChildren);
      if (!Number.isInteger(count) || count < 0 || count > 10) {
        errors.childrenUnder12 = 'Indicá un número de menores entre 0 y 10.';
      } else {
        childrenUnder12 = count;
      }
    }

    const listed = Array.isArray(input.children) ? input.children : [];
    if (!errors.childrenUnder12 && childrenUnder12 > 0) {
      if (listed.length !== childrenUnder12) {
        errors.children = 'Completá los datos de cada menor de 12 años.';
      } else {
        for (const child of listed) {
          const givenName = cleanText(child?.givenName);
          const familyName = cleanText(child?.familyName);
          const name = givenName || familyName ? joinGuestName(givenName, familyName) : cleanText(child?.name);
          if (givenName || familyName) {
            if (givenName.length < 2 || givenName.length > 40 || familyName.length < 2 || familyName.length > 40) {
              errors.children = 'Cada menor necesita nombre y apellido.';
              break;
            }
          } else if (name.length < 2 || name.length > 80) {
            errors.children = 'Cada menor necesita nombre y apellido.';
            break;
          }
          if (!isDietary(child.dietary)) {
            errors.children = 'Contanos la alimentación de cada menor.';
            break;
          }
          const note = cleanText(child.dietaryNote);
          let dietaryNote: string | null = null;
          if (child.dietary === 'other') {
            if (note.length < 2) {
              errors.children = 'Contanos la restricción de cada menor.';
              break;
            }
            if (note.length > 200) {
              errors.children = 'El detalle de un menor es demasiado largo.';
              break;
            }
            dietaryNote = note;
          }
          const allergies = cleanText(child.allergies);
          if (allergies.length > 300) {
            errors.children = 'El texto de alergias de un menor es demasiado largo.';
            break;
          }
          const stored = givenName || familyName ? { givenName, familyName } : splitGuestName(name);
          children.push({
            name,
            givenName: stored.givenName,
            familyName: stored.familyName,
            dietary: child.dietary,
            dietaryNote,
            allergies: allergies || null,
          });
        }
      }
    }
  }

  if (confirmedCount === 2) {
    const givenName = cleanText(input.companionGivenName);
    const familyName = cleanText(input.companionFamilyName);
    const legacy = !(givenName || familyName) ? splitGuestName(input.companionName) : null;
    const given = givenName || legacy?.givenName || '';
    const family = familyName || legacy?.familyName || '';
    if (given.length < 2 || given.length > 40 || family.length < 2 || family.length > 40) {
      errors.companionName = 'El acompañante necesita nombre y apellido.';
    } else companionName = joinGuestName(given, family);

    if (!isDietary(input.companionDietary)) {
      errors.companionDietary = 'Contanos la alimentación del acompañante.';
    } else {
      companionDietary = input.companionDietary;
      const note = cleanText(input.companionDietaryNote);
      if (companionDietary === 'other') {
        if (note.length < 2) errors.companionDietaryNote = 'Contanos la restricción del acompañante.';
        else if (note.length > 200) errors.companionDietaryNote = 'El detalle es demasiado largo.';
        else companionDietaryNote = note;
      }
    }

    const allergies = cleanText(input.companionAllergies);
    if (allergies.length > 300) errors.companionAllergies = 'El texto de alergias es demasiado largo.';
    else companionAllergies = allergies || null;
  }

  const songs: NormalizedRsvp['songs'] = [];
  const filled = input.songs.filter(
    (song) => cleanText(song.title) || cleanText(song.artist) || cleanText(song.comment) || cleanText(song.link),
  );
  if (filled.length > MAX_SONGS) {
    errors.songs = 'Podés sugerir hasta 5 canciones.';
  } else {
    for (const song of filled) {
      const read = readSongDraft(song);
      if (!read.ok) {
        errors.songs = read.message;
        break;
      }
      songs.push({ title: read.song.title, artist: read.song.artist, comment: read.song.comment || null, link: read.song.link || null });
    }
  }

  const message = cleanText(input.message);
  if (message.length > 1000) errors.message = 'El mensaje es demasiado largo.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      attendance,
      confirmedCount,
      guestDietary,
      guestDietaryNote,
      guestAllergies,
      companionName,
      companionDietary,
      companionDietaryNote,
      companionAllergies,
      childrenUnder12,
      children,
      songs,
      message: message || null,
    },
  };
}

export function validateGuestDraft(input: {
  name?: string;
  givenName?: string;
  familyName?: string;
  slots: number;
  notes: string;
}): string | null {
  const usingParts = input.givenName !== undefined || input.familyName !== undefined;
  if (usingParts) {
    const givenName = cleanText(input.givenName);
    const familyName = cleanText(input.familyName);
    if (givenName.length < 2 || givenName.length > 40) return 'El nombre necesita entre 2 y 40 caracteres.';
    if (familyName && (familyName.length < 2 || familyName.length > 40)) return 'El apellido necesita entre 2 y 40 caracteres.';
  } else {
    const name = cleanText(input.name);
    if (name.length < 2 || name.length > 80) return 'El nombre necesita entre 2 y 80 caracteres.';
  }
  if (input.slots !== 1 && input.slots !== 2) return 'Los cupos solo pueden ser 1 o 2.';
  if (input.notes.trim().length > 500) return 'Las observaciones son demasiado largas.';
  return null;
}

const FLOOR_ID = /^[a-zA-Z0-9_-]{1,40}$/;

type FloorGuest = { invitationId: string; role: FloorSeatRole; childIndex?: number | null };

function pointOk(value: number) {
  return Number.isFinite(value) && Math.abs(value) <= 20000;
}

function readShape(value: unknown): FloorShape {
  return value === 'square' || value === 'rect' ? value : 'round';
}

export function validateFloor(
  input: unknown,
  eligible: FloorGuest[],
): { ok: true; value: FloorPlan } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') return { ok: false, message: 'El plano no es válido.' };
  const body = input as { tables?: unknown; chairs?: unknown; walls?: unknown; openings?: unknown; objects?: unknown };
  if (!Array.isArray(body.tables) || !Array.isArray(body.chairs)) return { ok: false, message: 'El plano no es válido.' };
  if (body.tables.length > 80) return { ok: false, message: 'Hay demasiadas mesas.' };
  if (body.chairs.length > 800) return { ok: false, message: 'Hay demasiadas sillas.' };
  const rawWalls = Array.isArray(body.walls) ? body.walls : [];
  const rawOpenings = Array.isArray(body.openings) ? body.openings : [];
  const rawObjects = Array.isArray(body.objects) ? body.objects : [];
  if (rawWalls.length > 200 || rawOpenings.length > 200 || rawObjects.length > 40) {
    return { ok: false, message: 'El plano tiene demasiados elementos.' };
  }

  const allowed = new Set(eligible.map((person) => seatKey(person)));
  const tableIds = new Set<string>();
  const numbers = new Set<number>();
  const tables: FloorTable[] = [];

  for (const raw of body.tables) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: 'Una mesa no es válida.' };
    const table = raw as Record<string, unknown>;
    const id = String(table.id ?? '');
    const number = Number(table.number);
    const x = Number(table.x);
    const y = Number(table.y);
    const seats = table.seats == null ? 0 : Number(table.seats);
    const rotation = table.rotation == null ? 0 : Number(table.rotation);
    const shape = table.shape == null ? 'round' : readShape(table.shape);
    if (!FLOOR_ID.test(id) || tableIds.has(id)) return { ok: false, message: 'Hay una mesa repetida o sin identificar.' };
    if (!Number.isInteger(number) || number < 1 || number > 500 || numbers.has(number)) {
      return { ok: false, message: 'Cada mesa necesita un número propio.' };
    }
    if (!pointOk(x) || !pointOk(y)) return { ok: false, message: 'La posición de una mesa no es válida.' };
    if (!Number.isInteger(seats) || seats < 0 || seats > 20) return { ok: false, message: 'La cantidad de lugares de una mesa no es válida.' };
    if (!Number.isFinite(rotation)) return { ok: false, message: 'La rotación de una mesa no es válida.' };
    if (table.shape != null && table.shape !== 'round' && table.shape !== 'square' && table.shape !== 'rect') {
      return { ok: false, message: 'La forma de una mesa no es válida.' };
    }
    tableIds.add(id);
    numbers.add(number);
    tables.push({ id, number, x, y, shape: shape as FloorShape, seats, rotation });
  }

  const chairIds = new Set<string>();
  const seated = new Set<string>();
  const seatIndexes = new Set<string>();
  const chairs: FloorChair[] = [];
  for (const raw of body.chairs) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: 'Una silla no es válida.' };
    const chair = raw as Record<string, unknown>;
    const id = String(chair.id ?? '');
    const x = Number(chair.x);
    const y = Number(chair.y);
    const rotation = chair.rotation == null ? 0 : Number(chair.rotation);
    const tableId = chair.tableId == null || chair.tableId === '' ? null : String(chair.tableId);
    const seatIndex = chair.seatIndex == null || chair.seatIndex === '' ? null : Number(chair.seatIndex);
    if (!FLOOR_ID.test(id) || chairIds.has(id)) return { ok: false, message: 'Hay una silla repetida o sin identificar.' };
    if (!pointOk(x) || !pointOk(y) || !Number.isFinite(rotation)) return { ok: false, message: 'La posición de una silla no es válida.' };
    if (tableId && !tableIds.has(tableId)) return { ok: false, message: 'Hay una silla en una mesa que no existe.' };
    if (seatIndex != null && (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex > 20)) {
      return { ok: false, message: 'Hay una silla fuera de la mesa.' };
    }
    if (tableId && seatIndex != null) {
      const slot = `${tableId}:${seatIndex}`;
      if (seatIndexes.has(slot)) return { ok: false, message: 'Dos sillas ocupan el mismo lugar.' };
      seatIndexes.add(slot);
    }
    const invitationId = chair.invitationId == null || chair.invitationId === '' ? null : String(chair.invitationId);
    const role = chair.role == null || chair.role === '' ? null : chair.role;
    const childIndex = role === 'child' ? Number(chair.childIndex ?? 0) : null;
    if ((invitationId == null) !== (role == null)) return { ok: false, message: 'Una silla asignada necesita una persona.' };
    if (role != null && role !== 'guest' && role !== 'companion' && role !== 'child') {
      return { ok: false, message: 'Esa silla no corresponde a un invitado.' };
    }
    if (role === 'child' && (!Number.isInteger(childIndex) || (childIndex ?? -1) < 0 || (childIndex ?? 0) > 9)) {
      return { ok: false, message: 'Esa silla no corresponde a un menor.' };
    }
    if (invitationId && role) {
      const key = seatKey({ invitationId, role, childIndex });
      if (!allowed.has(key)) return { ok: false, message: 'Solo se puede sentar a quien confirmó asistencia.' };
      if (seated.has(key)) return { ok: false, message: 'Una persona no puede ocupar dos sillas.' };
      seated.add(key);
    }
    chairIds.add(id);
    chairs.push({
      id,
      x,
      y,
      rotation,
      tableId,
      seatIndex,
      invitationId,
      role: role as FloorSeatRole | null,
      childIndex,
    });
  }

  const wallIds = new Set<string>();
  const walls: FloorWall[] = [];
  for (const raw of rawWalls) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: 'Una pared no es válida.' };
    const wall = raw as Record<string, unknown>;
    const id = String(wall.id ?? '');
    const x1 = Number(wall.x1);
    const y1 = Number(wall.y1);
    const x2 = Number(wall.x2);
    const y2 = Number(wall.y2);
    if (!FLOOR_ID.test(id) || wallIds.has(id)) return { ok: false, message: 'Hay una pared repetida o sin identificar.' };
    if (![x1, y1, x2, y2].every(pointOk) || Math.hypot(x2 - x1, y2 - y1) < 8) {
      return { ok: false, message: 'Una pared es demasiado corta.' };
    }
    wallIds.add(id);
    walls.push({ id, x1, y1, x2, y2 });
  }

  const openingIds = new Set<string>();
  const openings: FloorOpening[] = [];
  for (const raw of rawOpenings) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: 'Una abertura no es válida.' };
    const opening = raw as Record<string, unknown>;
    const id = String(opening.id ?? '');
    const wallId = String(opening.wallId ?? '');
    const kind = opening.kind === 'window' ? 'window' : opening.kind === 'door' ? 'door' : '';
    const t = Number(opening.t);
    const width = Number(opening.width);
    if (!FLOOR_ID.test(id) || openingIds.has(id)) return { ok: false, message: 'Hay una abertura repetida.' };
    if (!wallIds.has(wallId) || !kind) return { ok: false, message: 'Una puerta o ventana no está sobre una pared.' };
    if (!Number.isFinite(t) || t <= 0 || t >= 1 || !Number.isFinite(width) || width < 16 || width > 240) {
      return { ok: false, message: 'Una puerta o ventana no entra en la pared.' };
    }
    openingIds.add(id);
    openings.push({ id, wallId, kind, t, width, flip: Boolean(opening.flip) });
  }

  const objectIds = new Set<string>();
  const objects: FloorObject[] = [];
  for (const raw of rawObjects) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: 'Hay un objeto del salón que no pudimos leer.' };
    const object = raw as Record<string, unknown>;
    const id = String(object.id ?? '');
    const kind = object.kind === 'bath' || object.kind === 'dance' || object.kind === 'stage' ? object.kind : '';
    const x = Number(object.x);
    const y = Number(object.y);
    const width = Number(object.width);
    const height = Number(object.height);
    const rotation = object.rotation == null ? 0 : Number(object.rotation);
    if (!FLOOR_ID.test(id) || objectIds.has(id) || !kind) return { ok: false, message: 'Hay un objeto del salón repetido o sin identificar.' };
    if (!pointOk(x) || !pointOk(y) || !Number.isFinite(width) || !Number.isFinite(height) || width < 24 || height < 24 || width > 2000 || height > 2000) {
      return { ok: false, message: 'El tamaño de un objeto del salón no es válido.' };
    }
    if (!Number.isFinite(rotation)) return { ok: false, message: 'La rotación de un objeto no es válida.' };
    objectIds.add(id);
    objects.push({ id, kind, x, y, width, height, rotation });
  }

  return { ok: true, value: { tables, chairs, walls, openings, objects } };
}

export function createToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type BudgetItemInput = {
  id: string;
  name: string;
  cost: number;
  paid: boolean;
  notes: string;
};

const BUDGET_ID = /^[a-zA-Z0-9_-]{1,40}$/;

export function defaultBudgetItems(): BudgetItemInput[] {
  return [
    ['salon', 'Salón'],
    ['catering', 'Cátering'],
    ['discoteca', 'Discoteca'],
    ['fotografo', 'Fotógrafo'],
    ['decoracion', 'Decoración'],
    ['invitaciones', 'Invitaciones'],
    ['cotillon', 'Cotillón'],
    ['vestido', 'Vestido'],
    ['traje', 'Traje'],
    ['peluqueria', 'Peluquería'],
    ['barberia', 'Barbería'],
  ].map(([id, name]) => ({ id, name, cost: 0, paid: false, notes: '' }));
}

const BUDGET_CURRENCIES = ['UYU', 'ARS', 'BRL', 'USD', 'EUR'] as const;

export function validatePartyBudget(input: unknown): { ok: true; value: { total: number; currency: (typeof BUDGET_CURRENCIES)[number]; items: BudgetItemInput[] } } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') return { ok: false, message: 'El presupuesto no es válido.' };
  const body = input as { total?: unknown; currency?: unknown; items?: unknown };
  const total = Number(body.total);
  if (!Number.isFinite(total) || total < 0 || total > 1_000_000_000_000) {
    return { ok: false, message: 'El presupuesto tiene que ser un número mayor o igual a cero.' };
  }
  if (!BUDGET_CURRENCIES.includes(body.currency as (typeof BUDGET_CURRENCIES)[number])) {
    return { ok: false, message: 'Elegí la moneda de los gastos.' };
  }
  if (!Array.isArray(body.items) || body.items.length > 60) return { ok: false, message: 'Los ítems del presupuesto no son válidos.' };
  const items: BudgetItemInput[] = [];
  const ids = new Set<string>();
  for (const item of body.items) {
    if (!item || typeof item !== 'object') return { ok: false, message: 'Hay un ítem que no pudimos leer.' };
    const row = item as { id?: unknown; name?: unknown; cost?: unknown; paid?: unknown; notes?: unknown };
    const id = String(row.id ?? '');
    const name = cleanText(row.name);
    const notes = cleanText(row.notes);
    const cost = Number(row.cost);
    if (!BUDGET_ID.test(id) || ids.has(id)) return { ok: false, message: 'Hay un ítem repetido o sin identificar.' };
    if (name.length < 1 || name.length > 60) return { ok: false, message: 'Cada ítem necesita un nombre de hasta 60 caracteres.' };
    if (notes.length > 240) return { ok: false, message: 'Las observaciones son demasiado largas.' };
    if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000_000) return { ok: false, message: 'El costo tiene que ser un número mayor o igual a cero.' };
    if (typeof row.paid !== 'boolean') return { ok: false, message: 'Indicá si el ítem está pagado.' };
    ids.add(id);
    items.push({ id, name, cost, paid: row.paid, notes });
  }
  return { ok: true, value: { total, currency: body.currency as (typeof BUDGET_CURRENCIES)[number], items } };
}
