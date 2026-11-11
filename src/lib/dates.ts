const TIME_ZONE = 'America/Montevideo';

export type Countdown = {
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function diffParts(targetIso: string, nowMs: number): Countdown {
  const target = new Date(targetIso).getTime();
  const delta = target - nowMs;
  if (!Number.isFinite(target) || delta <= 0) {
    return { past: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(delta / 1000);
  return {
    past: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatEventDate(iso: string): string {
  const formatted = new Intl.DateTimeFormat('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
  return capitalize(formatted);
}

export function formatEventMonth(iso: string): string {
  const formatted = new Intl.DateTimeFormat('es-UY', {
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
  return capitalize(formatted);
}

export function formatEventDay(iso: string): string {
  const formatted = new Intl.DateTimeFormat('es-UY', {
    weekday: 'long',
    day: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
  return capitalize(formatted.replace(',', ''));
}

export function formatEventTime(iso: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDeadline(dateStr: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(new Date(`${dateStr}T12:00:00-03:00`));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function deadlineHasPassed(dateStr: string, nowMs = Date.now()): boolean {
  const end = new Date(`${dateStr}T23:59:59-03:00`).getTime();
  return nowMs > end;
}

export function toDateTimeLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}`;
}

export function fromDateTimeLocal(value: string): string {
  return `${value}:00-03:00`;
}

export function toUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
