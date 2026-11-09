/**
 * Minimap (POC.md §3, §9): lanes, river, structures, units and the camera's view on a small 2D canvas. Desktop:
 * left-click looks there, right-click moves there. Touch: tap to peek for a moment. GAPS A4: countdown rings on
 * Pudding's spot and the rat camps (onboarding/objectives.ts ObjectiveClock.timers). GAPS B1: a long press (touch)
 * or an Alt-click (desktop) pings "Go here" at that spot.
 */
import { NX, NY, createGrid, onPlayfield } from '../sim/map/grid';
import { BUSHES, CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, PUDDING_SPOT, RAT_CAMP, mirrorX, type LaneId } from '../data/map';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS, RELATION_CSS, sidesSwapped } from '../render/palette';
import { portraitUrl } from '../render/portraits';
import { HERO_TEXT } from './heroText';
import type { HeroId, SimEvent } from '../sim/api';
import { cameraYaw } from '../render/coords';
import type { PingKind } from '../data/pings';
import { pingGlyph } from './pingGlyph';
import { clearedBushes } from '../render/bushClear';
import { mapInfo } from '../sim/map/info';
import { applyMinimapSize, colourBlind } from './minimapPrefs';

export interface MinimapHost {
  /** Feel pass B1: hold the view on (x, z) m while the minimap is held (peekEnd lets it go). */
  peekHold(xM: number, zM: number): void;
  /** The minimap let go: the view returns to the hero (over 150 ms). */
  peekEnd(): void;
  moveTo(xMm: number, yMm: number): void;
  /** Ground corners (m, three.js X/Z) of the camera view, or null. */
  viewQuad(): { x: number; z: number }[] | null;
  mySlot(): number;
  myTeam(): number;
  /** GAPS B1: ping "Go here" at (x, y) mm. */
  goHere?(xMm: number, yMm: number): void;
}

/**
 * Feel pass B1 (hold to peek, Wild Rift and MLBB): a finger or the mouse button on the minimap centres the camera
 * there at once and drags it along; the lift returns it to the hero (camera/frame.ts PEEK_RETURN_S). Pings go
 * through the ping button and wheel (Alt-click still pings Go here on desktop).
 */
/** MAP-GAPS A21: a second tap within `ms` and `px` of the first is a double tap: a move order there. */
export const MINIMAP_DOUBLE_TAP = Object.freeze({ ms: 320, px: 24 });

/**
 * MAP-GAPS A3: the order heroes are drawn in: allies and enemies by id, the player's own hero last (always on top).
 */
export function heroDrawOrder<T extends { id: number }>(heroes: readonly T[], me: number): T[] {
  const out = heroes.filter((h) => h.id !== me).sort((a, b) => a.id - b.id);
  const self = heroes.find((h) => h.id === me);
  if (self) out.push(self);
  return out;
}

/**
 * MAP-GAPS A3: a hero's minimap initial: the first letter of its name, or two letters when another hero in `others`
 * starts with the same letter (Clem and Cacklejaw: "Cl", "Ca").
 */
export function heroInitial(hero: HeroId, others: readonly HeroId[] = []): string {
  const name = HERO_TEXT[hero]?.title ?? hero;
  const first = name[0].toUpperCase();
  const clash = others.some((o) => o !== hero && (HERO_TEXT[o]?.title ?? o)[0].toUpperCase() === first);
  if (!clash) return first;
  const taken = new Set(others.filter((o) => o !== hero && (HERO_TEXT[o]?.title ?? o)[0].toUpperCase() === first).map(heroPair));
  for (let i = 1; i < name.length; i++) {
    const two = first + name[i].toLowerCase();
    if (!taken.has(two)) return two;
  }
  return heroPair(hero);
}
const heroPair = (h: HeroId): string => {
  const n = HERO_TEXT[h]?.title ?? h;
  return n[0].toUpperCase() + n[1].toLowerCase();
};

/** The minimap's ground colours. */
/** MAP-GAPS A7: bushes a light catnip green with an outline and dots, forest darker, the jungle rocks grey-brown. */
export const MM_GROUND = Object.freeze({ grass: '#7fb86a', river: '#6fb7e0', lane: '#e6cf98', forest: '#2f4f2c', wall: '#6e6458', bush: '#5fae4a', bushEdge: '#2f5a26' });

/** MAP-GAPS A20: a cleared bush (an ally in it), lighter than an unscouted one. */
export const MM_BUSH_CLEARED = 'rgba(190,240,160,0.85)';

/** MAP-GAPS A4: the dark outline every unit mark wears (towers, heroes, minions, Pudding). */
export const MM_OUTLINE = '#2a1a22';
/** MAP-GAPS A4: the enemy hue with colour-blind colours on (orange: apart from ally blue under every CVD). */
export const MM_ENEMY_CVD = '#ff8a00';

/** The relation colours the minimap draws with (colour-blind colours swap the enemy hue). */
export function minimapRelation(cvd: boolean): { self: string; ally: string; enemy: string; neutral: string } {
  return { self: RELATION_CSS.self, ally: RELATION_CSS.ally, enemy: cvd ? MM_ENEMY_CVD : RELATION_CSS.enemy, neutral: RELATION_CSS.neutral };
}

/** MAP-GAPS A8: Pudding and its countdown wear their own objective hue (gold is the player's own mark only). */
export const MM_OBJECTIVE = '#b07cff';

/** MAP-GAPS A11: how long (s) a last-seen ghost stays after an enemy hero leaves our sight. */
export const GHOST_S = 6;

/** MAP-GAPS A6: the minimap draws the map into a rectangle this far (CSS px) inside the canvas edge. */
export const MM_PAD = 6;

/**
 * MAP-GAPS A6 + feel pass B2: the minimap mapping for a `w` × `h` px canvas, turned by the camera's ground yaw `yaw`
 * (render/coords.ts cameraYaw: −38° for team 0, + 180° for a team-1 seat), so the minimap reads like the screen: our
 * base bottom left, theirs top right. The turned map is scaled to fit inside the canvas, inset by `pad`.
 * `P` maps sim mm → canvas px; `LX` / `LY` are the unturned layout (px from the canvas centre) for shapes drawn under
 * a `rotate(rot)` about (cx, cy); `inv` is the exact inverse of `P` (clamped to the map).
 */
