import type { FloorChair, FloorOpening, FloorPlan, FloorSeatPerson, FloorShape, FloorWall } from './models';

export const GRID = 16;
const PITCH = 36;

export function seatKey(seat: { invitationId?: string | null; role?: string | null; childIndex?: number | null }) {
  if (!seat.invitationId || !seat.role) return '';
  if (seat.role === 'child') return `${seat.invitationId}:child:${seat.childIndex ?? 0}`;
  return `${seat.invitationId}:${seat.role}`;
}

export function rotatePoint(x: number, y: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export type SeatSpot = { x: number; y: number; facing: number };

export function seatLayout(shape: FloorShape, seats: number): { tableW: number; tableH: number; chairs: SeatSpot[] } {
  const count = Math.max(0, Math.min(20, Math.floor(seats)));
  if (shape === 'round') {
    const radius = Math.max(30, (Math.max(count, 1) * PITCH) / (2 * Math.PI));
    const chairs = Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
      const dist = radius + 18;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        facing: (angle * 180) / Math.PI + 90,
      };
    });
    return { tableW: radius * 2, tableH: radius * 2, chairs };
  }

  const across = shape === 'square' ? Math.ceil(count / 4) : Math.ceil(count / 2);
  const side = Math.max(shape === 'square' ? 64 : 48, Math.max(across, 1) * PITCH);
  const width = shape === 'square' ? side : Math.max(88, Math.ceil(count / 2) * PITCH);
  const height = shape === 'square' ? side : Math.max(56, Math.ceil(count / 4) * PITCH);
  const spots = perimeterSpots(width, height, count);
  return { tableW: width, tableH: height, chairs: spots };
}

function perimeterSpots(width: number, height: number, count: number): SeatSpot[] {
  if (count <= 0) return [];
  const top = Math.ceil(count / 2);
  const bottom = count - top;
  const topCount = Math.ceil(top / 2);
  const bottomCount = top - topCount;
  const right = Math.ceil(bottom / 2);
  const left = bottom - right;
  const gap = 18;
  const spots: SeatSpot[] = [];
  lineSpots(spots, topCount, -width / 2, width / 2, -height / 2 - gap, -height / 2 - gap, 0);
  lineSpots(spots, right, width / 2 + gap, width / 2 + gap, -height / 2, height / 2, 90);
  lineSpots(spots, bottomCount, width / 2, -width / 2, height / 2 + gap, height / 2 + gap, 180);
  lineSpots(spots, left, -width / 2 - gap, -width / 2 - gap, height / 2, -height / 2, 270);
  return spots.slice(0, count);
}

function lineSpots(spots: SeatSpot[], count: number, x1: number, x2: number, y1: number, y2: number, facing: number) {
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0.5 : index / (count - 1);
    spots.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, facing });
  }
}

