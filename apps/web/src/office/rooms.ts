// Plantas das salas de descompressão e módulos de móveis: o que cada sala tem e onde os ociosos ficam.
// Coordenadas locais em tiles (x ao longo de gx, y ao longo de gy).
import type { IconName } from '../components/icons';
export type Floor = 'wood' | 'carpet' | 'tile' | 'grass';

// Âncora (ax, ay): quanto do espaço extra da sala esticada o móvel acompanha. 0 fica junto da parede
// esquerda/do fundo, 1 acompanha a direita/a frente, 0,5 fica no centro (grupos como mesa e banquetas).
type Anchor = { ax?: number; ay?: number };

export type Item = Anchor & {
  t: string; // tipo de móvel (ver OfficeScene.drawItem)
  x: number;
  y: number;
  w?: number;
  d?: number;
  c?: number; // cor
  s?: number; // escala (plantas)
  face?: 'gx' | 'gy'; // para que lado a estante mostra os livros
  flip?: boolean; // encosto do banco/sofá no lado + (de frente para -gx/-gy)
};

// face: 'back' quando o que interessa (TV, estante, balcão) está atrás do personagem.
export type Spot = Anchor & { x: number; y: number; icon: IconName; pair?: string; face?: 'front' | 'back' };

// Conjunto de móveis que preenche o espaço livre de uma sala esticada (e traz mais lugares para os ociosos).
// edge: só encostado na parede do fundo 'R' (y = 0) ou 'L' (x = 0); sem edge, em qualquer lugar livre.
export type Module = { w: number; d: number; items: Item[]; spots?: Spot[]; edge?: 'R' | 'L' };

// A porta fica no tile do meio (floor(w / 2)), na parede da frente ou na de trás conforme o lado do corredor:
// esse tile tem que ficar livre junto das duas paredes. Esticada, a porta anda junto com a âncora 0,5.
export type Blueprint = {
  id: string;
  name: string;
  color: string;
  w: number;
  d: number;
  floor: Floor;
  walls: boolean; // jardim não tem parede, tem cerca viva
  items: Item[];
  spots: Spot[];
  fill: Module[];
};

const C = { ax: 0.5, ay: 0.5 };

// Pegada no chão de cada móvel: os de centro (x, y) e os de canto com tamanho padrão.
const RADIUS: Record<string, number> = { plant: 0.3, stool: 0.2, roundTable: 0.6, beanbag: 0.4, sideTable: 0.25, lamp: 0.2, fountain: 1, tree: 0.8, bush: 0.4, lampPost: 0.15, bin: 0.15, coatRack: 0.2 };
const SIZE: Record<string, [number, number]> = { fridge: [0.9, 0.7], cooler: [0.45, 0.45], arcade: [0.8, 0.7], armchair: [0.8, 0.8], vending: [0.9, 0.7], printer: [0.9, 0.6], cabinet: [0.5, 0.5] };
export function footprint(it: Item) {
  const r = RADIUS[it.t];
  if (r != null) return { x: it.x - r, y: it.y - r, w: 2 * r, d: 2 * r };
  if (it.t === 'path') return { x: Math.min(it.x, it.x + (it.w ?? 0)) - 0.3, y: Math.min(it.y, it.y + (it.d ?? 0)) - 0.3, w: Math.abs(it.w ?? 0) + 0.6, d: Math.abs(it.d ?? 0) + 0.6 };
  const [w, d] = SIZE[it.t] ?? [1, 1];
  return { x: it.x, y: it.y, w: it.w ?? w, d: it.d ?? d };
}

