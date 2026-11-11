import { describe, expect, it } from 'vitest';
import { DEMO_TOKENS } from '../content/defaultSite';
import { diffParts, formatEventDate, formatEventTime, toUtcStamp } from './dates';
import { parseGuestCsv, toCsv } from './csv';
import { isSafeMapsUrl, parseSiteContent } from './content';
import { defaultSite } from '../content/defaultSite';
import { summarizeGuests } from './stats';
import { formatAmountFixed, formatAmountTyping, parseAmount } from './money';
import { emptyRsvp, validateFloor, validateRsvp, type RsvpPayload } from './validation';

function payload(partial: Partial<RsvpPayload>): RsvpPayload {
  return { ...emptyRsvp(), ...partial };
}

describe('confirmaciones', () => {
  it('acepta una invitación individual', () => {
    const result = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.confirmedCount).toBe(1);
  });

  it('registra el rechazo de una invitación individual sin datos alimentarios', () => {
    const result = validateRsvp(
      1,
      payload({ attendance: 'no', guestDietary: 'vegan', guestAllergies: 'maní', companionName: 'Alguien' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confirmedCount).toBe(0);
      expect(result.value.guestDietary).toBeNull();
      expect(result.value.guestAllergies).toBeNull();
      expect(result.value.companionName).toBeNull();
    }
  });

  it('pide los datos del acompañante cuando confirman dos personas', () => {
    const missing = validateRsvp(2, payload({ attendance: 'yes_two', guestDietary: 'vegetarian' }));
    expect(missing.ok).toBe(false);

    const result = validateRsvp(
      2,
      payload({
        attendance: 'yes_two',
        guestDietary: 'vegetarian',
        guestAllergies: 'maní',
        companionName: 'Laura Sosa',
        companionDietary: 'celiac',
        companionAllergies: 'lactosa',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confirmedCount).toBe(2);
      expect(result.value.guestDietary).toBe('vegetarian');
      expect(result.value.companionDietary).toBe('celiac');
      expect(result.value.guestAllergies).toBe('maní');
      expect(result.value.companionAllergies).toBe('lactosa');
    }
  });

  it('registra una sola persona cuando un cupo doble va solo', () => {
    const result = validateRsvp(2, payload({ attendance: 'yes_one', guestDietary: 'vegan' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confirmedCount).toBe(1);
      expect(result.value.companionName).toBeNull();
    }
  });

  it('registra cero asistentes cuando un cupo doble rechaza', () => {
    const result = validateRsvp(2, payload({ attendance: 'no' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.confirmedCount).toBe(0);
  });

  it('permite cambiar la respuesta', () => {
    const first = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none' }));
    const second = validateRsvp(1, payload({ attendance: 'no' }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.confirmedCount).toBe(1);
      expect(second.value.confirmedCount).toBe(0);
    }
  });

  it('exige el detalle cuando la restricción es otra', () => {
    const result = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'other' }));
    expect(result.ok).toBe(false);
  });

  it('guarda canción y mensaje como datos opcionales', () => {
    const skipped = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none' }));
    const withExtras = validateRsvp(
      1,
      payload({
        attendance: 'yes_one',
        guestDietary: 'none',
        songs: [{ title: 'Yellow', artist: 'Coldplay', comment: 'Para el vals', link: 'https://open.spotify.com/track/yellow' }],
        message: 'Los queremos mucho',
      }),
    );
    expect(skipped.ok && withExtras.ok).toBe(true);
    if (withExtras.ok) {
      expect(withExtras.value.songs).toEqual([
        { title: 'Yellow', artist: 'Coldplay', comment: 'Para el vals', link: 'https://open.spotify.com/track/yellow' },
      ]);
      expect(withExtras.value.message).toBe('Los queremos mucho');
    }
  });

  it('rechaza más personas que los cupos y más de cinco canciones', () => {
    expect(validateRsvp(1, payload({ attendance: 'yes_two', guestDietary: 'none', companionName: 'Ana', companionDietary: 'none' })).ok).toBe(false);
    const songs = Array.from({ length: 6 }, (_, index) => ({ title: `Tema ${index}`, artist: 'Alguien', comment: '' }));
    expect(validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none', songs })).ok).toBe(false);
    expect(validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none', songs: [{ title: 'Tema', artist: 'Alguien', comment: '', link: 'nota suelta' }] })).ok).toBe(false);
  });

  it('guarda los menores de 12 solo cuando confirman asistencia', () => {
    const child = { givenName: 'Joaquín', familyName: 'Pereira', dietary: 'none' as const, dietaryNote: '', allergies: '' };
    const attending = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none', childrenUnder12: 1, children: [child] }));
    const missing = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none', childrenUnder12: 1 }));
    const tooMany = validateRsvp(1, payload({ attendance: 'yes_one', guestDietary: 'none', childrenUnder12: 11 }));
    const declined = validateRsvp(1, payload({ attendance: 'no', childrenUnder12: 4 }));
    expect(attending.ok).toBe(true);
    if (attending.ok) {
      expect(attending.value.childrenUnder12).toBe(1);
      expect(attending.value.children[0]?.name).toBe('Joaquín Pereira');
    }
    expect(missing.ok).toBe(false);
    expect(tooMany.ok).toBe(false);
    expect(declined.ok).toBe(true);
    if (declined.ok) {
      expect(declined.value.childrenUnder12).toBe(0);
      expect(declined.value.children).toEqual([]);
    }
  });

  it('rechaza sentar dos veces a la misma persona o a quien no confirmó', () => {
    const eligible = [{ invitationId: 'ana', role: 'guest' as const }];
    const repeated = validateFloor(
      {
        tables: [{ id: 'mesa1', number: 1, x: 0, y: 0 }],
        chairs: [
          { id: 'silla1', x: 10, y: 10, invitationId: 'ana', role: 'guest' },
          { id: 'silla2', x: 20, y: 10, invitationId: 'ana', role: 'guest' },
        ],
      },
      eligible,
    );
    const absent = validateFloor(
      {
        tables: [],
        chairs: [{ id: 'silla1', x: 0, y: 0, invitationId: 'lucia', role: 'guest' }],
      },
      eligible,
    );
    expect(repeated.ok).toBe(false);
    expect(absent.ok).toBe(false);
    const legacy = validateFloor({ tables: [{ id: 'mesa1', number: 1, x: 0, y: 0 }], chairs: [] }, eligible);
    expect(legacy.ok).toBe(true);
    if (legacy.ok) {
      expect(legacy.value.tables[0]).toMatchObject({ shape: 'round', seats: 0, rotation: 0 });
      expect(legacy.value.walls).toEqual([]);
    }
    const child = validateFloor(
      {
        tables: [{ id: 'mesa1', number: 1, x: 0, y: 0, shape: 'round', seats: 1, rotation: 0 }],
        chairs: [{ id: 'silla1', x: 10, y: 10, invitationId: 'ana', role: 'child', childIndex: 0, tableId: 'mesa1', seatIndex: 0 }],
        walls: [],
        openings: [],
        objects: [],
      },
      [{ invitationId: 'ana', role: 'child', childIndex: 0 }],
    );
    expect(child.ok).toBe(true);
  });
});

describe('fechas y archivos', () => {
  it('calcula la cuenta regresiva en horario de Montevideo', () => {
    const now = new Date('2026-12-18T20:00:00-03:00').getTime();
    expect(diffParts('2026-12-19T20:00:00-03:00', now)).toMatchObject({ past: false, days: 1, hours: 0, minutes: 0, seconds: 0 });
    expect(formatEventDate('2026-12-19T20:00:00-03:00').toLowerCase()).toContain('diciembre');
    expect(formatEventTime('2026-12-19T20:00:00-03:00')).toBe('20:00');
  });

  it('arma el sello UTC del calendario a partir de las 20:00 de Uruguay', () => {
    expect(toUtcStamp(new Date('2026-12-19T20:00:00-03:00').getTime())).toBe('20261219T230000Z');
  });

  it('importa y exporta invitados', () => {
    const parsed = parseGuestCsv('nombre,apellido,cupos,observaciones\nAna,Pereira,1,\nMartín,Silva,2,"Mesa, familia"\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.guests).toEqual([
      { name: 'Ana Pereira', givenName: 'Ana', familyName: 'Pereira', slots: 1, notes: '' },
      { name: 'Martín Silva', givenName: 'Martín', familyName: 'Silva', slots: 2, notes: 'Mesa, familia' },
    ]);
    expect(parseGuestCsv('nombre,apellido,cupos,observaciones\nAna,,1,\n').guests[0]).toMatchObject({ name: 'Ana', givenName: 'Ana', familyName: '' });
    expect(parseGuestCsv('nombre,apellido,cupos,observaciones\nAna,P,3').errors.length).toBeGreaterThan(0);
    expect(toCsv(['nombre'], [['=cmd|test']])).toContain("'=cmd|test");
  });

  it('resume asistentes y restricciones por persona', () => {
    const stats = summarizeGuests([
      { status: 'active', rsvp: null },
      { status: 'active', rsvp: { attendance: 'yes_two', confirmedCount: 2, guestDietary: 'celiac', companionDietary: 'vegan' } },
      { status: 'active', rsvp: { attendance: 'no', confirmedCount: 0, guestDietary: null, companionDietary: null } },
      { status: 'revoked', rsvp: { attendance: 'yes_one', confirmedCount: 1, guestDietary: 'none', companionDietary: null } },
    ]);
    expect(stats).toMatchObject({ sent: 3, pending: 1, confirmed: 1, declined: 1, attendees: 2, companions: 1 });
    expect(stats.dietary.find((item) => item.key === 'celiac')?.count).toBe(1);
    expect(stats.dietary.find((item) => item.key === 'vegan')?.count).toBe(1);
    expect(stats.dietary.find((item) => item.key === 'none')?.count).toBe(0);
  });

  it('solo acepta mapas de Google en https', () => {
    expect(isSafeMapsUrl(defaultSite.venue.mapsUrl)).toBe(true);
    expect(isSafeMapsUrl('javascript:alert(1)')).toBe(false);
    expect(parseSiteContent(defaultSite)?.couple.first).toBe('Florencia');
  });
});

describe('montos', () => {
  it('agrupa miles con punto y deja dos cifras detrás de la coma', () => {
    expect(formatAmountTyping('1500000')).toBe('1.500.000');
    expect(formatAmountTyping('1500000,5')).toBe('1.500.000,5');
    expect(formatAmountTyping('1.500.000,567abc')).toBe('1.500.000,56');
    expect(formatAmountFixed(1_500_000.5)).toBe('1.500.000,50');
    expect(parseAmount('1.500.000,50')).toBe(1500000.5);
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('enlaces de demostración', () => {
  it('usa tokens largos y distintos', () => {
    const tokens = Object.values(DEMO_TOKENS);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.every((token) => token.length >= 32)).toBe(true);
  });
});
