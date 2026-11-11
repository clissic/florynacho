import { describe, expect, it } from 'vitest';
import { layoutChairs, seatLayout, seatParty } from './floor';
import type { FloorPlan, FloorSeatPerson } from './models';

describe('plano del salón', () => {
  it('agranda la mesa redonda cuando hay más sillas', () => {
    expect(seatLayout('round', 8).tableW).toBeGreaterThan(seatLayout('round', 4).tableW);
    expect(seatLayout('round', 6).chairs).toHaveLength(6);
    expect(seatLayout('rect', 8).chairs).toHaveLength(8);
  });

  it('al sentar a una persona completa al acompañante y al menor en la misma mesa', () => {
    const plan: FloorPlan = {
      tables: [{ id: 'mesa1', number: 1, x: 0, y: 0, shape: 'round', seats: 3, rotation: 0 }],
      chairs: [0, 1, 2].map((index) => ({
        id: `silla${index}`,
        x: 0,
        y: 0,
        rotation: 0,
        tableId: 'mesa1',
        seatIndex: index,
        invitationId: null,
        role: null,
        childIndex: null,
      })),
      walls: [],
      openings: [],
      objects: [],
    };
    const party: FloorSeatPerson[] = [
      { invitationId: 'ana', role: 'guest', childIndex: null, label: 'Ana', accredited: false },
      { invitationId: 'ana', role: 'companion', childIndex: null, label: 'Luis', accredited: false },
      { invitationId: 'ana', role: 'child', childIndex: 0, label: 'Sol', accredited: false },
    ];
    const seated = seatParty(plan, 'silla0', party[0], party);
    expect(seated.pending).toBe(0);
    expect(seated.plan.chairs.map((chair) => chair.role)).toEqual(['guest', 'companion', 'child']);
    const short = seatParty({ ...plan, tables: [{ ...plan.tables[0], seats: 2 }], chairs: plan.chairs.slice(0, 2) }, 'silla0', party[0], party);
    const laid = layoutChairs(short.plan);
    expect(laid.chairs.filter((chair) => chair.tableId === 'mesa1')).toHaveLength(2);
    expect(short.pending).toBe(1);
  });
});
