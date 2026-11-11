import bcrypt from 'bcryptjs';
import { defaultSite } from '../src/content/defaultSite';
import { DEMO_TOKENS } from './demoTokens';
import { EventModel, InvitationModel, MessageModel, RsvpModel, SongModel, UserModel } from './models';

const demoGuests = [
  { guestName: 'Ana Pereira', slots: 1 as const, token: DEMO_TOKENS.ana, status: 'active' as const, notes: '' },
  { guestName: 'Martín Silva', slots: 2 as const, token: DEMO_TOKENS.martin, status: 'active' as const, notes: 'Demo de dos cupos' },
  { guestName: 'Lucía Fernández', slots: 1 as const, token: DEMO_TOKENS.lucia, status: 'active' as const, notes: '' },
  { guestName: 'Diego Álvarez', slots: 2 as const, token: DEMO_TOKENS.diego, status: 'active' as const, notes: '' },
  { guestName: 'Camila Rocha', slots: 2 as const, token: DEMO_TOKENS.camila, status: 'active' as const, notes: '' },
  { guestName: 'Elena Castro', slots: 1 as const, token: DEMO_TOKENS.elena, status: 'revoked' as const, notes: 'Enlace revocado de demostración' },
];

const demoTokens = Object.values(DEMO_TOKENS);

export async function seedIfEmpty() {
  const production = process.env.NODE_ENV === 'production';

  let event = await EventModel.findOne({ slug: 'florencia-ignacio' });
  if (!event) {
    event = await EventModel.create({
      slug: 'florencia-ignacio',
      draft: defaultSite,
      published: defaultSite,
      publishedAt: new Date(),
    });
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (production && (!email || !password)) {
    throw new Error('Faltan ADMIN_EMAIL o ADMIN_PASSWORD.');
  }

  const adminEmail = email || 'novios@florenciaeignacio.local';
  const adminPassword = password || 'cambiar-esta-clave';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  let existingUser = await UserModel.findOne({ eventId: event._id });
  if (!existingUser) {
    existingUser = await UserModel.findOne({ email: adminEmail });
  }

  if (existingUser) {
    existingUser.email = adminEmail;
    existingUser.passwordHash = passwordHash;
    existingUser.eventId = event._id;
    await existingUser.save();
  } else {
    await UserModel.create({
      email: adminEmail,
      passwordHash,
      eventId: event._id,
    });
  }

  if (production) {
    const demos = await InvitationModel.find({ eventId: event._id, token: { $in: demoTokens } }).select('_id');
    const demoIds = demos.map((guest) => guest._id);
    if (demoIds.length) {
      await Promise.all([
        InvitationModel.deleteMany({ _id: { $in: demoIds } }),
        RsvpModel.deleteMany({ invitationId: { $in: demoIds } }),
        SongModel.deleteMany({ invitationId: { $in: demoIds } }),
        MessageModel.deleteMany({ invitationId: { $in: demoIds } }),
      ]);
    }
    return event;
  }

  const count = await InvitationModel.countDocuments({ eventId: event._id });
  if (count === 0) {
    await InvitationModel.insertMany(demoGuests.map((guest) => ({ ...guest, eventId: event._id })));
  }

  return event;
}
