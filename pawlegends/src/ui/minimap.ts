/**
 * Minimap (POC.md §3, §9): lanes, river, structures, units and the camera's view on a small 2D canvas. Desktop:
 * left-click looks there, right-click moves there. Touch: tap to peek for a moment. GAPS A4: countdown rings on
 * Pudding's spot and the rat camps (onboarding/objectives.ts ObjectiveClock.timers). GAPS B1: a long press (touch)
 * or an Alt-click (desktop) pings "Go here" at that spot.
 */
import { NX, NY, createGrid } from '../sim/map/grid';
import { BUSHES, CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, mirrorX } from '../data/map';
import type { ViewFrame } from '../render/interp';
import { HERO_COLOR_CSS, RELATION_CSS } from '../render/palette';
import { portraitUrl } from '../render/portraits';
import { HERO_TEXT } from './heroText';
import type { HeroId } from '../sim/api';

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

/** MAP-GAPS A3: below this drawn diameter (CSS px) a hero is its initial; at and above it, its portrait. */
export const PORTRAIT_MIN_PX = 12;

export class Minimap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private bg: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null;
  private w = 220;
  private h = 132;
  private dpr = 1;
  private n = 0;

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
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    return { xMm: u * MAP.width, yMm: (1 - v) * MAP.height };
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
    if (w === this.w && h === this.h && dpr === this.dpr && this.bg) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.bg = this.paintBg();
  }

  private X = (xMm: number): number => (xMm / MAP.width) * this.w;
  private Y = (yMm: number): number => (1 - yMm / MAP.height) * this.h;

  private paintBg(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w * this.dpr;
    c.height = this.h * this.dpr;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    g.fillStyle = '#7fb86a';
    g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#6fb7e0';
    g.fillRect(this.X(MAP.riverX[0]), 0, this.X(MAP.riverX[1]) - this.X(MAP.riverX[0]), this.h);
    // sim v5: the forest outside the playfield (the nav grid's blocked cells), darker, so a right-click there reads as
    // "not walkable"
    const wall = createGrid().walls;
    g.fillStyle = '#3d6e3a';
    const cw = this.w / NX;
    const ch = this.h / NY;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (wall[j * NX + i]) g.fillRect(i * cw, this.h - (j + 1) * ch, cw + 0.5, ch + 0.5);
    g.strokeStyle = '#e6cf98';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = (MAP.laneWidth / MAP.width) * this.w * 0.7;
    for (const lane of ['sunny', 'puddle'] as const) {
      const pts = LANE_WAYPOINTS[lane];
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
      for (let i = pts.length - 2; i >= 0; i--) g.lineTo(this.X(mirrorX(pts[i][0])), this.Y(pts[i][1]));
      g.stroke();
    }
    g.fillStyle = '#3f8a46';
    for (const b of BUSHES)
      for (const x of [b.x, mirrorX(b.x)]) g.fillRect(this.X(x - b.w / 2), this.Y(b.y + b.h / 2), (b.w / MAP.width) * this.w, (b.h / MAP.height) * this.h);
    for (const team of [0, 1]) {
      const cx = team === 0 ? CORE.x : mirrorX(CORE.x);
      g.fillStyle = team === 0 ? 'rgba(255,111,145,0.35)' : 'rgba(150,92,30,0.45)';
      g.beginPath();
      g.arc(this.X(cx), this.Y(CORE.y), (10000 / MAP.width) * this.w, 0, Math.PI * 2);
      g.fill();
      const fx = team === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x);
      g.fillStyle = '#bfe8ff';
      g.beginPath();
      g.arc(this.X(fx), this.Y(FOUNTAIN.y), 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  /** Pulsing rings on the minimap (core under attack), sim mm, until `until` (ms, performance clock). */
  private pings: { x: number; y: number; color: string; until: number }[] = [];
  ping(xMm: number, yMm: number, color: string, ms = 3000): void {
    this.pings.push({ x: xMm, y: yMm, color, until: performance.now() + ms });
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
      const r = 6;
      const color = t.key === 'pudding' ? '#ffd34d' : t.key === 'rats' ? RELATION_CSS.ally : RELATION_CSS.enemy;
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
    const me = this.host.mySlot();
    const team = this.host.myTeam();
    const col = (t: number, id: number): string => (id === me ? RELATION_CSS.self : t === 2 ? RELATION_CSS.neutral : t === team ? RELATION_CSS.ally : RELATION_CSS.enemy);
    for (const e of frame.entities) {
      if (e.state === 'dead' || e.kind === 'fountain' || e.kind === 'hero' || (e.kind as string) === 'pickup') continue;
      const x = this.X(e.fx);
      const y = this.Y(e.fy);
      g.fillStyle = col(e.team, e.id);
      if (e.kind === 'tower' || e.kind === 'core') {
        const s = e.kind === 'core' ? 9 : 6;
        g.fillStyle = 'rgba(42,26,34,0.9)';
        g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
        g.fillStyle = col(e.team, e.id);
        g.fillRect(x - s / 2, y - s / 2, s, s);
      } else if (e.kind === 'pudding') {
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const glow = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    for (const p of this.pickups()) {
      const x = this.X(p.x);
      const y = this.Y(p.y);
      g.fillStyle = p.kind === 'frenzy' ? `rgba(125,255,138,${(0.35 * glow).toFixed(3)})` : `rgba(255,166,77,${(0.3 * glow).toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.kind === 'frenzy' ? '#7dff8a' : '#ffa64d';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    this.drawTimers(g);
    const heroes = frame.entities.filter((e) => e.kind === 'hero' && e.state !== 'dead');
    const ids = heroes.map((e) => e.hero).filter((h): h is HeroId => !!h);
    for (const e of heroDrawOrder(heroes, me)) {
      const self = e.id === me;
      this.drawHero(g, this.X(e.fx), this.Y(e.fy), e.hero, col(e.team, e.id), self, self ? null : this.ringOf(e.id), ids.filter((_, i) => heroes[i].team === e.team));
    }
    const now = performance.now();
    this.pings = this.pings.filter((p) => p.until > now);
    for (const p of this.pings) {
      const k = ((now / 700) % 1);
      g.strokeStyle = p.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.X(p.x), this.Y(p.y), 5 + k * 12, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    const q = this.host.viewQuad();
    if (q) {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.2;
      g.beginPath();
      q.forEach((p, i) => (i ? g.lineTo(this.X(p.x * 1000), this.Y(-p.z * 1000)) : g.moveTo(this.X(p.x * 1000), this.Y(-p.z * 1000))));
      g.closePath();
      g.stroke();
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
    const r = self ? 6 : 5;
    g.fillStyle = 'rgba(42,26,34,0.95)';
    g.beginPath();
    g.arc(x, y, r + 1.4, 0, Math.PI * 2);
    g.fill();
    const inner = r - (self ? 1.8 : 1.3);
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
