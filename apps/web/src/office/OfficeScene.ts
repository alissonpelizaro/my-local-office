// Office View: desenha a planta em isométrico (sem assets, tudo em Graphics) e anima os eventos do escritório.
import Phaser from 'phaser';
import type { IconName } from '../components/icons';
import { ACTIVITY_ICON, truncate } from '../format';
import { tr } from '../store';
import type { Activity, OfficeEvent, OfficeState } from '../types';
import * as D from './draw';
import { iconKey, loadIcons } from './icons';
import { computeFloorplan, type Floorplan, iso, type LeisureSpot, type Pt, type Room, route, type Seg, WALL, WALL_CUT } from './layout';
import { BOSS_FILL, DEPT_FILL, GARDEN, type Item, LEISURE } from './rooms';

const { pt, mix, darken } = D;

const THEMES = {
  dark: { void: 0x0e131b, hall: 0x2b3242, hallAlt: 0x272d3c, wall: 0x3a4357, wallTop: 0x5b6680, floorMix: 0x161b26, floorT: 0.6, desk: 0x6b4a2e, grass: 0x2f6b3a, tile: 0x57514b },
  light: { void: 0xd8dde6, hall: 0xc7cdd8, hallAlt: 0xbfc6d2, wall: 0xb4bcc9, wallTop: 0xe8ebf0, floorMix: 0xffffff, floorT: 0.8, desk: 0x9a6b3f, grass: 0x86c76f, tile: 0xf3ede4 },
};
// Segue o tema do app (setDark); a planta é redesenhada quando muda.
let DARK = document.documentElement.classList.contains('dark');
let THEME = DARK ? THEMES.dark : THEMES.light;

const FLOOR_DEPTH = -1e6;
const LABEL_DEPTH = 5e5;
const OVERLAY_DEPTH = 1e6;
const SPEED = 150; // px/s
// A aba em background congela o rAF do Phaser; ao voltar, um único tick em atraso veria
// todos os nextWander no passado e faria todo mundo sair junto. Acima disso é "puxou
// tick" — remarca em vez de agir, espalhando a descompressão em vez de estourar junto.
const WANDER_MAX_GAP = 5000;
const FONT = 'ui-sans-serif, system-ui, -apple-system, sans-serif';
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIR = [0x2c1b10, 0x5a3825, 0xb55239, 0xe6c27a, 0x1a1a1a, 0x7a7a7a];
const PANTS = [0x1f2937, 0x1e3a8a, 0x78716c, 0x3f3f46, 0x365314];
const WORKING: Activity[] = ['typing', 'running', 'reading', 'thinking', 'onboarding', 'consulting'];
const TOOL_ACTIVITY: Record<string, Activity> = {
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  WebFetch: 'reading',
  WebSearch: 'reading',
  Edit: 'typing',
  Write: 'typing',
  MultiEdit: 'typing',
  NotebookEdit: 'typing',
  Bash: 'running',
  mcp__office__ask_colleague: 'talking',
  mcp__office__delegate_task: 'delegating',
  mcp__office__ask_boss: 'waiting',
};

// Ícones que sobem da cabeça: tarefa nova e fim de tarefa.
const FINISH = { done: ['circleCheck', 0x16a34a], cancelled: ['ban', 0x64748b], failed: ['circleX', 0xdc2626] } as const satisfies Record<string, readonly [IconName, number]>;
const FLOATS: IconName[] = ['inbox', ...Object.values(FINISH).map(([i]) => i)];

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type Char = {
  id: number;
  room: string;
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Graphics;
  back: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Container; // ícone da atividade num selo sobre a cabeça
  iconImage: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Ellipse;
  screen: Phaser.GameObjects.Graphics;
  activity: Activity;
  pending: boolean;
  alert?: Phaser.GameObjects.Container;
  bubble?: Phaser.GameObjects.Container;
  bubbleTimer?: Phaser.Time.TimerEvent;
  bubbleDx: number; // em conversa, cada um fala para um lado para os balões não se cobrirem
  bob?: Phaser.Tweens.Tween;
  walking: boolean;
  cancelWalk?: () => void;
  arrival?: Promise<boolean>;
  mission: boolean; // visitando um colega: não volta para a mesa sozinho
  away: boolean; // fora da mesa
  spot?: LeisureSpot; // lugar de descompressão reservado
  atSpot: boolean;
  nextWander: number;
};

type Ball = { ball: Phaser.GameObjects.Arc; tween?: Phaser.Tweens.Tween };

export class OfficeScene extends Phaser.Scene {
  onSelect: (id: number) => void = () => {};
  onBoss: () => void = () => {};
  onReady: () => void = () => {};

  private ready = false;
  private incoming?: { state: OfficeState; selected: number | null; lang: string };
  private applied?: { state: OfficeState; selected: number | null; lang: string };
  private signature = '';
  private plan?: Floorplan;
  private statics: Phaser.GameObjects.GameObject[] = [];
  private transients = new Set<Phaser.GameObjects.GameObject>();
  private timers: Phaser.Time.TimerEvent[] = [];
  private chars = new Map<number, Char>();
  private occupied = new Map<string, number>(); // spot → funcionário
  private balls = new Map<string, Ball>(); // dupla de ping-pong → bolinha
  private pile?: { g: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Container; count: Phaser.GameObjects.Text; desk: Pt };
  private steamAt?: { x: number; y: number };
  private replaying = false;
  private replayPending = 0;
  private userMoved = false;

  constructor() {
    super('office');
  }

  preload() {
    const modules = [...LEISURE, GARDEN].flatMap((b) => b.fill).concat(DEPT_FILL, BOSS_FILL);
    const spots = [...LEISURE, GARDEN].flatMap((b) => b.spots).concat(modules.flatMap((m) => m.spots ?? [])).map((s) => s.icon);
    loadIcons(this, [...Object.values(ACTIVITY_ICON), ...spots, ...FLOATS, 'question', 'file', 'message', 'briefcase']);
  }

