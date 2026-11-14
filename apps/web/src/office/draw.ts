// Primitivas isométricas e móveis, desenhados em Graphics (sem assets). Coordenadas em tiles; z em pixels.
import type Phaser from 'phaser';
import { iso } from './layout';
import type { Floor } from './rooms';

type G = Phaser.GameObjects.Graphics;
type XY = { x: number; y: number };

export const pt = (gx: number, gy: number, z = 0): XY => {
  const p = iso(gx, gy);
  return { x: p.x, y: p.y - z };
};

export function mix(a: number, b: number, t: number) {
  const ch = (c: number, s: number) => (c >> s) & 255;
  return [16, 8, 0].reduce((acc, s) => acc | (Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s), 0);
}
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
export const darken = (c: number, t: number) => mix(c, 0x000000, t);

// Aleatório determinístico: a mesma sala sai igual a cada rebuild.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
const pick = <T>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];

export function quad(g: G, pts: XY[], color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
}

const rect = (gx: number, gy: number, w: number, d: number, z = 0) => [pt(gx, gy, z), pt(gx + w, gy, z), pt(gx + w, gy + d, z), pt(gx, gy + d, z)];

// Caixa: topo, face frontal-esquerda (+gy) e frontal-direita (+gx).
export function box(g: G, gx: number, gy: number, w: number, d: number, h: number, color: number, z0 = 0) {
  const top = z0 + h;
  quad(g, rect(gx, gy, w, d, top), lighten(color, 0.18));
  quad(g, [pt(gx, gy + d, top), pt(gx + w, gy + d, top), pt(gx + w, gy + d, z0), pt(gx, gy + d, z0)], darken(color, 0.08));
  quad(g, [pt(gx + w, gy, top), pt(gx + w, gy + d, top), pt(gx + w, gy + d, z0), pt(gx + w, gy, z0)], darken(color, 0.3));
}

export function shadow(g: G, gx: number, gy: number, w: number, d: number, alpha = 0.18) {
  quad(g, [pt(gx - 0.04, gy + 0.06), pt(gx + w + 0.12, gy + 0.06), pt(gx + w + 0.12, gy + d + 0.14), pt(gx - 0.04, gy + d + 0.14)], 0x000000, alpha);
}

// Círculo no chão (raio em tiles) vira elipse 2:1.
export function disc(g: G, gx: number, gy: number, r: number, color: number, alpha = 1, z = 0) {
  const c = pt(gx, gy, z);
  g.fillStyle(color, alpha);
  g.fillEllipse(c.x, c.y, 90.5 * r, 45.25 * r);
}

export function cylinder(g: G, gx: number, gy: number, r: number, h: number, color: number, z0 = 0) {
  const b = pt(gx, gy, z0);
  const t = pt(gx, gy, z0 + h);
  const w = 90.5 * r;
  g.fillStyle(darken(color, 0.15), 1);
  g.fillEllipse(b.x, b.y, w, w / 2);
  g.fillRect(b.x - w / 2, t.y, w, b.y - t.y);
  g.fillStyle(lighten(color, 0.12), 1);
  g.fillEllipse(t.x, t.y, w, w / 2);
}

// ---------- pisos ----------

