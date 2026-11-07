/**
 * Minimap (POC.md §3, §9): lanes, river, structures, units and the camera's view on a small 2D canvas. Desktop:
 * left-click looks there, right-click moves there. Touch: tap to peek for a moment. GAPS A4: countdown rings on
 * Pudding's spot and the rat camps (onboarding/objectives.ts ObjectiveClock.timers). GAPS B1: a long press (touch)
 * or an Alt-click (desktop) pings "Go here" at that spot.
 */
import { NX, NY, createGrid, onPlayfield } from '../sim/map/grid';
import { BUSHES, CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, PUDDING_SPOT, mirrorX, type LaneId } from '../data/map';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS, RELATION_CSS, sidesSwapped } from '../render/palette';
import { portraitUrl } from '../render/portraits';
import { HERO_TEXT } from './heroText';
import type { HeroId, SimEvent } from '../sim/api';
import type { PingKind } from '../data/pings';
import { pingGlyph } from './pingGlyph';
import { applyMinimapSize, colourBlind } from './minimapPrefs';

export interface MinimapHost {
  /** Look at (x, z) m; `hold` s before the camera drifts back (Infinity: until the next look). */
  lookAt(xM: number, zM: number, hold?: number): void;
  moveTo(xMm: number, yMm: number): void;
  /** Ground corners (m, three.js X/Z) of the camera view, or null. */
  viewQuad(): { x: number; z: number }[] | null;
  mySlot(): number;
  myTeam(): number;
  /** GAPS B1: ping "Go here" at (x, y) mm. */
  goHere?(xMm: number, yMm: number): void;
}

/** GAPS B1: a touch held this long on the minimap pings "Go here". */
export const MINIMAP_HOLD_MS = 450;
/**
 * MAP-GAPS A2: touch scrub. A finger that moves more than `slopPx` from where it went down drags the camera over the
 * map (held while the finger is down) and lets it go `releaseS` s after the lift; a finger that stays inside the slop
 * for MINIMAP_HOLD_MS pings Go here and never moves the camera; a short tap peeks for `peekS` s.
 */