export function newFloorId(prefix: string) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `${prefix}${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function layoutChairs(plan: FloorPlan): FloorPlan {
  const loose = plan.chairs.filter((chair) => !chair.tableId || !plan.tables.some((table) => table.id === chair.tableId));
  const bound: FloorChair[] = [];
  for (const table of plan.tables) {
    const layout = seatLayout(table.shape, table.seats);
    const mine = plan.chairs
      .filter((chair) => chair.tableId === table.id)
      .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
    for (let index = 0; index < table.seats; index += 1) {
      const spot = layout.chairs[index];
      const world = rotatePoint(spot?.x ?? 0, spot?.y ?? 0, table.rotation);
      const existing = mine[index];
      bound.push({
        id: existing?.id ?? newFloorId('silla'),
        x: table.x + world.x,
        y: table.y + world.y,
        rotation: existing?.rotation ?? 0,
        tableId: table.id,
        seatIndex: index,
        invitationId: existing?.invitationId ?? null,
        role: existing?.role ?? null,
        childIndex: existing?.childIndex ?? null,
      });
    }
  }
  return { ...plan, chairs: [...loose, ...bound] };
}

export function chairFacing(plan: FloorPlan, chair: FloorChair) {
  if (!chair.tableId || chair.seatIndex == null) return chair.rotation;
  const table = plan.tables.find((item) => item.id === chair.tableId);
  if (!table) return chair.rotation;
  const spot = seatLayout(table.shape, table.seats).chairs[chair.seatIndex];
  return (spot?.facing ?? 0) + table.rotation + chair.rotation;
}

export function projectOnWall(wall: FloorWall, x: number, y: number) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy) || 1;
  const t = Math.min(1, Math.max(0, ((x - wall.x1) * dx + (y - wall.y1) * dy) / (length * length)));
  const px = wall.x1 + dx * t;
  const py = wall.y1 + dy * t;
  return { t, x: px, y: py, distance: Math.hypot(x - px, y - py), length, ux: dx / length, uy: dy / length };
}

export function nearestWall(walls: FloorWall[], x: number, y: number, maxDistance: number) {
  let best: (ReturnType<typeof projectOnWall> & { wall: FloorWall }) | null = null;
  for (const wall of walls) {
    const hit = projectOnWall(wall, x, y);
    if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = { wall, ...hit };
  }
  return best;
}

export function openingEnds(wall: FloorWall, opening: Pick<FloorOpening, 't' | 'width'>) {
  const hit = projectOnWall(wall, wall.x1, wall.y1);
  const length = hit.length;
  const cx = wall.x1 + hit.ux * opening.t * length;
  const cy = wall.y1 + hit.uy * opening.t * length;
  const half = opening.width / 2;
  return {
    x1: cx - hit.ux * half,
    y1: cy - hit.uy * half,
    x2: cx + hit.ux * half,
    y2: cy + hit.uy * half,
    cx,
    cy,
    ux: hit.ux,
    uy: hit.uy,
    nx: -hit.uy,
    ny: hit.ux,
  };
}

export function snapPoint(x: number, y: number, walls: FloorWall[], shiftFrom?: { x: number; y: number } | null) {
  let nextX = Math.round(x / GRID) * GRID;
  let nextY = Math.round(y / GRID) * GRID;
  for (const wall of walls) {
    for (const end of [
      [wall.x1, wall.y1],
      [wall.x2, wall.y2],
    ]) {
      if (Math.hypot(nextX - end[0], nextY - end[1]) <= 14) return { x: end[0], y: end[1] };
    }
  }
  if (shiftFrom) {
    if (Math.abs(nextX - shiftFrom.x) >= Math.abs(nextY - shiftFrom.y)) nextY = shiftFrom.y;
    else nextX = shiftFrom.x;
  }
  return { x: nextX, y: nextY };
}

export function seatParty(plan: FloorPlan, chairId: string, person: FloorSeatPerson | null, party: FloorSeatPerson[]) {
  const chairs = plan.chairs.map((chair) => ({ ...chair }));
  const target = chairs.find((chair) => chair.id === chairId);
  if (!target) return { plan, pending: 0 };
  if (person) {
    for (const chair of chairs) {
      if (chair.id !== target.id && seatKey(chair) === seatKey(person)) {
        chair.invitationId = null;
        chair.role = null;
        chair.childIndex = null;
      }
    }
  }
  target.invitationId = person?.invitationId ?? null;
  target.role = person?.role ?? null;
  target.childIndex = person?.childIndex ?? null;
  let pending = 0;
  if (person && target.tableId) {
    const members = party.filter((member) => member.invitationId === person.invitationId && seatKey(member) !== seatKey(person));
    const order = ['guest', 'companion', 'child'] as const;
    members.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || (a.childIndex ?? 0) - (b.childIndex ?? 0));
    const empty = chairs
      .filter((chair) => chair.tableId === target.tableId && chair.id !== target.id && !chair.invitationId)
      .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
    for (const member of members) {
      if (chairs.some((chair) => seatKey(chair) === seatKey(member))) continue;
      const chair = empty.shift();
      if (!chair) {
        pending += 1;
        continue;
      }
      chair.invitationId = member.invitationId;
      chair.role = member.role;
      chair.childIndex = member.childIndex;
    }
  }
  return { plan: { ...plan, chairs }, pending };
}

export function planBounds(plan: FloorPlan) {
  const points: { x: number; y: number }[] = [];
  for (const wall of plan.walls) points.push({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
  for (const object of plan.objects) {
    points.push({ x: object.x - object.width / 2, y: object.y - object.height / 2 }, { x: object.x + object.width / 2, y: object.y + object.height / 2 });
  }
  for (const table of plan.tables) {
    const layout = seatLayout(table.shape, Math.max(table.seats, 1));
    points.push({ x: table.x - layout.tableW, y: table.y - layout.tableH }, { x: table.x + layout.tableW, y: table.y + layout.tableH });
  }
  for (const chair of plan.chairs) points.push({ x: chair.x, y: chair.y });
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY };
}

export function normalizePlan(input: Partial<FloorPlan> | null | undefined): FloorPlan {
  return {
    tables: input?.tables ?? [],
    chairs: input?.chairs ?? [],
    walls: input?.walls ?? [],
    openings: input?.openings ?? [],
    objects: input?.objects ?? [],
  };
}
