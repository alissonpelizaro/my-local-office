// Planta do escritório em coordenadas de grade (gx, gy), projetada em isométrico na tela.
// Faixas de salas acima e abaixo de corredores horizontais, ligados por uma espinha à direita que percorre o prédio
// inteiro; do outro lado da espinha o Jardim ocupa a lateral toda, com a porta no meio.
// Chefe e departamentos se agrupam por profundidade (a faixa estica todas para a mais funda); as salas de
// descompressão preenchem o que sobra, empilhadas onde a faixa é funda. Sala esticada ganha módulos de móveis.
import type { Department, Employee } from '../types';
import type { Wall } from './draw';
import { type Blueprint, BOSS_FILL, DEPT_FILL, type Floor, footprint, GARDEN, type Item, LEISURE, type Module, type Spot } from './rooms';
import type { IconName } from '../components/icons';

export const TW = 64;
export const TH = 32;
export const WALL = 54; // parede inteira
export const WALL_CUT = 18; // parede cortada: frente, ou fundo que esconderia o que está atrás
export type Pt = { gx: number; gy: number };
export type Rect = { gx: number; gy: number; w: number; d: number };
// Trecho de parede de 1 tile: L em gx = at, R em gy = at; u é o tile ao longo dela. front: lado da câmera.
export type Seg = { wall: Wall; at: number; u: number; h: number; front: boolean };
export type Door = { wall: Wall; at: number; u: number };
export const iso = (gx: number, gy: number) => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 });

// Posição de um móvel/lugar da planta na sala esticada, conforme a âncora (ver rooms.Item).
const place = (r: Rect & { blueprint?: Blueprint }, p: { x: number; y: number; ax?: number; ay?: number }): Pt => ({
  gx: r.gx + p.x + Math.floor((p.ax ?? 0) * (r.w - (r.blueprint?.w ?? r.w))),
  gy: r.gy + p.y + Math.floor((p.ay ?? 0) * (r.d - (r.blueprint?.d ?? r.d))),
});

export type Room = Rect & {
  id: string;
  kind: 'dept' | 'boss' | 'leisure';
  name: string;
  color: string;
  floor: Floor;
  walls: boolean;
  blueprint?: Blueprint;
  door: Door; // vão de 1 tile na parede (ou na cerca)
  inside: Pt; // ponto logo dentro da porta
  path: Pt[]; // do corredor até `inside`; sala empilhada passa pela da frente
  items: Item[]; // móveis em coordenadas absolutas
  segs: Seg[]; // paredes (ou cerca viva, no jardim)
};
export type Seat = { roomId: string; desk: Pt; seat: Pt; visitor: Pt };
export type LeisureSpot = Pt & { id: string; roomId: string; icon: IconName; pair?: string; face: 'front' | 'back' };
export type Floorplan = {
  rooms: Room[];
  seats: Map<number, Seat>;
  halls: Rect[]; // corredores horizontais, de cima para baixo
  spine: Rect; // corredor vertical que liga os horizontais, da frente aos fundos
  hallSegs: Seg[];
  spots: LeisureSpot[];
  bounds: { x: number; y: number; w: number; h: number };
};

const CELL = 3; // cada mesa ocupa 3×3 tiles (mesa, cadeira, passagem)
const HALL = 2;

// Mais largo que fundo: a profundidade de uma sala estica as vizinhas de faixa, a largura não.
function deptSize(n: number) {
  const cols = Math.max(1, Math.min(n, 10, Math.ceil(Math.sqrt(n * 1.6))));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, w: Math.max(5, cols * CELL + 1), d: Math.max(4, rows * CELL + 1) };
}

type Draft = { id: string; kind: Room['kind']; name: string; color: string; w: number; d: number; floor: Floor; walls: boolean; blueprint?: Blueprint; cols: number; members: Employee[] };
type Col = { rooms: Draft[]; w: number; d: number; extra: number }; // salas empilhadas a partir do corredor
type Band = { cols: Col[]; w: number; d: number };

const leisureCol = (c: Col) => c.rooms[0].kind === 'leisure';

