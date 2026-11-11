import bcrypt from 'bcryptjs';
import { DEMO_TOKENS, defaultSite } from '../src/content/defaultSite';
import { EventModel, InvitationModel, UserModel } from './models';

const guests = [
  { guestName: 'Ana Pereira', slots: 1 as const, token: DEMO_TOKENS.ana, status: 'active' as const, notes: '' },
  { guestName: 'Martín Silva', slots: 2 as const, token: DEMO_TOKENS.martin, status: 'active' as const, notes: 'Demo de dos cupos' },
  { guestName: 'Lucía Fernández', slots: 1 as const, token: DEMO_TOKENS.lucia, status: 'active' as const, notes: '' },
  { guestName: 'Diego Álvarez', slots: 2 as const, token: DEMO_TOKENS.diego, status: 'active' as const, notes: '' },
  { guestName: 'Camila Rocha', slots: 2 as const, token: DEMO_TOKENS.camila, status: 'active' as const, notes: '' },
  { guestName: 'Elena Castro', slots: 1 as const, token: DEMO_TOKENS.elena, status: 'revoked' as const, notes: 'Enlace revocado de demostración' },
];

export async function seedIfEmpty() {
  let event = await EventModel.findOne({ slug: 'florencia-ignacio' });
  if (!event) {
    event = await EventModel.create({
      slug: 'florencia-ignacio',
      draft: defaultSite,
      published: defaultSite,
      publishedAt: new Date(),
    });
  }

  const email = (process.env.ADMIN_EMAIL || 'novios@florenciaeignacio.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'cambiar-esta-clave';
  const existingUser = await UserModel.findOne({ email });
  if (!existingUser) {
    await UserModel.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      eventId: event._id,
    });
  }

  const count = await InvitationModel.countDocuments({ eventId: event._id });
  if (count === 0) {
    await InvitationModel.insertMany(guests.map((guest) => ({ ...guest, eventId: event._id })));
  }

  return event;
}