  // O Phaser escuta o mouseup na janela inteira: soltar o clique fora do canvas (em outra aba, num diálogo ou num
  // botão por cima da cena) dispararia o pointerup do que estiver por baixo. Só vale clique que começou e terminou nele.
  private tapped = (p: Phaser.Input.Pointer) => p.downElement === this.game.canvas && p.upElement === this.game.canvas && p.getDistance() < 6;

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor(THEME.void);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      if (p.getDistance() > 6) this.userMoved = true;
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 2.5));
      this.userMoved = true;
    });
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      cam.setSize(size.width, size.height);
      if (!this.userMoved) this.fitView();
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.wander() });
    this.time.addEvent({ delay: 900, loop: true, callback: () => this.chars.forEach((c) => this.isScreenOn(c) && this.drawScreen(c)) });
    this.ready = true;
    this.apply();
    this.onReady();
  }

  update() {
    for (const c of this.chars.values()) {
      c.root.setDepth(c.root.y);
      c.label.setPosition(c.root.x, c.root.y + 5);
      c.bubble?.setPosition(c.root.x + c.bubbleDx, c.root.y - 54);
      c.alert?.setPosition(c.root.x, c.root.y - 54);
    }
    this.updateBalls();
  }

  // ---------- dados vindos do React ----------

  setData(state: OfficeState, selected: number | null, lang: string) {
    this.incoming = { state, selected, lang };
    if (this.ready) this.apply();
  }

  setDark(dark: boolean) {
    if (dark === DARK) return;
    DARK = dark;
    THEME = dark ? THEMES.dark : THEMES.light;
    if (!this.ready) return;
    this.cameras.main.setBackgroundColor(THEME.void);
    this.signature = ''; // força o rebuild com as cores novas
    this.applied = undefined;
    this.apply();
  }

  // animate: botão "Centralizar" desliza até o enquadramento; resize e primeira carga são instantâneos.
  fitView(animate = false) {
    if (!this.plan) return;
    const b = this.plan.bounds;
    const cam = this.cameras.main;
    if (!cam.width || !cam.height) return;
    const zoom = Phaser.Math.Clamp(Math.min(cam.width / (b.w + 60), cam.height / (b.h + 60)), 0.3, 1.4);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    this.userMoved = false;
    if (!animate) {
      cam.setZoom(zoom);
      cam.centerOn(cx, cy);
      return;
    }
    cam.pan(cx, cy, 450, 'Cubic.easeOut', true);
    cam.zoomTo(zoom, 450, 'Cubic.easeOut', true);
  }

  private apply() {
    const next = this.incoming;
    if (!next || (this.applied?.state === next.state && this.applied.selected === next.selected && this.applied.lang === next.lang)) return;
    this.applied = next;
    const { state, selected } = next;
    const sig = JSON.stringify([next.lang, state.departments.map((d) => [d.id, d.name, d.color]), state.employees.map((e) => [e.id, e.name, e.department_id])]);
    if (sig !== this.signature) {
      this.signature = sig;
      this.rebuild(state);
    }
    if (!this.replaying) {
      const pending = new Set(state.approvals.filter((a) => a.kind !== 'delegation').map((a) => a.employee_id));
      for (const e of state.employees) this.setActivity(e.id, e.activity);
      for (const c of this.chars.values()) this.setPending(c, pending.has(c.id));
      this.setPile(state.approvals.length);
    }
    for (const c of this.chars.values()) c.ring.setVisible(c.id === selected);
  }

  // ---------- construção da planta ----------

  private rebuild(state: OfficeState) {
    for (const c of this.chars.values()) this.destroyChar(c);
    this.chars.clear();
    this.tweens.killAll();
    for (const t of this.timers) t.remove();
    for (const o of [...this.statics, ...this.transients]) o.destroy();
    this.statics = [];
    this.transients.clear();
    this.timers = [];
    this.occupied.clear();
    this.balls.clear();
    this.pile = undefined;
    this.steamAt = undefined;

    const plan = computeFloorplan(state.departments, state.employees);
    const boundsChanged = JSON.stringify(plan.bounds) !== JSON.stringify(this.plan?.bounds);
    this.plan = plan;

    this.drawHall();
    for (const room of plan.rooms) this.drawRoom(room);
    const colors = new Map(state.departments.map((d) => [d.id, hex(d.color)]));
    for (const e of state.employees) {
      const seat = plan.seats.get(e.id);
      if (seat) this.makeChar(e.id, e.name, seat.roomId, colors.get(e.department_id) ?? 0x64748b);
    }
    for (const pair of new Set(plan.spots.flatMap((s) => (s.pair ? [s.pair] : [])))) {
      this.balls.set(pair, { ball: this.keep(this.add.circle(0, 0, 2.6, 0xffffff).setStrokeStyle(1, 0xf97316).setDepth(OVERLAY_DEPTH - 1).setVisible(false)) });
    }
    if (this.steamAt) this.every(2400, () => this.steam());
    if (boundsChanged && !this.userMoved) this.fitView();
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T) {
    this.statics.push(o);
    return o;
  }

  private every(delay: number, callback: () => void) {
    this.timers.push(this.time.addEvent({ delay, loop: true, callback }));
  }

  private graphics(depth: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
    const g = this.keep(this.add.graphics().setDepth(depth));
    draw(g);
    return g;
  }

  // Móvel com profundidade pelo centro da base (ordem de desenho isométrica).
  private furniture(cx: number, cy: number, draw: (g: Phaser.GameObjects.Graphics) => void, bias = 0) {
    return this.graphics(iso(cx, cy).y + bias, draw);
  }

  private drawHall() {
    const { halls, spine, hallSegs, rooms } = this.plan!;
    this.graphics(FLOOR_DEPTH, (g) => {
      for (const h of spine ? [...halls, spine] : halls) {
        for (let x = h.gx; x < h.gx + h.w; x++) for (let y = h.gy; y < h.gy + h.d; y++) D.quad(g, [pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)], (x + y) % 2 ? THEME.hall : THEME.hallAlt);
      }
    });
    for (const s of hallSegs) this.wall(s);
    // Na borda de cima de cada corredor, encostados nas salas e longe das portas: vaso, máquina de lanches,
    // banco, bebedouro, lixeira, em ciclo. Cada um dentro de um tile só: o trecho de parede da frente ordena pelo
    // meio do tile, e o que invadisse o tile seguinte ficaria atrás dele.
    for (const h of halls) {
      const doors = rooms.filter((r) => r.door.wall === 'R' && r.door.at === h.gy).map((r) => r.door.u + 0.5);
      let n = hash(`hall${h.gy}`) % 5;
      for (let px = 2.5; px < h.w - 1; px += 4) {
        if (doors.some((d) => Math.abs(d - px) < 1.6)) continue;
        const seed = hash(`hall${h.gy}:${px}`);
        const kind = n++ % 5;
        if (kind === 0) this.furniture(px, h.gy + 0.3, (g) => D.plant(g, px, h.gy + 0.3, 0.9, seed));
        else if (kind === 1) this.furniture(px, h.gy + 0.4, (g) => D.vending(g, px - 0.45, h.gy + 0.05, seed));
        else if (kind === 2) this.furniture(px, h.gy + 0.3, (g) => D.bench(g, px - 0.45, h.gy + 0.08, 0.9, 0.45));
        else if (kind === 3) this.furniture(px, h.gy + 0.28, (g) => D.cooler(g, px - 0.22, h.gy + 0.06));
        else this.furniture(px, h.gy + 0.3, (g) => (D.plant(g, px - 0.35, h.gy + 0.3, 0.8, seed), D.bin(g, px + 0.3, h.gy + 0.25)));
      }
    }
    // Fim da espinha nos fundos (antes do primeiro corredor): canto do café.
    const s = this.plan!.spine;
    if (halls[0]?.gy > 1) {
      this.furniture(s.gx + 0.5, 0.45, (g) => D.plant(g, s.gx + 0.5, 0.45, 1.1, 3));
      this.furniture(s.gx + 1.45, 0.3, (g) => D.cooler(g, s.gx + 1.25, 0.08));
    }
  }

  private floorBase(r: Room) {
    const c = hex(r.color);
    if (r.floor === 'grass') return THEME.grass;
    if (r.floor === 'tile') return mix(THEME.tile, c, 0.08);
    if (r.kind === 'leisure' && r.floor === 'wood') return mix(0xa16207, THEME.floorMix, DARK ? 0.55 : 0.5);
    return mix(c, THEME.floorMix, r.kind === 'dept' ? THEME.floorT : THEME.floorT + 0.05);
  }

  private drawRoom(r: Room) {
    this.graphics(FLOOR_DEPTH + 1, (g) => {
      D.floor(g, r, r.floor, this.floorBase(r), hash(r.id));
      g.lineStyle(1, darken(hex(r.color), 0.2), 0.6);
      g.strokePoints([pt(r.gx, r.gy), pt(r.gx + r.w, r.gy), pt(r.gx + r.w, r.gy + r.d), pt(r.gx, r.gy + r.d)], true);
    });

    if (r.walls) for (const s of r.segs) this.wall(s);
    else this.drawHedges(r);

    // Placa sobre a porta, na linha da parede: não cobre os nomes de quem está na sala de trás.
    const { door, inside } = r;
    const line = door.wall === 'R' ? { gx: door.u + 0.5, gy: door.at } : { gx: door.at, gy: door.u + 0.5 };
    const sign = pt(line.gx, line.gy, r.walls ? WALL_CUT : 10);
    this.keep(
      this.add
        .text(sign.x, sign.y, r.kind === 'dept' ? r.name : (tr().office.rooms[r.id] ?? r.name), { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ffffff', backgroundColor: r.color, padding: { x: 6, y: 2 }, resolution: 2 })
        .setOrigin(0.5, 0.5)
        .setDepth(LABEL_DEPTH),
    );
    if (r.walls) this.graphics(FLOOR_DEPTH + 2, (g) => D.doormat(g, (line.gx + inside.gx) / 2, (line.gy + inside.gy) / 2));

    if (r.kind === 'dept') this.decorateDept(r);
    if (r.kind === 'boss') this.drawBoss(r);
    for (const item of r.items) this.drawItem(r, item);
  }

  // Paredes em trechos de 1 tile, para ordenar com quem passa. Fundo: profundidade pelo ponto mais ao fundo,
  // tudo dentro da sala (mesmo encostado) fica na frente. Frente: pelo meio do trecho, o que está a mais de
  // 1/4 de tile de cada lado ordena certo (dentro atrás, corredor na frente).
  private wall({ wall, at, u, h, front }: Seg) {
    const A = wall === 'L' ? pt(at, u) : pt(u, at);
    const B = wall === 'L' ? pt(at, u + 1) : pt(u + 1, at);
    const color = wall === 'L' ? THEME.wall : mix(THEME.wall, 0xffffff, 0.12);
    this.graphics(front ? (A.y + B.y) / 2 : A.y + 0.5, (g) => {
      D.quad(g, [A, B, { x: B.x, y: B.y - h }, { x: A.x, y: A.y - h }], color);
      g.fillStyle(darken(color, 0.15), 1);
      g.fillPoints([A, B, { x: B.x, y: B.y - 4 }, { x: A.x, y: A.y - 4 }], true); // rodapé
      g.lineStyle(3, THEME.wallTop, 1);
      g.lineBetween(A.x, A.y - h, B.x, B.y - h);
    });
  }

  // Item de parede ocupando o tile `tile` (só em trecho de fundo inteiro). Redesenhável (janela, relógio).
  private wallItem(r: Room, wall: D.Wall, tile: number, draw: (g: Phaser.GameObjects.Graphics, at: number, u: number) => void, refreshMs?: number) {
    const u = (wall === 'L' ? r.gy : r.gx) + tile;
    if (!r.walls || !r.segs.some((s) => s.wall === wall && !s.front && s.u === u && s.h === WALL)) return;
    const at = wall === 'L' ? r.gx : r.gy;
    const depth = (wall === 'L' ? iso(r.gx, u).y : iso(u, r.gy).y) + 1;
    const g = this.graphics(depth, (g) => draw(g, at, u));
    if (refreshMs) {
      this.every(refreshMs, () => {
        g.clear();
        draw(g, at, u);
      });
    }
  }

  // Cerca viva nos trechos que não encostam no prédio (layout): os do fundo se comportam como parede
  // (atrás de tudo da sala); os da frente, como móvel.
  private drawHedges(r: Room) {
    for (const { wall, at, u, front } of r.segs) {
      const [gx, gy, w, d] = wall === 'L' ? [front ? at - 0.25 : at, u, 0.25, 1] : [u, front ? at - 0.25 : at, 1, 0.25];
      if (front) this.furniture(gx + w / 2, gy + d / 2, (g) => D.hedge(g, gx, gy, w, d, 8));
      else this.graphics(iso(gx, gy).y + 0.5, (g) => D.hedge(g, gx, gy, w, d, 14));
    }
  }

  private decorateDept(r: Room) {
    const seed = hash(r.id);
    for (let y = 1; y < r.d - 0.5; y += 3) this.wallItem(r, 'L', y, (g, at, u) => D.windowPane(g, 'L', at, u), 600_000);
    this.wallItem(r, 'R', 2, (g, at, u) => D.whiteboard(g, 'R', at, u, seed));
    if (r.w >= 8) this.wallItem(r, 'R', 5, (g, at, u) => D.clock(g, 'R', at, u), 30_000);
    this.wallItem(r, 'R', r.w - 2, (g, at, u) => D.picture(g, 'R', at, u, seed));
  }

  // Planta de 5 tiles; sala esticada centraliza mesa, tapete e armário (alinhados com a porta).
  private drawBoss(r: Room) {
    const o = r.gx + Math.floor((r.w - 5) / 2);
    const desk = { gx: o + 1.2, gy: r.gy + 1.2 };
    this.graphics(FLOOR_DEPTH + 2, (g) => D.rug(g, o + 0.7, r.gy + 0.8, 3.6, 2.8, 0x7f1d1d));
    this.furniture(o + 2.5, r.gy + 0.65, (g) => D.box(g, o + 2.1, r.gy + 0.4, 0.8, 0.5, 30, 0x1f2937), -2);
    this.furniture(desk.gx + 1.3, desk.gy + 0.5, (g) => {
      D.shadow(g, desk.gx, desk.gy, 2.6, 1);
      D.box(g, desk.gx, desk.gy, 2.6, 1, 16, mix(THEME.desk, 0x000000, 0.25));
    });
    this.furniture(r.gx + r.w - 0.6, r.gy + 0.45, (g) => D.plant(g, r.gx + r.w - 0.6, r.gy + 0.45, 1.3, 7));
    this.furniture(r.gx + 0.35, r.gy + 1.8, (g) => D.bookshelf(g, r.gx + 0.12, r.gy + 1.0, 0.45, 1.6, 'gx', 11));
    this.wallItem(r, 'R', 1, (g, at, u) => D.windowPane(g, 'R', at, u), 600_000);
    this.wallItem(r, 'R', 3, (g, at, u) => D.clock(g, 'R', at, u), 30_000);
    this.wallItem(r, 'L', 2, (g, at, u) => D.picture(g, 'L', at, u, 5));

    const g = this.keep(this.add.graphics().setDepth(iso(desk.gx + 1.3, desk.gy + 0.5).y + 1));
    const top = pt(desk.gx + 1.3, desk.gy + 0.5, 64);
    const count = this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#fff', resolution: 2 }).setOrigin(0.5);
    const circle = this.add.circle(0, 0, 11, 0xdc2626);
    const badge = this.keep(this.add.container(top.x, top.y, [circle, count]).setDepth(OVERLAY_DEPTH).setVisible(false));
    this.tweens.add({ targets: badge, scale: 1.15, duration: 600, yoyo: true, repeat: -1 });
    const center = pt(desk.gx + 1.3, desk.gy + 0.5, 10);
    const zone = this.keep(this.add.zone(center.x, center.y, 120, 70).setInteractive({ useHandCursor: true }));
    zone.on('pointerup', (p: Phaser.Input.Pointer) => this.tapped(p) && this.onBoss());
    this.pile = { g, badge, count, desk };
  }

  // Móvel em coordenadas absolutas (o layout já resolveu âncoras e módulos).
  private drawItem(r: Room, it: Item) {
    const { x, y } = it;
    const w = it.w ?? 1;
    const d = it.d ?? 1;
    const seed = hash(`${r.id}${it.t}${it.x}${it.y}`);
    const at = (cx: number, cy: number, draw: (g: Phaser.GameObjects.Graphics) => void, bias = 0) => this.furniture(cx, cy, draw, bias);
    switch (it.t) {
      case 'rug':
        return this.graphics(FLOOR_DEPTH + 2, (g) => D.rug(g, x, y, w, d, it.c ?? 0x991b1b));
      case 'path':
        return this.graphics(FLOOR_DEPTH + 2, (g) => D.stonePath(g, x, y, x + (it.w ?? 0), y + (it.d ?? 0), seed));
      case 'promenade':
        return this.graphics(FLOOR_DEPTH + 2, (g) => D.stonePath(g, x + w / 2, y, x + w / 2, y + d, seed));
      case 'sofa':
        return at(x + w / 2, y + d / 2, (g) => D.sofa(g, x, y, w, d, it.c ?? 0x475569));
      case 'coffeeTable':
        return at(x + w / 2, y + d / 2, (g) => D.coffeeTable(g, x, y, w, d, seed));
      case 'vending':
        return at(x + 0.45, y + 0.35, (g) => D.vending(g, x, y, seed));
      case 'bin':
        return at(x, y, (g) => D.bin(g, x, y));
      case 'printer':
        return at(x + 0.45, y + 0.3, (g) => D.printer(g, x, y));
      case 'cabinet':
        return at(x + 0.25, y + 0.25, (g) => D.cabinet(g, x, y));
      case 'lowShelf':
        return at(x + w / 2, y + d / 2, (g) => D.bookshelf(g, x, y, w, d, it.face ?? 'gy', seed, 26));
      case 'coatRack':
        return at(x, y, (g) => D.coatRack(g, x, y, seed));
      case 'foosball':
        return at(x + w / 2, y + d / 2, (g) => D.foosball(g, x, y, w, d));
      case 'pool':
        return at(x + w / 2, y + d / 2, (g) => D.pool(g, x, y, w, d, seed));
      case 'table':
        return at(x + w / 2, y + d / 2, (g) => D.table(g, x, y, w, d, seed));
      case 'picnic':
        return at(x + w / 2, y + d / 2, (g) => D.picnic(g, x, y, w, d));
      case 'bush':
        return at(x, y, (g) => D.bush(g, x, y, seed));
      case 'lampPost':
        return at(x, y, (g) => D.lampPost(g, x, y));
      case 'counter':
        this.steamAt = pt(x + 0.5, y + 0.25, 40);
        return at(x + w / 2, y + d / 2, (g) => D.counter(g, x, y, w, d));
      case 'fridge':
        return at(x + 0.45, y + 0.35, (g) => D.fridge(g, x, y));
      case 'cooler':
        return at(x + 0.22, y + 0.22, (g) => D.cooler(g, x, y));
      case 'roundTable':
        return at(x, y, (g) => D.roundTable(g, x, y));
      case 'stool':
        return at(x, y, (g) => D.stool(g, x, y));
      case 'plant':
        return at(x, y, (g) => D.plant(g, x, y, it.s ?? 1.2, seed));
      case 'beanbag':
        return at(x, y, (g) => D.beanbag(g, x, y, it.c ?? 0xef4444));
      case 'pingpong':
        return at(x + w / 2, y + d / 2, (g) => D.pingpong(g, x, y, w, d));
      case 'bench':
        return at(x + w / 2, y + d / 2, (g) => D.bench(g, x, y, w, d, it.flip));
      case 'armchair':
        return at(x + 0.4, y + 0.4, (g) => D.armchair(g, x, y, it.c ?? 0x047857));
      case 'sideTable':
        return at(x, y, (g) => D.sideTable(g, x, y));
      case 'lamp':
        return at(x, y, (g) => D.lamp(g, x, y));
      case 'flowers':
        return at(x + w / 2, y + d / 2, (g) => D.flowers(g, x, y, w, d, seed));
      case 'bookshelf':
        return at(x + w / 2, y + d / 2, (g) => D.bookshelf(g, x, y, w, d, it.face ?? 'gy', seed));
      case 'tv': {
        let screen: { x: number; y: number }[] = [];
        const depth = iso(x + w / 2, y + 0.17).y;
        this.graphics(depth, (g) => (screen = D.tv(g, x, y, w)));
        return this.animatedScreen(screen, depth + 1, 0x7c3aed);
      }
      case 'arcade': {
        let screen: { x: number; y: number }[] = [];
        const depth = iso(x + 0.4, y + 0.35).y;
        this.graphics(depth, (g) => (screen = D.arcade(g, x, y, it.c ?? 0x2563eb)));
        return this.animatedScreen(screen, depth + 1, it.c ?? 0x2563eb);
      }
      case 'fountain':
        at(x, y, (g) => D.fountain(g, x, y));
        return this.ripples(x, y);
      case 'tree':
        return this.tree(x, y, seed);
    }
  }

  // Tela de TV/fliperama piscando em "modo demonstração".
  private animatedScreen(pts: { x: number; y: number }[], depth: number, tint: number) {
    const g = this.keep(this.add.graphics().setDepth(depth));
    const draw = () => {
      g.clear();
      D.quad(g, pts, mix(0x0b1220, tint, 0.25 + Math.random() * 0.3));
      const [a, b, , d] = pts;
      for (let i = 0; i < 3; i++) {
        const t = 0.2 + Math.random() * 0.6;
        const s = 0.15 + Math.random() * 0.5;
        const p = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t };
        g.fillStyle([0xfacc15, 0x22d3ee, 0xf472b6, 0x4ade80][i % 4], 0.9);
        g.fillRect(p.x + (b.x - a.x) * s, p.y + (b.y - a.y) * s - 1.5, 4, 3);
      }
    };
    draw();
    this.every(500, draw);
  }

  private ripples(gx: number, gy: number) {
    const c = pt(gx, gy, 9.5);
    for (let i = 0; i < 2; i++) {
      const ring = this.keep(this.add.ellipse(c.x, c.y, 60, 30).setStrokeStyle(1.5, 0xe0f2fe, 0.9).setDepth(iso(gx, gy).y + 1));
      this.tweens.add({ targets: ring, scale: { from: 0.25, to: 1 }, alpha: { from: 1, to: 0 }, duration: 2000, delay: i * 1000, repeat: -1 });
    }
  }

  private tree(gx: number, gy: number, seed: number) {
    const base = pt(gx, gy);
    const g = this.keep(this.add.graphics().setPosition(base.x, base.y).setDepth(base.y));
    D.treeLocal(g, seed);
    this.tweens.add({ targets: g, angle: { from: -1.2, to: 1.2 }, duration: 2200 + (seed % 1200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private steam() {
    if (!this.steamAt) return;
    const puff = this.add.circle(this.steamAt.x + (Math.random() - 0.5) * 4, this.steamAt.y, 3, 0xffffff, 0.5).setDepth(OVERLAY_DEPTH - 2);
    this.transients.add(puff);
    this.tweens.add({
      targets: puff,
      y: puff.y - 22,
      alpha: 0,
      scale: 2.2,
      duration: 1800,
      onComplete: () => {
        this.transients.delete(puff);
        puff.destroy();
      },
    });
  }

  // Pilha de papéis na mesa do chefe = pedidos pendentes.
  private setPile(n: number) {
    if (!this.pile) return;
    const { g, badge, count, desk } = this.pile;
    g.clear();
    for (let i = 0; i < Math.min(n, 12); i++) D.box(g, desk.gx + 0.9 + (i % 2) * 0.05, desk.gy + 0.25, 0.7, 0.5, 2, 0xf8fafc, 16 + i * 2.5);
    badge.setVisible(n > 0);
    count.setText(String(n));
  }

  // ---------- funcionários ----------

  private makeChar(id: number, name: string, roomId: string, shirt: number) {
    const seat = this.plan!.seats.get(id)!;
    const h = hash(name);
    const { desk } = seat;

    this.furniture(desk.gx + 0.8, desk.gy + 0.4, (g) => D.desk(g, desk.gx, desk.gy, THEME.desk, h));
    const screen = this.keep(this.add.graphics().setDepth(iso(desk.gx + 0.8, desk.gy + 0.4).y + 1));
    this.furniture(seat.seat.gx, seat.seat.gy + 0.17, (g) => D.officeChair(g, seat.seat.gx, seat.seat.gy), 2);

    const pos = pt(seat.seat.gx, seat.seat.gy);
    const ring = this.add.ellipse(0, 0, 34, 14).setStrokeStyle(2, 0xfacc15).setVisible(false);
    const shadow = this.add.ellipse(0, 0, 24, 9, 0x000000, 0.22);
    const front = this.drawPerson(h, shirt, 'front').setVisible(false);
    const back = this.drawPerson(h, shirt, 'back');
    const figure = this.add.container(0, 0, [front, back]);
    const iconImage = this.add.image(0, 0, iconKey('coffee')).setDisplaySize(11, 11);
    const icon = this.add.container(0, -54, [this.add.circle(0, 0, 9, 0x0f172a, 0.78).setStrokeStyle(1, 0xffffff, 0.5), iconImage]).setVisible(false);
    // Nome fica numa camada acima dos móveis para não sumir atrás da mesa da frente.
    const label = this.add
      .text(pos.x, pos.y + 5, name, { fontFamily: FONT, fontSize: '10px', color: '#ffffff', backgroundColor: 'rgba(15,23,42,0.78)', padding: { x: 4, y: 1 }, resolution: 2 })
      .setOrigin(0.5, 0)
      .setDepth(LABEL_DEPTH - 1);
    const hit = this.add.rectangle(0, -18, 30, 52, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => this.tapped(p) && this.onSelect(id));
    const root = this.add.container(pos.x, pos.y, [ring, shadow, figure, icon, hit]);

    const c: Char = {
      id,
      room: roomId,
      root,
      figure,
      front,
      back,
      icon,
      iconImage,
      label,
      ring,
      screen,
      activity: 'idle',
      pending: false,
      bubbleDx: 0,
      walking: false,
      mission: false,
      away: false,
      atSpot: false,
      nextWander: this.time.now + Phaser.Math.Between(8000, 45000),
    };
    this.chars.set(id, c);
    this.drawScreen(c);
  }

  // Frente (rosto olhando levemente para a direita; espelhado vira para a esquerda) ou costas (sentado no monitor).
  private drawPerson(h: number, shirt: number, view: 'front' | 'back') {
    const g = this.add.graphics();
    const skin = SKIN[h % SKIN.length];
    const hair = HAIR[(h >> 4) % HAIR.length];
    const style = (h >> 9) % 3;
    g.fillStyle(0x111827, 1);
    g.fillEllipse(-3.5, -0.5, 6, 3);
    g.fillEllipse(3.5, -0.5, 6, 3);
    g.fillStyle(PANTS[(h >> 7) % PANTS.length], 1);
    g.fillRect(-6, -13, 5, 12);
    g.fillRect(1, -13, 5, 12);
    if (style === 1 && view === 'front') {
      g.fillStyle(hair, 1);
      g.fillRoundedRect(-7.5, -38, 15, 14, 4); // cabelo comprido, atrás dos ombros
    }
    g.fillStyle(shirt, 1);
    g.fillRoundedRect(-8, -29, 16, 18, 5);
    g.fillStyle(darken(shirt, 0.18), 1);
    g.fillRoundedRect(-11, -27, 4, 13, 2);
    g.fillRoundedRect(7, -27, 4, 13, 2);
    g.fillStyle(skin, 1);
    g.fillCircle(-9, -13.5, 2.2);
    g.fillCircle(9, -13.5, 2.2);
    g.fillCircle(0, -35, 6.5);
    g.fillStyle(hair, 1);
    if (view === 'back') {
      g.fillCircle(0, -35.6, 6.7); // nuca coberta de cabelo
      if (style === 1) g.fillRoundedRect(-7, -37, 14, 13, 4); // cabelo comprido sobre as costas
      g.fillStyle(skin, 1);
      g.fillCircle(-6.6, -34.5, 1.5); // orelhas
      g.fillCircle(6.6, -34.5, 1.5);
      g.fillStyle(hair, 1);
    } else {
      g.fillEllipse(0, -39.5, 14, 6);
    }
    if (style === 2) g.fillCircle(0, -44, 3.5); // coque
    if (view === 'front') {
      g.fillStyle(0x1f2937, 1);
      g.fillCircle(-1.6, -35, 0.9);
      g.fillCircle(3, -35, 0.9);
      g.fillStyle(0xf87171, 0.35);
      g.fillCircle(-3.2, -32.5, 1.3);
      g.fillCircle(4.4, -32.5, 1.3);
    }
    return g;
  }

  private face(c: Char, view: 'front' | 'back', flip = false) {
    c.front.setVisible(view === 'front');
    c.back.setVisible(view === 'back');
    c.figure.scaleX = flip ? -1 : 1;
  }

  private destroyChar(c: Char) {
    c.cancelWalk?.();
    c.bob?.stop();
    c.bubbleTimer?.remove();
    c.bubble?.destroy();
    c.alert?.destroy();
    this.tweens.killTweensOf(c.root);
    c.root.destroy();
    c.label.destroy();
  }

  private isScreenOn = (c: Char) => c.activity !== 'idle' && !c.away;

  private drawScreen(c: Char) {
    const { desk } = this.plan!.seats.get(c.id)!;
    c.screen.clear();
    D.monitor(c.screen, desk.gx, desk.gy, this.isScreenOn(c), Math.random);
  }

  private refreshIcon(c: Char) {
    const name: IconName | null = c.pending ? null : c.activity !== 'idle' ? ACTIVITY_ICON[c.activity] : c.atSpot && c.spot ? c.spot.icon : null;
    c.icon.setVisible(!!name);
    if (name) c.iconImage.setTexture(iconKey(name)).setDisplaySize(11, 11);
  }

  private setActivity(id: number, a: Activity) {
    const c = this.chars.get(id);
    if (!c || c.activity === a) return;
    c.activity = a;
    this.refreshIcon(c);
    if (a !== 'idle' && c.away && !c.mission) this.goHome(c);
    this.drawScreen(c);
    this.updateBob(c);
  }

  private updateBob(c: Char) {
    c.bob?.stop();
    c.bob = undefined;
    c.figure.y = 0;
    if (c.walking || c.away || !WORKING.includes(c.activity)) return;
    c.bob = this.tweens.add({ targets: c.figure, y: -1.5, duration: c.activity === 'typing' ? 130 : 520, yoyo: true, repeat: -1 });
  }

  private setPending(c: Char, pending: boolean) {
    if (c.pending === pending) return;
    c.pending = pending;
    this.refreshIcon(c);
    if (!pending) {
      c.alert?.destroy();
      c.alert = undefined;
      return;
    }
    // Pede permissão: sobe o aviso "!" sobre a cabeça; o funcionário fica no lugar.
    const circle = this.add.circle(0, 0, 11, 0xdc2626).setStrokeStyle(2, 0xffffff);
    const mark = this.add.text(0, 0, '!', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff', resolution: 2 }).setOrigin(0.5);
    c.alert = this.add.container(c.root.x, c.root.y - 54, [circle, mark]).setDepth(OVERLAY_DEPTH + 1).setSize(24, 24).setInteractive({ useHandCursor: true });
    c.alert.on('pointerup', (p: Phaser.Input.Pointer) => this.tapped(p) && this.onSelect(c.id));
    this.tweens.add({ targets: c.alert, scale: 1.2, duration: 450, yoyo: true, repeat: -1 });
  }

  // Anda pelos pontos; resolve true ao chegar, false se outra caminhada a interromper.
  private walk(c: Char, points: Pt[], toRoom: string): Promise<boolean> {
    c.cancelWalk?.();
    c.bob?.stop();
    c.figure.y = 0;
    c.room = toRoom;
    c.walking = true;
    const step = this.tweens.add({ targets: c.figure, y: -2.5, duration: 110, yoyo: true, repeat: -1 });
    return new Promise((resolve) => {
      let done = false;
      const finish = (arrived: boolean) => {
        if (done) return;
        done = true;
        step.stop();
        c.figure.y = 0;
        c.cancelWalk = undefined;
        if (arrived) {
          c.walking = false;
          this.updateBob(c);
        }
        resolve(arrived);
      };
      c.cancelWalk = () => {
        this.tweens.killTweensOf(c.root);
        finish(false);
      };
      const next = (i: number) => {
        if (done) return;
        if (i >= points.length) return finish(true);
        const t = pt(points[i].gx, points[i].gy);
        const dist = Phaser.Math.Distance.Between(c.root.x, c.root.y, t.x, t.y);
        // Olha para onde anda: subindo na tela fica de costas; espelha para a esquerda.
        if (dist > 1) this.face(c, t.y < c.root.y - 0.5 ? 'back' : 'front', t.x < c.root.x);
        this.tweens.add({ targets: c.root, x: t.x, y: t.y, duration: Math.max(60, (dist / SPEED) * 1000), onComplete: () => next(i + 1) });
      };
      next(0);
    });
  }

  private leaveSpot(c: Char) {
    if (c.spot) this.occupied.delete(c.spot.id);
    c.spot = undefined;
    c.atSpot = false;
    this.refreshIcon(c);
  }

  private async goHome(c: Char) {
    const seat = this.plan?.seats.get(c.id);
    if (!seat) return;
    this.leaveSpot(c);
    c.away = true;
    if (!(await this.walk(c, route(this.plan!, c.room, seat.roomId, seat.seat), seat.roomId))) return;
    this.face(c, 'back'); // sentado, virado para o monitor
    c.away = false;
    c.mission = false;
    c.bubbleDx = 0;
    this.drawScreen(c);
    this.updateBob(c);
  }

  // Vai até a mesa do colega e fala. O visitante fica à direita do colega.
  private visit(fromId: number, toId: number, text: string, icon: IconName, after?: number) {
    const c = this.chars.get(fromId);
    const target = this.plan?.seats.get(toId);
    if (!c || !target) return;
    this.leaveSpot(c);
    c.mission = true;
    c.away = true;
    this.drawScreen(c);
    c.arrival = this.walk(c, route(this.plan!, c.room, target.roomId, target.visitor), target.roomId);
    c.arrival.then((arrived) => {
      if (!arrived) return;
      this.face(c, 'back', true); // de lado para o colega, à esquerda
      c.bubbleDx = 70;
      const host = this.chars.get(toId);
      if (host) host.bubbleDx = -70;
      this.say(c, text, 'say', 7000, icon);
      if (after) this.time.delayedCall(after, () => this.goHome(c));
    });
  }

  private async answer(fromId: number, toId: number, text: string) {
    const asker = this.chars.get(toId);
    await asker?.arrival;
    const c = this.chars.get(fromId);
    if (c) this.say(c, text, 'say', 6500, 'message');
    this.time.delayedCall(2800, () => asker && this.goHome(asker));
    this.time.delayedCall(6500, () => c && (c.bubbleDx = 0));
  }

  private say(c: Char, text: string, kind: 'say' | 'thought', ms: number, icon?: IconName) {
    c.bubbleTimer?.remove();
    c.bubble?.destroy();
    const thought = kind === 'thought';
    const txt = this.add
      .text(0, -12, truncate(text.replace(/\s+/g, ' ').trim(), 120), {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: thought ? 'italic' : 'normal',
        color: thought ? '#475569' : '#0f172a',
        wordWrap: { width: 190, useAdvancedWrap: true },
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    const pad = icon ? 18 : 0; // espaço do ícone à esquerda do texto
    const w = txt.width + 14 + pad;
    const h = txt.height + 10;
    txt.setX(pad / 2);
    const g = this.add.graphics();
    g.fillStyle(thought ? 0xf1f5f9 : 0xffffff, 0.97);
    g.lineStyle(1, 0x94a3b8, 1);
    g.fillRoundedRect(-w / 2, -h - 7, w, h, 8);
    g.strokeRoundedRect(-w / 2, -h - 7, w, h, 8);
    if (thought) {
      g.fillCircle(-3, -4, 3);
      g.fillCircle(-6, 1, 2);
    } else {
      g.fillTriangle(-6, -8, 6, -8, 0, 0);
    }
    const parts: Phaser.GameObjects.GameObject[] = [g, txt];
    if (icon) parts.push(this.add.image(-w / 2 + 13, -7 - h / 2, iconKey(icon)).setDisplaySize(12, 12).setTint(0x2563eb));
    const bubble = this.add.container(c.root.x + c.bubbleDx, c.root.y - 54, parts).setDepth(OVERLAY_DEPTH + c.root.y / 1e4);
    c.bubble = bubble;
    c.bubbleTimer = this.time.delayedCall(ms, () => {
      if (c.bubble === bubble) c.bubble = undefined;
      this.tweens.add({ targets: bubble, alpha: 0, duration: 250, onComplete: () => bubble.destroy() });
    });
  }

  private float(c: Char, icon: IconName, tint: number) {
    const t = this.add.image(c.root.x, c.root.y - 50, iconKey(icon)).setDisplaySize(20, 20).setTint(tint).setDepth(OVERLAY_DEPTH + 2);
    this.transients.add(t);
    this.tweens.add({
      targets: t,
      y: t.y - 40,
      alpha: 0,
      duration: 1800,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.transients.delete(t);
        t.destroy();
      },
    });
  }

  // ---------- descompressão ----------

  private pickSpot(): LeisureSpot | undefined {
    const spots = this.plan!.spots;
    const free = spots.filter((s) => !this.occupied.has(s.id));
    // Alguém esperando parceiro no ping-pong: completa a dupla com prioridade.
    const partner = free.find((s) => s.pair && spots.some((o) => o.pair === s.pair && o.id !== s.id && this.occupied.has(o.id)));
    if (partner && Math.random() < 0.75) return partner;
    return free.length ? Phaser.Utils.Array.GetRandom(free) : undefined;
  }

  // Ocioso de vez em quando sai para um lugar livre (Copa, Jogos, Jardim, Biblioteca) e volta.
  private wander() {
    if (this.replaying || !this.plan) return;
    const now = this.time.now;
    for (const c of this.chars.values()) {
      if (c.activity !== 'idle' || c.mission || c.walking || c.pending || now < c.nextWander) continue;
      if (now - c.nextWander > WANDER_MAX_GAP) {
        c.nextWander = now + Phaser.Math.Between(1000, 45000);
        continue;
      }
      if (c.away) {
        c.nextWander = now + Phaser.Math.Between(30000, 90000);
        this.goHome(c);
        continue;
      }
      const spot = Math.random() < 0.55 ? this.pickSpot() : undefined;
      if (!spot) {
        c.nextWander = now + Phaser.Math.Between(20000, 60000);
        continue;
      }
      c.spot = spot;
      this.occupied.set(spot.id, c.id);
      c.away = true;
      c.nextWander = now + Phaser.Math.Between(15000, 35000);
      this.drawScreen(c);
      this.walk(c, route(this.plan, c.room, spot.roomId, spot), spot.roomId).then((arrived) => {
        if (!arrived || c.spot !== spot) return;
        this.face(c, spot.face);
        c.atSpot = true;
        this.refreshIcon(c);
      });
    }
  }

  private updateBalls() {
    if (!this.plan) return;
    for (const [pair, b] of this.balls) {
      const players = this.plan.spots
        .filter((s) => s.pair === pair)
        .map((s) => this.chars.get(this.occupied.get(s.id) ?? -1))
        .filter((c): c is Char => !!c?.atSpot);
      if (players.length === 2 && !b.tween) {
        const [p, q] = players;
        b.ball.setVisible(true);
        b.tween = this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 650,
          yoyo: true,
          repeat: -1,
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            b.ball.setPosition(p.root.x + (q.root.x - p.root.x) * t, p.root.y - 20 + (q.root.y - p.root.y) * t - Math.sin(t * Math.PI) * 16);
          },
        });
      } else if (players.length < 2 && b.tween) {
        b.tween.stop();
        b.tween = undefined;
        b.ball.setVisible(false);
      }
    }
  }

  // ---------- eventos ----------

  handle(e: OfficeEvent, replay: boolean) {
    if (!this.ready || !this.plan) return;
    if (e.type === 'replay.start') return this.setReplay(true);
    if (e.type === 'replay.end') return this.setReplay(false);
    if (replay !== this.replaying) return;
    const c = e.employeeId != null ? this.chars.get(e.employeeId) : undefined;
    const d = e.data;
    switch (e.type) {
      case 'run.started':
        if (replay && c) this.setActivity(c.id, d.kind === 'consult' ? 'consulting' : 'thinking');
        break;
      case 'agent.tool':
        if (replay && c && d.kind === 'task') this.setActivity(c.id, TOOL_ACTIVITY[d.name] ?? 'running');
        break;
      case 'agent.text':
        // Na consulta o texto é a própria resposta, que aparece no colleague.answer.
        if (c && d.kind === 'task') this.say(c, d.text, 'thought', 4500);
        break;
      case 'colleague.ask':
        this.visit(e.employeeId!, d.toId, d.question, 'question');
        break;
      case 'colleague.answer':
        this.answer(d.fromId, e.employeeId!, d.answer);
        if (replay) this.setActivity(d.fromId, 'idle');
        break;
      case 'task.delegated':
        this.visit(e.employeeId!, d.toId, d.title, 'file', 2500);
        break;
      case 'approval.requested':
        if (c && d.kind !== 'delegation') this.setPending(c, true);
        if (replay) this.setPile(++this.replayPending);
        break;
      case 'approval.resolved':
        if (c && d.kind !== 'delegation') this.setPending(c, false);
        if (replay) this.setPile((this.replayPending = Math.max(0, this.replayPending - 1)));
        break;
      case 'task.created':
        if (c) this.float(c, 'inbox', 0x2563eb);
        break;
      case 'task.finished':
        if (!c) break;
        const [icon, tint] = FINISH[d.status as keyof typeof FINISH] ?? FINISH.failed;
        this.float(c, icon, tint);
        if (replay) this.setActivity(c.id, 'idle');
        break;
      case 'boss.message':
        if (c) this.say(c, d.text, 'say', 5000, 'briefcase');
        break;
    }
  }

  // Replay começa com todos sentados e ociosos; ao terminar, volta ao estado real.
  private setReplay(on: boolean) {
    this.replaying = on;
    this.replayPending = 0;
    this.occupied.clear();
    for (const c of this.chars.values()) {
      const seat = this.plan!.seats.get(c.id)!;
      c.cancelWalk?.();
      c.bubbleTimer?.remove();
      c.bubble?.destroy();
      c.bubble = undefined;
      c.arrival = undefined;
      c.bubbleDx = 0;
      c.walking = c.mission = c.away = false;
      c.spot = undefined;
      c.atSpot = false;
      c.room = seat.roomId;
      const p = pt(seat.seat.gx, seat.seat.gy);
      c.root.setPosition(p.x, p.y);
      this.face(c, 'back');
      this.setPending(c, false);
      c.activity = 'thinking';
      this.setActivity(c.id, 'idle');
    }
    this.setPile(0);
    if (!on) {
      this.applied = undefined;
      this.apply();
    }
  }
}