// Prateleiras com largura fixa: as salas fixas (já da mais funda para a mais rasa) só entram numa faixa até 1,6×
// mais funda que elas; as de descompressão empilham onde cabem, senão ocupam folga, senão abrem faixa.
function pack(fixed: Draft[], leisure: Draft[], width: number): Band[] {
  const bands: Band[] = [];
  const column = (b: Band, r: Draft) => {
    b.cols.push({ rooms: [r], w: r.w, d: r.d, extra: 0 });
    b.w += r.w;
    b.d = Math.max(b.d, r.d);
  };
  const open = (r: Draft) => {
    const b: Band = { cols: [], w: 0, d: r.d };
    bands.push(b);
    return b;
  };
  for (const r of fixed) column(bands.find((b) => b.w + r.w <= width && r.d * 1.6 >= b.d) ?? open(r), r);
  for (const r of leisure) {
    let best: { cost: number; run: () => void } | undefined;
    const offer = (cost: number, run: () => void) => (!best || cost < best.cost) && (best = { cost, run });
    for (const b of bands) {
      for (const c of b.cols) {
        const w = Math.max(c.w, r.w);
        if (leisureCol(c) && c.d + r.d <= b.d && b.w - c.w + w <= width) {
          offer(-r.w * r.d + (w - c.w) * b.d, () => {
            c.rooms.push(r);
            c.d += r.d;
            b.w += w - c.w;
            c.w = w;
          });
        }
      }
      // Faixa mais rasa que a sala afundaria todas as outras dela.
      if (b.w + r.w <= width) offer(r.d <= b.d ? (b.d - r.d) * r.w * 0.3 : (r.d - b.d) * b.w * 2, () => column(b, r));
    }
    offer(1e6, () => column(open(r), r));
    best!.run();
  }
  return bands;
}

// Área esticada à toa: sala fixa vale mais que descompressão (que ganha móveis extras).
function waste(bands: Band[], width: number) {
  let sum = 0;
  for (const b of bands) {
    if (!b.cols.some(leisureCol)) sum += (width - b.w) * b.d;
    for (const c of b.cols) sum += (b.d - c.d) * c.w * (leisureCol(c) ? 0.3 : 1);
  }
  return sum;
}