export const LEISURE: Blueprint[] = [
  {
    id: 'copa',
    name: 'Copa',
    color: '#b45309',
    w: 6,
    d: 5,
    floor: 'tile',
    walls: true,
    items: [
      { t: 'counter', x: 0.3, y: 0.25, w: 2.6, d: 0.7 },
      { t: 'fridge', x: 4.1, y: 0.25, ax: 1 },
      { t: 'cooler', x: 5.2, y: 0.35, ax: 1 },
      { t: 'roundTable', x: 2.6, y: 3.0, ...C },
      { t: 'stool', x: 1.85, y: 3.0, ...C },
      { t: 'stool', x: 3.35, y: 3.0, ...C },
      { t: 'stool', x: 2.6, y: 2.25, ...C },
      { t: 'stool', x: 2.6, y: 3.75, ...C },
      { t: 'plant', x: 5.35, y: 4.35, ax: 1, ay: 1 },
      { t: 'plant', x: 0.25, y: 4.35, ay: 1 },
    ],
    spots: [
      { x: 1.4, y: 1.5, icon: 'coffee', face: 'back' },
      { x: 2.5, y: 1.5, icon: 'coffee', face: 'back' },
      { x: 5.45, y: 1.4, icon: 'droplet', face: 'back', ax: 1 },
      { x: 1.6, y: 3.5, icon: 'cookie', ...C },
      { x: 3.6, y: 3.5, icon: 'coffee', ...C },
      { x: 3.2, y: 2.2, icon: 'messages', ...C },
    ],
    fill: [
      {
        w: 3,
        d: 3,
        items: [
          { t: 'roundTable', x: 1.5, y: 1.5 },
          { t: 'stool', x: 0.75, y: 1.5 },
          { t: 'stool', x: 2.25, y: 1.5 },
          { t: 'stool', x: 1.5, y: 0.75 },
          { t: 'stool', x: 1.5, y: 2.25 },
        ],
        spots: [
          { x: 0.8, y: 2.0, icon: 'cookie' },
          { x: 2.2, y: 1.1, icon: 'coffee', face: 'back' },
        ],
      },
      {
        w: 3,
        d: 2,
        items: [
          { t: 'sofa', x: 0.3, y: 0.15, w: 2.4, d: 0.75, c: 0x0e7490 },
          { t: 'coffeeTable', x: 0.9, y: 1.15, w: 1.2, d: 0.45 },
        ],
        spots: [
          { x: 1.0, y: 0.7, icon: 'messages' },
          { x: 2.0, y: 0.7, icon: 'coffee' },
        ],
      },
      {
        w: 2,
        d: 2,
        items: [
          { t: 'vending', x: 0.35, y: 0.2 },
          { t: 'bin', x: 1.6, y: 0.5 },
        ],
        spots: [{ x: 0.8, y: 1.5, icon: 'cookie', face: 'back' }],
      },
    ],
  },
  {
    id: 'games',
    name: 'Sala de Jogos',
    color: '#7c3aed',
    w: 7,
    d: 5,
    floor: 'carpet',
    walls: true,
    items: [
      { t: 'rug', x: 0.3, y: 1.15, w: 2.6, d: 1.6, c: 0xf59e0b },
      { t: 'tv', x: 0.4, y: 0.2, w: 1.9 },
      { t: 'beanbag', x: 0.95, y: 1.9, c: 0xef4444 },
      { t: 'beanbag', x: 2.1, y: 2.0, c: 0x22c55e },
      { t: 'arcade', x: 4.3, y: 0.25, c: 0x2563eb, ax: 1 },
      { t: 'arcade', x: 5.45, y: 0.25, c: 0xdb2777, ax: 1 },
      { t: 'pingpong', x: 2.3, y: 2.7, w: 2.6, d: 1.3, ...C },
      { t: 'plant', x: 6.4, y: 4.35, ax: 1, ay: 1 },
    ],
    spots: [
      { x: 1.05, y: 2.5, icon: 'gamepad', face: 'back' },
      { x: 2.2, y: 2.6, icon: 'gamepad', face: 'back' },
      { x: 4.7, y: 1.35, icon: 'joystick', face: 'back', ax: 1 },
      { x: 5.85, y: 1.35, icon: 'joystick', face: 'back', ax: 1 },
      { x: 1.85, y: 3.35, icon: 'pingpong', pair: 'pingpong', ...C },
      { x: 5.35, y: 3.35, icon: 'pingpong', pair: 'pingpong', face: 'back', ...C },
    ],
    fill: [
      {
        w: 3,
        d: 3,
        items: [{ t: 'foosball', x: 0.6, y: 1.0, w: 1.8, d: 0.9 }],
        spots: [
          { x: 1.5, y: 0.55, icon: 'gamepad' },
          { x: 1.5, y: 2.4, icon: 'gamepad', face: 'back' },
        ],
      },
      {
        w: 4,
        d: 3,
        items: [{ t: 'pool', x: 0.5, y: 0.8, w: 3.0, d: 1.4 }],
        spots: [
          { x: 0.3, y: 1.6, icon: 'pingpong' },
          { x: 3.7, y: 1.4, icon: 'pingpong', face: 'back' },
        ],
      },
      {
        w: 3,
        d: 3,
        items: [
          { t: 'rug', x: 0.25, y: 0.25, w: 2.5, d: 2.5, c: 0x0ea5e9 },
          { t: 'beanbag', x: 0.95, y: 1.0, c: 0xf97316 },
          { t: 'beanbag', x: 2.0, y: 1.9, c: 0xa855f7 },
        ],
        spots: [
          { x: 0.95, y: 1.2, icon: 'gamepad' },
          { x: 2.0, y: 2.1, icon: 'messages' },
        ],
      },
      {
        w: 2,
        d: 2,
        items: [{ t: 'arcade', x: 0.6, y: 0.2, c: 0x16a34a }],
        spots: [{ x: 1.0, y: 1.45, icon: 'joystick', face: 'back' }],
      },
    ],
  },
  {
    id: 'library',
    name: 'Biblioteca',
    color: '#0f766e',
    w: 5,
    d: 5,
    floor: 'wood',
    walls: true,
    items: [
      { t: 'rug', x: 1.0, y: 2.1, w: 3.2, d: 2.3, c: 0x991b1b, ...C },
      { t: 'bookshelf', x: 0.3, y: 0.15, w: 1.6, d: 0.45, face: 'gy' },
      { t: 'bookshelf', x: 3.1, y: 0.15, w: 1.6, d: 0.45, face: 'gy', ax: 1 },
      { t: 'bookshelf', x: 0.15, y: 1.0, w: 0.45, d: 1.8, face: 'gx' },
      { t: 'armchair', x: 1.35, y: 2.55, c: 0x047857, ...C },
      { t: 'armchair', x: 3.15, y: 2.75, c: 0x047857, ...C },
      { t: 'sideTable', x: 2.45, y: 3.35, ...C },
      { t: 'lamp', x: 4.4, y: 4.3, ax: 1, ay: 1 },
      { t: 'plant', x: 0.25, y: 4.4, ay: 1 },
    ],
    spots: [
      { x: 1.75, y: 3.4, icon: 'library', ...C },
      { x: 3.55, y: 3.6, icon: 'library', ...C },
      { x: 1.1, y: 1.2, icon: 'book', face: 'back' },
      { x: 3.9, y: 1.1, icon: 'book', face: 'back', ax: 1 },
    ],
    fill: [
      {
        w: 3,
        d: 2,
        items: [{ t: 'bookshelf', x: 0.2, y: 0.3, w: 2.6, d: 0.45, face: 'gy' }],
        spots: [{ x: 1.5, y: 1.35, icon: 'book', face: 'back' }],
      },
      {
        w: 3,
        d: 3,
        items: [
          { t: 'table', x: 0.6, y: 1.0, w: 1.8, d: 0.9 },
          { t: 'stool', x: 1.0, y: 0.6 },
          { t: 'stool', x: 2.0, y: 2.3 },
          { t: 'lamp', x: 2.6, y: 0.5 },
        ],
        spots: [
          { x: 1.0, y: 0.65, icon: 'book' },
          { x: 2.0, y: 2.35, icon: 'library', face: 'back' },
        ],
      },
      {
        w: 3,
        d: 2,
        items: [
          { t: 'armchair', x: 0.2, y: 0.25, c: 0x7c2d12 },
          { t: 'armchair', x: 2.0, y: 0.25, c: 0x7c2d12 },
          { t: 'sideTable', x: 1.5, y: 0.75 },
        ],
        spots: [
          { x: 0.6, y: 0.85, icon: 'library' },
          { x: 2.4, y: 0.85, icon: 'library' },
        ],
      },
    ],
  },
];

