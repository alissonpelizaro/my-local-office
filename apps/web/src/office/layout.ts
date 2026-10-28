// Planta do escritório em coordenadas de grade (gx, gy), projetada em isométrico na tela.
// Duas fileiras de salas com um corredor no meio: Sala do Chefe, um departamento por sala e as salas de descompressão.
import type { Department, Employee } from '../types';
import { type Blueprint, type Floor, LEISURE } from './rooms';

export const TW = 64;
export const TH = 32;
export type Pt = { gx: number; gy: number };
export const iso = (gx: number, gy: number) => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 });

export type Room = {
  id: string;
  kind: 'dept' | 'boss' | 'leisure';
  name: string;
  color: string;
  gx: number;
  gy: number;
  w: number;
  d: number;
  row: 0 | 1;
  floor: Floor;
  walls: boolean;
  blueprint?: Blueprint;
  doorGx: number; // tile da porta (na parede da frente na fileira 0, na de trás na fileira 1)
  door: Pt; // ponto logo dentro da porta
  hall: Pt; // ponto do corredor em frente à porta
};
export type Seat = { roomId: string; desk: Pt; seat: Pt; visitor: Pt };
export type LeisureSpot = Pt & { id: string; roomId: string; icon: string; pair?: string; face: 'front' | 'back' };
export type Floorplan = {
  rooms: Room[];
  seats: Map<number, Seat>;
  hall: { gx: number; gy: number; w: number; d: number };
  spots: LeisureSpot[];
  bounds: { x: number; y: number; w: number; h: number };
};

const CELL = 3; // cada mesa ocupa 3×3 tiles (mesa, cadeira, passagem)
const GAP = 1;
const HALL = 2;

function deptSize(n: number) {
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n))));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, w: Math.max(5, cols * CELL + 1), d: Math.max(4, rows * CELL + 1) };
}

export function computeFloorplan(departments: Department[], employees: Employee[]): Floorplan {
  type Draft = Omit<Room, 'gx' | 'gy' | 'row' | 'doorGx' | 'door' | 'hall'> & { cols: number; members: Employee[] };
  const drafts: Draft[] = [
    { id: 'boss', kind: 'boss', name: 'Sala do Chefe', color: '#64748b', w: 5, d: 4, floor: 'carpet', walls: true, cols: 1, members: [] },
    ...departments.map((dep): Draft => {
      const members = employees.filter((e) => e.department_id === dep.id);
      return { id: `d${dep.id}`, kind: 'dept', name: dep.name, color: dep.color, floor: 'wood', walls: true, ...deptSize(members.length), members };
    }),
    ...LEISURE.map((b): Draft => ({ id: b.id, kind: 'leisure', name: b.name, color: b.color, w: b.w, d: b.d, floor: b.floor, walls: b.walls, blueprint: b, cols: 1, members: [] })),
  ];

  // Cada sala vai para a fileira mais curta, equilibrando a largura.
  const rows: Draft[][] = [[], []];
  const widths = [0, 0];
  for (const r of drafts) {
    const i = widths[0] <= widths[1] ? 0 : 1;
    rows[i].push(r);
    widths[i] += r.w + GAP;
  }
  const d0 = Math.max(4, ...rows[0].map((r) => r.d));
  const hallGy = d0;

  const rooms: Room[] = [];
  const seats = new Map<number, Seat>();
  rows.forEach((row, ri) => {
    let gx = 0;
    for (const { cols, members, ...r } of row) {
      const gy = ri === 0 ? d0 - r.d : d0 + HALL;
      const doorGx = gx + Math.floor(r.w / 2);
      rooms.push({
        ...r,
        gx,
        gy,
        row: ri as 0 | 1,
        doorGx,
        door: { gx: doorGx + 0.5, gy: ri === 0 ? gy + r.d - 0.6 : gy + 0.6 },
        hall: { gx: doorGx + 0.5, gy: hallGy + HALL / 2 },
      });
      members.forEach((e, i) => {
        const desk = { gx: gx + 1 + (i % cols) * CELL, gy: gy + 1 + Math.floor(i / cols) * CELL };
        seats.set(e.id, {
          roomId: r.id,
          desk,
          seat: { gx: desk.gx + 0.8, gy: desk.gy + 1.35 },
          visitor: { gx: desk.gx + 2.05, gy: desk.gy + 1.05 },
        });
      });
      gx += r.w + GAP;
    }
  });

  const spots = rooms.flatMap((r) =>
    (r.blueprint?.spots ?? []).map((s, i) => ({
      id: `${r.id}:${i}`,
      roomId: r.id,
      gx: r.gx + s.x,
      gy: r.gy + s.y,
      icon: s.icon,
      pair: s.pair && `${r.id}:${s.pair}`,
      face: s.face ?? 'front',
    })),
  );

  const hallW = Math.max(widths[0], widths[1]) - GAP;
  const corners = rooms.flatMap((r) => [iso(r.gx, r.gy), iso(r.gx + r.w, r.gy), iso(r.gx, r.gy + r.d), iso(r.gx + r.w, r.gy + r.d)]);
  corners.push(iso(0, hallGy), iso(hallW, hallGy), iso(0, hallGy + HALL), iso(hallW, hallGy + HALL));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minY = Math.min(...ys) - 90; // paredes, árvores e placas
  return {
    rooms,
    seats,
    hall: { gx: 0, gy: hallGy, w: hallW, d: HALL },
    spots,
    bounds: { x: Math.min(...xs), y: minY, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) + 30 - minY },
  };
}

// Caminho entre salas: porta → corredor → porta. Dentro da mesma sala, linha reta.
export function route(plan: Floorplan, fromRoom: string, toRoom: string, to: Pt): Pt[] {
  if (fromRoom === toRoom) return [to];
  const a = plan.rooms.find((r) => r.id === fromRoom);
  const b = plan.rooms.find((r) => r.id === toRoom);
  if (!a || !b) return [to];
  return [a.door, a.hall, b.hall, b.door, to];
}