export const MINIMAP_TOUCH = Object.freeze({ slopPx: 6, releaseS: 0.6, peekS: 2.5 });

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
 * MAP-GAPS A6 (and A24's flip): the minimap mapping for a `w` × `h` px canvas: sim mm → canvas px, inset by `pad`,
 * and canvas px → sim mm (clamped to the map). `flip` turns the map 180° (a team-1 seat sees its base bottom left).
 */
export function minimapMapping(w: number, h: number, pad = MM_PAD, flip = false) {
  const iw = Math.max(1, w - 2 * pad);
  const ih = Math.max(1, h - 2 * pad);
  const fx = (x: number): number => (flip ? MAP.width - x : x);
  const fy = (y: number): number => (flip ? MAP.height - y : y);
  return {
    X: (xMm: number): number => pad + (fx(xMm) / MAP.width) * iw,
    Y: (yMm: number): number => pad + (1 - fy(yMm) / MAP.height) * ih,
    /** Canvas px → sim mm, clamped to the map. */
    inv: (px: number, py: number): { xMm: number; yMm: number } => {
      const u = Math.max(0, Math.min(1, (px - pad) / iw));
      const v = Math.max(0, Math.min(1, (py - pad) / ih));
      return { xMm: fx(u * MAP.width), yMm: fy((1 - v) * MAP.height) };
    },
    /** Clamp a canvas point into the inset rectangle (the view quad stays closed at the map edge). */
    clamp: (px: number, py: number): [number, number] => [Math.max(pad, Math.min(w - pad, px)), Math.max(pad, Math.min(h - pad, py))],
  };
}

/** MAP-GAPS A3: below this drawn diameter (CSS px) a hero is its initial; at and above it, its portrait. */
export const PORTRAIT_MIN_PX = 12;

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
  private n = 0;
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
  }

  private hold: ReturnType<typeof setTimeout> | null = null;
  /** The finger or mouse button on the minimap (MAP-GAPS A2): where it went down, and whether it scrubs or pinged. */
  private press: { id: number; touch: boolean; x0: number; y0: number; scrub: boolean; pinged: boolean; last: { xMm: number; yMm: number } } | null = null;

  private clearHold(): void {
    if (this.hold) clearTimeout(this.hold);
    this.hold = null;
  }

  private toMap(e: { clientX: number; clientY: number }): { xMm: number; yMm: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = r.width > 0 ? this.w / r.width : 1;
    const sy = r.height > 0 ? this.h / r.height : 1;
    return this.map.inv((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
  }

  private look(p: { xMm: number; yMm: number }, hold?: number): void {
    this.host.lookAt(p.xMm / 1000, -p.yMm / 1000, hold);
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
    this.press = { id: e.pointerId, touch, x0: e.clientX, y0: e.clientY, scrub: !touch, pinged: false, last: p };
    // desktop: a click looks there at once and a drag keeps scrubbing; touch waits to see a tap, a drag or a hold
    if (!touch) this.look(p, Infinity);
    else if (this.host.goHere) {
      this.clearHold();
      this.hold = setTimeout(() => {
        this.hold = null;
        if (!this.press || this.press.scrub) return;
        this.press.pinged = true;
        this.host.goHere?.(p.xMm, p.yMm);
      }, MINIMAP_HOLD_MS);
    }
  }

  private move(e: PointerEvent): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    e.preventDefault();
    const p = this.toMap(e);
    pr.last = p;
    if (!pr.scrub) {
      if (pr.pinged || Math.hypot(e.clientX - pr.x0, e.clientY - pr.y0) <= MINIMAP_TOUCH.slopPx) return;
      pr.scrub = true;
      this.clearHold();
    }
    this.look(p, Infinity);
  }

  private up(e: PointerEvent, cancel: boolean): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    this.press = null;
    this.clearHold();
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (pr.pinged) return;
    if (pr.scrub) this.look(pr.last, pr.touch ? MINIMAP_TOUCH.releaseS : MINIMAP_TOUCH.peekS);
    else if (!cancel) this.look(pr.last, MINIMAP_TOUCH.peekS);
  }

  private size(): void {
    const r = this.root.getBoundingClientRect();
    const w = Math.round(r.width) || 220;
    const h = Math.round(r.height) || 132;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = this.bgKey();
    if (w === this.w && h === this.h && dpr === this.dpr && this.bg && key === this.bgKeyNow) return;
    this.bgKeyNow = key;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.k = w / 196;
    this.map = minimapMapping(w, h, MM_PAD, this.flip);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.bg = this.paintBg();
  }

  /** MAP-GAPS A9: what the cached background depends on besides its size: our team, the flip, colours, species. */
  private bgKeyNow = '';
  private bgKey(): string {
    return `${this.host.myTeam()}|${this.flip ? 1 : 0}|${colourBlind() ? 1 : 0}|${sidesSwapped() ? 1 : 0}`;
  }
  /** Repaint the background on the next draw (species or side swap, a setting change). */
  invalidate(): void {
    this.bg = null;
  }
  /** Background repaints so far (tests). */
  bgPaints = 0;

  /** MAP-GAPS A6 / A24: the current mapping (inset, flipped for a team-1 seat). */
  private map = minimapMapping(this.w, this.h);
  private flip = false;
  readonly X = (xMm: number): number => this.map.X(xMm);
  readonly Y = (yMm: number): number => this.map.Y(yMm);

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
    const x0 = this.X(0);
    const x1 = this.X(MAP.width);
    const y0 = this.Y(MAP.height);
    const y1 = this.Y(0);
    g.fillStyle = MM_GROUND.grass;
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.fillStyle = MM_GROUND.river;
    const rx0 = this.X(MAP.riverX[0]);
    const rx1 = this.X(MAP.riverX[1]);
    g.fillRect(Math.min(rx0, rx1), Math.min(y0, y1), Math.abs(rx1 - rx0), Math.abs(y1 - y0));
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
    g.lineWidth = (MAP.laneWidth / MAP.width) * (this.w - 2 * MM_PAD) * 0.7;
    for (const lane of ['sunny', 'puddle'] as const) {
      const pts = LANE_WAYPOINTS[lane];
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
      for (let i = pts.length - 2; i >= 0; i--) g.lineTo(this.X(mirrorX(pts[i][0])), this.Y(pts[i][1]));
      g.stroke();
    }
    for (const b of BUSHES)
      for (const x of [b.x, mirrorX(b.x)]) {
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
      const cx = team === 0 ? CORE.x : mirrorX(CORE.x);
      g.fillStyle = team === myTeam ? rel.ally : rel.enemy;
      g.globalAlpha = 0.3;
      g.beginPath();
      g.arc(this.X(cx), this.Y(CORE.y), (10000 / MAP.width) * (this.w - 2 * MM_PAD), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      const fx = team === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x);
      g.fillStyle = '#bfe8ff';
      g.beginPath();
      g.arc(this.X(fx), this.Y(FOUNTAIN.y), 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  /** Pulsing rings on the minimap (core under attack), sim mm, until `until` (ms, performance clock). */
  private pings: { x: number; y: number; color: string; until: number; kind: PingKind | null }[] = [];
  /** MAP-GAPS A10: `kind` draws its glyph in a dark bubble inside the ring. */
  ping(xMm: number, yMm: number, color: string, ms = 3000, kind: PingKind | null = null): void {
    this.pings.push({ x: xMm, y: yMm, color, until: performance.now() + ms, kind });
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

  /** MAP-GAPS A10: the lane Pudding's escort walks, once it shows (null: no escort). */
  escortLane: LaneId | null = null;
  private escorting = false;
  /** Sim events the minimap reads (the Pudding escort's start and end, a hero's death for the ghosts). */
  event(ev: SimEvent): void {
    if (ev.type === 'death') this.lastSeen.delete(ev.id);
    if (ev.type !== 'pudding') return;
    if (ev.what === 'escort') this.escorting = true;
    else if (ev.what === 'leave' || ev.what === 'spawn' || ev.what === 'calmed') {
      this.escorting = false;
      this.escortLane = null;
    }
  }

  /** Stroke a lane's whole centre line (both halves). */
  private strokeLane(g: CanvasRenderingContext2D, lane: LaneId, color: string, width: number): void {
    const pts = LANE_WAYPOINTS[lane];
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
    for (let i = pts.length - 2; i >= 0; i--) g.lineTo(this.X(mirrorX(pts[i][0])), this.Y(pts[i][1]));
    g.stroke();
  }

  /** Pickups on the ground (sim mm): a glowing dot each (fun plan F2 item 8). Set by the match session. */
  /** Party play (§7 M1): a friend's ring colour by slot (null: a bot or solo). */
  ringOf: (slot: number) => string | null = () => null;
  pickups: () => readonly { x: number; y: number; kind: 'frenzy' | 'snack' }[] = () => [];

  /** GAPS A4: objective countdowns (sim mm; ticks left of total). A ring fills as the timer runs out. */
  timers: () => readonly { key: string; x: number; y: number; left: number; total: number }[] = () => [];

  /** Rings drawn last frame (e2e and tests). */
  ringsDrawn = 0;

  private drawTimers(g: CanvasRenderingContext2D): void {
    let n = 0;
    for (const t of this.timers()) {
      if (t.left <= 0 || t.total <= 0) continue;
      const x = this.X(t.x);
      const y = this.Y(t.y);
      const done = Math.max(0, Math.min(1, 1 - t.left / t.total));
      const r = 6 * this.k;
      const rel = minimapRelation(colourBlind());
      const color = t.key === 'pudding' ? MM_OBJECTIVE : t.key === 'rats' ? rel.ally : rel.enemy;
      g.fillStyle = 'rgba(42,26,34,0.75)';
      g.beginPath();
      g.arc(x, y, r + 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,243,220,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = color;
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2);
      g.stroke();
      const secs = Math.ceil(t.left / 30);
      if (secs <= 99) {
        g.fillStyle = '#fff3dc';
        g.font = '700 7px Fredoka, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(secs), x, y + 0.5);
      }
      n++;
    }
    this.ringsDrawn = n;
  }

  draw(frame: ViewFrame | null): void {
    if ((this.n++ & 1) === 1) return;
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
    if (this.escorting && !this.escortLane) {
      const pud = frame.entities.find((e) => e.kind === 'pudding' && e.state !== 'dead');
      if (pud && Math.abs(pud.fy - PUDDING_SPOT.y) > 2500) this.escortLane = pud.fy > PUDDING_SPOT.y ? 'sunny' : 'puddle';
    }
    if (this.escortLane) {
      g.globalAlpha = 0.45 + 0.2 * Math.sin(performance.now() / 260);
      this.strokeLane(g, this.escortLane, MM_OBJECTIVE, 3 * this.k);
      g.globalAlpha = 1;
    }
    const rel = minimapRelation(colourBlind());
    const col = (t: number, id: number): string => (id === me ? rel.self : t === 2 ? rel.neutral : t === team ? rel.ally : rel.enemy);
    for (const e of frame.entities) {
      if (e.state === 'dead' || e.kind === 'fountain' || e.kind === 'hero' || (e.kind as string) === 'pickup') continue;
      const x = this.X(e.fx);
      const y = this.Y(e.fy);
      if (e.kind === 'tower' || e.kind === 'core') {
        const s = (e.kind === 'core' ? 9 : 6) * this.k;
        g.fillStyle = MM_OUTLINE;
        g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
        g.fillStyle = col(e.team, e.id);
        g.fillRect(x - s / 2, y - s / 2, s, s);
      } else if (e.kind === 'pudding') {
        // MAP-GAPS A8: an objective-violet rounded square with a dark outline and a heart glyph
        const s = 6 * this.k;
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
      } else this.drawMinion(g, x, y, col(e.team, e.id), e.team === 2 ? 'neutral' : e.team === team ? 'ally' : 'enemy');
    }
    const glow = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    for (const p of this.pickups()) {
      const x = this.X(p.x);
      const y = this.Y(p.y);
      g.fillStyle = p.kind === 'frenzy' ? `rgba(125,255,138,${(0.35 * glow).toFixed(3)})` : `rgba(255,166,77,${(0.3 * glow).toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, 7 * this.k, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.kind === 'frenzy' ? '#7dff8a' : '#ffa64d';
      g.beginPath();
      g.arc(x, y, 3 * this.k, 0, Math.PI * 2);
      g.fill();
    }
    this.drawTimers(g);
    this.ghostsDrawn = [];
    for (const gh of this.updateGhosts(frame, team)) {
      // faded and desaturated, a shrinking ring and a "?"
      const x = this.X(gh.x);
      const y = this.Y(gh.y);
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
      this.drawHero(g, this.X(e.fx), this.Y(e.fy), e.hero, col(e.team, e.id), self, self ? null : this.ringOf(e.id), ids.filter((_, i) => heroes[i].team === e.team));
    }
    const now = performance.now();
    this.pings = this.pings.filter((p) => p.until > now);
    this.glyphsDrawn = 0;
    for (const p of this.pings) {
      const k = (now / 700) % 1;
      const x = this.X(p.x);
      const y = this.Y(p.y);
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
    const q = this.host.viewQuad();
    if (q) {
      // MAP-GAPS A6: clamped into the inset map, so the quad stays closed at the map edge
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.2;
      g.beginPath();
      q.forEach((p, i) => {
        const [x, y] = this.map.clamp(this.X(p.x * 1000), this.Y(-p.z * 1000));
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.stroke();
    }
  }

  /** Minion marks drawn last frame by shape (tests): squares (allies), diamonds (enemies), dots (camp). */
  minionsDrawn = { square: 0, diamond: 0, dot: 0 };

  /** MAP-GAPS A4: an outlined minion mark: an ally square, an enemy diamond (shape, not only hue), a camp dot. */
  private drawMinion(g: CanvasRenderingContext2D, x: number, y: number, color: string, rel: 'ally' | 'enemy' | 'neutral'): void {
    const h = 1.8 * this.k;
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
      this.minionsDrawn.diamond++;
    } else if (rel === 'ally') {
      g.fillStyle = MM_OUTLINE;
      g.fillRect(x - h - 0.9, y - h - 0.9, 2 * h + 1.8, 2 * h + 1.8);
      g.fillStyle = color;
      g.fillRect(x - h, y - h, 2 * h, 2 * h);
      this.minionsDrawn.square++;
    } else {
      g.fillStyle = MM_OUTLINE;
      g.beginPath();
      g.arc(x, y, h + 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, h, 0, Math.PI * 2);
      g.fill();
      this.minionsDrawn.dot++;
    }
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
      this.heroesDrawn.push(`${hero}:p`);
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
      this.heroesDrawn.push(`${hero}:i`);
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
    this.root.remove();
  }
}
