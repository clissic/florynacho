import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { parseSiteContent } from '../src/lib/content';
import { deadlineHasPassed } from '../src/lib/dates';
import { createToken, defaultBudgetItems, joinGuestName, splitGuestName, validateFloor, validateGuestDraft, validatePartyBudget, validateRsvp, cleanText, type RsvpPayload } from '../src/lib/validation';
import { clearSessionCookie, requireAdmin, setSessionCookie, signSession } from './auth';
import { BudgetModel, EventModel, FloorModel, InvitationModel, MessageModel, RsvpModel, SongModel, UserModel } from './models';
import { consumeLoginAttempt, consumeRateLimit } from './rateLimit';
import { folderFromRequest, removeMedia, saveAudio, saveImage, upload } from './uploads';

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function clientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function unavailable(_req: Request, res: Response) {
  res.status(200).json({ ok: false, error: 'unavailable' });
}

function presentRsvp(
  rsvp: {
    attendance: string;
    confirmedCount: number;
    guestDietary?: string | null;
    guestDietaryNote: string;
    guestAllergies: string;
    companionName: string;
    companionDietary?: string | null;
    companionDietaryNote: string;
    companionAllergies: string;
    childrenUnder12?: number;
    children?: { name: string; givenName?: string; familyName?: string; dietary?: string | null; dietaryNote?: string; allergies?: string }[];
    afterDeadline?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  } | null | undefined,
  deadline?: string | null,
) {
  if (!rsvp) return null;
  const afterDeadline =
    typeof rsvp.afterDeadline === 'boolean'
      ? rsvp.afterDeadline
      : Boolean(deadline && rsvp.createdAt && deadlineHasPassed(deadline, new Date(rsvp.createdAt).getTime()));
  return {
    attendance: rsvp.attendance,
    confirmedCount: rsvp.confirmedCount,
    guestDietary: rsvp.guestDietary ?? null,
    guestDietaryNote: rsvp.guestDietaryNote,
    guestAllergies: rsvp.guestAllergies,
    companionName: rsvp.companionName,
    companionDietary: rsvp.companionDietary ?? null,
    companionDietaryNote: rsvp.companionDietaryNote,
    companionAllergies: rsvp.companionAllergies,
    childrenUnder12: rsvp.childrenUnder12 ?? 0,
    children: (rsvp.children ?? []).map((child) => {
      const parts = splitGuestName(child.name);
      return {
        name: child.name,
        givenName: child.givenName || parts.givenName,
        familyName: child.familyName || parts.familyName,
        dietary: child.dietary ?? null,
        dietaryNote: child.dietaryNote ?? '',
        allergies: child.allergies ?? '',
      };
    }),
    afterDeadline,
    updatedAt: rsvp.updatedAt,
  };
}

async function eventDeadline(eventId: unknown) {
  const event = await EventModel.findById(eventId);
  const content = parseSiteContent(event?.published) ?? parseSiteContent(event?.draft);
  return content?.rsvpDeadline ?? null;
}

function storedNames(body: { name?: string; givenName?: string; familyName?: string }) {
  if (body.givenName !== undefined || body.familyName !== undefined) {
    const givenName = cleanText(body.givenName);
    const familyName = cleanText(body.familyName);
    return { givenName, familyName, guestName: joinGuestName(givenName, familyName) };
  }
  const guestName = cleanText(body.name);
  return { guestName, ...splitGuestName(guestName) };
}

async function responseView(invitation: { _id: unknown; eventId?: unknown; guestName: string; givenName?: string; slots: number }) {
  const [rsvp, songs, message, deadline] = await Promise.all([
    RsvpModel.findOne({ invitationId: invitation._id }),
    SongModel.find({ invitationId: invitation._id }).sort({ createdAt: 1 }),
    MessageModel.findOne({ invitationId: invitation._id }),
    eventDeadline(invitation.eventId),
  ]);
  return {
    guestName: invitation.guestName,
    givenName: invitation.givenName || splitGuestName(invitation.guestName).givenName,
    slots: invitation.slots as 1 | 2,
    rsvp: presentRsvp(rsvp, deadline),
    songs: songs.map((song) => ({ title: song.title, artist: song.artist, comment: song.comment, link: song.link ?? '' })),
    message: message?.body ?? '',
  };
}

async function invitationView(invitationId: string) {
  const invitation = await InvitationModel.findById(invitationId);
  if (!invitation || invitation.status !== 'active') return null;
  return { ok: true as const, ...(await responseView(invitation)) };
}