// Jardim: lateral inteira do prédio, do outro lado da espinha. Porta no meio do lado esquerdo (x = 0, y = doorY),
// alameda ao longo de gy e a praça da fonte no centro; o comprimento extra vira módulos dos dois lados da alameda.
export const GARDEN: Blueprint & { doorY: number } = {
  id: 'garden',
  name: 'Jardim',
  color: '#15803d',
  w: 7,
  d: 8,
  doorY: 4,
  floor: 'grass',
  walls: false,
  items: [
    { t: 'promenade', x: 3.5, y: 0, w: 0.9, d: 8 },
    { t: 'path', x: 0.1, y: 4.5, w: 2.4, d: 0, ay: 0.5 },
    { t: 'fountain', x: 3.5, y: 4.5, ay: 0.5 },
    { t: 'bench', x: 0.8, y: 3.0, w: 1.4, d: 0.5, ay: 0.5 },
    { t: 'flowers', x: 0.8, y: 5.4, w: 1.5, d: 0.6, ay: 0.5 },
    { t: 'bench', x: 5.2, y: 3.8, w: 0.5, d: 1.4, flip: true, ay: 0.5 },
    { t: 'flowers', x: 5.0, y: 2.2, w: 1.4, d: 0.6, ay: 0.5 },
    { t: 'lampPost', x: 2.6, y: 3.3, ay: 0.5 },
    { t: 'lampPost', x: 4.4, y: 5.7, ay: 0.5 },
    { t: 'tree', x: 1.2, y: 1.1 },
    { t: 'tree', x: 5.8, y: 1.1 },
    { t: 'tree', x: 1.2, y: 7.0, ay: 1 },
    { t: 'tree', x: 5.8, y: 7.0, ay: 1 },
  ],
  spots: [
    { x: 1.5, y: 3.65, icon: 'tree', ay: 0.5 },
    { x: 5.0, y: 4.5, icon: 'leaf', face: 'back', ay: 0.5 },
    { x: 3.5, y: 3.25, icon: 'droplets', ay: 0.5 },
    { x: 2.9, y: 5.6, icon: 'sparkles', ay: 0.5 },
    { x: 1.6, y: 6.2, icon: 'flower', face: 'back', ay: 0.5 },
  ],
  fill: [
    {
      w: 3,
      d: 3,
      items: [
        { t: 'tree', x: 0.9, y: 0.9 },
        { t: 'bench', x: 1.0, y: 1.9, w: 1.5, d: 0.5 },
      ],
      spots: [{ x: 1.75, y: 2.6, icon: 'tree', face: 'back' }],
    },
    {
      w: 3,
      d: 2,
      items: [{ t: 'flowers', x: 0.4, y: 0.4, w: 2.2, d: 0.8 }],
      spots: [{ x: 1.5, y: 1.6, icon: 'flower', face: 'back' }],
    },
    {
      w: 3,
      d: 3,
      items: [{ t: 'picnic', x: 0.6, y: 1.0, w: 1.8, d: 1.0 }],
      spots: [
        { x: 1.5, y: 0.55, icon: 'leaf' },
        { x: 1.5, y: 2.45, icon: 'messages', face: 'back' },
      ],
    },
    {
      w: 3,
      d: 3,
      items: [
        { t: 'tree', x: 1.1, y: 1.1 },
        { t: 'bush', x: 2.3, y: 2.2 },
        { t: 'bush', x: 0.6, y: 2.4 },
      ],
    },
  ],
};