export function computeFloorplan(departments: Department[], employees: Employee[]): Floorplan {
  const boss: Draft = { id: 'boss', kind: 'boss', name: 'Sala do Chefe', color: '#64748b', w: 5, d: 4, floor: 'carpet', walls: true, cols: 1, members: [] };
  const depts = departments.map((dep): Draft => {
    const members = employees.filter((e) => e.department_id === dep.id);
    return { id: `d${dep.id}`, kind: 'dept', name: dep.name, color: dep.color, floor: 'wood', walls: true, ...deptSize(members.length), members };
  });
  const leisure = LEISURE.map((b): Draft => ({ id: b.id, kind: 'leisure', name: b.name, color: b.color, w: b.w, d: b.d, floor: b.floor, walls: b.walls, blueprint: b, cols: 1, members: [] }));
  // A Sala do Chefe vai primeiro entre as de mesma profundidade, e a faixa dela fica no topo.
  const fixed = [boss, ...depts].sort((a, b) => b.d - a.d);
  const widths = [...fixed, ...leisure].map((r) => r.w);

  // Testa toda largura de faixa e fica com a planta mais compacta e quadrada (jardim incluído), com menos sobra.
  let best = { bands: [] as Band[], width: 0, score: Infinity };
  for (let width = Math.max(...widths); width <= widths.reduce((s, w) => s + w, 0); width++) {
    const bands = pack(fixed, leisure, width);
    const W = width + HALL + GARDEN.w;
    const D = bands.reduce((s, b) => s + b.d, 0) + Math.ceil(bands.length / 2) * HALL;
    const score = W + D + Math.abs(W - D) / 4 + waste(bands, width) * 0.05;
    if (score < best.score) best = { bands, width, score };
  }
  const width = best.width;
  const bands = best.bands.toSorted((a, b) => Number(b.cols.some((c) => c.rooms.includes(boss))) - Number(a.cols.some((c) => c.rooms.includes(boss))));

  const rooms: Room[] = [];
  const extraSpots = new Map<Room, PlacedSpot[]>(); // lugares dos módulos de móveis
  const seats = new Map<number, Seat>();
  const halls: Rect[] = [];
  let top = 0;
  bands.forEach((band, i) => {
    const row = i % 2; // 0: acima do corredor (porta na parede da frente); 1: abaixo (porta na de trás)
    const d = band.d;
    const hallGy = row === 0 ? top + d : top - HALL;
    // A largura que falta até a espinha vai para as de descompressão da faixa; sem nenhuma, para todas.
    const takers = band.cols.some(leisureCol) ? band.cols.filter(leisureCol) : band.cols;
    const extra = width - band.w;
    takers.forEach((c, j) => (c.extra = Math.floor(extra / takers.length) + (j < extra % takers.length ? 1 : 0)));
    let gx = 0;
    for (const c of band.cols) {
      const w = c.w + c.extra;
      let used = 0;
      let outer: Room | undefined;
      c.rooms.forEach(({ cols, members, ...r }, k) => {
        const rd = k === c.rooms.length - 1 ? d - used : r.d; // a mais longe do corredor fica com o fundo que sobra
        const gy = row === 0 ? top + d - used - rd : top + used;
        // Mesmo deslocamento dos móveis centrais (âncora 0,5): a porta continua no vão livre da planta.
        // Empilhada abre na da frente, alinhada com a porta dela.
        const doorGx = outer?.door.u ?? gx + Math.floor(r.w / 2) + Math.floor((w - r.w) / 2);
        const door: Door = { wall: 'R', at: row === 0 ? gy + rd : gy, u: doorGx };
        const inside = { gx: doorGx + 0.5, gy: row === 0 ? gy + rd - 0.6 : gy + 0.6 };
        const path = outer ? [...outer.path, { gx: doorGx + 0.5, gy: row === 0 ? outer.gy + 0.6 : outer.gy + outer.d - 0.6 }, inside] : [{ gx: doorGx + 0.5, gy: hallGy + HALL / 2 }, inside];
        const room: Room = { ...r, gx, gy, w, d: rd, door, inside, path, items: [], segs: [] };
        rooms.push(room);
        outer = room;
        used += rd;
        if (r.kind !== 'dept') return;
        // Mesas centralizadas na sala.
        const rows = Math.max(1, Math.ceil(members.length / cols));
        const ox = gx + 1 + (w - cols * CELL - 1) / 2;
        const oy = gy + 1 + (rd - rows * CELL - 1) / 2;
        members.forEach((e, n) => {
          const desk = { gx: ox + (n % cols) * CELL, gy: oy + Math.floor(n / cols) * CELL };
          seats.set(e.id, { roomId: r.id, desk, seat: { gx: desk.gx + 0.8, gy: desk.gy + 1.35 }, visitor: { gx: desk.gx + 2.05, gy: desk.gy + 1.05 } });
        });
        const f = furnishDept(room, { gx: ox, gy: oy, w: cols * CELL, d: rows * CELL });
        room.items = f.items;
        extraSpots.set(room, f.spots);
      });
      gx += w;
    }
    top += d;
    if (row === 0) {
      halls.push({ gx: 0, gy: top, w: width, d: HALL });
      top += HALL;
    }
  });
  const depth = top;
  const spine: Rect = { gx: width, gy: 0, w: HALL, d: depth };

  // Jardim do outro lado da espinha, na lateral inteira; a porta (vão na parede da espinha) fica no meio dele.
  const gd = Math.max(depth, GARDEN.d);
  const gardenRect = { gx: width + HALL, gy: 0, w: GARDEN.w, d: gd, blueprint: GARDEN };
  const doorGy = place(gardenRect, { x: 0, y: GARDEN.doorY, ay: 0.5 }).gy;
  const gardenInside = { gx: gardenRect.gx + 0.6, gy: doorGy + 0.5 };
  rooms.push({
    ...gardenRect,
    id: GARDEN.id,
    kind: 'leisure',
    name: GARDEN.name,
    color: GARDEN.color,
    floor: GARDEN.floor,
    walls: false,
    door: { wall: 'L', at: gardenRect.gx, u: doorGy },
    inside: gardenInside,
    path: [{ gx: width + HALL / 2, gy: doorGy + 0.5 }, gardenInside],
    items: [],
    segs: [],
  });

  // Dono de cada tile (id da sala ou 'hall'): decide a altura e quem desenha cada parede.
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const grid = new Map<string, string>();
  const fill = (a: Rect, id: string) => {
    for (let x = a.gx; x < a.gx + a.w; x++) for (let y = a.gy; y < a.gy + a.d; y++) grid.set(key(x, y), id);
  };
  const floors = [...halls, spine];
  for (const r of rooms) fill(r, r.id);
  for (const h of floors) fill(h, 'hall');
  const indoorIds = new Set(rooms.filter((r) => r.walls).map((r) => r.id));
  const isRoom = (k: string) => indoorIds.has(grid.get(k) ?? '');
  const inBuilding = (k: string) => grid.get(k) === 'hall' || isRoom(k);
  // Vão de porta: sem parede de nenhum dos lados.
  const doors = new Set(rooms.map((r) => `${r.door.wall}${r.door.at},${r.door.u}`));
  const open = (e: { wall: Wall; at: number; u: number }) => doors.has(`${e.wall}${e.at},${e.u}`);

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
  for (const r of rooms) {
    // Parede entre duas salas sai uma vez só, como fundo da sala da frente. A cerca viva do jardim não encosta no prédio.
    r.segs = r.walls ? edges(r).filter((e) => !(e.front && isRoom(e.outside)) && !open(e)).map(seg) : edges(r).filter((e) => !inBuilding(e.outside)).map(seg);
  }
  // Corredor fecha onde dá para fora (vazio ou jardim); o resto já é parede das salas.
  const hallSegs = floors.flatMap(edges).filter((e) => grid.get(e.outside) !== 'hall' && !isRoom(e.outside) && !open(e)).map(seg);

  const spots: LeisureSpot[] = [];
  for (const r of rooms) {
    // Chefe: mesa, tapete e armário no bloco central de 5 tiles (drawBoss), estante na esquerda e vaso na direita.
    const boss = [{ gx: r.gx + Math.floor((r.w - 5) / 2), gy: r.gy, w: 5, d: r.d }, { gx: r.gx, gy: r.gy + 1, w: 1, d: 2 }, { gx: r.gx + r.w - 1, gy: r.gy, w: 1, d: 1 }];
    const f = r.kind === 'leisure' ? furnishLeisure(r) : r.kind === 'boss' ? furnish(r, [], boss, BOSS_FILL) : undefined;
    if (f) {
      r.items = f.items;
      extraSpots.set(r, f.spots);
    }
    const base = r.kind === 'leisure' ? r.blueprint!.spots.map((s): PlacedSpot => ({ ...s, ...place(r, s) })) : [];
    [...base, ...(extraSpots.get(r) ?? [])].forEach((s, i) =>
      spots.push({ id: `${r.id}:${i}`, roomId: r.id, gx: s.gx, gy: s.gy, icon: s.icon, pair: s.pair && `${r.id}:${s.pair}`, face: s.face ?? 'front' }),
    );
  }

  const corners = [...rooms, ...floors].flatMap((r) => [iso(r.gx, r.gy), iso(r.gx + r.w, r.gy), iso(r.gx, r.gy + r.d), iso(r.gx + r.w, r.gy + r.d)]);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minY = Math.min(...ys) - 90; // paredes, árvores e placas
  return { rooms, seats, halls, spine, hallSegs, spots, bounds: { x: Math.min(...xs), y: minY, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) + 30 - minY } };
}