export function minimapMapping(w: number, h: number, pad = MM_PAD, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const W = MAP.width;
  const H = MAP.height;
  const bbW = W * Math.abs(c) + H * Math.abs(s);
  const bbH = W * Math.abs(s) + H * Math.abs(c);
  const k = Math.max(1e-6, Math.min(Math.max(1, w - 2 * pad) / bbW, Math.max(1, h - 2 * pad) / bbH));
  const cx = w / 2;
  const cy = h / 2;
  const LX = (xMm: number): number => (xMm - W / 2) * k;
  const LY = (yMm: number): number => -(yMm - H / 2) * k;
  return {
    /** px per mm. */
    k,
    cx,
    cy,
    /** The canvas rotation (rad) that turns the layout (LX, LY) into canvas px about (cx, cy). */
    rot: yaw,
    LX,
    LY,
    /** Sim mm → canvas px. */
    P: (xMm: number, yMm: number): [number, number] => {
      const lx = LX(xMm);
      const ly = LY(yMm);
      return [cx + lx * c - ly * s, cy + lx * s + ly * c];
    },
    /** Canvas px → sim mm, clamped to the map. */
    inv: (px: number, py: number): { xMm: number; yMm: number } => {
      const dx = px - cx;
      const dy = py - cy;
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      return { xMm: Math.max(0, Math.min(W, lx / k + W / 2)), yMm: Math.max(0, Math.min(H, -ly / k + H / 2)) };
    },
    /** Clamp a canvas point into the inset rectangle (the view quad stays closed at the edge). */
    clamp: (px: number, py: number): [number, number] => [Math.max(pad, Math.min(w - pad, px)), Math.max(pad, Math.min(h - pad, py))],
  };
}

/** MAP-GAPS A3: below this drawn diameter (CSS px) a hero is its initial; at and above it, its portrait. */
export const PORTRAIT_MIN_PX = 12;

/** MAP-GAPS A19: the lane a line of text names ("Push Sunny", "Puddle Lane tower down"), or null. */
export function laneNamed(text: string): LaneId | null {
  if (/\bsunny\b/i.test(text)) return 'sunny';
  if (/\bpuddle\b/i.test(text)) return 'puddle';
  return null;
}

/** MAP-GAPS A19: where each lane's glyph sits (sim mm): over its river crossing, at the map edge side. */
export const LANE_GLYPH_AT: Readonly<Partial<Record<LaneId, { x: number; y: number }>>> = Object.freeze({ sunny: { x: 50000, y: 57000 }, puddle: { x: 50000, y: 3200 } });
/** MAP-GAPS A19: how long (ms) a named lane flashes. */
export const LANE_FLASH_MS = 1000;

/** Sim v19 (Hearthwood): Grizzlechop's minimap hue (rust red, apart from Pudding's violet). */
export const MM_BOSS = '#e0703a';
/** Sim v19: the buff camps' minimap hues (Prickle Hollow, Crow Roost). */
export const MM_CAMP: Readonly<Record<string, string>> = Object.freeze({ rat: '#cdb784', toad: '#9cc77a', prickle: '#ff9a4d', crow: '#9aa8ff' });

const isPoint = (): boolean => MAP.point === 1;

/** A lane's whole centre line, core to core (sim mm), on the bound map. */
export function lanePoints(lane: LaneId): (readonly [number, number])[] {
  if (isPoint()) {
    const l = mapInfo('hearthwood').lanes.find((k) => k.id === lane);
    if (!l) return [];
    const [xs, ys] = l.path[0];
    return Array.from(xs, (x, i) => [x, ys[i]] as const);
  }
  const pts = LANE_WAYPOINTS[lane] ?? [];
  const out: (readonly [number, number])[] = pts.map(([x, y]) => [x, y] as const);
  for (let i = pts.length - 2; i >= 0; i--) out.push([mirrorX(pts[i][0]), pts[i][1]]);
  return out;
}

/** Every bush on the bound map in sim/map/brush.ts bushAt order (sim mm: centre and size). */
export function bushList(): { x: number; y: number; w: number; h: number }[] {
  if (isPoint()) return mapInfo('hearthwood').bushes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let side = 0; side < 2; side++) for (const b of BUSHES) out.push({ x: side === 0 ? b.x : mirrorX(b.x), y: b.y, w: b.w, h: b.h });
  return out;
}

/** A team's base point (core or fountain, team 0's spot given) on the bound map. */
const basePt = (team: number, p: { x: number; y: number }): [number, number] => (team === 0 ? [p.x, p.y] : isPoint() ? [MAP.width - p.x, MAP.height - p.y] : [mirrorX(p.x), p.y]);


/** MAP-GAPS A4: an outlined minion mark centred on (x, y): an ally square, an enemy diamond (shape, not only hue), a camp dot. */
function drawMinionMark(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, rel: 'ally' | 'enemy' | 'neutral'): void {
  if (rel === 'enemy') {
    const d = h * 1.45;
    for (const [c, k] of [
      [MM_OUTLINE, d + 1.1],
      [color, d],
    ] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(x, y - k);
      g.lineTo(x + k, y);
      g.lineTo(x, y + k);
      g.lineTo(x - k, y);
      g.closePath();
      g.fill();
    }
  } else if (rel === 'ally') {
    g.fillStyle = MM_OUTLINE;
    g.fillRect(x - h - 0.9, y - h - 0.9, 2 * h + 1.8, 2 * h + 1.8);
    g.fillStyle = color;
    g.fillRect(x - h, y - h, 2 * h, 2 * h);
  } else {
    g.fillStyle = MM_OUTLINE;
    g.beginPath();
    g.arc(x, y, h + 1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, h, 0, Math.PI * 2);
    g.fill();
  }
}

/** MAP-GAPS A8: Pudding's mark centred on (x, y), side s: an objective-violet rounded square with a heart glyph. */
function drawPudding(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = MM_OUTLINE;
  roundRectPath(g, x - s / 2 - 1.2, y - s / 2 - 1.2, s + 2.4, s + 2.4, 2.4);
  g.fill();
  g.fillStyle = MM_OBJECTIVE;
  roundRectPath(g, x - s / 2, y - s / 2, s, s, 1.8);
  g.fill();
  g.fillStyle = '#fff3dc';
  g.beginPath();
  const r = s * 0.17;
  g.arc(x - r, y - r * 0.4, r, 0, Math.PI * 2);
  g.arc(x + r, y - r * 0.4, r, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - 2 * r, y - r * 0.2);
  g.lineTo(x + 2 * r, y - r * 0.2);
  g.lineTo(x, y + 1.8 * r);
  g.closePath();
  g.fill();
}

