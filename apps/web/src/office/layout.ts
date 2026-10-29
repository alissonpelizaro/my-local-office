// Planta do escritório em coordenadas de grade (gx, gy), projetada em isométrico na tela.
// Faixas de salas acima e abaixo de corredores horizontais. Com mais de um corredor, uma espinha à direita
// liga todos e a planta cresce nas duas direções em vez de virar uma linha. As salas esticam para cada faixa
// ficar retangular, sem vãos entre elas. A área externa (Jardim) fica fora do prédio, no fim da espinha.
import type { Department, Employee } from '../types';
import type { Wall } from './draw';
import { type Blueprint, type Floor, LEISURE } from './rooms';

export const TW = 64;
export const TH = 32;
export const WALL = 54; // parede inteira
export const WALL_CUT = 18; // parede cortada: frente, ou fundo que esconderia o que está atrás
export type Pt = { gx: number; gy: number };
export type Rect = { gx: number; gy: number; w: number; d: number };
// Trecho de parede de 1 tile: L em gx = at, R em gy = at; u é o tile ao longo dela. front: lado da câmera.
export type Seg = { wall: Wall; at: number; u: number; h: number; front: boolean };
export const iso = (gx: number, gy: number) => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 });

// Posição de um móvel/lugar da planta na sala esticada, conforme a âncora (ver rooms.Item).
export const place = (r: Room, p: { x: number; y: number; ax?: number; ay?: number }): Pt => ({
  gx: r.gx + p.x + Math.floor((p.ax ?? 0) * (r.w - (r.blueprint?.w ?? r.w))),
  gy: r.gy + p.y + Math.floor((p.ay ?? 0) * (r.d - (r.blueprint?.d ?? r.d))),
});

export type Room = Rect & {
  id: string;
  kind: 'dept' | 'boss' | 'leisure';
  name: string;
  color: string;
  row: 0 | 1; // 0: acima do corredor (porta na parede da frente); 1: abaixo (porta na de trás)
  floor: Floor;
  walls: boolean;
  blueprint?: Blueprint;
  doorGx: number; // tile da porta
  door: Pt; // ponto logo dentro da porta
  hall: Pt; // ponto do corredor em frente à porta
  segs: Seg[];
};
export type Seat = { roomId: string; desk: Pt; seat: Pt; visitor: Pt };
export type LeisureSpot = Pt & { id: string; roomId: string; icon: string; pair?: string; face: 'front' | 'back' };
export type Floorplan = {
  rooms: Room[];
  seats: Map<number, Seat>;
  halls: Rect[]; // corredores horizontais, de cima para baixo
  spine?: Rect; // corredor vertical que liga os horizontais
  hallSegs: Seg[];
  spots: LeisureSpot[];
  bounds: { x: number; y: number; w: number; h: number };
};

const CELL = 3; // cada mesa ocupa 3×3 tiles (mesa, cadeira, passagem)
const HALL = 2;

function deptSize(n: number) {
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n))));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, w: Math.max(5, cols * CELL + 1), d: Math.max(4, rows * CELL + 1) };
}