async function saveInvitationResponse(invitation: { _id: unknown; eventId: unknown; slots: number }, body: RsvpPayload) {
  const validated = validateRsvp(invitation.slots as 1 | 2, body);
  if (!validated.ok) return validated;
  const value = validated.value;
  const [existing, deadline] = await Promise.all([
    RsvpModel.findOne({ invitationId: invitation._id }),
    eventDeadline(invitation.eventId),
  ]);
  const existingRaw = existing?.toObject?.() as Record<string, unknown> | undefined;
  const afterDeadline = existing
    ? Object.prototype.hasOwnProperty.call(existingRaw ?? {}, 'afterDeadline')
      ? Boolean(existingRaw?.afterDeadline)
      : Boolean(deadline && existing.createdAt && deadlineHasPassed(deadline, new Date(existing.createdAt).getTime()))
    : Boolean(deadline && deadlineHasPassed(deadline));
  await RsvpModel.findOneAndUpdate(
    { invitationId: invitation._id },
    {
      eventId: invitation.eventId,
      invitationId: invitation._id,
      attendance: value.attendance,
      confirmedCount: value.confirmedCount,
      guestDietary: value.guestDietary,
      guestDietaryNote: value.guestDietaryNote ?? '',
      guestAllergies: value.guestAllergies ?? '',
      companionName: value.companionName ?? '',
      companionDietary: value.companionDietary,
      companionDietaryNote: value.companionDietaryNote ?? '',
      companionAllergies: value.companionAllergies ?? '',
      childrenUnder12: value.childrenUnder12,
      children: value.children,
      afterDeadline,
    },
    { upsert: true, new: true },
  );
  await SongModel.deleteMany({ invitationId: invitation._id });
  if (value.songs.length) {
    await SongModel.insertMany(
      value.songs.map((song) => ({
        eventId: invitation.eventId,
        invitationId: invitation._id,
        title: song.title,
        artist: song.artist,
        comment: song.comment ?? '',
        link: song.link ?? '',
      })),
    );
  }
  if (value.message) {
    await MessageModel.findOneAndUpdate(
      { invitationId: invitation._id },
      { eventId: invitation.eventId, invitationId: invitation._id, body: value.message },
      { upsert: true },
    );
  } else {
    await MessageModel.deleteOne({ invitationId: invitation._id });
  }
  return { ok: true as const };
}

type DoorPerson = { dietary?: string | null; allergies?: string | null };

function partySize(rsvp: { attendance: string; childrenUnder12?: number | null }) {
  if (rsvp.attendance !== 'yes_one' && rsvp.attendance !== 'yes_two') return 0;
  const children = Number(rsvp.childrenUnder12 ?? 0);
  const minors = Number.isInteger(children) && children > 0 ? Math.min(children, 10) : 0;
  return (rsvp.attendance === 'yes_two' ? 2 : 1) + minors;
}

function emptyDoorCounts() {
  return { celiac: 0, vegetarian: 0, vegan: 0, other: 0, allergies: 0, children: 0 };
}

function countDoorPerson(counts: ReturnType<typeof emptyDoorCounts>, person: DoorPerson) {
  const dietary = person.dietary ?? '';
  if (dietary === 'celiac' || dietary === 'vegetarian' || dietary === 'vegan' || dietary === 'other') counts[dietary] += 1;
  if ((person.allergies ?? '').trim()) counts.allergies += 1;
}

function doorCounts(rsvp: {
  attendance: string;
  guestDietary?: string | null;
  guestAllergies?: string | null;
  companionDietary?: string | null;
  companionAllergies?: string | null;
  childrenUnder12?: number | null;
  children?: DoorPerson[] | null;
}) {
  const counts = emptyDoorCounts();
  if (rsvp.attendance !== 'yes_one' && rsvp.attendance !== 'yes_two') return counts;
  countDoorPerson(counts, { dietary: rsvp.guestDietary, allergies: rsvp.guestAllergies });
  if (rsvp.attendance === 'yes_two') countDoorPerson(counts, { dietary: rsvp.companionDietary, allergies: rsvp.companionAllergies });
  const declared = Number(rsvp.childrenUnder12 ?? 0);
  counts.children = Number.isInteger(declared) && declared > 0 ? Math.min(declared, 10) : 0;
  for (const child of rsvp.children ?? []) countDoorPerson(counts, child);
  return counts;
}

