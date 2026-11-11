import { DIETARY_OPTIONS, type Attendance, type Dietary, type InvitationStatus } from '../content/defaultSite';

export type StatsInput = {
  status: InvitationStatus;
  rsvp: null | {
    attendance: Attendance;
    confirmedCount: number;
    guestDietary: Dietary | null;
    companionDietary: Dietary | null;
  };
};

export type WeddingStats = {
  sent: number;
  pending: number;
  confirmed: number;
  declined: number;
  attendees: number;
  companions: number;
  dietary: { key: Dietary; label: string; count: number }[];
};

export function summarizeGuests(guests: StatsInput[]): WeddingStats {
  const dietary = new Map<Dietary, number>(DIETARY_OPTIONS.map((option) => [option.value, 0]));
  const stats: WeddingStats = {
    sent: 0,
    pending: 0,
    confirmed: 0,
    declined: 0,
    attendees: 0,
    companions: 0,
    dietary: [],
  };

  for (const guest of guests) {
    if (guest.status !== 'active') continue;
    stats.sent += 1;
    if (!guest.rsvp) {
      stats.pending += 1;
      continue;
    }
    if (guest.rsvp.confirmedCount > 0) stats.confirmed += 1;
    if (guest.rsvp.attendance === 'no') stats.declined += 1;
    stats.attendees += guest.rsvp.confirmedCount;
    if (guest.rsvp.attendance === 'yes_two') stats.companions += 1;
    if (guest.rsvp.confirmedCount >= 1 && guest.rsvp.guestDietary) {
      dietary.set(guest.rsvp.guestDietary, (dietary.get(guest.rsvp.guestDietary) ?? 0) + 1);
    }
    if (guest.rsvp.confirmedCount === 2 && guest.rsvp.companionDietary) {
      dietary.set(guest.rsvp.companionDietary, (dietary.get(guest.rsvp.companionDietary) ?? 0) + 1);
    }
  }

  stats.dietary = DIETARY_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    count: dietary.get(option.value) ?? 0,
  }));
  return stats;
}

export function dietaryLabel(value: Dietary | null, note?: string | null): string {
  if (!value) return '';
  const label = DIETARY_OPTIONS.find((option) => option.value === value)?.label ?? value;
  if (value === 'other' && note) return `${label}: ${note}`;
  return label;
}