/** Sim v19: Grizzlechop's mark centred on (x, y), side s: a rust disc with a dark tricorn. */
function drawBoss(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = MM_OUTLINE;
  g.beginPath();
  g.arc(x, y, s / 2 + 1.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = MM_BOSS;
  g.beginPath();
  g.arc(x, y, s / 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = MM_OUTLINE;
  g.beginPath();
  g.moveTo(x - s * 0.36, y);
  g.lineTo(x, y - s * 0.34);
  g.lineTo(x + s * 0.36, y);
  g.closePath();
  g.fill();
}

/** A rounded rectangle path (no CanvasRenderingContext2D.roundRect needed). */
function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class Minimap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private bg: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null;
  private w = 220;
  private h = 132;
  private dpr = 1;
  /**
   * PERF-IOS P1-4: redraws a second (30 on a desktop, 15 on a phone, 10 when the thermal governor asks; it drew 60 at
   * ~85 Canvas 2D calls each). A ping, a death or a tap draws on the next frame whatever the rate.
   */
  hz = 30;
  private nextDraw = 0;
  private dirty = true;
  /** The root's size is re-read only after a resize (ResizeObserver) or once a second (it was read every frame). */
  private measuredAt = -1e9;
  private resized = true;
  private readonly ro: ResizeObserver | null = null;
  /** MAP-GAPS A5: unit marks scale with the canvas width (196 px, the desktop M size, is 1). */
  private k = 1;
  /** MAP-GAPS A5: a hero mark's radius (px): 8 on desktop (a portrait 16 px across), w / 36 on touch (an initial). */
  heroR(self: boolean): number {
    const touch = typeof document !== 'undefined' && document.documentElement?.dataset.touch === '1';
    return (touch ? this.w / 36 : 8 * this.k) * (self ? 1.15 : 1);
  }

  constructor(
    parent: HTMLElement,
    private readonly host: MinimapHost,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pl-minimap';
    this.canvas = document.createElement('canvas');
    this.root.appendChild(this.canvas);
    parent.appendChild(this.root);
    this.g = this.canvas.getContext('2d');
    applyMinimapSize();
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e, false));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    this.canvas.addEventListener('pointerdown', () => (this.dirty = true));
    try {
      if (typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(() => {
          this.resized = true;
          this.dirty = true;
        });
        this.ro.observe(this.root);
      }
    } catch {
      this.ro = null;
    }
  }

  /** The finger or mouse button holding the minimap (feel pass B1: it peeks while held). */
  private press: { id: number; last: { xMm: number; yMm: number } } | null = null;
  /** Peeks started (e2e telemetry). */
  peeks = 0;

  private lastTap: { t: number; x: number; y: number } | null = null;
  /** MAP-GAPS A21: the minimap move order's goal (sim mm), shown until the hero gets there (or 10 s). */
  moveGoal: { x: number; y: number; until: number } | null = null;

  private toMap(e: { clientX: number; clientY: number }): { xMm: number; yMm: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = r.width > 0 ? this.w / r.width : 1;
    const sy = r.height > 0 ? this.h / r.height : 1;
    return this.map.inv((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
  }

  private look(p: { xMm: number; yMm: number }): void {
    this.host.peekHold(p.xMm / 1000, -p.yMm / 1000);
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const p = this.toMap(e);
    if (e.altKey && this.host.goHere) {
      this.host.goHere(p.xMm, p.yMm);
      return;
    }
    if (e.button === 2) {
      this.host.moveTo(p.xMm, p.yMm);
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic event without an active pointer */
    }
    const touch = e.pointerType === 'touch';
    // MAP-GAPS A21: a double tap (from the pointerdown times: app/noZoom.ts cancels dblclick) is a move order
    const now = e.timeStamp || performance.now();
    const last = this.lastTap;
    this.lastTap = touch ? { t: now, x: e.clientX, y: e.clientY } : null;
    if (touch && last && now - last.t <= MINIMAP_DOUBLE_TAP.ms && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= MINIMAP_DOUBLE_TAP.px) {
      this.lastTap = null;
      this.press = null;
      this.host.peekEnd();
      this.host.moveTo(p.xMm, p.yMm);
      this.moveGoal = { x: p.xMm, y: p.yMm, until: performance.now() + 10000 };
      return;
    }
    // feel pass B1: hold to peek, at once, for touch and mouse alike
    this.press = { id: e.pointerId, last: p };
    this.peeks++;
    this.look(p);
  }

  private move(e: PointerEvent): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    e.preventDefault();
    const p = this.toMap(e);
    pr.last = p;
    this.look(p);
  }

  private up(e: PointerEvent, _cancel: boolean): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    this.press = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    this.host.peekEnd();
  }

  private size(): void {
    const now = performance.now();
    if (this.bg && !this.resized && now - this.measuredAt < 1000) {
      if (this.bgKey() === this.bgKeyNow) return;
    }
    this.resized = false;
    this.measuredAt = now;
    const r = this.root.getBoundingClientRect();
    const w = Math.round(r.width) || 220;
    const h = Math.round(r.height) || 132;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // feel pass B2: the minimap turns with the camera (diagonal; another 180° for a team-1 seat)
    this.yaw = cameraYaw();
    const key = this.bgKey();
    if (w === this.w && h === this.h && dpr === this.dpr && this.bg && key === this.bgKeyNow) return;
    this.bgKeyNow = key;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.k = w / 196;
    this.map = minimapMapping(w, h, MM_PAD, this.yaw);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.bg = this.paintBg();
  }

  /** MAP-GAPS A9: what the cached background depends on besides its size: our team, the flip, colours, species. */
  private bgKeyNow = '';
  private bgKey(): string {
    return `${this.host.myTeam()}|${this.yaw.toFixed(4)}|${colourBlind() ? 1 : 0}|${sidesSwapped() ? 1 : 0}`;
  }
  /** Repaint the background on the next draw (species or side swap, a setting change). */
  invalidate(): void {
    this.bg = null;
    this.dirty = true;
  }
  /** The next draw() runs whatever the redraw rate (a state change outside the sim events; tests). */
  markDirty(): void {
    this.dirty = true;
  }
  /** Background repaints so far (tests). */
  bgPaints = 0;

  /** MAP-GAPS A6 / feel pass B2: the current mapping (inset, turned with the camera). */
  private map = minimapMapping(this.w, this.h);
  private yaw = 0;
  /** Sim mm → canvas px (turned). */
  readonly P = (xMm: number, yMm: number): [number, number] => this.map.P(xMm, yMm);
  /** The unturned layout (px from the centre), for shapes drawn inside `turned()`. */
  private readonly X = (xMm: number): number => this.map.LX(xMm);
  private readonly Y = (yMm: number): number => this.map.LY(yMm);
  /** Draw `fn` with the canvas turned like the map (layout coordinates X / Y). */
  private turned(g: CanvasRenderingContext2D, fn: () => void): void {
    g.save();
    g.translate(this.map.cx, this.map.cy);
    g.rotate(this.map.rot);
    fn();
    g.restore();
  }

  private paintBg(): HTMLCanvasElement {
    this.bgPaints++;
    const c = document.createElement('canvas');
    c.width = this.w * this.dpr;
    c.height = this.h * this.dpr;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    // MAP-GAPS A6: the forest frames the inset map, so a unit at the edge is drawn whole
    g.fillStyle = MM_GROUND.forest;
    g.fillRect(0, 0, this.w, this.h);
    this.turned(g, () => {
      const x0 = this.X(0);
      const x1 = this.X(MAP.width);
      const y0 = this.Y(MAP.height);
      const y1 = this.Y(0);
      g.fillStyle = MM_GROUND.grass;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.fillStyle = MM_GROUND.river;
      if (isPoint()) {
        // sim v19 Hearthwood: the river is the band |x + y − W| ≤ b across the diagonal
        const W = MAP.width;
        const b = mapInfo('hearthwood').river.b;
        g.beginPath();
        g.moveTo(this.X(0), this.Y(W - b));
        g.lineTo(this.X(W - b), this.Y(0));
        g.lineTo(this.X(W), this.Y(b));
        g.lineTo(this.X(b), this.Y(W));
        g.lineTo(this.X(0), this.Y(W));
        g.lineTo(this.X(0), this.Y(W - b));
        g.closePath();
        g.save();
        g.beginPath();
        g.moveTo(this.X(0), this.Y(W - b));
        g.lineTo(this.X(W - b), this.Y(0));
        g.lineTo(this.X(W), this.Y(0));
        g.lineTo(this.X(W), this.Y(b));
        g.lineTo(this.X(b), this.Y(W));
        g.lineTo(this.X(0), this.Y(W));
        g.closePath();
        g.fill();
        g.restore();
        // the far corner past the band is grass again
        g.fillStyle = MM_GROUND.grass;
        g.beginPath();
        g.moveTo(this.X(W), this.Y(b));
        g.lineTo(this.X(W), this.Y(W));
        g.lineTo(this.X(b), this.Y(W));
        g.closePath();
        g.fill();
      } else {
        const rx0 = this.X(MAP.riverX[0]);
        const rx1 = this.X(MAP.riverX[1]);
        g.fillRect(Math.min(rx0, rx1), Math.min(y0, y1), Math.abs(rx1 - rx0), Math.abs(y1 - y0));
      }
      // sim v5: the forest outside the playfield (the nav grid's blocked cells), darker, so a right-click there reads as
      // "not walkable"
      const wall = createGrid().walls;
      const cw = Math.abs(this.X(MAP.navCell) - this.X(0));
      const ch = Math.abs(this.Y(MAP.navCell) - this.Y(0));
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++)
          if (wall[j * NX + i]) {
            // the jungle rocks (blocked cells on the playfield) grey-brown, the forest dark green
            g.fillStyle = onPlayfield(i * MAP.navCell + MAP.navCell / 2, j * MAP.navCell + MAP.navCell / 2) ? MM_GROUND.wall : MM_GROUND.forest;
            const ax = this.X(i * MAP.navCell);
            const bx = this.X((i + 1) * MAP.navCell);
            const ay = this.Y((j + 1) * MAP.navCell);
            const by = this.Y(j * MAP.navCell);
            g.fillRect(Math.min(ax, bx), Math.min(ay, by), cw + 0.5, ch + 0.5);
          }
      g.strokeStyle = MM_GROUND.lane;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = MAP.laneWidth * this.map.k * 0.7;
      for (const lane of isPoint() ? (['fence', 'yarn', 'gutter'] as const) : (['sunny', 'puddle'] as const)) {
        const pts = lanePoints(lane);
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
        g.stroke();
      }
      for (const b of bushList()) {
        const x = b.x;
          const ax = this.X(x - b.w / 2);
          const bx = this.X(x + b.w / 2);
          const ay = this.Y(b.y + b.h / 2);
          const by = this.Y(b.y - b.h / 2);
          const rx = Math.min(ax, bx);
          const ry = Math.min(ay, by);
          const rw = Math.abs(bx - ax);
          const rh = Math.abs(by - ay);
          g.fillStyle = MM_GROUND.bush;
          g.strokeStyle = MM_GROUND.bushEdge;
          g.lineWidth = 1;
          roundRectPath(g, rx, ry, rw, rh, Math.min(rw, rh) * 0.35);
          g.fill();
          g.stroke();
          // a dot texture: leaves, not a flat block of forest
          g.fillStyle = 'rgba(30,70,25,0.55)';
          for (let a = 0; a < 3; a++) for (let c = 0; c < 2; c++) g.fillRect(rx + rw * (0.3 + c * 0.4) - 0.5, ry + rh * (0.2 + a * 0.3) - 0.5, 1.2, 1.2);
        }
      // MAP-GAPS A9: each base tinted by relation (ours ally blue, theirs enemy), whichever species or side we play
      const rel = minimapRelation(colourBlind());
      const myTeam = this.host.myTeam();
      for (const team of [0, 1]) {
        const [cx, cy] = basePt(team, CORE);
        g.fillStyle = team === myTeam ? rel.ally : rel.enemy;
        g.globalAlpha = 0.3;
        g.beginPath();
        g.arc(this.X(cx), this.Y(cy), (isPoint() ? 16000 : 10000) * this.map.k, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        const [fx, fy] = basePt(team, FOUNTAIN);
        g.fillStyle = '#bfe8ff';
        g.beginPath();
        g.arc(this.X(fx), this.Y(fy), 3, 0, Math.PI * 2);
        g.fill();
      }
      // MAP-GAPS A19: static landmarks, dimmed: the rat camps (a ring and a dot), Pudding's pit (a violet ring), and
      // each lane's glyph (a sun, a puddle) with its name on desktop
      g.globalAlpha = 0.7;
      const camps = isPoint()
        ? mapInfo('hearthwood').camps.map((c) => ({ x: c.x, y: c.y, kind: c.kind }))
        : [RAT_CAMP.x, mirrorX(RAT_CAMP.x)].map((x) => ({ x, y: RAT_CAMP.y, kind: 'rat' }));
      for (const cp of camps) {
        const buff = cp.kind === 'prickle' || cp.kind === 'crow';
        g.strokeStyle = MM_OUTLINE;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(this.X(cp.x), this.Y(cp.y), (buff ? 3.6 : 2.8) * this.k, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = MM_CAMP[cp.kind] ?? '#cdb784';
        g.beginPath();
        g.arc(this.X(cp.x), this.Y(cp.y), (buff ? 2 : 1.4) * this.k, 0, Math.PI * 2);
        g.fill();
      }
      const pits = isPoint() ? mapInfo('hearthwood').objectives : [{ kind: 'pudding' as const, x: PUDDING_SPOT.x, y: PUDDING_SPOT.y }];
      for (const o of pits) {
        g.strokeStyle = o.kind === 'grizzlechop' ? MM_BOSS : MM_OBJECTIVE;
        g.lineWidth = 1.4;
        g.setLineDash([2, 2]);
        g.beginPath();
        g.arc(this.X(o.x), this.Y(o.y), 6.5 * this.k, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      g.globalAlpha = 1;
    });
    const desktop = typeof document === 'undefined' || document.documentElement?.dataset.touch !== '1';
    for (const lane of isPoint() ? [] : (['sunny', 'puddle'] as const)) {
      const at = LANE_GLYPH_AT[lane]!;
      const [x, y] = this.P(at.x, at.y);
      const r = 2.6 * Math.max(0.85, this.k);
      g.fillStyle = MM_OUTLINE;
      g.beginPath();
      g.arc(x, y, r + 2, 0, Math.PI * 2);
      g.fill();
      if (lane === 'sunny') {
        g.fillStyle = '#ffd166';
        g.beginPath();
        g.arc(x, y, r * 0.55, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ffd166';
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
          g.lineTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05);
        }
        g.stroke();
      } else {
        g.fillStyle = '#7fd4ff';
        g.beginPath();
        g.moveTo(x, y - r);
        g.quadraticCurveTo(x + r * 0.9, y + r * 0.1, x, y + r * 0.8);
        g.quadraticCurveTo(x - r * 0.9, y + r * 0.1, x, y - r);
        g.fill();
      }
      if (desktop) {
        g.font = `700 ${(7.5 * Math.max(0.9, this.k)).toFixed(1)}px Fredoka, system-ui, sans-serif`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.lineWidth = 2.5;
        g.strokeStyle = MM_OUTLINE;
        const name = lane === 'sunny' ? 'Sunny' : 'Puddle';
        g.strokeText(name, x + r + 4, y + 0.5);
        g.fillStyle = '#fff3dc';
        g.fillText(name, x + r + 4, y + 0.5);
      }
    }
    return c;
  }

  /** Pulsing rings on the minimap (core under attack), sim mm, until `until` (ms, performance clock). */
  private pings: { x: number; y: number; color: string; until: number; kind: PingKind | null }[] = [];
  /** MAP-GAPS A10: `kind` draws its glyph in a dark bubble inside the ring. */
  ping(xMm: number, yMm: number, color: string, ms = 3000, kind: PingKind | null = null): void {
    this.pings.push({ x: xMm, y: yMm, color, until: performance.now() + ms, kind });
    this.dirty = true;
  }
  /** Glyph bubbles drawn last frame (tests). */
  glyphsDrawn = 0;

  /**
   * MAP-GAPS A11: where each enemy hero was last seen (sim mm) and at which tick, from the snapshot only. For
   * GHOST_S s after it leaves our sight alive (not dead, not napping home) a faded mark with a "?" stays there.
   */
  private lastSeen = new Map<number, { x: number; y: number; hero: HeroId | undefined; tick: number; napping: boolean }>();
  /** Ghost marks drawn last frame, by hero id (tests). */
  ghostsDrawn: number[] = [];

  private updateGhosts(frame: ViewFrame, myTeam: number): { id: number; x: number; y: number; hero: HeroId | undefined; age: number }[] {
    const out: { id: number; x: number; y: number; hero: HeroId | undefined; age: number }[] = [];
    const tick = frame.tick;
    for (const e of frame.entities) {
      if (e.kind !== 'hero' || e.team === myTeam) continue;
      if (e.state === 'dead') this.lastSeen.delete(e.id);
      else this.lastSeen.set(e.id, { x: e.fx, y: e.fy, hero: e.hero, tick, napping: e.state === 'napping' });
    }
    for (const [id, g] of this.lastSeen) {
      if (frame.byId.has(id)) continue;
      const age = (tick - g.tick) / 30;
      if (g.napping || age > GHOST_S || age < 0) {
        this.lastSeen.delete(id);
        continue;
      }
      out.push({ id, x: g.x, y: g.y, hero: g.hero, age });
    }
    return out;
  }

  /** MAP-GAPS A19: lanes flashing until (ms, performance clock). */
  private flashes: { lane: LaneId; until: number }[] = [];
  /** Lane flashes drawn last frame (tests). */
  lanesFlashed = 0;
  /** Flash `lane` for LANE_FLASH_MS (an announcement or a ping named it). */
  flashLane(lane: LaneId): void {
    this.flashes = this.flashes.filter((f) => f.lane !== lane);
    this.flashes.push({ lane, until: performance.now() + LANE_FLASH_MS });
  }

  private cleared: boolean[] = [];
  /** Cleared bushes drawn last frame (tests). */
  bushesCleared = 0;

  /** MAP-GAPS A18: every tower seen this match (sim mm), so a fallen one keeps its mark. */
  private towers = new Map<number, { x: number; y: number; team: number }>();
  /** Fallen tower marks drawn last frame (tests). */
  fallenDrawn = 0;

  /** MAP-GAPS A10: the lane Pudding's escort walks, once it shows (null: no escort). */
  escortLane: LaneId | null = null;
  private escorting = false;
  /** Sim events the minimap reads (the Pudding escort's start and end, a hero's death for the ghosts). */
  event(ev: SimEvent): void {
    if (ev.type === 'death') {
      this.lastSeen.delete(ev.id);
      this.dirty = true;
    }
    if (ev.type !== 'pudding') return;
    if (ev.what === 'escort') this.escorting = true;
    else if (ev.what === 'leave' || ev.what === 'spawn' || ev.what === 'calmed') {
      this.escorting = false;
      this.escortLane = null;
    }
  }

  /** Stroke a lane's whole centre line (both halves). */
  private strokeLane(g: CanvasRenderingContext2D, lane: LaneId, color: string, width: number): void {
    const pts = lanePoints(lane);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    this.turned(g, () => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
      g.stroke();
    });
  }

  /** Pickups on the ground (sim mm): a glowing dot each (fun plan F2 item 8). Set by the match session. */
  /** Party play (§7 M1): a friend's ring colour by slot (null: a bot or solo). */
  ringOf: (slot: number) => string | null = () => null;
  pickups: () => readonly { x: number; y: number; kind: 'frenzy' | 'snack' }[] = () => [];

  /** GAPS A4: objective countdowns (sim mm; ticks left of total). A ring fills as the timer runs out. */
  timers: () => readonly { key: string; x: number; y: number; left: number; total: number }[] = () => [];

  /** Rings drawn last frame (e2e and tests). */
  ringsDrawn = 0;

  private drawTimers(): void {
    let n = 0;
    const rel = minimapRelation(colourBlind());
    for (const t of this.timers()) {
      if (t.left <= 0 || t.total <= 0) continue;
      const [x, y] = this.P(t.x, t.y);
      // PERF-IOS §8 Track A: the ring fills in 1/64 steps, one sprite per step and second shown
      const done = Math.round(Math.max(0, Math.min(1, 1 - t.left / t.total)) * 64) / 64;
      const r = 6 * this.k;
      const color = t.key === 'pudding' ? MM_OBJECTIVE : t.key === 'grizzlechop' ? MM_BOSS : t.key === 'rats' ? rel.ally : rel.enemy;
      const secs = Math.ceil(t.left / 30);
      this.blit(
        this.sprite(`t|${color}|${done}|${secs <= 99 ? secs : ''}|${r}`, 2 * r + 6, 2 * r + 6, (g) => {
          g.fillStyle = 'rgba(42,26,34,0.75)';
          g.beginPath();
          g.arc(0, 0, r + 2, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(255,243,220,0.35)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.stroke();
          g.strokeStyle = color;
          g.beginPath();
          g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2);
          g.stroke();
          if (secs <= 99) {
            g.fillStyle = '#fff3dc';
            g.font = '700 7px Fredoka, system-ui, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(secs), 0, 0.5);
          }
        }),
        x,
        y,
      );
      n++;
    }
    this.ringsDrawn = n;
  }

  /** What the last redraw showed (PERF-IOS §8 Track A: an unchanged, still frame is not redrawn: a paused match). */
  private lastSig = '';
  /** Redraws skipped because nothing changed (tests). */
  stillSkips = 0;

  draw(frame: ViewFrame | null): void {
    const now0 = performance.now();
    if (!this.dirty && now0 < this.nextDraw) return;
    this.nextDraw = now0 + 1000 / Math.max(1, this.hz) - 2;
    // nothing moves (the render clock stopped: pause, a frozen end screen) and nothing animates: keep the last image
    const q0 = this.host.viewQuad()?.[0];
    const sig = frame ? `${frame.tick}|${q0 ? `${q0.x.toFixed(2)},${q0.z.toFixed(2)}` : ''}` : '';
    const animating = this.pings.length > 0 || this.flashes.length > 0 || this.moveGoal !== null;
    if (!this.dirty && sig && sig === this.lastSig && !animating) {
      this.stillSkips++;
      return;
    }
    this.lastSig = sig;
    this.dirty = false;
    this.size();
    const g = this.g;
    if (!g || !this.bg) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!frame) return;
    this.heroesDrawn = [];
    this.minionsDrawn = { square: 0, diamond: 0, dot: 0 };
    const me = this.host.mySlot();
    const team = this.host.myTeam();
    // MAP-GAPS A10: the lane Pudding's escort walks, from the moment it leaves its spot
    if (this.escorting && !this.escortLane && !isPoint()) {
      const pud = frame.entities.find((e) => e.kind === 'pudding' && e.state !== 'dead');
      if (pud && Math.abs(pud.fy - PUDDING_SPOT.y) > 2500) this.escortLane = pud.fy > PUDDING_SPOT.y ? 'sunny' : 'puddle';
    }
    {
      const now = performance.now();
      this.flashes = this.flashes.filter((f) => f.until > now);
      this.lanesFlashed = 0;
      for (const f of this.flashes) {
        const left = (f.until - now) / LANE_FLASH_MS;
        g.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(left * Math.PI * 3));
        this.strokeLane(g, f.lane, '#fff3dc', 4 * this.k);
        g.globalAlpha = 1;
        this.lanesFlashed++;
      }
    }
    if (this.escortLane) {
      g.globalAlpha = 0.45 + 0.2 * Math.sin(performance.now() / 260);
      this.strokeLane(g, this.escortLane, MM_OBJECTIVE, 3 * this.k);
      g.globalAlpha = 1;
    }
    const rel = minimapRelation(colourBlind());
    const col = (t: number, id: number): string => (id === me ? rel.self : t === 2 ? rel.neutral : t === team ? rel.ally : rel.enemy);
    // PERF-IOS §8 Track A: the cleared bushes, fallen towers and standing towers and cores change a few times a match:
    // they are painted into one layer, repainted only when one of them changes, and drawn with one drawImage
    clearedBushes(frame.entities, team, this.cleared);
    for (const e of frame.entities) if (e.kind === 'tower' && !this.towers.has(e.id)) this.towers.set(e.id, { x: e.fx, y: e.fy, team: e.team });
    let key = `${rel.ally}${rel.enemy}${me}|${team}|`;
    for (let i = 0; i < this.cleared.length; i++) key += this.cleared[i] ? '1' : '0';
    key += '|';
    for (const e of frame.entities) if ((e.kind === 'tower' || e.kind === 'core') && e.state !== 'dead' && e.hp > 0) key += `${e.id}.${e.team},`;
    this.structures(key, frame, col);
    if (this.layer) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.layer, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    // PERF-IOS §8 Track A: unit marks are cached sprites (one drawImage each instead of ~10 path calls)
    let sq = 0;
    let dia = 0;
    let dot = 0;
    for (const e of frame.entities) {
      if (e.state === 'dead' || e.kind === 'fountain' || e.kind === 'hero' || e.kind === 'tower' || e.kind === 'core' || (e.kind as string) === 'pickup') continue;
      const [x, y] = this.P(e.fx, e.fy);
      if (e.kind === 'boss') {
        // sim v19: Captain Grizzlechop, a rust disc with a dark tricorn
        const s = 7 * this.k;
        this.blit(this.sprite(`boss|${s}`, s + 4, s + 4, (c) => drawBoss(c, 0, 0, s)), x, y);
        continue;
      }
      if (e.kind === 'pudding') {
        // MAP-GAPS A8: an objective-violet rounded square with a dark outline and a heart glyph
        const s = 6 * this.k;
        this.blit(this.sprite(`pud|${s}`, s + 4, s + 4, (c) => drawPudding(c, 0, 0, s)), x, y);
        continue;
      }
      const relKind = e.team === 2 ? 'neutral' : e.team === team ? 'ally' : 'enemy';
      const color = col(e.team, e.id);
      const h = 1.8 * this.k;
      const box = 2 * (h * 1.45 + 1.1) + 2;
      this.blit(this.sprite(`m|${relKind}|${color}|${h}`, box, box, (c) => drawMinionMark(c, 0, 0, h, color, relKind)), x, y);
      if (relKind === 'enemy') dia++;
      else if (relKind === 'ally') sq++;
      else dot++;
    }
    this.minionsDrawn = { square: sq, diamond: dia, dot };
    // the pickups' glow in 6 steps (one sprite each)
    const glowStep = Math.round((0.5 + 0.5 * Math.sin(performance.now() / 180)) * 5);
    const glow = 0.6 + 0.4 * (glowStep / 2.5 - 1);
    for (const p of this.pickups()) {
      const [x, y] = this.P(p.x, p.y);
      const r = 7 * this.k;
      this.blit(
        this.sprite(`pk|${p.kind}|${glowStep}|${r}`, 2 * r + 2, 2 * r + 2, (c) => {
          c.fillStyle = p.kind === 'frenzy' ? `rgba(125,255,138,${(0.35 * glow).toFixed(3)})` : `rgba(255,166,77,${(0.3 * glow).toFixed(3)})`;
          c.beginPath();
          c.arc(0, 0, r, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = p.kind === 'frenzy' ? '#7dff8a' : '#ffa64d';
          c.beginPath();
          c.arc(0, 0, 3 * this.k, 0, Math.PI * 2);
          c.fill();
        }),
        x,
        y,
      );
    }
    this.drawTimers();
    this.ghostsDrawn = [];
    for (const gh of this.updateGhosts(frame, team)) {
      // faded and desaturated, a shrinking ring and a "?"
      const [x, y] = this.P(gh.x, gh.y);
      const r = this.heroR(false);
      const left = 1 - gh.age / GHOST_S;
      g.globalAlpha = 0.35 + 0.3 * left;
      g.fillStyle = '#6b6470';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = rel.enemy;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x, y, r + 1 + 3 * left, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#fff3dc';
      g.font = `800 ${(r * 1.5).toFixed(1)}px Fredoka, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', x, y + 0.4);
      g.globalAlpha = 1;
      this.ghostsDrawn.push(gh.id);
    }
    const heroes = frame.entities.filter((e) => e.kind === 'hero' && e.state !== 'dead');
    const ids = heroes.map((e) => e.hero).filter((h): h is HeroId => !!h);
    for (const e of heroDrawOrder(heroes, me)) {
      const self = e.id === me;
      const [x, y] = this.P(e.fx, e.fy);
      const color = col(e.team, e.id);
      const ring = self ? null : this.ringOf(e.id);
      const mates = ids.filter((_, i) => heroes[i].team === e.team);
      const r = this.heroR(self);
      const inner = r - (self ? 1.8 : 1.3) * Math.min(1, this.k);
      const pic = e.hero && inner * 2 >= PORTRAIT_MIN_PX ? this.portrait(e.hero, Math.round(inner * 2 * this.dpr)) : null;
      const initial = !pic && e.hero ? heroInitial(e.hero, mates) : '';
      const box = 2 * (r + 3.2);
      this.blit(this.sprite(`h|${e.hero}|${color}|${self ? 1 : 0}|${ring}|${pic ? 'p' : initial}|${r}`, box, box, (c) => this.drawHero(c, 0, 0, e.hero, color, self, ring, mates)), x, y);
      this.heroesDrawn.push(`${e.hero}:${pic ? 'p' : 'i'}`);
    }
    const now = performance.now();
    this.pings = this.pings.filter((p) => p.until > now);
    this.glyphsDrawn = 0;
    for (const p of this.pings) {
      const k = (now / 700) % 1;
      const [x, y] = this.P(p.x, p.y);
      g.strokeStyle = p.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, (5 + k * 12) * this.k, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      if (p.kind) {
        // MAP-GAPS A10: the kind's glyph in a dark bubble, so a ping reads by shape and not only by colour
        const r = 5.5 * Math.max(0.85, this.k);
        g.fillStyle = MM_OUTLINE;
        g.strokeStyle = p.color;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        const icon = pingGlyph(p.kind, Math.round(r * 1.5 * this.dpr), p.color);
        if (icon) g.drawImage(icon, x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
        this.glyphsDrawn++;
      }
    }
    const mg = this.moveGoal;
    if (mg) {
      const meE = frame.byId.get(me);
      if (performance.now() > mg.until || (meE && Math.hypot(meE.fx - mg.x, meE.fy - mg.y) < 1500)) this.moveGoal = null;
      else {
        g.strokeStyle = '#5ff0a8';
        g.lineWidth = 1.6;
        g.setLineDash([3, 2]);
        if (meE) {
          g.beginPath();
          g.moveTo(...this.P(meE.fx, meE.fy));
          g.lineTo(...this.P(mg.x, mg.y));
          g.stroke();
        }
        g.setLineDash([]);
        g.beginPath();
        g.arc(...this.P(mg.x, mg.y), 3.5 * Math.max(0.85, this.k), 0, Math.PI * 2);
        g.stroke();
      }
    }
    const q = this.host.viewQuad();
    if (q) {
      // MAP-GAPS A6: clamped into the inset map, so the quad stays closed at the map edge
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.2;
      g.beginPath();
      q.forEach((p, i) => {
        const [x, y] = this.map.clamp(...this.P(p.x * 1000, -p.z * 1000));
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.stroke();
    }
  }

  /** Minion marks drawn last frame by shape (tests): squares (allies), diamonds (enemies), dots (camp). */
  minionsDrawn = { square: 0, diamond: 0, dot: 0 };

  /** PERF-IOS §8 Track A: small sprites (unit marks, hero marks) painted once at the canvas DPR, by key. */
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private spriteDpr = 0;
  private sprite(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
    if (this.spriteDpr !== this.dpr || this.sprites.size > 256) {
      this.sprites.clear();
      this.spriteDpr = this.dpr;
    }
    const hit = this.sprites.get(key);
    if (hit) return hit;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil((w * this.dpr) / 2) * 2);
    c.height = Math.max(2, Math.ceil((h * this.dpr) / 2) * 2);
    const g = c.getContext('2d');
    if (!g) return null;
    g.setTransform(this.dpr, 0, 0, this.dpr, c.width / 2, c.height / 2);
    paint(g);
    this.sprites.set(key, c);
    return c;
  }

  /** Draw a sprite centred on (x, y) CSS px, on whole device px (1:1, no resampling blur). */
  private blit(c: HTMLCanvasElement | null, x: number, y: number): void {
    const g = this.g;
    if (!c || !g) return;
    const d = this.dpr;
    g.drawImage(c, Math.round(x * d - c.width / 2) / d, Math.round(y * d - c.height / 2) / d, c.width / d, c.height / d);
  }

  /** The structures layer (cleared bushes, fallen and standing towers, cores) and the key it was painted for. */
  private layer: HTMLCanvasElement | null = null;
  private layerKey = '';
  private layerFallen = 0;
  private layerBushes = 0;
  /** Layer repaints so far (tests). */
  layerPaints = 0;

  private structures(key: string, frame: ViewFrame, col: (t: number, id: number) => string): void {
    const full = `${key}|${this.w}x${this.h}@${this.dpr}|${this.bgKeyNow}`;
    if (this.layer && full === this.layerKey) {
      this.fallenDrawn = this.layerFallen;
      this.bushesCleared = this.layerBushes;
      return;
    }
    this.layerKey = full;
    this.layerPaints++;
    const c = this.layer ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!c) return;
    c.width = this.w * this.dpr;
    c.height = this.h * this.dpr;
    const g = c.getContext('2d');
    this.layer = c;
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // MAP-GAPS A20: a bush an ally stands in is cleared: lighter, so the unscouted ones stand out
    this.bushesCleared = 0;
    g.fillStyle = MM_BUSH_CLEARED;
    const bl = bushList();
    for (let i = 0; i < bl.length; i++) {
        if (!this.cleared[i]) continue;
        const b = bl[i];
        const x = b.x;
        const ax = this.X(x - b.w / 2);
        const bx = this.X(x + b.w / 2);
        const ay = this.Y(b.y + b.h / 2);
        const by = this.Y(b.y - b.h / 2);
        const rw = Math.abs(bx - ax);
        const rh = Math.abs(by - ay);
        this.turned(g, () => {
          roundRectPath(g, Math.min(ax, bx), Math.min(ay, by), rw, rh, Math.min(rw, rh) * 0.35);
          g.fill();
        });
        this.bushesCleared++;
      }
    // MAP-GAPS A18: a fallen tower stays as a greyed, crossed-out square where it stood
    this.fallenDrawn = 0;
    for (const [id, t] of this.towers) {
      const e = frame.byId.get(id);
      if (e && e.state !== 'dead' && e.hp > 0) continue;
      const [x, y] = this.P(t.x, t.y);
      const s = 6 * this.k;
      g.globalAlpha = 0.35;
      g.fillStyle = MM_OUTLINE;
      g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
      g.fillStyle = '#9a948c';
      g.fillRect(x - s / 2, y - s / 2, s, s);
      g.strokeStyle = MM_OUTLINE;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x - s / 2, y - s / 2);
      g.lineTo(x + s / 2, y + s / 2);
      g.moveTo(x + s / 2, y - s / 2);
      g.lineTo(x - s / 2, y + s / 2);
      g.stroke();
      g.globalAlpha = 1;
      this.fallenDrawn++;
    }
    for (const e of frame.entities) {
      if ((e.kind !== 'tower' && e.kind !== 'core') || e.state === 'dead' || e.hp <= 0) continue;
      const [x, y] = this.P(e.fx, e.fy);
      const s = (e.kind === 'core' ? 9 : 6) * this.k;
      g.fillStyle = MM_OUTLINE;
      g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
      g.fillStyle = col(e.team, e.id);
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    this.layerFallen = this.fallenDrawn;
    this.layerBushes = this.bushesCleared;
  }

  /** Hero marks drawn last frame, in order (tests and e2e): `id:kind` with kind `p` portrait or `i` initial. */
  heroesDrawn: string[] = [];
  private portraits = new Map<string, HTMLCanvasElement | null>();

  /** A round portrait of `hero` `d` px across (device px), from the baked HUD portrait; null until it has loaded. */
  private portrait(hero: HeroId, d: number): HTMLCanvasElement | null {
    const key = `${hero}|${d}`;
    if (this.portraits.has(key)) return this.portraits.get(key) ?? null;
    const url = portraitUrl(hero);
    if (!url || typeof Image === 'undefined') return null;
    this.portraits.set(key, null);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = d;
      const g = c.getContext('2d');
      if (!g) return;
      g.beginPath();
      g.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = HERO_COLOR_CSS[hero] ?? '#fff3dc';
      g.fillRect(0, 0, d, d);
      // the portrait frames head and shoulders: crop to the face
      g.drawImage(img, img.width * 0.14, img.height * 0.08, img.width * 0.72, img.height * 0.72, 0, 0, d, d);
      this.portraits.set(key, c);
    };
    img.src = url;
    return null;
  }

  /** MAP-GAPS A3: a hero's mark: its portrait (or its initial on a coat-coloured disc) in a relation-colour ring. */
  private drawHero(g: CanvasRenderingContext2D, x: number, y: number, hero: HeroId | undefined, color: string, self: boolean, ring: string | null, team: readonly HeroId[]): void {
    const r = this.heroR(self);
    g.fillStyle = MM_OUTLINE;
    g.beginPath();
    g.arc(x, y, r + 1.4, 0, Math.PI * 2);
    g.fill();
    const inner = r - (self ? 1.8 : 1.3) * Math.min(1, this.k);
    const pic = hero && inner * 2 >= PORTRAIT_MIN_PX ? this.portrait(hero, Math.round(inner * 2 * this.dpr)) : null;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (pic) {
      g.drawImage(pic, x - inner, y - inner, inner * 2, inner * 2);
    } else {
      g.fillStyle = hero ? (HERO_COLOR_CSS[hero] ?? '#fff3dc') : '#fff3dc';
      g.beginPath();
      g.arc(x, y, inner, 0, Math.PI * 2);
      g.fill();
      if (hero) {
        const t = heroInitial(hero, team);
        g.fillStyle = '#2a1a22';
        g.font = `800 ${(inner * (t.length > 1 ? 1.15 : 1.5)).toFixed(1)}px Fredoka, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(t, x, y + 0.4);
      }
    }
    // party play (§7 M1): a friend's mark wears its slot ring colour
    if (ring) {
      g.strokeStyle = ring;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, r + 2.2, 0, Math.PI * 2);
      g.stroke();
    }
  }

  dispose(): void {
    this.ro?.disconnect();
    this.root.remove();
  }
}