async function accreditedTotal(eventId: unknown) {
  const rows = await RsvpModel.find({ eventId, accreditedAt: { $exists: true, $ne: null } });
  return rows.reduce((sum, row) => sum + (row.accreditedCount || 0), 0);
}

function presentFloor(floor: {
  tables?: { id: string; number: number; x: number; y: number; shape?: string; seats?: number; rotation?: number }[];
  chairs?: { id: string; x: number; y: number; rotation?: number; tableId?: string | null; seatIndex?: number | null; invitationId?: string | null; role?: string | null; childIndex?: number | null }[];
  walls?: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  openings?: { id: string; wallId: string; kind: string; t: number; width: number; flip?: boolean }[];
  objects?: { id: string; kind: string; x: number; y: number; width: number; height: number; rotation?: number }[];
} | null) {
  if (!floor) return { tables: [], chairs: [], walls: [], openings: [], objects: [] };
  return {
    tables: (floor.tables ?? []).map((table) => ({
      id: table.id,
      number: table.number,
      x: table.x,
      y: table.y,
      shape: table.shape === 'square' || table.shape === 'rect' ? table.shape : 'round',
      seats: Number.isInteger(table.seats) ? table.seats : 0,
      rotation: Number(table.rotation) || 0,
    })),
    chairs: (floor.chairs ?? []).map((chair) => ({
      id: chair.id,
      x: chair.x,
      y: chair.y,
      rotation: Number(chair.rotation) || 0,
      tableId: chair.tableId || null,
      seatIndex: Number.isInteger(chair.seatIndex) ? chair.seatIndex : null,
      invitationId: chair.invitationId || null,
      role: chair.role === 'guest' || chair.role === 'companion' || chair.role === 'child' ? chair.role : null,
      childIndex: chair.role === 'child' && Number.isInteger(chair.childIndex) ? chair.childIndex : null,
    })),
    walls: (floor.walls ?? []).map((wall) => ({ id: wall.id, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 })),
    openings: (floor.openings ?? []).map((opening) => ({
      id: opening.id,
      wallId: opening.wallId,
      kind: opening.kind === 'window' ? 'window' : 'door',
      t: opening.t,
      width: opening.width,
      flip: Boolean(opening.flip),
    })),
    objects: (floor.objects ?? []).map((object) => ({
      id: object.id,
      kind: object.kind === 'dance' || object.kind === 'stage' ? object.kind : 'bath',
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: Number(object.rotation) || 0,
    })),
  };
}

async function clearSeat(eventId: unknown, invitationId: string) {
  const floor = await FloorModel.findOne({ eventId });
  if (!floor) return;
  let changed = false;
  for (const chair of floor.chairs) {
    if (chair.invitationId === invitationId) {
      chair.invitationId = null;
      chair.role = null;
      chair.childIndex = null;
      changed = true;
    }
  }
  if (changed) {
    floor.markModified('chairs');
    await floor.save();
  }
}

async function currentEvent(eventId: string) {
  return EventModel.findById(eventId);
}