// ---------- móveis extras ----------

type PlacedSpot = Spot & Pt;

// Preenche o chão livre com módulos (em ciclo), varrendo do fundo para a frente. blocked: retângulos absolutos ocupados.
function furnish(r: Room, base: Item[], blocked: Rect[], modules: Module[]) {
  const occ = Array.from({ length: r.d }, () => new Array<boolean>(r.w).fill(false));
  const mark = (x: number, y: number, w: number, d: number) => {
    for (let j = Math.max(0, Math.floor(y + 0.05)); j < Math.min(r.d, Math.ceil(y + d - 0.05)); j++)
      for (let i = Math.max(0, Math.floor(x + 0.05)); i < Math.min(r.w, Math.ceil(x + w - 0.05)); i++) occ[j][i] = true;
  };
  const free = (x: number, y: number, w: number, d: number) => {
    for (let j = y; j < y + d; j++) for (let i = x; i < x + w; i++) if (occ[j][i]) return false;
    return true;
  };
  for (const it of base) {
    const f = footprint(it);
    mark(f.x - r.gx, f.y - r.gy, f.w, f.d);
  }
  for (const b of blocked) mark(b.gx - r.gx, b.gy - r.gy, b.w, b.d);
  // Passagem da porta: dois tiles para dentro.
  const { door } = r;
  if (door.wall === 'R') mark(door.u - r.gx, door.at === r.gy ? 0 : r.d - 2, 1, 2);
  else mark(0, door.u - r.gy, 2, 1);

  const items = [...base];
  const spots: PlacedSpot[] = [];
  let k = (r.gx * 7 + r.gy * 3) % Math.max(1, modules.length);
  for (let y = 0; y < r.d; y++) {
    for (let x = 0; x < r.w; x++) {
      for (let n = 0; n < modules.length; n++) {
        const m = modules[(k + n) % modules.length];
        if ((m.edge === 'R' && y !== 0) || (m.edge === 'L' && x !== 0) || x + m.w > r.w || y + m.d > r.d || !free(x, y, m.w, m.d)) continue;
        items.push(...m.items.map((it) => ({ ...it, x: r.gx + x + it.x, y: r.gy + y + it.y })));
        spots.push(...(m.spots ?? []).map((s) => ({ ...s, gx: r.gx + x + s.x, gy: r.gy + y + s.y })));
        // Os de parede ficam espaçados; os de chão já trazem margem.
        mark(x, y, m.w + (m.edge ? 1 : 0), m.d + (m.edge ? 1 : 0));
        k = (k + n + 1) % modules.length;
        break;
      }
    }
  }
  return { items, spots };
}

