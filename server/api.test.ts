import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { DEMO_TOKENS } from '../src/content/defaultSite';
import { createApp } from './app';
import { resetRateLimits } from './rateLimit';

const admin = { email: 'novios@florenciaeignacio.local', password: 'cambiar-esta-clave' };

describe('confirmaciones en MongoDB', () => {
  let memory: MongoMemoryServer;
  let app: Awaited<ReturnType<typeof createApp>>;
  let mediaDir: string;

  beforeAll(async () => {
    mediaDir = await mkdtemp(path.join(tmpdir(), 'fi-media-'));
    process.env.MEDIA_DIR = mediaDir;
    process.env.ADMIN_EMAIL = admin.email;
    process.env.ADMIN_PASSWORD = admin.password;
    memory = await MongoMemoryServer.create();
    app = await createApp(memory.getUri());
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await memory.stop();
    await rm(mediaDir, { recursive: true, force: true });
  });

  it('guarda cada caso de confirmación y rechaza lo que excede los cupos', async () => {
    resetRateLimits();
    const ana = await request(app).post(`/api/invitations/${DEMO_TOKENS.ana}/rsvp`).send({
      attendance: 'yes_one',
      guestDietary: 'none',
      guestDietaryNote: '',
      guestAllergies: '',
      companionName: '',
      companionDietary: '',
      companionDietaryNote: '',
      companionAllergies: '',
      songs: [],
      message: '',
    });
    expect(ana.body.rsvp).toMatchObject({ confirmedCount: 1, guestDietary: 'none', companionName: '' });

    const lucia = await request(app).post(`/api/invitations/${DEMO_TOKENS.lucia}/rsvp`).send({
      attendance: 'yes_one',
      guestDietary: 'other',
      guestDietaryNote: 'sin maní',
      guestAllergies: 'nueces',
      songs: [],
      message: '',
    });
    expect(lucia.body.rsvp).toMatchObject({ guestDietary: 'other', guestDietaryNote: 'sin maní', guestAllergies: 'nueces' });

    const martin = await request(app).post(`/api/invitations/${DEMO_TOKENS.martin}/rsvp`).send({
      attendance: 'yes_two',
      guestDietary: 'celiac',
      guestAllergies: 'nueces',
      companionName: 'Laura Sosa',
      companionDietary: 'vegan',
      companionAllergies: 'lactosa',
      childrenUnder12: 1,
      children: [{ givenName: 'Joaquín', familyName: 'Silva', dietary: 'none', dietaryNote: '', allergies: '' }],
      songs: [{ title: 'Canción propia', artist: 'Artista propio', comment: 'para bailar', link: 'https://www.youtube.com/watch?v=ejemplo' }],
      message: 'Los queremos',
    });
    expect(martin.body.rsvp).toMatchObject({
      confirmedCount: 2,
      guestDietary: 'celiac',
      companionName: 'Laura Sosa',
      companionDietary: 'vegan',
      childrenUnder12: 1,
      children: [{ name: 'Joaquín Silva', givenName: 'Joaquín', familyName: 'Silva', dietary: 'none', dietaryNote: '', allergies: '' }],
    });
    expect(martin.body.songs).toEqual([{ title: 'Canción propia', artist: 'Artista propio', comment: 'para bailar', link: 'https://www.youtube.com/watch?v=ejemplo' }]);
    expect(martin.body.message).toBe('Los queremos');

    const diego = await request(app).post(`/api/invitations/${DEMO_TOKENS.diego}/rsvp`).send({
      attendance: 'yes_one',
      guestDietary: 'vegetarian',
      songs: [],
      message: '',
    });
    expect(diego.body.rsvp).toMatchObject({ confirmedCount: 1, companionName: '', guestDietary: 'vegetarian' });

    const camila = await request(app).post(`/api/invitations/${DEMO_TOKENS.camila}/rsvp`).send({
      attendance: 'no',
      songs: [],
      message: '',
    });
    expect(camila.body.rsvp.confirmedCount).toBe(0);
    expect(camila.body.rsvp.guestDietary).toBeNull();
    expect(camila.body.rsvp.childrenUnder12).toBe(0);

    const edited = await request(app).post(`/api/invitations/${DEMO_TOKENS.ana}/rsvp`).send({
      attendance: 'no',
      songs: [],
      message: '',
    });
    expect(edited.body.rsvp).toMatchObject({ confirmedCount: 0, guestDietary: null });

    const overflow = await request(app).post(`/api/invitations/${DEMO_TOKENS.ana}/rsvp`).send({
      attendance: 'yes_two',
      guestDietary: 'none',
      companionName: 'Alguien Más',
      companionDietary: 'none',
      songs: [],
      message: '',
    });
    expect(overflow.status).toBe(400);
    expect(overflow.body.ok).toBe(false);
    const stillDeclined = await request(app).get(`/api/invitations/${DEMO_TOKENS.ana}`);
    expect(stillDeclined.body.rsvp.confirmedCount).toBe(0);
  });

  it('responde igual ante un enlace inválido y uno desactivado', async () => {
    const revoked = await request(app).get(`/api/invitations/${DEMO_TOKENS.elena}`);
    const unknown = await request(app).get('/api/invitations/0123456789abcdef0123456789abcdef');
    expect(revoked.body).toEqual(unknown.body);
    expect(revoked.body).toEqual({ ok: false, error: 'unavailable' });
    expect(JSON.stringify(revoked.body)).not.toContain('Elena');
  });

  it('exige sesión para el panel y deja achicar cupos solo si la respuesta lo permite', async () => {
    const hidden = await request(app).get('/api/admin/guests');
    expect(hidden.status).toBe(401);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send(admin);
    expect(login.status).toBe(200);

    const guests = await agent.get('/api/admin/guests');
    expect(guests.body.some((guest: { guestName: string }) => guest.guestName === 'Ana Pereira')).toBe(true);
    const publicList = await request(app).get('/api/site');
    expect(JSON.stringify(publicList.body)).not.toContain('Ana Pereira');

    const martin = guests.body.find((guest: { guestName: string }) => guest.guestName === 'Martín Silva');
    const shrink = await agent.patch(`/api/admin/guests/${martin.id}`).send({ slots: 1 });
    expect(shrink.status).toBe(400);
    expect(shrink.body.message).toContain('más personas confirmadas');

    const diego = guests.body.find((guest: { guestName: string }) => guest.guestName === 'Diego Álvarez');
    const ana = guests.body.find((guest: { guestName: string; id: string }) => guest.guestName === 'Ana Pereira');
    const saved = await agent.put('/api/admin/floor').send({
      tables: [{ id: 'mesa1', number: 1, x: 16, y: 16 }],
      chairs: [{ id: 'silla1', x: 40, y: 16, invitationId: diego.id, role: 'guest' }],
    });
    expect(saved.status).toBe(200);
    const twice = await agent.put('/api/admin/floor').send({
      tables: [{ id: 'mesa1', number: 1, x: 16, y: 16 }],
      chairs: [
        { id: 'silla1', x: 40, y: 16, invitationId: diego.id, role: 'guest' },
        { id: 'silla2', x: 80, y: 16, invitationId: diego.id, role: 'guest' },
      ],
    });
    expect(twice.status).toBe(400);
    const declined = await agent.put('/api/admin/floor').send({
      tables: [],
      chairs: [{ id: 'silla1', x: 0, y: 0, invitationId: ana.id, role: 'guest' }],
    });
    expect(declined.status).toBe(400);
  });

  it('acredita una sola vez a las personas de la invitación', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(admin);

    const stranger = await request(app).post('/api/admin/check-in').send({ token: DEMO_TOKENS.martin });
    expect(stranger.status).toBe(401);

    const first = await agent.post('/api/admin/check-in').send({ token: DEMO_TOKENS.martin });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, already: false, guestName: 'Martín Silva', count: 3, total: 3 });

    const again = await agent.post('/api/admin/check-in').send({ token: DEMO_TOKENS.martin });
    expect(again.body).toMatchObject({ ok: true, already: true, count: 3, total: 3 });

    const declined = await agent.post('/api/admin/check-in').send({ token: DEMO_TOKENS.ana });
    expect(declined.body).toMatchObject({ ok: false, count: 0, total: 3 });

    const board = await agent.get('/api/admin/check-ins');
    expect(board.body.total).toBe(3);
    expect(board.body.breakdown).toEqual({ celiac: 1, vegetarian: 0, vegan: 1, other: 0, allergies: 2, children: 1 });
    expect(board.body.entries).toEqual([expect.objectContaining({ guestName: 'Martín Silva', count: 3 })]);
  });

  it('guarda el presupuesto y los ítems de la fiesta', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(admin);
    const empty = await agent.get('/api/admin/budget');
    expect(empty.body).toEqual({ total: null, currency: null, items: [] });

    const missing = await agent.put('/api/admin/budget').send({ total: 150000 });
    expect(missing.status).toBe(400);

    const created = await agent.put('/api/admin/budget').send({ total: 150000, currency: 'USD' });
    expect(created.status).toBe(200);
    expect(created.body.total).toBe(150000);
    expect(created.body.currency).toBe('USD');
    expect(created.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Salón',
      'Cátering',
      'Discoteca',
      'Fotógrafo',
      'Decoración',
      'Invitaciones',
      'Cotillón',
      'Vestido',
      'Traje',
      'Peluquería',
      'Barbería',
    ]);

    const salon = created.body.items[0];
    const updated = await agent.put('/api/admin/budget').send({
      total: 150000,
      items: created.body.items.map((item: { id: string }) => (item.id === salon.id ? { ...salon, cost: 80000, paid: true, notes: 'Seña abonada' } : item)),
    });
    expect(updated.body.currency).toBe('USD');
    expect(updated.body.items[0]).toMatchObject({ name: 'Salón', cost: 80000, paid: true, notes: 'Seña abonada' });

    const stranger = await request(app).put('/api/admin/budget').send({ total: 1 });
    expect(stranger.status).toBe(401);
  });

  it('deja que el administrador confirme incluso una invitación desactivada', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(admin);
    const guests = await agent.get('/api/admin/guests');
    const elena = guests.body.find((guest: { guestName: string }) => guest.guestName === 'Elena Castro');
    const denied = await request(app).post(`/api/admin/guests/${elena.id}/response`).send({ attendance: 'yes_one', guestDietary: 'none' });
    expect(denied.status).toBe(401);

    const saved = await agent.post(`/api/admin/guests/${elena.id}/response`).send({
      attendance: 'yes_one',
      guestDietary: 'vegetarian',
      guestAllergies: '',
      songs: [],
      message: 'Aviso del administrador',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.rsvp).toMatchObject({ attendance: 'yes_one', confirmedCount: 1, guestDietary: 'vegetarian' });
    expect(saved.body.message).toBe('Aviso del administrador');

    const loaded = await agent.get(`/api/admin/guests/${elena.id}/response`);
    expect(loaded.body.guestName).toBe('Elena Castro');
    expect(loaded.body.rsvp.guestDietary).toBe('vegetarian');

    const hidden = await request(app).get(`/api/invitations/${DEMO_TOKENS.elena}`);
    expect(hidden.body).toEqual({ ok: false, error: 'unavailable' });
  });
});
