import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const eventSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    draft: { type: Schema.Types.Mixed, required: true },
    published: { type: Schema.Types.Mixed, required: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
  },
  { timestamps: true },
);

const invitationSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    token: { type: String, required: true, unique: true },
    guestName: { type: String, required: true },
    givenName: { type: String, default: '' },
    familyName: { type: String, default: '' },
    slots: { type: Number, required: true, enum: [1, 2] },
    status: { type: String, required: true, enum: ['active', 'revoked'], default: 'active' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

const rsvpSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    invitationId: { type: Schema.Types.ObjectId, ref: 'Invitation', required: true, unique: true },
    attendance: { type: String, required: true, enum: ['yes_one', 'yes_two', 'no'] },
    confirmedCount: { type: Number, required: true, min: 0, max: 2 },
    guestDietary: { type: String, default: null },
    guestDietaryNote: { type: String, default: '' },
    guestAllergies: { type: String, default: '' },
    companionName: { type: String, default: '' },
    companionDietary: { type: String, default: null },
    companionDietaryNote: { type: String, default: '' },
    companionAllergies: { type: String, default: '' },
    childrenUnder12: { type: Number, default: 0, min: 0, max: 10 },
    accreditedAt: { type: Date, default: null },
    accreditedCount: { type: Number, default: 0 },
    afterDeadline: { type: Boolean, default: false },
    children: {
      type: [
        {
          name: { type: String, required: true },
          givenName: { type: String, default: '' },
          familyName: { type: String, default: '' },
          dietary: { type: String, default: null },
          dietaryNote: { type: String, default: '' },
          allergies: { type: String, default: '' },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const songSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    invitationId: { type: Schema.Types.ObjectId, ref: 'Invitation', required: true, index: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    comment: { type: String, default: '' },
    link: { type: String, default: '' },
  },
  { timestamps: true },
);

const messageSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    invitationId: { type: Schema.Types.ObjectId, ref: 'Invitation', required: true, unique: true },
    body: { type: String, required: true },
  },
  { timestamps: true },
);

const floorSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
    tables: {
      type: [
        {
          id: { type: String, required: true },
          number: { type: Number, required: true },
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          shape: { type: String, enum: ['round', 'square', 'rect'], default: 'round' },
          seats: { type: Number, default: 0 },
          rotation: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    chairs: {
      type: [
        {
          id: { type: String, required: true },
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          rotation: { type: Number, default: 0 },
          tableId: { type: String, default: null },
          seatIndex: { type: Number, default: null },
          invitationId: { type: String, default: null },
          role: { type: String, default: null },
          childIndex: { type: Number, default: null },
        },
      ],
      default: [],
    },
    walls: {
      type: [
        {
          id: { type: String, required: true },
          x1: { type: Number, required: true },
          y1: { type: Number, required: true },
          x2: { type: Number, required: true },
          y2: { type: Number, required: true },
        },
      ],
      default: [],
    },
    openings: {
      type: [
        {
          id: { type: String, required: true },
          wallId: { type: String, required: true },
          kind: { type: String, enum: ['door', 'window'], required: true },
          t: { type: Number, required: true },
          width: { type: Number, required: true },
          flip: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    objects: {
      type: [
        {
          id: { type: String, required: true },
          kind: { type: String, enum: ['bath', 'dance', 'stage'], required: true },
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          width: { type: Number, required: true },
          height: { type: Number, required: true },
          rotation: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export const EventModel = mongoose.model('Event', eventSchema);
export const UserModel = mongoose.model('User', userSchema);
export const InvitationModel = mongoose.model('Invitation', invitationSchema);
export const RsvpModel = mongoose.model('Rsvp', rsvpSchema);
export const SongModel = mongoose.model('SongSuggestion', songSchema);
export const MessageModel = mongoose.model('Message', messageSchema);
export const FloorModel = mongoose.model('FloorPlan', floorSchema);

const budgetItemSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    cost: { type: Number, required: true },
    paid: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const budgetSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
    total: { type: Number, required: true },
    currency: { type: String, enum: ['UYU', 'ARS', 'BRL', 'USD', 'EUR'], default: 'UYU' },
    items: { type: [budgetItemSchema], default: [] },
  },
  { timestamps: true },
);

export const BudgetModel = mongoose.model('PartyBudget', budgetSchema);

export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: mongoose.Types.ObjectId };
export type InvitationDoc = InferSchemaType<typeof invitationSchema> & { _id: mongoose.Types.ObjectId };