function furnishLeisure(r: Room) {
  const b = r.blueprint!;
  const base = b.items.map((it) => {
    const p = place(r, it);
    // Alameda do jardim acompanha o comprimento todo.
    return it.t === 'promenade' ? { ...it, x: p.gx, y: r.gy, d: r.d } : { ...it, x: p.gx, y: p.gy };
  });
  const spots = b.spots.map((s) => place(r, s));
  return furnish(r, base, spots.map((s) => ({ gx: s.gx - 0.45, gy: s.gy - 0.45, w: 0.9, d: 0.9 })), b.fill);
}

// Departamento: plantas nos cantos e bebedouro; o resto encosta nas paredes do fundo, longe do quadro e do quadro de aviso.
function furnishDept(r: Room, desks: Rect) {
  const base: Item[] = [
    { t: 'plant', x: r.gx + 0.35, y: r.gy + 0.35, s: 1.2 },
    { t: 'plant', x: r.gx + r.w - 0.45, y: r.gy + 0.35, s: 1 },
    { t: 'plant', x: r.gx + r.w - 0.4, y: r.gy + r.d - 0.4, s: 1.3 },
    { t: 'cooler', x: r.gx + 0.2, y: r.gy + r.d - 0.78 },
  ];
  const wallArt = [2, r.w - 2].map((x) => ({ gx: r.gx + x, gy: r.gy, w: 1, d: 1 }));
  return furnish(r, base, [desks, ...wallArt], DEPT_FILL);
}

// Caminho entre salas: sai pela porta (e pela sala da frente, se empilhada) → corredor → (espinha → outro corredor) → entra.
// Entre salas da mesma pilha não passa pelo corredor. Dentro da mesma sala, linha reta.
export function route(plan: Floorplan, fromRoom: string, toRoom: string, to: Pt): Pt[] {
  if (fromRoom === toRoom) return [to];
  const a = plan.rooms.find((r) => r.id === fromRoom);
  const b = plan.rooms.find((r) => r.id === toRoom);
  if (!a || !b) return [to];
  let k = 0;
  while (k < a.path.length && k < b.path.length && a.path[k] === b.path[k]) k++;
  if (k > 1) return [...a.path.slice(k).reverse(), ...b.path.slice(k), to];
  const out = a.path.toReversed();
  const x = plan.spine.gx + plan.spine.w / 2;
  const via = a.path[0].gy === b.path[0].gy ? [] : [{ gx: x, gy: a.path[0].gy }, { gx: x, gy: b.path[0].gy }];
  const pts = [...out, ...via, ...b.path, to];
  return pts.filter((p, i) => i === 0 || p.gx !== pts[i - 1].gx || p.gy !== pts[i - 1].gy);
}
