// Plantas das salas de descompressão: móveis e lugares onde os ociosos ficam, em coordenadas locais da sala.
export type Floor = 'wood' | 'carpet' | 'tile' | 'grass';

export type Item = {
  t: string; // tipo de móvel (ver OfficeScene.drawItem)
  x: number;
  y: number;
  w?: number;
  d?: number;
  c?: number; // cor
  face?: 'gx' | 'gy'; // para que lado a estante mostra os livros
};

// face: 'back' quando o que interessa (TV, estante, balcão) está atrás do personagem.
export type Spot = { x: number; y: number; icon: string; pair?: string; face?: 'front' | 'back' };

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
};

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
      { t: 'counter', x: 0.3, y: 0.25, w: 2.8, d: 0.7 },
      { t: 'coffee', x: 0.55, y: 0.3 },
      { t: 'fridge', x: 3.4, y: 0.25 },
      { t: 'cooler', x: 4.6, y: 0.35 },
      { t: 'roundTable', x: 2.6, y: 3.0 },
      { t: 'stool', x: 1.85, y: 3.0 },
      { t: 'stool', x: 3.35, y: 3.0 },
      { t: 'stool', x: 2.6, y: 2.25 },
      { t: 'stool', x: 2.6, y: 3.75 },
      { t: 'plant', x: 5.35, y: 4.35 },
      { t: 'plant', x: 0.25, y: 4.35 },
    ],
    spots: [
      { x: 1.4, y: 1.5, icon: '☕', face: 'back' },
      { x: 2.5, y: 1.5, icon: '☕', face: 'back' },
      { x: 4.9, y: 1.4, icon: '💧', face: 'back' },
      { x: 1.6, y: 3.5, icon: '🍪' },
      { x: 3.6, y: 3.5, icon: '☕' },
      { x: 3.2, y: 2.2, icon: '💬' },
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
      { t: 'arcade', x: 4.3, y: 0.25, c: 0x2563eb },
      { t: 'arcade', x: 5.45, y: 0.25, c: 0xdb2777 },
      { t: 'pingpong', x: 2.3, y: 3.0, w: 2.6, d: 1.3 },
      { t: 'plant', x: 6.4, y: 4.35 },
    ],
    spots: [
      { x: 1.05, y: 2.5, icon: '🎮', face: 'back' },
      { x: 2.2, y: 2.6, icon: '🎮', face: 'back' },
      { x: 4.7, y: 1.35, icon: '🕹️', face: 'back' },
      { x: 5.85, y: 1.35, icon: '🕹️', face: 'back' },
      { x: 1.85, y: 3.65, icon: '🏓', pair: 'pingpong' },
      { x: 5.35, y: 3.65, icon: '🏓', pair: 'pingpong', face: 'back' },
    ],
  },
  {
    id: 'garden',
    name: 'Jardim',
    color: '#15803d',
    w: 8,
    d: 6,
    floor: 'grass',
    walls: false,
    items: [
      { t: 'path', x: 4, y: 0 },
      { t: 'flowers', x: 2.6, y: 0.35, w: 2.8, d: 0.6 },
      { t: 'flowers', x: 2.4, y: 5.05, w: 1.0, d: 0.6 },
      { t: 'flowers', x: 4.6, y: 5.05, w: 1.0, d: 0.6 },
      { t: 'fountain', x: 4.0, y: 3.0 },
      { t: 'bench', x: 1.9, y: 2.35, w: 0.5, d: 1.4 },
      { t: 'bench', x: 5.6, y: 2.35, w: 0.5, d: 1.4 },
      { t: 'tree', x: 1.0, y: 1.0 },
      { t: 'tree', x: 7.0, y: 1.1 },
      { t: 'tree', x: 1.1, y: 5.0 },
      { t: 'tree', x: 6.9, y: 5.0 },
    ],
    spots: [
      { x: 2.65, y: 3.05, icon: '🌳' },
      { x: 5.35, y: 3.1, icon: '🌳', face: 'back' },
      { x: 4.0, y: 1.55, icon: '⛲' },
      { x: 2.0, y: 4.4, icon: '🌿' },
      { x: 6.0, y: 4.2, icon: '🌼' },
      { x: 5.8, y: 1.7, icon: '🦋' },
      { x: 3.1, y: 4.6, icon: '🌿' },
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
      { t: 'rug', x: 1.0, y: 2.1, w: 3.2, d: 2.3, c: 0x991b1b },
      { t: 'bookshelf', x: 0.3, y: 0.15, w: 1.9, d: 0.45, face: 'gy' },
      { t: 'bookshelf', x: 2.6, y: 0.15, w: 1.9, d: 0.45, face: 'gy' },
      { t: 'bookshelf', x: 0.15, y: 1.0, w: 0.45, d: 1.8, face: 'gx' },
      { t: 'armchair', x: 1.35, y: 2.55, c: 0x047857 },
      { t: 'armchair', x: 3.15, y: 2.75, c: 0x047857 },
      { t: 'sideTable', x: 2.45, y: 3.35 },
      { t: 'lamp', x: 4.4, y: 4.3 },
      { t: 'plant', x: 0.25, y: 4.4 },
    ],
    spots: [
      { x: 1.75, y: 3.4, icon: '📚' },
      { x: 3.55, y: 3.6, icon: '📚' },
      { x: 1.3, y: 1.2, icon: '📖', face: 'back' },
      { x: 3.4, y: 1.1, icon: '📖', face: 'back' },
    ],
  },
];
