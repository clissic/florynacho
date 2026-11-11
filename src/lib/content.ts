import { defaultSite, type Gathering, type SiteContent } from '../content/defaultSite';

const SECTION_KEYS = [
  'story',
  'gallery',
  'countdown',
  'event',
  'dressCode',
  'rsvp',
  'songs',
  'messages',
  'gifts',
] as const;

export function isSafeMapsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ['www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\r\n/g, '\n').trim();
  if (clean.length > max) return null;
  return clean;
}

export function parseSiteContent(input: unknown): SiteContent | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Partial<SiteContent>;
  const first = text(source.couple?.first, 40);
  const second = text(source.couple?.second, 40);
  const story = text(source.story, 1500);
  const closing = text(source.closing, 800);
  const venueName = text(source.venue?.name, 120);
  const city = text(source.venue?.city, 120);
  const mapsUrl = text(source.venue?.mapsUrl, 400);
  const dressLabel = text(source.dressCode?.label, 40);
  const women = text(source.dressCode?.women, 240);
  const men = text(source.dressCode?.men, 240);
  const giftsIntro = text(source.gifts?.intro, 500);
  const musicTitle = text(source.musicTitle, 80);
  if (!first || !second || story == null || !closing || !venueName || !city || !mapsUrl || !dressLabel || !women || !men || giftsIntro == null || !musicTitle) {
    return null;
  }
  if (!isSafeMapsUrl(mapsUrl)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(source.eventDate ?? '')) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.rsvpDeadline ?? '')) return null;
  if (source.timezone !== 'America/Montevideo') return null;
  if (!Array.isArray(source.gifts?.accounts) || source.gifts.accounts.length < 1 || source.gifts.accounts.length > 4) return null;

  const accounts = [];
  for (const account of source.gifts.accounts) {
    const bank = text(account.bank, 60);
    const currency = text(account.currency, 40);
    const holder = text(account.holder, 80);
    const number = text(account.account, 40);
    if (!bank || !currency || !holder || !number) return null;
    accounts.push({ bank, currency, holder, account: number });
  }

  const sections = { ...defaultSite.sections };
  for (const key of SECTION_KEYS) {
    const value = source.sections?.[key];
    if (typeof value !== 'boolean') return null;
    sections[key] = value;
  }

  const cover = mediaPath(source.coverImagePath);
  const music = mediaPath(source.musicPath);
  if (cover === undefined || music === undefined) return null;
  if (!Array.isArray(source.gallery) || source.gallery.length > 24) return null;
  const gallery: SiteContent['gallery'] = [];
  for (const item of source.gallery) {
    if (!item || typeof item !== 'object') return null;
    const path = mediaPath(item.path);
    const alt = text(item.alt ?? '', 160);
    if (!path || alt == null) return null;
    gallery.push({ path, alt });
  }

  const party = gathering(source.party, defaultSite.party);
  const ceremony = gathering(source.ceremony, defaultSite.ceremony);

  return {
    couple: { first, second },
    eventDate: source.eventDate as string,
    rsvpDeadline: source.rsvpDeadline as string,
    timezone: 'America/Montevideo',
    venue: { name: venueName, city, mapsUrl },
    ceremony,
    party,
    dressCode: { label: dressLabel, women, men },
    story,
    sections,
    gifts: { intro: giftsIntro, accounts },
    closing,
    coverImagePath: cover,
    musicPath: music,
    musicTitle,
    gallery,
  };
}

function gathering(value: unknown, fallback: Gathering): Gathering {
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<Gathering>;
  const place = text(source.place, 120);
  const city = text(source.city, 120);
  const mapsUrl = text(source.mapsUrl, 500);
  if (!place || !city || !mapsUrl || !isSafeMapsUrl(mapsUrl)) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(source.date ?? '')) return fallback;
  return { date: source.date as string, place, city, mapsUrl };
}

function mediaPath(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('data:image/') || value.startsWith('data:audio/')) {
    return value.length <= 1_500_000 ? value : undefined;
  }
  if (value.length < 1 || value.length > 300 || value.includes('..')) return undefined;
  return value;
}
