import type { Gathering, SiteContent } from '../content/defaultSite';
import { toUtcStamp } from './dates';

function eventRange(iso: string) {
  const start = new Date(iso).getTime();
  const end = start + 4 * 60 * 60 * 1000;
  return { start, end };
}

function googleEventUrl(site: SiteContent, gathering: Gathering, label: string): string {
  const { start, end } = eventRange(gathering.date);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${label} de ${site.couple.first} e ${site.couple.second}`,
    dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
    location: `${gathering.place}, ${gathering.city}`,
    details: 'Celebración de Florencia e Ignacio.',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function googleCalendarUrl(site: SiteContent, which: 'ceremony' | 'party'): string {
  const gathering = which === 'ceremony' ? site.ceremony : site.party;
  const label = which === 'ceremony' ? 'Ceremonia' : 'Fiesta';
  return googleEventUrl(site, gathering, label);
}

export function buildIcs(site: SiteContent): string {
  const stamp = toUtcStamp(Date.now());
  const events = [
    { gathering: site.ceremony, label: 'Ceremonia' },
    { gathering: site.party, label: 'Fiesta' },
  ];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Florencia e Ignacio//Invitacion//ES',
    'CALSCALE:GREGORIAN',
  ];
  for (const event of events) {
    const { start, end } = eventRange(event.gathering.date);
    lines.push(
      'BEGIN:VEVENT',
      `DTSTAMP:${stamp}`,
      `DTSTART:${toUtcStamp(start)}`,
      `DTEND:${toUtcStamp(end)}`,
      `SUMMARY:${event.label} de ${site.couple.first} e ${site.couple.second}`,
      `LOCATION:${event.gathering.place}, ${event.gathering.city}`,
      'DESCRIPTION:Los esperamos para celebrar juntos.',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(site: SiteContent) {
  const blob = new Blob([buildIcs(site)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'florencia-e-ignacio.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