// Departamentos: móveis baixos nas paredes do fundo (não cobrem janelas e quadro) e, com espaço sobrando, um canto de sofá.
export const DEPT_FILL: Module[] = [
  { w: 2, d: 1, edge: 'R', items: [{ t: 'cabinet', x: 0.2, y: 0.15 }, { t: 'cabinet', x: 0.8, y: 0.15 }] },
  { w: 2, d: 1, edge: 'R', items: [{ t: 'printer', x: 0.4, y: 0.15 }, { t: 'bin', x: 1.6, y: 0.55 }] },
  { w: 2, d: 1, edge: 'R', items: [{ t: 'lowShelf', x: 0.2, y: 0.12, w: 1.6, d: 0.4, face: 'gy' }] },
  { w: 1, d: 2, edge: 'L', items: [{ t: 'lowShelf', x: 0.12, y: 0.2, w: 0.4, d: 1.6, face: 'gx' }] },
  { w: 1, d: 1, edge: 'L', items: [{ t: 'coatRack', x: 0.45, y: 0.5 }] },
  { w: 1, d: 2, edge: 'L', items: [{ t: 'cabinet', x: 0.15, y: 0.2 }, { t: 'cabinet', x: 0.15, y: 0.8 }] },
  {
    w: 3,
    d: 3,
    items: [
      { t: 'rug', x: 0.25, y: 0.3, w: 2.5, d: 2.2, c: 0x64748b },
      { t: 'sofa', x: 0.3, y: 0.35, w: 2.4, d: 0.75, c: 0x475569 },
      { t: 'coffeeTable', x: 0.9, y: 1.5, w: 1.2, d: 0.45 },
      { t: 'plant', x: 2.6, y: 2.5 },
    ],
    spots: [
      { x: 1.0, y: 0.9, icon: 'coffee' },
      { x: 2.0, y: 0.9, icon: 'messages' },
    ],
  },
];

export const BOSS_FILL: Module[] = [
  {
    w: 3,
    d: 3,
    items: [
      { t: 'sofa', x: 0.3, y: 0.35, w: 2.4, d: 0.75, c: 0x7f1d1d },
      { t: 'coffeeTable', x: 0.9, y: 1.5, w: 1.2, d: 0.45 },
    ],
  },
  { w: 2, d: 1, edge: 'R', items: [{ t: 'lowShelf', x: 0.2, y: 0.12, w: 1.6, d: 0.4, face: 'gy' }] },
  { w: 1, d: 1, items: [{ t: 'plant', x: 0.5, y: 0.5, s: 1.3 }] },
];