export function floor(g: G, r: { gx: number; gy: number; w: number; d: number }, kind: Floor, base: number, seed: number) {
  const rand = rng(seed);
  for (let x = 0; x < r.w; x++) {
    for (let y = 0; y < r.d; y++) {
      const tile = rect(r.gx + x, r.gy + y, 1, 1);
      if (kind === 'tile') quad(g, tile, (x + y) % 2 ? base : lighten(base, 0.14));
      else if (kind === 'grass') quad(g, tile, mix(base, rand() < 0.5 ? 0x14532d : 0x4ade80, rand() * 0.12));
      else quad(g, tile, (x + y) % 2 ? base : darken(base, 0.035));
    }
  }
  if (kind === 'wood') {
    // Tábuas ao longo de gx, com emendas desencontradas.
    g.lineStyle(1, darken(base, 0.18), 0.55);
    for (let y = 0.25; y < r.d; y += 0.25) {
      const a = pt(r.gx, r.gy + y);
      const b = pt(r.gx + r.w, r.gy + y);
      g.lineBetween(a.x, a.y, b.x, b.y);
      for (let x = rand() * 1.5; x < r.w; x += 1.2 + rand()) {
        const p = pt(r.gx + x, r.gy + y - 0.25);
        const q = pt(r.gx + x, r.gy + y);
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
    }
  } else if (kind === 'tile') {
    g.lineStyle(1, darken(base, 0.12), 0.5);
    for (let x = 0; x <= r.w; x++) g.lineBetween(pt(r.gx + x, r.gy).x, pt(r.gx + x, r.gy).y, pt(r.gx + x, r.gy + r.d).x, pt(r.gx + x, r.gy + r.d).y);
    for (let y = 0; y <= r.d; y++) g.lineBetween(pt(r.gx, r.gy + y).x, pt(r.gx, r.gy + y).y, pt(r.gx + r.w, r.gy + y).x, pt(r.gx + r.w, r.gy + y).y);
  } else if (kind === 'carpet') {
    g.fillStyle(lighten(base, 0.1), 0.5);
    for (let i = 0; i < r.w * r.d * 3; i++) {
      const p = pt(r.gx + rand() * r.w, r.gy + rand() * r.d);
      g.fillCircle(p.x, p.y, 0.8);
    }
  } else if (kind === 'grass') {
    g.lineStyle(1, darken(base, 0.25), 0.7);
    for (let i = 0; i < r.w * r.d * 4; i++) {
      const p = pt(r.gx + 0.1 + rand() * (r.w - 0.2), r.gy + 0.1 + rand() * (r.d - 0.2));
      g.lineBetween(p.x, p.y, p.x - 1.5, p.y - 3);
      g.lineBetween(p.x, p.y, p.x + 1.5, p.y - 3.5);
    }
  }
}

// ---------- paredes ----------

export type Wall = 'L' | 'R'; // L: parede em gx fixo (corre ao longo de gy); R: parede em gy fixo (corre ao longo de gx)
const wallPt = (wall: Wall, at: number, u: number, z: number) => (wall === 'L' ? pt(at, u, z) : pt(u, at, z));

export function wallRect(g: G, wall: Wall, at: number, u0: number, u1: number, z0: number, z1: number, color: number, alpha = 1) {
  quad(g, [wallPt(wall, at, u0, z0), wallPt(wall, at, u1, z0), wallPt(wall, at, u1, z1), wallPt(wall, at, u0, z1)], color, alpha);
}

function wallLine(g: G, wall: Wall, at: number, u0: number, z0: number, u1: number, z1: number, width: number, color: number) {
  const a = wallPt(wall, at, u0, z0);
  const b = wallPt(wall, at, u1, z1);
  g.lineStyle(width, color, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

export function sky(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 17) return { color: 0x93c5fd, night: false };
  if (h >= 17 && h < 19) return { color: 0xfdba74, night: false };
  if (h >= 5.5 && h < 7) return { color: 0xf9a8d4, night: false };
  return { color: 0x1e3a8a, night: true };
}

// Janela ocupando o tile [u, u+1] da parede, com o céu da hora atual.
export function windowPane(g: G, wall: Wall, at: number, u: number) {
  const s = sky();
  wallRect(g, wall, at, u + 0.12, u + 0.88, 13, 47, 0xe5e7eb);
  wallRect(g, wall, at, u + 0.18, u + 0.82, 17, 43, s.color);
  if (s.night) {
    g.fillStyle(0xfef9c3, 1);
    for (const [du, z] of [[0.3, 38], [0.55, 33], [0.7, 40], [0.4, 24]]) {
      const p = wallPt(wall, at, u + du, z);
      g.fillCircle(p.x, p.y, 0.9);
    }
  } else {
    wallRect(g, wall, at, u + 0.22, u + 0.4, 36, 41, 0xffffff, 0.5);
  }
  wallLine(g, wall, at, u + 0.5, 17, u + 0.5, 43, 2, 0xe5e7eb);
  wallLine(g, wall, at, u + 0.18, 30, u + 0.82, 30, 2, 0xe5e7eb);
}

export function whiteboard(g: G, wall: Wall, at: number, u: number, seed: number) {
  const r = rng(seed);
  wallRect(g, wall, at, u + 0.08, u + 0.92, 16, 44, 0x9ca3af);
  wallRect(g, wall, at, u + 0.12, u + 0.88, 18, 42, 0xf8fafc);
  for (let i = 0; i < 3; i++) {
    const z = 37 - i * 6;
    wallLine(g, wall, at, u + 0.2, z, u + 0.2 + 0.25 + r() * 0.35, z, 1.2, pick(r, [0x2563eb, 0xdc2626, 0x16a34a]));
  }
  for (let i = 0; i < 3; i++) {
    const su = u + 0.22 + i * 0.2;
    wallRect(g, wall, at, su, su + 0.13, 20, 26, pick(r, [0xfde047, 0xf9a8d4, 0x86efac, 0x93c5fd]));
  }
  wallRect(g, wall, at, u + 0.15, u + 0.85, 16, 17.5, 0x6b7280);
}

export function picture(g: G, wall: Wall, at: number, u: number, seed: number) {
  const r = rng(seed);
  wallRect(g, wall, at, u + 0.25, u + 0.75, 22, 42, 0x78350f);
  const bg = pick(r, [0xbfdbfe, 0xfde68a, 0xfbcfe8, 0xbbf7d0]);
  wallRect(g, wall, at, u + 0.3, u + 0.7, 25, 39, bg);
  const a = wallPt(wall, at, u + 0.32, 26);
  const b = wallPt(wall, at, u + 0.5, 35);
  const c = wallPt(wall, at, u + 0.68, 26);
  g.fillStyle(darken(bg, 0.35), 1);
  g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
  const sun = wallPt(wall, at, u + 0.6, 36);
  g.fillStyle(0xf59e0b, 1);
  g.fillCircle(sun.x, sun.y, 2);
}

// Relógio de parede com a hora real.
export function clock(g: G, wall: Wall, at: number, u: number, date = new Date()) {
  const cu = u + 0.5;
  const cz = 38;
  const R = 9;
  const ring = (radius: number) => Array.from({ length: 20 }, (_, i) => wallPt(wall, at, cu + ((radius / 35.8) * Math.cos((i / 20) * Math.PI * 2)), cz + radius * Math.sin((i / 20) * Math.PI * 2)));
  quad(g, ring(R), 0x374151);
  quad(g, ring(R - 1.5), 0xffffff);
  const hand = (frac: number, len: number, width: number) => {
    const ang = Math.PI / 2 - frac * Math.PI * 2;
    wallLine(g, wall, at, cu, cz, cu + ((len / 35.8) * Math.cos(ang)), cz + len * Math.sin(ang), width, 0x111827);
  };
  hand(((date.getHours() % 12) + date.getMinutes() / 60) / 12, 4.5, 1.6);
  hand(date.getMinutes() / 60, 6.5, 1);
}

// ---------- móveis ----------

export function desk(g: G, gx: number, gy: number, wood: number, seed: number) {
  const r = rng(seed);
  shadow(g, gx, gy, 1.6, 0.8);
  box(g, gx, gy, 1.6, 0.8, 14, wood);
  quad(g, rect(gx + 0.45, gy + 0.45, 0.6, 0.17, 14.5), 0x374151);
  disc(g, gx + 1.22, gy + 0.55, 0.05, 0xd1d5db, 1, 14.5);
  if (r() < 0.65) cylinder(g, gx + 0.2, gy + 0.5, 0.06, 6, pick(r, [0xffffff, 0xef4444, 0x3b82f6, 0xfacc15]), 14);
  if (r() < 0.45) {
    cylinder(g, gx + 1.42, gy + 0.18, 0.07, 5, 0xb45309, 14);
    const leaf = pt(gx + 1.42, gy + 0.18, 23);
    g.fillStyle(0x22c55e, 1);
    g.fillCircle(leaf.x, leaf.y, 4);
  }
  if (r() < 0.5) for (let i = 0; i < 3; i++) quad(g, rect(gx + 1.1 + i * 0.02, gy + 0.42 - i * 0.02, 0.3, 0.3, 14.6 + i), 0xf8fafc);
  // Luminária ou fone de ouvido em parte das mesas.
  const extra = r();
  if (extra < 0.3) {
    disc(g, gx + 0.15, gy + 0.2, 0.08, 0x1f2937, 1, 14);
    const a = pt(gx + 0.15, gy + 0.2, 14);
    const b = pt(gx + 0.2, gy + 0.25, 30);
    g.lineStyle(1.5, 0x1f2937, 1);
    g.lineBetween(a.x, a.y, b.x, b.y);
    g.fillStyle(0xfbbf24, 1);
    g.fillTriangle(b.x - 4, b.y + 3, b.x + 4, b.y + 3, b.x, b.y - 3);
  } else if (extra < 0.5) {
    const c = pt(gx + 0.3, gy + 0.3, 15.5);
    g.lineStyle(2, 0x111827, 1);
    g.beginPath();
    g.arc(c.x, c.y, 4, Math.PI, 0);
    g.strokePath();
    g.fillStyle(0x111827, 1);
    g.fillCircle(c.x - 4, c.y + 0.5, 1.8);
    g.fillCircle(c.x + 4, c.y + 0.5, 1.8);
  }
}

// Monitor com a tela voltada para a cadeira (+gy). Ligado, mostra "código".
export function monitor(g: G, gx: number, gy: number, on: boolean, rand: () => number) {
  box(g, gx + 0.74, gy + 0.18, 0.12, 0.08, 3, 0x1f2937, 14);
  box(g, gx + 0.45, gy + 0.12, 0.7, 0.1, 18, 0x111827, 16);
  const s = (u: number, z: number) => pt(gx + u, gy + 0.22, z);
  quad(g, [s(0.5, 32), s(1.1, 32), s(1.1, 18), s(0.5, 18)], on ? 0x0b1220 : 0x1e293b);
  if (!on) return;
  const colors = [0x60a5fa, 0x34d399, 0xf472b6, 0xfbbf24, 0xa78bfa, 0xe5e7eb];
  for (let i = 0; i < 5; i++) {
    const z = 29.5 - i * 2.4;
    const x0 = 0.54 + Math.floor(rand() * 3) * 0.05;
    const a = s(x0, z);
    const b = s(Math.min(1.06, x0 + 0.12 + rand() * 0.35), z);
    g.lineStyle(1.3, colors[Math.floor(rand() * colors.length)], 1);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

export function officeChair(g: G, gx: number, gy: number) {
  disc(g, gx, gy + 0.2, 0.22, 0x111827, 0.9);
  box(g, gx - 0.25, gy + 0.08, 0.5, 0.18, 14, 0x374151, 6);
}

export function plant(g: G, gx: number, gy: number, s = 1, seed = 1) {
  const r = rng(seed);
  disc(g, gx, gy + 0.05, 0.22 * s, 0x000000, 0.18);
  cylinder(g, gx, gy, 0.16 * s, 11 * s, 0xc2410c);
  const top = pt(gx, gy, 11 * s);
  const greens = [0x15803d, 0x16a34a, 0x22c55e, 0x4ade80];
  for (let i = 0; i < 6; i++) {
    g.fillStyle(greens[Math.floor(r() * greens.length)], 1);
    g.fillCircle(top.x + (r() - 0.5) * 14 * s, top.y - 4 * s - r() * 14 * s, (4 + r() * 3) * s);
  }
}

// Árvore em coordenadas locais (base em 0,0) para poder balançar a partir do tronco.
export function treeLocal(g: G, seed: number) {
  const r = rng(seed);
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(4, 4, 70, 30);
  g.fillStyle(0x78350f, 1);
  g.fillRect(-4, -34, 8, 34);
  const greens = [0x14532d, 0x166534, 0x15803d, 0x16a34a, 0x22c55e];
  for (let i = 0; i < 9; i++) {
    g.fillStyle(greens[Math.floor(r() * greens.length)], 1);
    g.fillCircle((r() - 0.5) * 38, -48 - r() * 34, 12 + r() * 8);
  }
}

export function bookshelf(g: G, gx: number, gy: number, w: number, d: number, face: 'gx' | 'gy', seed: number, h = 50) {
  const r = rng(seed);
  shadow(g, gx, gy, w, d);
  box(g, gx, gy, w, d, h, 0x6b3f1d);
  const span = face === 'gy' ? w : d;
  const at = face === 'gy' ? gy + d : gx + w;
  const base = face === 'gy' ? gx : gy;
  const wall: Wall = face === 'gy' ? 'R' : 'L';
  for (let shelf = 0; shelf < Math.floor((h - 4) / 11.5); shelf++) {
    const z0 = 4 + shelf * 11.5;
    wallRect(g, wall, at, base + 0.05, base + span - 0.05, z0 - 1.5, z0, 0x4a2a12);
    for (let u = base + 0.08; u < base + span - 0.1; ) {
      const bw = 0.05 + r() * 0.07;
      const bh = 6 + r() * 3.5;
      wallRect(g, wall, at, u, Math.min(u + bw, base + span - 0.08), z0, z0 + bh, pick(r, [0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b, 0x7c3aed, 0xe5e7eb, 0x0f766e]));
      u += bw + 0.012;
    }
  }
}

// Balcão com pia e cafeteira em cima, no mesmo desenho para a cafeteira nunca ficar atrás do tampo.
export function counter(g: G, gx: number, gy: number, w: number, d: number) {
  shadow(g, gx, gy, w, d);
  box(g, gx, gy, w, d, 15, 0xa16207);
  quad(g, rect(gx, gy, w, d, 16), 0xd6d3d1);
  box(g, gx + w - 0.9, gy + 0.15, 0.55, 0.4, 1, 0x9ca3af, 15.5);
  box(g, gx + 0.25, gy + 0.05, 0.5, 0.42, 20, 0x1f2937, 16);
  const led = pt(gx + 0.5, gy + 0.47, 32);
  g.fillStyle(0xef4444, 1);
  g.fillCircle(led.x, led.y, 1.4);
  cylinder(g, gx + 0.5, gy + 0.6, 0.06, 5, 0xffffff, 16);
}

export function fridge(g: G, gx: number, gy: number) {
  shadow(g, gx, gy, 0.9, 0.7);
  box(g, gx, gy, 0.9, 0.7, 48, 0xe5e7eb);
  const a = pt(gx, gy + 0.7, 30);
  const b = pt(gx + 0.9, gy + 0.7, 30);
  g.lineStyle(1, 0x9ca3af, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  const h1 = pt(gx + 0.75, gy + 0.7, 26);
  const h2 = pt(gx + 0.75, gy + 0.7, 14);
  g.lineStyle(2, 0x6b7280, 1);
  g.lineBetween(h1.x, h1.y, h2.x, h2.y);
}

export function cooler(g: G, gx: number, gy: number) {
  shadow(g, gx, gy, 0.45, 0.45);
  box(g, gx, gy, 0.45, 0.45, 22, 0xf1f5f9);
  cylinder(g, gx + 0.225, gy + 0.225, 0.17, 16, 0x60a5fa, 22);
}

export function roundTable(g: G, gx: number, gy: number) {
  disc(g, gx, gy + 0.08, 0.6, 0x000000, 0.15);
  cylinder(g, gx, gy, 0.06, 14, 0x6b7280);
  cylinder(g, gx, gy, 0.55, 2, 0xf5f5f4, 14);
}

export function stool(g: G, gx: number, gy: number) {
  disc(g, gx, gy + 0.05, 0.2, 0x000000, 0.15);
  cylinder(g, gx, gy, 0.16, 11, 0xb91c1c);
}

export function rug(g: G, gx: number, gy: number, w: number, d: number, c: number) {
  quad(g, rect(gx, gy, w, d), darken(c, 0.15), 0.95);
  quad(g, rect(gx + 0.12, gy + 0.12, w - 0.24, d - 0.24), c, 0.95);
  g.lineStyle(1, lighten(c, 0.35), 0.8);
  g.strokePoints(rect(gx + 0.25, gy + 0.25, w - 0.5, d - 0.5), true);
}

export function doormat(g: G, gx: number, gy: number) {
  quad(g, rect(gx - 0.4, gy - 0.2, 0.8, 0.4), 0x57534e, 0.9);
}

// Retorna a tela (para piscar por cima).
export function tv(g: G, gx: number, gy: number, w: number): XY[] {
  shadow(g, gx, gy, w, 0.35);
  box(g, gx, gy, w, 0.35, 10, 0x44403c);
  box(g, gx + 0.1, gy + 0.05, w - 0.2, 0.08, 30, 0x111827, 10);
  return [pt(gx + 0.15, gy + 0.13, 38), pt(gx + w - 0.15, gy + 0.13, 38), pt(gx + w - 0.15, gy + 0.13, 13), pt(gx + 0.15, gy + 0.13, 13)];
}

export function beanbag(g: G, gx: number, gy: number, c: number) {
  disc(g, gx, gy + 0.08, 0.38, 0x000000, 0.18);
  disc(g, gx, gy, 0.36, darken(c, 0.2), 1, 3);
  disc(g, gx, gy, 0.3, c, 1, 8);
  disc(g, gx - 0.05, gy - 0.05, 0.12, lighten(c, 0.3), 0.8, 11);
}

export function arcade(g: G, gx: number, gy: number, c: number): XY[] {
  shadow(g, gx, gy, 0.8, 0.7);
  box(g, gx, gy, 0.8, 0.7, 48, darken(c, 0.2));
  box(g, gx + 0.05, gy + 0.6, 0.7, 0.25, 4, 0x111827, 22);
  wallRect(g, 'R', gy + 0.7, gx + 0.08, gx + 0.72, 44, 50, lighten(c, 0.3));
  g.fillStyle(0xef4444, 1);
  const b = pt(gx + 0.25, gy + 0.72, 26.5);
  g.fillCircle(b.x, b.y, 1.6);
  return [pt(gx + 0.1, gy + 0.7, 42), pt(gx + 0.7, gy + 0.7, 42), pt(gx + 0.7, gy + 0.7, 28), pt(gx + 0.1, gy + 0.7, 28)];
}

export function pingpong(g: G, gx: number, gy: number, w: number, d: number) {
  shadow(g, gx, gy, w, d);
  for (const [lx, ly] of [[0.2, 0.15], [w - 0.3, 0.15], [0.2, d - 0.25], [w - 0.3, d - 0.25]]) box(g, gx + lx, gy + ly, 0.1, 0.1, 14, 0x1f2937);
  box(g, gx, gy, w, d, 2, 0x166534, 14);
  g.lineStyle(1.5, 0xffffff, 0.9);
  g.strokePoints(rect(gx + 0.05, gy + 0.05, w - 0.1, d - 0.1, 16.2), true);
  const m1 = pt(gx + 0.05, gy + d / 2, 16.2);
  const m2 = pt(gx + w - 0.05, gy + d / 2, 16.2);
  g.lineBetween(m1.x, m1.y, m2.x, m2.y);
  wallRect(g, 'L', gx + w / 2, gy - 0.05, gy + d + 0.05, 16, 22, 0xf8fafc, 0.75);
}

export function fountain(g: G, gx: number, gy: number) {
  disc(g, gx, gy + 0.1, 0.95, 0x000000, 0.15);
  cylinder(g, gx, gy, 0.85, 9, 0x9ca3af);
  disc(g, gx, gy, 0.72, 0x38bdf8, 1, 9);
  cylinder(g, gx, gy, 0.12, 18, 0xa8a29e, 9);
  cylinder(g, gx, gy, 0.3, 3, 0xa8a29e, 27);
  disc(g, gx, gy, 0.22, 0x7dd3fc, 1, 30);
}

// Encosto no lado de trás (-gx/-gy); flip põe no lado da frente, para sentar de costas para a câmera.
export function bench(g: G, gx: number, gy: number, w: number, d: number, flip = false) {
  shadow(g, gx, gy, w, d);
  for (const [lx, ly] of [[0.05, 0.1], [w - 0.15, 0.1], [0.05, d - 0.2], [w - 0.15, d - 0.2]]) box(g, gx + lx, gy + ly, 0.1, 0.1, 8, 0x374151);
  box(g, gx, gy, w, d, 3, 0xa16207, 8);
  if (w < d) box(g, flip ? gx + w - 0.1 : gx, gy, 0.1, d, 12, 0x854d0e, 11);
  else box(g, gx, flip ? gy + d - 0.1 : gy, w, 0.1, 12, 0x854d0e, 11);
}

export function sofa(g: G, gx: number, gy: number, w: number, d: number, c: number) {
  shadow(g, gx, gy, w, d);
  box(g, gx, gy, w, 0.22, 21, darken(c, 0.12));
  box(g, gx, gy + 0.22, w, d - 0.22, 9, c);
  for (let i = 1; i < 3; i++) {
    const a = pt(gx + (w * i) / 3, gy + 0.25, 9.2);
    const b = pt(gx + (w * i) / 3, gy + d, 9.2);
    g.lineStyle(1, darken(c, 0.25), 0.7);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  box(g, gx, gy + 0.22, 0.18, d - 0.22, 14, darken(c, 0.05));
  box(g, gx + w - 0.18, gy + 0.22, 0.18, d - 0.22, 14, darken(c, 0.05));
}

export function coffeeTable(g: G, gx: number, gy: number, w: number, d: number, seed: number) {
  const r = rng(seed);
  shadow(g, gx, gy, w, d, 0.14);
  box(g, gx, gy, w, d, 7, 0x57534e);
  quad(g, rect(gx + 0.05, gy + 0.05, w - 0.1, d - 0.1, 7.2), 0x78716c);
  cylinder(g, gx + w * (0.25 + r() * 0.5), gy + d / 2, 0.06, 4, pick(r, [0xffffff, 0xfacc15, 0x60a5fa]), 7);
  if (r() < 0.6) box(g, gx + 0.15, gy + 0.08, 0.3, 0.22, 1.5, pick(r, [0xdc2626, 0x2563eb, 0x16a34a]), 7.2);
}

// Máquina de lanches com a vitrine para +gy.
export function vending(g: G, gx: number, gy: number, seed: number) {
  const r = rng(seed);
  const body = pick(r, [0xdc2626, 0x1d4ed8, 0x0f766e]);
  shadow(g, gx, gy, 0.9, 0.7);
  box(g, gx, gy, 0.9, 0.7, 46, body);
  wallRect(g, 'R', gy + 0.7, gx + 0.08, gx + 0.62, 14, 42, 0x0b1220);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const p = pt(gx + 0.17 + col * 0.17, gy + 0.7, 18 + row * 6.5);
      g.fillStyle(pick(r, [0xfacc15, 0xf97316, 0x22c55e, 0xec4899, 0x38bdf8, 0xffffff]), 1);
      g.fillRect(p.x - 1.6, p.y - 2.2, 3.2, 3.6);
    }
  }
  wallRect(g, 'R', gy + 0.7, gx + 0.67, gx + 0.82, 26, 36, lighten(body, 0.4));
  wallRect(g, 'R', gy + 0.7, gx + 0.12, gx + 0.58, 4, 9, 0x111827);
}

export function bin(g: G, gx: number, gy: number) {
  disc(g, gx, gy + 0.04, 0.15, 0x000000, 0.15);
  cylinder(g, gx, gy, 0.13, 8, 0x6b7280);
  disc(g, gx, gy, 0.1, 0x374151, 1, 8.1);
}

export function printer(g: G, gx: number, gy: number) {
  shadow(g, gx, gy, 0.9, 0.6);
  box(g, gx, gy, 0.9, 0.6, 12, 0x374151);
  box(g, gx + 0.05, gy + 0.05, 0.8, 0.5, 8, 0xe5e7eb, 12);
  quad(g, rect(gx + 0.2, gy + 0.12, 0.45, 0.3, 20.2), 0x9ca3af);
  quad(g, rect(gx + 0.25, gy + 0.42, 0.35, 0.22, 16), 0xffffff);
  const led = pt(gx + 0.75, gy + 0.55, 17);
  g.fillStyle(0x22c55e, 1);
  g.fillCircle(led.x, led.y, 1.2);
}

// Arquivo de gavetas.
export function cabinet(g: G, gx: number, gy: number, w = 0.5, d = 0.5) {
  shadow(g, gx, gy, w, d);
  box(g, gx, gy, w, d, 22, 0x9ca3af);
  for (const z of [7.5, 15]) wallRect(g, 'R', gy + d, gx + 0.05, gx + w - 0.05, z - 0.6, z, 0x6b7280);
  for (const z of [4, 11.5, 19]) wallRect(g, 'R', gy + d, gx + w / 2 - 0.07, gx + w / 2 + 0.07, z - 1, z, 0x374151);
}

export function coatRack(g: G, gx: number, gy: number, seed: number) {
  const r = rng(seed);
  disc(g, gx, gy, 0.18, 0x000000, 0.18);
  disc(g, gx, gy, 0.14, 0x44403c, 1, 1);
  const a = pt(gx, gy);
  const b = pt(gx, gy, 40);
  g.lineStyle(2, 0x44403c, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(pick(r, [0x1e3a8a, 0x7f1d1d, 0x365314, 0x78350f]), 1);
  g.fillRoundedRect(b.x - 5, b.y + 3, 7, 16, 3);
  g.fillStyle(0x44403c, 1);
  g.fillCircle(b.x, b.y, 2);
}

export function foosball(g: G, gx: number, gy: number, w: number, d: number) {
  shadow(g, gx, gy, w, d);
  for (const [lx, ly] of [[0.1, 0.1], [w - 0.2, 0.1], [0.1, d - 0.2], [w - 0.2, d - 0.2]]) box(g, gx + lx, gy + ly, 0.1, 0.1, 12, 0x1f2937);
  box(g, gx, gy, w, d, 5, 0x78350f, 12);
  quad(g, rect(gx + 0.08, gy + 0.08, w - 0.16, d - 0.16, 17.2), 0x15803d);
  const m1 = pt(gx + w / 2, gy + 0.08, 17.3);
  const m2 = pt(gx + w / 2, gy + d - 0.08, 17.3);
  g.lineStyle(1, 0xffffff, 0.8);
  g.lineBetween(m1.x, m1.y, m2.x, m2.y);
  for (let i = 1; i <= 4; i++) {
    const x = gx + (w * i) / 5;
    const a = pt(x, gy - 0.12, 20);
    const b = pt(x, gy + d + 0.12, 20);
    g.lineStyle(1.4, 0xd1d5db, 1);
    g.lineBetween(a.x, a.y, b.x, b.y);
    for (let j = 1; j <= 2; j++) {
      const p = pt(x, gy + (d * j) / 3, 19);
      g.fillStyle(i % 2 ? 0xdc2626 : 0x2563eb, 1);
      g.fillCircle(p.x, p.y, 1.8);
    }
  }
}

export function pool(g: G, gx: number, gy: number, w: number, d: number, seed: number) {
  const r = rng(seed);
  shadow(g, gx, gy, w, d);
  for (const [lx, ly] of [[0.15, 0.15], [w - 0.3, 0.15], [0.15, d - 0.3], [w - 0.3, d - 0.3]]) box(g, gx + lx, gy + ly, 0.15, 0.15, 11, 0x451a03);
  box(g, gx, gy, w, d, 5, 0x78350f, 11);
  quad(g, rect(gx + 0.12, gy + 0.12, w - 0.24, d - 0.24, 16.2), 0x166534);
  for (const [px, py] of [[0.15, 0.15], [w / 2, 0.12], [w - 0.15, 0.15], [0.15, d - 0.15], [w / 2, d - 0.12], [w - 0.15, d - 0.15]]) disc(g, gx + px, gy + py, 0.07, 0x0a0a0a, 1, 16.3);
  for (let i = 0; i < 6; i++) disc(g, gx + 0.4 + r() * (w - 0.8), gy + 0.35 + r() * (d - 0.7), 0.045, pick(r, [0xffffff, 0xfacc15, 0xdc2626, 0x2563eb, 0x111827]), 1, 16.6);
  const a = pt(gx + 0.5, gy + d * 0.7, 17);
  const b = pt(gx + w * 0.55, gy + d * 0.3, 17);
  g.lineStyle(1.5, 0xd6a35c, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

export function table(g: G, gx: number, gy: number, w: number, d: number, seed: number) {
  const r = rng(seed);
  shadow(g, gx, gy, w, d);
  for (const [lx, ly] of [[0.05, 0.05], [w - 0.13, 0.05], [0.05, d - 0.13], [w - 0.13, d - 0.13]]) box(g, gx + lx, gy + ly, 0.08, 0.08, 13, 0x44403c);
  box(g, gx, gy, w, d, 2, 0xa16207, 13);
  box(g, gx + 0.3, gy + 0.25, 0.4, 0.3, 2, pick(r, [0xdc2626, 0x1d4ed8, 0x15803d]), 15);
  quad(g, rect(gx + w - 0.8, gy + 0.3, 0.45, 0.3, 15.1), 0xf8fafc);
}

export function picnic(g: G, gx: number, gy: number, w: number, d: number) {
  shadow(g, gx, gy - 0.3, w, d + 0.6);
  box(g, gx + 0.1, gy - 0.35, w - 0.2, 0.25, 7, 0x92400e);
  box(g, gx + 0.2, gy + 0.3, 0.12, d - 0.6, 12, 0x78350f);
  box(g, gx + w - 0.32, gy + 0.3, 0.12, d - 0.6, 12, 0x78350f);
  box(g, gx, gy, w, d, 2, 0xb45309, 12);
  for (let i = 1; i < 4; i++) {
    const a = pt(gx, gy + (d * i) / 4, 14.1);
    const b = pt(gx + w, gy + (d * i) / 4, 14.1);
    g.lineStyle(1, 0x78350f, 0.8);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  box(g, gx + 0.1, gy + d + 0.1, w - 0.2, 0.25, 7, 0x92400e);
}

export function bush(g: G, gx: number, gy: number, seed: number) {
  const r = rng(seed);
  disc(g, gx, gy + 0.05, 0.4, 0x000000, 0.18);
  const c = pt(gx, gy, 6);
  for (let i = 0; i < 6; i++) {
    g.fillStyle(pick(r, [0x166534, 0x15803d, 0x16a34a, 0x22c55e]), 1);
    g.fillCircle(c.x + (r() - 0.5) * 18, c.y - r() * 8, 6 + r() * 3);
  }
  if (r() < 0.6) {
    g.fillStyle(pick(r, [0xf43f5e, 0xfacc15, 0xffffff]), 1);
    for (let i = 0; i < 4; i++) g.fillCircle(c.x + (r() - 0.5) * 16, c.y - 4 - r() * 6, 1.5);
  }
}

// Poste de luz do jardim; à noite, o halo no chão.
export function lampPost(g: G, gx: number, gy: number) {
  if (sky().night) disc(g, gx, gy, 0.9, 0xfde68a, 0.18);
  disc(g, gx, gy + 0.03, 0.12, 0x111827, 0.9);
  const a = pt(gx, gy);
  const b = pt(gx, gy, 46);
  g.lineStyle(2.5, 0x1f2937, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(sky().night ? 0xfef08a : 0xfef9c3, 1);
  g.fillCircle(b.x, b.y - 3, 4.5);
  g.fillStyle(0x1f2937, 1);
  g.fillRect(b.x - 5, b.y - 9, 10, 2.5);
}

export function flowers(g: G, gx: number, gy: number, w: number, d: number, seed: number) {
  const r = rng(seed);
  box(g, gx, gy, w, d, 4, 0x78350f);
  for (let i = 0; i < w * d * 26; i++) {
    const p = pt(gx + 0.06 + r() * (w - 0.12), gy + 0.06 + r() * (d - 0.12), 6 + r() * 4);
    g.fillStyle(0x15803d, 1);
    g.fillCircle(p.x, p.y + 2, 1.6);
    g.fillStyle(pick(r, [0xf43f5e, 0xfacc15, 0xa855f7, 0xffffff, 0xfb923c, 0x38bdf8]), 1);
    g.fillCircle(p.x, p.y, 1.8);
  }
}

// Pedras de (x0, y0) até (x1, y1), com um leve desalinhamento.
export function stonePath(g: G, x0: number, y0: number, x1: number, y1: number, seed: number) {
  const r = rng(seed);
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let s = 0.3; s < len; s += 0.55) {
    const t = s / len;
    disc(g, x0 + (x1 - x0) * t + (r() - 0.5) * 0.25 * (y1 !== y0 ? 1 : 0), y0 + (y1 - y0) * t + (r() - 0.5) * 0.25 * (x1 !== x0 ? 1 : 0), 0.17 + r() * 0.06, 0xd6d3d1, 0.95);
  }
}

export function hedge(g: G, gx: number, gy: number, w: number, d: number, h: number) {
  box(g, gx, gy, w, d, h, 0x166534);
  const top = pt(gx + w / 2, gy + d / 2, h);
  g.fillStyle(0x22c55e, 0.6);
  g.fillCircle(top.x - 6, top.y, 4);
  g.fillCircle(top.x + 5, top.y - 1, 3.5);
}

export function armchair(g: G, gx: number, gy: number, c: number) {
  shadow(g, gx, gy, 0.8, 0.8);
  box(g, gx, gy, 0.8, 0.8, 9, c);
  box(g, gx, gy, 0.8, 0.2, 24, darken(c, 0.1));
  // Braços só na frente do encosto: desenhados depois, invadindo o volume dele pintariam por cima.
  box(g, gx, gy + 0.2, 0.15, 0.6, 15, darken(c, 0.05));
  box(g, gx + 0.65, gy + 0.2, 0.15, 0.6, 15, darken(c, 0.05));
}

export function sideTable(g: G, gx: number, gy: number) {
  cylinder(g, gx, gy, 0.22, 12, 0x78350f);
  box(g, gx - 0.12, gy - 0.08, 0.24, 0.16, 3, 0x1d4ed8, 12);
}

export function lamp(g: G, gx: number, gy: number) {
  disc(g, gx, gy, 0.6, 0xfde68a, 0.12);
  disc(g, gx, gy + 0.03, 0.14, 0x111827, 0.9);
  const a = pt(gx, gy);
  const b = pt(gx, gy, 40);
  g.lineStyle(2, 0x44403c, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(0xfef3c7, 1);
  g.fillTriangle(b.x - 9, b.y + 4, b.x + 9, b.y + 4, b.x, b.y - 8);
}