export function computeFloorplan(departments: Department[], employees: Employee[]): Floorplan {
  type Draft = Omit<Room, 'gx' | 'gy' | 'row' | 'doorGx' | 'door' | 'hall' | 'segs'> & { cols: number; members: Employee[] };
  const drafts: Draft[] = [
    { id: 'boss', kind: 'boss', name: 'Sala do Chefe', color: '#64748b', w: 5, d: 4, floor: 'carpet', walls: true, cols: 1, members: [] },
    ...departments.map((dep): Draft => {
      const members = employees.filter((e) => e.department_id === dep.id);
      return { id: `d${dep.id}`, kind: 'dept', name: dep.name, color: dep.color, floor: 'wood', walls: true, ...deptSize(members.length), members };
    }),
    ...LEISURE.map((b): Draft => ({ id: b.id, kind: 'leisure', name: b.name, color: b.color, w: b.w, d: b.d, floor: b.floor, walls: b.walls, blueprint: b, cols: 1, members: [] })),
  ];

  const indoor = drafts.filter((r) => r.walls);
  const outdoor = drafts.filter((r) => !r.walls);

  // Faixas alternam acima/abaixo de cada corredor e cada sala vai para a faixa mais curta.
  // Testa toda quantidade de faixas e fica com a planta menor e mais quadrada.
  // A Sala do Chefe é a primeira, então sempre cai na faixa 0 (acima do primeiro corredor).
  let best = { bands: [] as Draft[][], w: 0, score: Infinity };
  for (let n = 1; n <= indoor.length; n++) {
    const bands: Draft[][] = Array.from({ length: n }, () => []);
    const widths = bands.map(() => 0);
    for (const r of indoor) {
      const i = widths.indexOf(Math.min(...widths));
      bands[i].push(r);
      widths[i] += r.w;
    }
    const halls = Math.ceil(n / 2);
    const w = Math.max(...widths);
    const W = w + (halls > 1 ? HALL : 0);
    const D = bands.reduce((s, b) => s + Math.max(...b.map((r) => r.d)), 0) + halls * HALL;
    const score = W + D + Math.abs(W - D) / 4;
    if (score < best.score) best = { bands, w, score };
  }

  const rooms: Room[] = [];
  const seats = new Map<number, Seat>();
  const halls: Rect[] = [];
  let top = 0;
  best.bands.forEach((band, i) => {
    const row = (i % 2) as 0 | 1;
    // Todas com a profundidade da faixa; a largura que falta até a espinha é dividida entre elas.
    const d = Math.max(...band.map((r) => r.d));
    const extra = best.w - band.reduce((s, r) => s + r.w, 0);
    const hallGy = row === 0 ? top + d : top - HALL;
    let gx = 0;
    band.forEach(({ cols, members, ...r }, j) => {
      const e = Math.floor(extra / band.length) + (j < extra % band.length ? 1 : 0);
      const w = r.w + e;
      // Mesmo deslocamento dos móveis centrais (âncora 0,5): a porta continua no vão livre da planta.
      const doorGx = gx + Math.floor(r.w / 2) + Math.floor(e / 2);
      rooms.push({
        ...r,
        gx,
        gy: top,
        w,
        d,
        row,
        doorGx,
        door: { gx: doorGx + 0.5, gy: row === 0 ? top + d - 0.6 : top + 0.6 },
        hall: { gx: doorGx + 0.5, gy: hallGy + HALL / 2 },
        segs: [],
      });
      // Mesas centralizadas na sala.
      const rows = Math.max(1, Math.ceil(members.length / cols));
      const ox = gx + 1 + (w - cols * CELL - 1) / 2;
      const oy = top + 1 + (d - rows * CELL - 1) / 2;
      members.forEach((e, i) => {
        const desk = { gx: ox + (i % cols) * CELL, gy: oy + Math.floor(i / cols) * CELL };
        seats.set(e.id, {
          roomId: r.id,
          desk,
          seat: { gx: desk.gx + 0.8, gy: desk.gy + 1.35 },
          visitor: { gx: desk.gx + 2.05, gy: desk.gy + 1.05 },
        });
      });
      gx += w;
    });
    top += d;
    if (row === 0) {
      halls.push({ gx: 0, gy: top, w: best.w, d: HALL });
      top += HALL;
    }
  });
  // A espinha liga os corredores e, havendo área externa, desce até a frente do prédio.
  const end = outdoor.length ? top : halls[halls.length - 1].gy + HALL;
  const spine = halls.length > 1 || outdoor.length ? { gx: best.w, gy: halls[0].gy, w: HALL, d: end - halls[0].gy } : undefined;
  const floors = spine ? [...halls, spine] : halls;

  // Área externa encostada na frente do prédio, com a porta (vão da cerca) no fim da espinha.
  // ponytail: só a primeira fica de frente para a espinha; outra precisaria de calçada própria até ela.
  let ox = best.w - Math.floor((outdoor[0]?.w ?? 0) / 2);
  for (const { cols: _, members: __, ...r } of outdoor) {
    const doorGx = ox + Math.floor(r.w / 2);
    rooms.push({ ...r, gx: ox, gy: top, row: 1, doorGx, door: { gx: doorGx + 0.5, gy: top + 0.6 }, hall: { gx: best.w + HALL / 2, gy: top - HALL / 2 }, segs: [] });
    ox += r.w;
  }

  // Dono de cada tile (id da sala ou 'hall'): decide a altura e quem desenha cada parede.
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const grid = new Map<string, string>();
  const fill = (a: Rect, id: string) => {
    for (let x = a.gx; x < a.gx + a.w; x++) for (let y = a.gy; y < a.gy + a.d; y++) grid.set(key(x, y), id);
  };
  for (const r of rooms) fill(r, r.id);
  for (const h of floors) fill(h, 'hall');
  const indoorIds = new Set(rooms.filter((r) => r.walls).map((r) => r.id));
  const isRoom = (k: string) => indoorIds.has(grid.get(k) ?? '');
  // Vão de porta: sem parede de nenhum dos lados (a da área externa abre no fim da espinha).
  const doors = new Set(rooms.map((r) => `${r.row === 0 ? r.gy + r.d : r.gy},${r.doorGx}`));
  const open = (e: { wall: Wall; at: number; u: number }) => e.wall === 'R' && doors.has(`${e.at},${e.u}`);

  const edges = (a: Rect) => {
    const out: (Omit<Seg, 'h'> & { outside: string })[] = [];
    for (let u = a.gy; u < a.gy + a.d; u++) {
      out.push({ wall: 'L', at: a.gx, u, front: false, outside: key(a.gx - 1, u) });
      out.push({ wall: 'L', at: a.gx + a.w, u, front: true, outside: key(a.gx + a.w, u) });
    }
    for (let u = a.gx; u < a.gx + a.w; u++) {
      out.push({ wall: 'R', at: a.gy, u, front: false, outside: key(u, a.gy - 1) });
      out.push({ wall: 'R', at: a.gy + a.d, u, front: true, outside: key(u, a.gy + a.d) });
    }
    return out;
  };
  // Parede inteira esconde o chão até ~1,7 tile atrás, na diagonal da tela. Só fica inteira se o tile
  // logo atrás (e o da diagonal) estão vazios; a da frente é sempre cortada.
  const seg = ({ outside, ...e }: ReturnType<typeof edges>[number]): Seg => {
    const behind = e.wall === 'L' ? [key(e.at - 1, e.u), key(e.at - 1, e.u - 1)] : [key(e.u, e.at - 1), key(e.u - 1, e.at - 1)];
    return { ...e, h: e.front || behind.some((k) => grid.has(k)) ? WALL_CUT : WALL };
  };
  // Parede entre duas salas sai uma vez só, como fundo da sala da frente.
  for (const r of rooms) r.segs = edges(r).filter((e) => !(e.front && isRoom(e.outside)) && !open(e)).map(seg);
  // Corredor fecha onde dá para fora (vazio ou área externa); o resto já é parede das salas.
  const hallSegs = floors.flatMap(edges).filter((e) => grid.get(e.outside) !== 'hall' && !isRoom(e.outside) && !open(e)).map(seg);

  const spots = rooms.flatMap((r) =>
    (r.blueprint?.spots ?? []).map((s, i) => ({
      id: `${r.id}:${i}`,
      roomId: r.id,
      ...place(r, s),
      icon: s.icon,
      pair: s.pair && `${r.id}:${s.pair}`,
      face: s.face ?? 'front',
    })),
  );

  const corners = [...rooms, ...floors].flatMap((r) => [iso(r.gx, r.gy), iso(r.gx + r.w, r.gy), iso(r.gx, r.gy + r.d), iso(r.gx + r.w, r.gy + r.d)]);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minY = Math.min(...ys) - 90; // paredes, árvores e placas
  return {
    rooms,
    seats,
    halls,
    spine,
    hallSegs,
    spots,
    bounds: { x: Math.min(...xs), y: minY, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) + 30 - minY },
  };
}

// Caminho entre salas: porta → corredor → (espinha → outro corredor) → porta. Dentro da mesma sala, linha reta.
export function route(plan: Floorplan, fromRoom: string, toRoom: string, to: Pt): Pt[] {
  if (fromRoom === toRoom) return [to];
  const a = plan.rooms.find((r) => r.id === fromRoom);
  const b = plan.rooms.find((r) => r.id === toRoom);
  if (!a || !b) return [to];
  if (a.hall.gy === b.hall.gy || !plan.spine) return [a.door, a.hall, b.hall, b.door, to];
  const x = plan.spine.gx + plan.spine.w / 2;
  return [a.door, a.hall, { gx: x, gy: a.hall.gy }, { gx: x, gy: b.hall.gy }, b.hall, b.door, to];
}
