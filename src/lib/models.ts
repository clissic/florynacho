import type { Attendance, Dietary, InvitationStatus, SiteContent } from '../content/defaultSite';
import type { FieldErrors, RsvpPayload } from './validation';

export type GalleryItem = {
  id: string;
  path: string;
  alt: string;
  sortOrder: number;
};

export type PublicSite = {
  content: SiteContent;
  gallery: GalleryItem[];
};

export type SavedRsvp = {
  attendance: Attendance;
  confirmedCount: number;
  guestDietary: Dietary | null;
  guestDietaryNote: string;
  guestAllergies: string;
  companionName: string;
  companionDietary: Dietary | null;
  companionDietaryNote: string;
  companionAllergies: string;
  childrenUnder12: number;
  children: { name: string; givenName: string; familyName: string; dietary: Dietary | null; dietaryNote: string; allergies: string }[];
  updatedAt: string;
};

export type InvitationData = {
  guestName: string;
  givenName: string;
  slots: 1 | 2;
  rsvp: SavedRsvp | null;
  songs: { title: string; artist: string; comment: string; link: string }[];
  message: string;
};

export type SubmitResult =
  | { ok: true; invitation: InvitationData }
  | {
      ok: false;
      error: 'unavailable' | 'invalid' | 'rate_limited' | 'network' | 'server';
      message?: string;
      field?: string;
      errors?: FieldErrors;
    };

export type GuestRow = {
  id: string;
  token: string;
  guestName: string;
  givenName: string;
  familyName: string;
  slots: 1 | 2;
  status: InvitationStatus;
  notes: string;
  createdAt: string;
  accredited: boolean;
  rsvp: SavedRsvp | null;
};

export type SongRow = {
  id: string;
  guestName: string;
  title: string;
  artist: string;
  comment: string;
  link: string;
  createdAt: string;
};

export type CheckInResult = {
  ok: boolean;
  already: boolean;
  guestName: string;
  count: number;
  total: number;
  message: string;
};

export type CheckInEntry = {
  guestName: string;
  count: number;
  accreditedAt: string;
};

export type CheckInBreakdown = {
  celiac: number;
  vegetarian: number;
  vegan: number;
  other: number;
  allergies: number;
  children: number;
};

export type CheckInBoard = {
  total: number;
  breakdown: CheckInBreakdown;
  entries: CheckInEntry[];
};

export type MessageRow = {
  id: string;
  guestName: string;
  body: string;
  updatedAt: string;
};

export type FloorShape = 'round' | 'square' | 'rect';
export type FloorSeatRole = 'guest' | 'companion' | 'child';
export type FloorObjectKind = 'bath' | 'dance' | 'stage';

export type FloorTable = {
  id: string;
  number: number;
  x: number;
  y: number;
  shape: FloorShape;
  seats: number;
  rotation: number;
};

export type FloorChair = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  tableId: string | null;
  seatIndex: number | null;
  invitationId: string | null;
  role: FloorSeatRole | null;
  childIndex: number | null;
};

export type FloorWall = { id: string; x1: number; y1: number; x2: number; y2: number };

export type FloorOpening = {
  id: string;
  wallId: string;
  kind: 'door' | 'window';
  t: number;
  width: number;
  flip: boolean;
};

export type FloorObject = {
  id: string;
  kind: FloorObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type FloorPlan = {
  tables: FloorTable[];
  chairs: FloorChair[];
  walls: FloorWall[];
  openings: FloorOpening[];
  objects: FloorObject[];
};

export type FloorSeatPerson = {
  invitationId: string;
  role: FloorSeatRole;
  childIndex: number | null;
  label: string;
  accredited: boolean;
};

export type BudgetItem = {
  id: string;
  name: string;
  cost: number;
  paid: boolean;
  notes: string;
};

export type BudgetCurrency = 'UYU' | 'ARS' | 'BRL' | 'USD' | 'EUR';

export type PartyBudget = {
  total: number | null;
  currency: BudgetCurrency | null;
  items: BudgetItem[];
};

export type AdminGuestInput = {
  name: string;
  givenName?: string;
  familyName?: string;
  slots: 1 | 2;
  notes: string;
  status?: InvitationStatus;
};

export type WeddingApi = {
  mode: 'server';
  getPublicSite(): Promise<PublicSite>;
  getInvitation(token: string): Promise<{ ok: true; invitation: InvitationData } | { ok: false; error: 'unavailable' | 'network' }>;
  submitRsvp(token: string, payload: RsvpPayload): Promise<SubmitResult>;
  getSession(): Promise<{ email: string } | null>;
  signIn(email: string, password: string): Promise<{ ok: true; email: string } | { ok: false; message: string }>;
  signOut(): Promise<void>;
  listGuests(): Promise<GuestRow[]>;
  saveGuest(id: string | null, input: AdminGuestInput): Promise<GuestRow>;
  setGuestStatus(id: string, status: InvitationStatus): Promise<void>;
  deleteGuest(id: string): Promise<void>;
  getGuestResponse(id: string): Promise<InvitationData>;
  saveGuestResponse(id: string, payload: RsvpPayload): Promise<SubmitResult>;
  importGuests(guests: { name: string; givenName: string; familyName: string; slots: 1 | 2; notes: string }[]): Promise<{ created: number }>;
  getFloor(): Promise<FloorPlan>;
  saveFloor(plan: FloorPlan): Promise<FloorPlan>;
  getBudget(): Promise<PartyBudget>;
  saveBudget(budget: { total: number; currency?: BudgetCurrency; items?: BudgetItem[] }): Promise<PartyBudget>;
  listSongs(): Promise<SongRow[]>;
  listCheckIns(): Promise<CheckInBoard>;
  checkIn(token: string): Promise<CheckInResult>;
  listMessages(): Promise<MessageRow[]>;
  getDraft(): Promise<SiteContent>;
  saveDraft(content: SiteContent): Promise<void>;
  publish(): Promise<void>;
  uploadImage(file: File, folder: 'cover' | 'gallery'): Promise<string>;
  uploadMusic(file: File): Promise<string>;
  deleteMedia(path: string, kind: 'image' | 'audio'): Promise<void>;
};