export function registerRoutes(app: import('express').Express) {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/site', async (_req, res) => {
    const event = await EventModel.findOne({ slug: 'florencia-ignacio' });
    const content = parseSiteContent(event?.published);
    if (!content) {
      res.status(503).json({ message: 'El sitio todavía no tiene contenido publicado.' });
      return;
    }
    res.json({
      content,
      gallery: content.gallery.map((item, index) => ({ id: String(index), path: item.path, alt: item.alt, sortOrder: index })),
    });
  });

  app.get('/api/invitations/:token', async (req, res) => {
    const invitation = await InvitationModel.findOne({ token: req.params.token });
    if (!invitation) return unavailable(req, res);
    const view = await invitationView(String(invitation._id));
    if (!view) return unavailable(req, res);
    res.json(view);
  });

  app.post('/api/invitations/:token/rsvp', async (req, res) => {
    const token = req.params.token;
    const ip = clientIp(req);
    if (!consumeRateLimit(`ip:${ip}`, 100, 60 * 60 * 1000) || !consumeRateLimit(token)) {
      res.status(429).json({ ok: false, error: 'rate_limited', message: 'Demasiados intentos. Esperá un rato y probá de nuevo.' });
      return;
    }
    const invitation = await InvitationModel.findOne({ token });
    if (!invitation || invitation.status !== 'active') return unavailable(req, res);
    const saved = await saveInvitationResponse(invitation, req.body as RsvpPayload);
    if (!saved.ok) {
      res.status(400).json({ ok: false, error: 'invalid', errors: saved.errors, message: 'Revisá los campos marcados.' });
      return;
    }
    const view = await invitationView(String(invitation._id));
    res.json({ ...view, saved: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const key = clientIp(req);
    if (!consumeLoginAttempt(key)) {
      res.status(429).json({ ok: false, message: 'Demasiados intentos. Esperá unos segundos y probá de nuevo.' });
      return;
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envPassword = process.env.ADMIN_PASSWORD || '';
    const user = await UserModel.findOne({ email });

    let accepted = false;
    if (envPassword) {
      const emailOk = envEmail ? email === envEmail : Boolean(user);
      accepted = Boolean(user && emailOk && sameSecret(password, envPassword));
    } else {
      accepted = Boolean(user && (await bcrypt.compare(password, user.passwordHash)));
    }

    if (!user || !accepted) {
      res.status(401).json({ ok: false, message: 'El usuario o la contraseña no coinciden.' });
      return;
    }
    setSessionCookie(res, signSession(String(user._id), user.email));
    res.json({ ok: true, email: user.email });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/session', requireAdmin, (req, res) => {
    res.json({ email: req.admin?.email });
  });

  app.get('/api/admin/guests', requireAdmin, async (req, res) => {
    const [invitations, deadline] = await Promise.all([
      InvitationModel.find({ eventId: req.admin?.eventId }).sort({ guestName: 1 }),
      eventDeadline(req.admin?.eventId),
    ]);
    const rsvps = await RsvpModel.find({ invitationId: { $in: invitations.map((item) => item._id) } });
    const byId = new Map(rsvps.map((item) => [String(item.invitationId), item]));
    res.json(
      invitations.map((invitation) => {
        const rsvp = byId.get(String(invitation._id));
        const names = splitGuestName(invitation.guestName);
        return {
          id: String(invitation._id),
          token: invitation.token,
          guestName: invitation.guestName,
          givenName: invitation.givenName || names.givenName,
          familyName: invitation.familyName || names.familyName,
          slots: invitation.slots,
          status: invitation.status,
          notes: invitation.notes,
          createdAt: invitation.createdAt,
          accredited: Boolean(rsvp?.accreditedAt),
          rsvp: presentRsvp(rsvp ?? null, deadline),
        };
      }),
    );
  });

  app.post('/api/admin/guests', requireAdmin, async (req, res) => {
    const usingParts = req.body?.givenName !== undefined || req.body?.familyName !== undefined;
    const problem = validateGuestDraft({
      name: req.body?.name,
      givenName: usingParts ? req.body?.givenName : undefined,
      familyName: usingParts ? req.body?.familyName : undefined,
      slots: Number(req.body?.slots),
      notes: req.body?.notes ?? '',
    });
    if (problem) {
      res.status(400).json({ message: problem });
      return;
    }
    const names = storedNames(req.body ?? {});
    const created = await InvitationModel.create({
      eventId: req.admin?.eventId,
      token: createToken(),
      ...names,
      slots: Number(req.body.slots),
      status: 'active',
      notes: String(req.body.notes ?? '').trim(),
    });
    res.status(201).json({
      id: String(created._id),
      token: created.token,
      guestName: created.guestName,
      givenName: created.givenName,
      familyName: created.familyName,
      slots: created.slots,
      status: created.status,
      notes: created.notes,
      createdAt: created.createdAt,
      rsvp: null,
    });
  });

  app.patch('/api/admin/guests/:id', requireAdmin, async (req, res) => {
    const invitation = await InvitationModel.findOne({ _id: req.params.id, eventId: req.admin?.eventId });
    if (!invitation) {
      res.status(404).json({ message: 'No encontramos esa invitación.' });
      return;
    }
    const slots = req.body.slots === undefined ? invitation.slots : Number(req.body.slots);
    const usingParts = req.body?.givenName !== undefined || req.body?.familyName !== undefined;
    const problem = validateGuestDraft({
      name: usingParts ? undefined : req.body.name ?? invitation.guestName,
      givenName: usingParts ? req.body?.givenName : undefined,
      familyName: usingParts ? req.body?.familyName : undefined,
      slots,
      notes: req.body.notes ?? invitation.notes,
    });
    if (problem) {
      res.status(400).json({ message: problem });
      return;
    }
    const rsvp = await RsvpModel.findOne({ invitationId: invitation._id });
    if (rsvp && rsvp.confirmedCount > slots) {
      res.status(400).json({ message: 'Esta invitación ya tiene más personas confirmadas. Pediles que actualicen la respuesta antes de reducir los cupos.' });
      return;
    }
    if (usingParts || req.body.name !== undefined) {
      const names = storedNames(usingParts ? req.body : { name: req.body.name ?? invitation.guestName });
      invitation.guestName = names.guestName;
      invitation.givenName = names.givenName;
      invitation.familyName = names.familyName;
    }
    invitation.slots = slots as 1 | 2;
    invitation.notes = String(req.body.notes ?? invitation.notes).trim();
    if (req.body.status === 'active' || req.body.status === 'revoked') invitation.status = req.body.status;
    await invitation.save();
    res.json({ ok: true });
  });

  app.get('/api/admin/guests/:id/response', requireAdmin, async (req, res) => {
    const invitation = await InvitationModel.findOne({ _id: req.params.id, eventId: req.admin?.eventId });
    if (!invitation) {
      res.status(404).json({ message: 'No encontramos esa invitación.' });
      return;
    }
    res.json(await responseView(invitation));
  });

  app.post('/api/admin/guests/:id/response', requireAdmin, async (req, res) => {
    const invitation = await InvitationModel.findOne({ _id: req.params.id, eventId: req.admin?.eventId });
    if (!invitation) {
      res.status(404).json({ message: 'No encontramos esa invitación.' });
      return;
    }
    const saved = await saveInvitationResponse(invitation, req.body as RsvpPayload);
    if (!saved.ok) {
      res.status(400).json({ ok: false, error: 'invalid', errors: saved.errors, message: 'Revisá los campos marcados.' });
      return;
    }
    res.json({ ok: true, ...(await responseView(invitation)) });
  });

  app.delete('/api/admin/guests/:id', requireAdmin, async (req, res) => {
    const invitation = await InvitationModel.findOneAndDelete({ _id: req.params.id, eventId: req.admin?.eventId });
    if (!invitation) {
      res.status(404).json({ message: 'No encontramos esa invitación.' });
      return;
    }
    await Promise.all([
      RsvpModel.deleteMany({ invitationId: invitation._id }),
      SongModel.deleteMany({ invitationId: invitation._id }),
      MessageModel.deleteMany({ invitationId: invitation._id }),
      clearSeat(invitation.eventId, String(invitation._id)),
    ]);
    res.json({ ok: true });
  });

  app.post('/api/admin/guests/import', requireAdmin, async (req, res) => {
    const rows = Array.isArray(req.body?.guests) ? req.body.guests : [];
    const documents = [];
    for (const row of rows) {
      const problem = validateGuestDraft(row);
      if (problem) {
        res.status(400).json({ message: problem });
        return;
      }
      documents.push({
        eventId: req.admin?.eventId,
        token: createToken(),
        ...storedNames(row),
        slots: row.slots,
        status: 'active',
        notes: String(row.notes ?? '').trim(),
      });
    }
    if (documents.length) await InvitationModel.insertMany(documents);
    res.json({ created: documents.length });
  });

  app.get('/api/admin/floor', requireAdmin, async (req, res) => {
    const floor = await FloorModel.findOne({ eventId: req.admin?.eventId });
    res.json(presentFloor(floor));
  });

  app.put('/api/admin/floor', requireAdmin, async (req, res) => {
    const invitations = await InvitationModel.find({ eventId: req.admin?.eventId, status: 'active' });
    const rsvps = await RsvpModel.find({ invitationId: { $in: invitations.map((item) => item._id) } });
    const eligible: { invitationId: string; role: 'guest' | 'companion' | 'child'; childIndex: number | null }[] = [];
    for (const rsvp of rsvps) {
      const invitationId = String(rsvp.invitationId);
      if (rsvp.attendance === 'yes_one' || rsvp.attendance === 'yes_two') {
        eligible.push({ invitationId, role: 'guest', childIndex: null });
      }
      if (rsvp.attendance === 'yes_two') eligible.push({ invitationId, role: 'companion', childIndex: null });
      if (rsvp.attendance === 'yes_one' || rsvp.attendance === 'yes_two') {
        const declared = Number(rsvp.childrenUnder12 ?? 0);
        const minors = Number.isInteger(declared) && declared > 0 ? Math.min(declared, 10) : 0;
        for (let index = 0; index < minors; index += 1) eligible.push({ invitationId, role: 'child', childIndex: index });
      }
    }
    const validated = validateFloor(req.body, eligible);
    if (!validated.ok) {
      res.status(400).json({ message: validated.message });
      return;
    }
    await FloorModel.findOneAndUpdate(
      { eventId: req.admin?.eventId },
      { eventId: req.admin?.eventId, ...validated.value },
      { upsert: true, new: true },
    );
    res.json(validated.value);
  });

  app.get('/api/admin/budget', requireAdmin, async (req, res) => {
    const budget = await BudgetModel.findOne({ eventId: req.admin?.eventId });
    if (!budget) {
      res.json({ total: null, currency: null, items: [] });
      return;
    }
    res.json({
      total: budget.total,
      currency: budget.currency || 'UYU',
      items: budget.items.map((item) => ({ id: item.id, name: item.name, cost: item.cost, paid: item.paid, notes: item.notes || '' })),
    });
  });

  app.put('/api/admin/budget', requireAdmin, async (req, res) => {
    const existing = await BudgetModel.findOne({ eventId: req.admin?.eventId });
    const items = Array.isArray(req.body?.items) ? req.body.items : existing ? existing.items : defaultBudgetItems();
    const validated = validatePartyBudget({
      total: req.body?.total,
      currency: req.body?.currency ?? existing?.currency,
      items,
    });
    if (!validated.ok) {
      res.status(400).json({ message: validated.message });
      return;
    }
    const saved = await BudgetModel.findOneAndUpdate(
      { eventId: req.admin?.eventId },
      { eventId: req.admin?.eventId, total: validated.value.total, currency: validated.value.currency, items: validated.value.items },
      { upsert: true, new: true },
    );
    res.json({
      total: saved?.total ?? validated.value.total,
      currency: saved?.currency ?? validated.value.currency,
      items: (saved?.items ?? validated.value.items).map((item) => ({ id: item.id, name: item.name, cost: item.cost, paid: item.paid, notes: item.notes || '' })),
    });
  });

  app.get('/api/admin/check-ins', requireAdmin, async (req, res) => {
    const rows = await RsvpModel.find({ eventId: req.admin?.eventId, accreditedAt: { $exists: true, $ne: null } }).sort({ accreditedAt: -1 });
    const invitations = await InvitationModel.find({ _id: { $in: rows.map((row) => row.invitationId) } });
    const names = new Map(invitations.map((item) => [String(item._id), item.guestName]));
    const entries = rows.map((row) => ({
      guestName: names.get(String(row.invitationId)) ?? 'Invitado',
      count: row.accreditedCount || 0,
      accreditedAt: row.accreditedAt,
    }));
    const breakdown = emptyDoorCounts();
    for (const row of rows) {
      const counts = doorCounts(row);
      breakdown.celiac += counts.celiac;
      breakdown.vegetarian += counts.vegetarian;
      breakdown.vegan += counts.vegan;
      breakdown.other += counts.other;
      breakdown.allergies += counts.allergies;
      breakdown.children += counts.children;
    }
    res.json({ total: entries.reduce((sum, entry) => sum + entry.count, 0), breakdown, entries });
  });

  app.post('/api/admin/check-in', requireAdmin, async (req, res) => {
    const token = cleanText(req.body?.token);
    const invitation = await InvitationModel.findOne({ token, eventId: req.admin?.eventId, status: 'active' });
    if (!invitation) {
      res.status(404).json({ message: 'No encontramos esa entrada.' });
      return;
    }
    const rsvp = await RsvpModel.findOne({ invitationId: invitation._id });
    const total = await accreditedTotal(req.admin?.eventId);
    if (!rsvp || partySize(rsvp) === 0) {
      res.json({
        ok: false,
        already: false,
        guestName: invitation.guestName,
        count: 0,
        total,
        message: `${invitation.guestName} no confirmó asistencia.`,
      });
      return;
    }
    if (rsvp.accreditedAt) {
      res.json({
        ok: true,
        already: true,
        guestName: invitation.guestName,
        count: rsvp.accreditedCount || 0,
        total,
        message: `La entrada de ${invitation.guestName} ya estaba acreditada.`,
      });
      return;
    }
    const count = partySize(rsvp);
    const updated = await RsvpModel.findOneAndUpdate(
      { _id: rsvp._id, accreditedAt: null },
      { accreditedAt: new Date(), accreditedCount: count },
      { new: true },
    );
    if (!updated) {
      const current = await accreditedTotal(req.admin?.eventId);
      res.json({
        ok: true,
        already: true,
        guestName: invitation.guestName,
        count: rsvp.accreditedCount || count,
        total: current,
        message: `La entrada de ${invitation.guestName} ya estaba acreditada.`,
      });
      return;
    }
    res.json({
      ok: true,
      already: false,
      guestName: invitation.guestName,
      count,
      total: total + count,
      message: `Acreditamos a ${invitation.guestName}. Sumamos ${count} ${count === 1 ? 'persona' : 'personas'}.`,
    });
  });

  app.get('/api/admin/songs', requireAdmin, async (req, res) => {
    const songs = await SongModel.find({ eventId: req.admin?.eventId }).sort({ createdAt: 1 });
    const invitations = await InvitationModel.find({ _id: { $in: songs.map((song) => song.invitationId) } });
    const names = new Map(invitations.map((item) => [String(item._id), item.guestName]));
    res.json(songs.map((song) => ({
      id: String(song._id),
      guestName: names.get(String(song.invitationId)) ?? 'Invitado',
      title: song.title,
      artist: song.artist,
      comment: song.comment,
      link: song.link ?? '',
      createdAt: song.createdAt,
    })));
  });

  app.get('/api/admin/messages', requireAdmin, async (req, res) => {
    const messages = await MessageModel.find({ eventId: req.admin?.eventId }).sort({ updatedAt: -1 });
    const invitationIds = messages.map((message) => message.invitationId);
    const [invitations, rsvps] = await Promise.all([
      InvitationModel.find({ _id: { $in: invitationIds } }),
      RsvpModel.find({ invitationId: { $in: invitationIds } }),
    ]);
    const names = new Map(invitations.map((item) => [String(item._id), item.guestName]));
    const responses = new Map(rsvps.map((item) => [String(item.invitationId), item]));
    res.json(messages.map((message) => {
      const invitationId = String(message.invitationId);
      const guestName = names.get(invitationId) ?? 'Invitado';
      const rsvp = responses.get(invitationId);
      const companionName =
        rsvp?.attendance === 'yes_two' && (rsvp.companionName || '').trim()
          ? rsvp.companionName.trim()
          : null;
      return {
        id: String(message._id),
        guestName,
        companionName,
        authors: companionName ? [guestName, companionName] : [guestName],
        body: message.body,
        updatedAt: message.updatedAt,
      };
    }));
  });

  app.get('/api/admin/draft', requireAdmin, async (req, res) => {
    const event = await currentEvent(req.admin?.eventId ?? '');
    const content = parseSiteContent(event?.draft);
    if (!content) {
      res.status(500).json({ message: 'El borrador no es válido.' });
      return;
    }
    res.json(content);
  });

  app.put('/api/admin/draft', requireAdmin, async (req, res) => {
    const parsed = parseSiteContent(req.body);
    if (!parsed) {
      res.status(400).json({ message: 'Revisá los textos antes de guardar.' });
      return;
    }
    await EventModel.updateOne({ _id: req.admin?.eventId }, { draft: parsed });
    res.json({ ok: true });
  });

  app.post('/api/admin/publish', requireAdmin, async (req, res) => {
    const event = await currentEvent(req.admin?.eventId ?? '');
    const parsed = parseSiteContent(event?.draft);
    if (!parsed || !event) {
      res.status(400).json({ message: 'Revisá los textos antes de publicar.' });
      return;
    }
    event.published = parsed;
    event.publishedAt = new Date();
    await event.save();
    res.json({ ok: true });
  });

  app.post('/api/admin/media/image', requireAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'Elegí una imagen.' });
      return;
    }
    try {
      const stored = await saveImage(req.file, folderFromRequest(req));
      res.json({ path: stored });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'No pudimos subir la imagen.' });
    }
  });

  app.post('/api/admin/media/audio', requireAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'Elegí un audio.' });
      return;
    }
    try {
      res.json({ path: await saveAudio(req.file) });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'No pudimos subir la música.' });
    }
  });

  app.delete('/api/admin/media', requireAdmin, async (req, res) => {
    await removeMedia(String(req.body?.path ?? ''));
    res.json({ ok: true });
  });
}
