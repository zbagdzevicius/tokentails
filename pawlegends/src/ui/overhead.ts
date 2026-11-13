/**
 * Overhead bars: every visible unit's health (and shield) bar, hero levels and names, drawn in WebGL over the scene
 * in one draw call (PERF-IOS §8 Track A: render/overlay/; it was a full-screen 2D canvas redrawn every frame). Colours by relation, one encoding with the
 * rings and the minimap (self gold, allies rose, enemies blue, wild sand); minion bars are thinner, shorter and paler.
 *
 * Layering and declutter (teamfights): minion and structure bars draw first, then hero plates (enemies, allies, and
 * the player's own plate last, always on top). Hero plates are laid out in screen space: the player's plate stays on
 * its hero, and any other plate that would overlap one already placed moves up by a plate height (two heroes on one
 * spot get two readable plates, plus a "×2" chip on the lower one). Status (Rooted, Challenged...) is a small chip
 * right of the bar, not a text line under it, so a stacked plate never runs into the one below.
 *
 * Names: the player's plate reads "You"; when the same hero plays on both sides (bots may mirror a pick, POC.md
 * §6.8), the enemy copy carries its team name ("Woof Sage"), so two Sages never share one label.
 */
import { viewport } from '../render/perf/viewport';
import * as THREE from 'three';
import { liveRenderer } from '../render/renderer';
import { StampAtlas } from '../render/overlay/atlas';
import { QuadBatch } from '../render/overlay/quadBatch';
import { GlOverlay } from '../render/overlay/glOverlay';
import { BuffFlag } from '../sim/api';
import { damageState } from '../render/views/towerDamage';
import { drawFlame } from './flameGlyph';
import type { ViewEntity, ViewFrame } from '../render/interp';
import { MINION_BAR_CSS, RELATION_CSS, TEAM } from '../render/palette';
import { HERO_TEXT } from './heroText';
import { HEROES } from '../data/heroes';
import { XP } from '../data/xp';
import { cutName } from '../meta/cardName';

const LIFT: Record<ViewEntity['kind'], number> = { hero: 1.62, minion: 1.9, tower: 6.4, core: 5.2, fountain: 0, camp: 1.05, pudding: 3.8, pickup: 0, boss: 3 };
const SIZE: Record<ViewEntity['kind'], [number, number]> = { hero: [70, 9], minion: [24, 3], tower: [86, 8], core: [120, 10], fountain: [0, 0], camp: [44, 5], pudding: [110, 9], pickup: [0, 0], boss: [110, 9] };

interface Plate {
  e: ViewEntity;
  sx: number;
  sy: number;
  /** Draw order: 0 minions / camps, 1 structures, 2 enemy heroes, 3 ally heroes, 4 the player. */
  layer: number;
  /** Screen-space offset (px) from the declutter pass. */
  dy: number;
  stacked: number;
  /** Another hero's plate was lifted off this one (draw the ×2 chip). */
  chip: boolean;
  /** Audit GFX-04: a phone, an allied bot in a fight: its bar only (no name pill, crowns or chips). */
  bare?: boolean;
}

/**
 * Audit GFX-04 (phones): the allied bots whose plate goes bar-only: an ally that is not the player or a friend, with
 * an enemy hero's plate within FIGHT_PX of it on screen (a fight). Pure.
 */
export const FIGHT_PX = Object.freeze({ x: 150, y: 110 });
export function bareAllies(
  heroes: readonly { id: number; team: number; sx: number; sy: number }[],
  mySlot: number,
  myTeam: number,
  friends: ReadonlySet<number> = new Set(),
): Set<number> {
  const out = new Set<number>();
  const foes = heroes.filter((h) => h.team !== myTeam && h.team <= 1);
  for (const h of heroes) {
    if (h.id === mySlot || h.team !== myTeam || friends.has(h.id)) continue;
    if (foes.some((f) => Math.abs(f.sx - h.sx) <= FIGHT_PX.x && Math.abs(f.sy - h.sy) <= FIGHT_PX.y)) out.add(h.id);
  }
  return out;
}

/** Hero plate box (px, relative to the bar centre) used by the declutter pass: name above, level badge left. */
export function plateBox(scale: number, phone = false): { left: number; right: number; top: number; bottom: number } {
  const bw = SIZE.hero[0] * scale;
  const bh = heroBarH(phone);
  const nf = nameFont(phone);
  return { left: -bw / 2 - (bh + 6) - 4, right: bw / 2 + 3, top: -bh / 2 - 3 - nf - 6, bottom: bh / 2 + 3 };
}

/** LoL pass (lane C): hero bar height (px): 10 on desktop, 8 on a phone (short landscape, ≤ 480 px tall). */
export const heroBarH = (phone: boolean): number => (phone ? 8 : 10);
/** LoL pass (lane C): hero name size (px) above the bar: 11 on desktop, 9 on a phone. */
export const nameFont = (phone: boolean): number => (phone ? 9 : 11);

/** LoL pass (lane C): the trailing damage chunk on unit bars holds this long (ms) after a drop, then drains. */
export const CHUNK_HOLD_MS = 300;
/** ...at this many max HPs a second. */
export const CHUNK_RATE = 1.5;

/** A unit bar's trailing chunk: `trail` the HP its far edge shows, `hp` the last HP seen, `at` the last drop (ms), `t` the last step (ms). */
export interface HpChunk {
  trail: number;
  hp: number;
  at: number;
  t: number;
}

/**
 * LoL pass (lane C), pure: one step of a unit bar's trailing damage chunk. A drop keeps the chunk's far edge where it
 * was and restarts the hold; after CHUNK_HOLD_MS it drains at CHUNK_RATE × maxHp a second down to the HP. A heal (or
 * the first sight of the unit) snaps it: no chunk.
 */
export function chunkStep(prev: HpChunk | null, hp: number, maxHp: number, now: number): HpChunk {
  // first sight or a heal: snap (no chunk)
  if (!prev || hp > prev.hp) return { trail: hp, hp, at: -Infinity, t: now };
  // a drop: the far edge stays where it was, the hold restarts
  if (hp < prev.hp) return { trail: Math.max(prev.trail, prev.hp), hp, at: now, t: now };
  return { trail: drain(prev, hp, maxHp, now), hp, at: prev.at, t: now };
}

function drain(prev: HpChunk, hp: number, maxHp: number, now: number): number {
  const from = Math.max(prev.t, prev.at + CHUNK_HOLD_MS);
  if (now <= from) return prev.trail;
  return Math.max(hp, prev.trail - (CHUNK_RATE * Math.max(1, maxHp) * (now - from)) / 1000);
}

/**
 * Screen-space stacking (pure): plates in priority order (the first stays put); each later plate moves up by the
 * plate height above the plate it overlaps until it overlaps none placed before it. Returns the offsets (px, negative = up) and stack depths.
 */
export function declutter(pts: readonly { x: number; y: number }[], scale: number, maxSteps = 4, phone = false): { dy: number; depth: number }[] {
  const b = plateBox(scale, phone);
  const h = b.bottom - b.top + 2;
  const placed: { x: number; y: number }[] = [];
  const out: { dy: number; depth: number }[] = [];
  for (const p of pts) {
    let y = p.y;
    let depth = 0;
    for (let step = 0; step < maxSteps; step++) {
      const hit = placed.find((q) => Math.abs(q.x - p.x) < b.right - b.left && Math.abs(q.y - y) < h);
      if (!hit) break;
      // sit right above the plate it overlaps
      y = hit.y - h;
      depth++;
    }
    placed.push({ x: p.x, y });
    out.push({ dy: y - p.y, depth });
  }
  return out;
}

/**
 * Edge arrow placement (pure): where the ray from the screen centre toward a point (sx, sy) px leaves the screen
 * inset by `margin` px, kept below `safeTop` + margin (the top HUD band). Returns the spot and the arrow angle (rad,
 * screen space, 0 = right, +y down), or null when the point is the centre itself.
 */
export function edgeArrow(sx: number, sy: number, w: number, h: number, margin: number, safeTop = 0): { x: number; y: number; a: number } | null {
  const cx = w / 2;
  const cy = h / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  if (dx === 0 && dy === 0) return null;
  const k = Math.min((w / 2 - margin) / Math.max(1e-6, Math.abs(dx)), (h / 2 - margin) / Math.max(1e-6, Math.abs(dy)));
  return { x: cx + dx * k, y: Math.max(safeTop + margin, cy + dy * k), a: Math.atan2(dy, dx) };
}

type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * QA v2 #11: move an edge arrow of radius `r` px off the HUD boxes it lands on (the minimap, the portrait strips, the
 * kill feed): straight down under a box in the top half, up over one in the bottom half, at most 4 steps.
 */
export function clearOfRects(p: { x: number; y: number }, r: number, rects: readonly Rect[], h: number, w = Infinity): { x: number; y: number } {
  let { x, y } = p;
  // feel pass B5: an arrow on the top or bottom edge slides along it (sideways, toward the middle); one on a side edge
  // slides up or down, as before. More steps: the button arc is many small boxes.
  const onSide = !Number.isFinite(w) || x <= r * 3 || x >= w - r * 3;
  for (let step = 0; step < 10; step++) {
    const hit = rects.find((b) => x + r > b.left && x - r < b.right && y + r > b.top && y - r < b.bottom);
    if (!hit) break;
    if (onSide) y = (hit.top + hit.bottom) / 2 < h / 2 ? hit.bottom + r + 2 : hit.top - r - 2;
    else x = (hit.left + hit.right) / 2 < w / 2 ? hit.right + r + 2 : hit.left - r - 2;
  }
  return { x, y };
}

/** Is a screen point (px) outside a w × h view? (The player's own edge arrow shows then.) */
export const offScreen = (sx: number, sy: number, w: number, h: number): boolean => sx < 0 || sx > w || sy < 0 || sy > h;

/** Raspberry's charge ring state (sim v9, Shy, Then Shiny): a spark ring while Charged, a grey ring during the lockout. */
export interface ChargeRing {
  state: 'charged' | 'lockout' | '';
  /** Lockout left as a share of the full lockout (1 → 0), 0 otherwise. */
  frac: number;
  /** Lockout seconds left, rounded up (0 when not locked out). */
  secs: number;
}

/**
 * Pure: Raspberry's ring from a snapshot entity. `charged` is sent for both teams; `lockout` only for the viewer's own
 * team, so an enemy Raspberry shows the spark ring but never a lockout timer.
 */
export function chargeRing(e: Pick<ViewEntity, 'hero' | 'charged' | 'lockout' | 'state'>): ChargeRing {
  if (e.hero !== 'aviete' || e.state === 'dead') return { state: '', frac: 0, secs: 0 };
  if (e.charged) return { state: 'charged', frac: 0, secs: 0 };
  const t = e.lockout ?? 0;
  if (t <= 0) return { state: '', frac: 0, secs: 0 };
  const full = HEROES.aviete.passive.lockout ?? t;
  return { state: 'lockout', frac: Math.min(1, t / Math.max(1, full)), secs: Math.ceil(t / 30) };
}

/**
 * Lane F (F6), pure: an enemy hero ahead of the player on Toys gets a small crown with a pip per Toy it owns. Returns
 * the pips to draw (0 = none: an ally, a dead hero, or not ahead).
 */
export function fedPips(e: Pick<ViewEntity, 'kind' | 'team' | 'toy' | 'state'>, myTeam: number, myToy: number): number {
  if (e.kind !== 'hero' || e.team === myTeam || e.team === 2 || e.state === 'dead') return 0;
  const t = Math.max(0, e.toy ?? 0);
  return t > myToy ? t : 0;
}

/**
 * Pure: Duchess's Disdain pips on a hero plate (sim v11, Utter Disdain): how many of the `max` crowns are lit, from the
 * snapshot's `stacks` (sent for both teams). 0 for a dead hero or one with no stacks; `max` is her Snub threshold.
 */
export function disdainPips(e: Pick<ViewEntity, 'kind' | 'stacks' | 'state'>): { lit: number; max: number } {
  const max = HEROES.duchess.passive.stacks ?? 3;
  if (e.kind !== 'hero' || e.state === 'dead') return { lit: 0, max };
  return { lit: Math.min(max, Math.max(0, e.stacks ?? 0)), max };
}

/**
 * Pure: Domino's Spots on a hero plate (sim v15, Spot On): how many black spots to draw, from the snapshot's `dots`
 * (sent for both teams). 0 for a dead hero or one with no Spots; capped at 4 (Polka Dots raises his max to 4).
 */
export function spotPips(e: Pick<ViewEntity, 'kind' | 'dots' | 'state'>): number {
  if (e.kind !== 'hero' || e.state === 'dead') return 0;
  return Math.min(4, Math.max(0, e.dots ?? 0));
}

/**
 * Pure: Stilts's Stride meter (sim v11, Long Stride) as a share of full, from the snapshot's `resource` (sent to her own
 * team only); -1 when there is no meter to draw (another hero, an enemy Stilts, or dead).
 */
export function strideMeter(e: Pick<ViewEntity, 'hero' | 'resource' | 'state'>): number {
  if (e.hero !== 'stilts' || e.state === 'dead' || e.resource === undefined) return -1;
  const max = HEROES.stilts.passive.max ?? 100;
  return Math.min(1, Math.max(0, e.resource / Math.max(1, max)));
}

/**
 * PERF-IOS §8 Track A: overhead plates are drawn in WebGL over the scene (render/overlay/): rects and lines straight
 * into one quad batch, everything with text or curves as an atlas stamp painted once with the same Canvas 2D code.
 * One draw call a frame and no full-screen 2D canvas (it was 0.75 Mpx rasterised on the CPU every frame on iOS).
 */
const FONT = (weight: number, px: number): string => `${weight} ${px}px Fredoka, system-ui, sans-serif`;
const DANGER_RGB = '#ff3b4d';
const FOUNTAIN_RGB = '#ff4d5e';
const GUIDE_RGB = '#ffd34d';
/**
 * v6 facelift (Lightning Rivalry): the plates' own inks, scoped here (canvas code cannot read CSS tokens). Night
 * #12091F replaces the old cocoa ink, the plum-deep #471F5D level badge and the gold bevel come from the logo, cream is
 * v6 cream. Relation colours (ally / enemy / you / danger) stay RELATION_CSS: team colours leave the match at the door.
 */
const V6 = Object.freeze({
  night: '#12091f',
  night0: '#0a0612',
  night2: '#1c1230',
  night3: '#281a42',
  plum: '#633077',
  plumDeep: '#471f5d',
  cream: '#fff3e3',
  bolt: '#ffe14a',
  boltTop: '#fff08a',
  flame: '#ff8a1e',
  ice: '#d6ecff',
  gold1: '#fff1b8',
  gold2: '#f2c14e',
  gold3: '#a8741c',
  gold4: '#5e3d0c',
  logoGold: '#f7bc3c',
  xp: '#c9a8ff',
  /** rgba() of night at alpha a. */
  ink: (a: number): string => `rgba(18,9,31,${a})`,
});
/** v6 facelift: the −8° lean (px of horizontal shift per px of height) of name pills and status chips. */
const LEAN = Math.tan((8 * Math.PI) / 180);

/** v6 facelift: a parallelogram leaning −8° (top edge shifted right), centred like roundRect's box. */
function leanRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const d = (h * LEAN) / 2;
  g.beginPath();
  g.moveTo(x + d, y);
  g.lineTo(x + w + d, y);
  g.lineTo(x + w - d, y + h);
  g.lineTo(x - d, y + h);
  g.closePath();
}

export class Overhead {
  private readonly atlas = new StampAtlas();
  private readonly batch = new QuadBatch();
  private readonly gl = new GlOverlay(this.batch, this.atlas);
  /** The atlas's 2D context (stamps paint into it). Tests swap in a recording stand-in. */
  protected get g(): CanvasRenderingContext2D | null {
    return this.atlas.g;
  }
  protected set g(v: CanvasRenderingContext2D | null) {
    this.atlas.g = v;
  }
  private w = 0;
  private h = 0;
  private readonly v = new THREE.Vector3();
  private plates: Plate[] = [];
  private readonly platePool: Plate[] = [];
  mySlot = 0;
  myTeam = 0;
  scale = 1;
  /** Display names by slot ("Clem 2"; ui/heroText.ts slotNames); empty = hero titles. */
  names: readonly string[] = [];
  /**
   * Party play (MULTIPLAYER.md §7 M1, M4): the human slots' ring colour (slot 0 mint, 1 violet, 2 orange: app/mpTypes.ts SLOT_RING) and whether a
   * bot flies that hero now (from the TURN mode bits): a friend's name pill gets its ring; a bot-flown one a greyed
   * ring and a robot glyph. Null in solo matches.
   */
  seats: ReadonlyMap<number, { ring: string; bot: boolean }> | null = null;
  /** Round 1 tier perk: a Legendary frame owner's "You" sits on a gold name plate. */
  goldPlate = false;
  /** Card skins (GDD §7.2): the cat the player's hero wears, a small line over the own plate only (null = none). */
  catName: string | null = null;
  /** A Legendary card skin: an element gem beside the own name (CSS colour, null = none). */
  plateGem: string | null = null;
  /**
   * Where a hero is drawn (m), when the view moves bodies apart (render only): plates sit over the drawn body, not the
   * sim point (trailer review: bodies pushed apart still had their plates stacked on one spot). Null = the sim point.
   */
  heroAt: ((id: number) => { x: number; z: number } | null) | null = null;
  /** Draw the player's off-screen edge arrow (the trailer harness turns it off on shots that do not follow the player). */
  selfEdge = true;
  /**
   * Where a minion is drawn (m), or null when the minion view does not draw it this frame (inside a falling core's
   * clear zone): its bar follows the drawn body and is dropped with it (trailer review: bars floated over the core
   * rubble with no unit under them). Null hook = the sim point.
   */
  minionAt: ((id: number) => { x: number; z: number } | null) | null = null;
  /** The enemy heroes' off-screen edge arrows (the trailer's director shots turn them off: no HUD frames them). */
  edgeArrows = true;
  /** The status chips right of a hero bar (Stunned, Slowed...). */
  statusChips = true;
  /** The minion bars (the trailer thins a crowded base fight to the heroes and structures). */
  minionBars = true;
  /** The player's plate reads the hero's own name instead of "You" (trailer: the champion's name is the proof). */
  selfName = false;
  /** When set, every drawn plate's screen box (CSS px) and label is written here each frame (trailer QC). */
  boxes: { kind: string; id: number; name: string; x0: number; y0: number; x1: number; y1: number; dy: number }[] | null = null;
  /** Heroes picked on both teams this frame (their enemy copy gets a team prefix). */
  private mirrored = new Set<string>();
  private readonly seen: [Set<string>, Set<string>] = [new Set(), new Set()];
  /** The older 2D dashed tower-to-hero beam (off: the 3D tower beam replaces it). */
  flatBeams = false;
  /** Tower-to-hero warning beams (a tower is hitting the player): src and dst ids, seconds left. */
  private beams: { src: number; dst: number; t: number }[] = [];
  private lastDraw = 0;
  /** LoL pass (lane C): the trailing damage chunk per unit id (heroes and structures), and the frame it was last drawn. */
  private readonly chunks = new Map<number, HpChunk & { seen: number }>();
  private drawN = 0;
  /** A short landscape phone (≤ 480 px tall): the smaller LoL bar and name sizes. */
  private get phone(): boolean {
    return this.h > 0 && this.h <= 480;
  }
  /** The player's hero is off screen this frame (panned away): its projected point (px). */
  private selfOff = false;
  private selfSx = 0;
  private selfSy = 0;

  /** First match: a chevron trail on the ground from the player toward this point (sim mm), or null. */
  guide: { x: number; y: number } | null = null;
  /** Sim v9: heroes facing a Bengal mid Striking Pose wind-up (render/telegraph.ts poseWatchers): a "!" eye over them. */
  watchers: ReadonlySet<number> = new Set();
  /** Lane F (F6): the player's Toy tiers (enemies ahead of it get a crown with pips). */
  myToy = 0;

  /** Round 1: the enemy fountain's no-entry ring (sim mm), drawn while the player is near it; null = hidden. */
  enemyFountain: { x: number; y: number; r: number } | null = null;
  private fountainHit = 0;

  /** The player walked into the enemy fountain's wall: the ring ripples. */
  fountainPulse(): void {
    this.fountainHit = performance.now();
  }

  /**
   * Round 2: screen rectangles (CSS px) of the top HUD (HP panel, score bar). A plate that lands on one fades, so units
   * north of the hero no longer bury the HP panel and the score bar in name plates; edge arrows stay below the band.
   */
  hudRects: readonly { left: number; top: number; right: number; bottom: number }[] = [];
  /**
   * QA v2 #11, #14: the other HUD boxes (minimap, portrait strips, kill feed): edge arrows step off them and plates
   * under them fade, but they do not lower the top band (`safeTop`).
   */
  sideRects: readonly { left: number; top: number; right: number; bottom: number }[] = [];
  private get safeTop(): number {
    let b = 0;
    for (const r of this.hudRects) if (r.top < this.h / 3) b = Math.max(b, r.bottom);
    return b;
  }
  /** Does a hero plate centred at (x, y) touch a HUD rectangle? */
  private underHud(x: number, y: number): boolean {
    const box = plateBox(this.scale, this.phone);
    for (const rs of [this.hudRects, this.sideRects])
      for (const r of rs) if (x + box.right > r.left && x + box.left < r.right && y + box.bottom > r.top && y + box.top < r.bottom) return true;
    return false;
  }

  /** Round 2: enemy heroes off screen within this distance (mm) get an arrow at the screen edge. */
  static readonly EDGE_RANGE = 30000;

  /** GAPS A5: the touch-locked enemy hero and the share of its 5 s left (1..0): red brackets round its plate. */
  targetLock: { id: number; left: number } | null = null;

  /** Bounty crown per hero slot (fun plan F2 item 11): > 0 draws a gold crown over the plate. */
  bounty: (slot: number) => number = () => 0;

  /** Tower lock-ons (fun plan S5 / F2 item 9): src tower → dst hero, seconds left of `total`. */
  private locks: { src: number; dst: number; t: number; total: number }[] = [];

  /** An enemy tower is aiming at `dst` for `seconds`: a red line that thickens, and a ring under the hero. */
  lockOn(src: number, dst: number, seconds: number): void {
    const s = Math.max(0.2, seconds);
    const l = this.locks.find((q) => q.src === src && q.dst === dst);
    if (l) {
      l.t = s;
      l.total = s;
    } else this.locks.push({ src, dst, t: s, total: s });
  }

  /** Drop every lock-on aimed at `dst` (the player died, respawned or walked away). */
  clearLocks(dst: number): void {
    this.locks = this.locks.filter((l) => l.dst !== dst);
  }

  /**
   * Draw a red beam from a tower to the hero it hits, for a moment. LoL pass (lane C): the 3D tower beam
   * (render/fx/towerBeams.ts) now draws every tower shot, the player's in red with a flare, so this 2D dashed copy is
   * off by default (the trailer harness may still turn it on).
   */
  beam(src: number, dst: number, seconds = 0.7): void {
    if (!this.flatBeams) return;
    const b = this.beams.find((q) => q.src === src && q.dst === dst);
    if (b) b.t = seconds;
    else this.beams.push({ src, dst, t: seconds });
  }

  constructor(_parent?: HTMLElement) {
    this.batch.white = this.atlas.white;
  }

  /**
   * PERF-IOS P1-4: was the 2D canvas's DPR cap. The plates now draw into the game's drawing buffer at its own
   * resolution (the tier DPR × the governor's resolution scale), so this only applies when no renderer is live (tests).
   */
  maxDpr = 2;

  /** Overlay counters (perf readout, tests): quads this frame, stamps held, stamp paints and atlas uploads so far. */
  get stats(): { quads: number; stamps: number; paints: number; uploads: number; draws: number } {
    return { quads: this.batch.count, stamps: this.atlas.size, paints: this.atlas.paints, uploads: this.gl.uploads, draws: this.gl.draws };
  }

  private resize(): void {
    const v = viewport();
    if (v.w === this.w && v.h === this.h) return;
    this.w = v.w;
    this.h = v.h;
    // round 1: on short landscape phones (≤ 480 px tall) the 8 px names were unreadable in teamfights: × 1.5 there
    this.scale = this.h <= 480 ? 1.15 : Math.max(0.75, Math.min(1.1, Math.min(this.w, this.h) / 720));
  }

  private color(e: ViewEntity): string {
    if (e.id === this.mySlot) return RELATION_CSS.self;
    if (e.team === 2) return RELATION_CSS.neutral;
    const ours = e.team === this.myTeam;
    if (e.kind === 'minion') return ours ? MINION_BAR_CSS.ally : MINION_BAR_CSS.enemy;
    return ours ? RELATION_CSS.ally : RELATION_CSS.enemy;
  }

  private layerOf(e: ViewEntity): number {
    if (e.kind !== 'hero') return e.kind === 'tower' || e.kind === 'core' || e.kind === 'pudding' ? 1 : 0;
    if (e.id === this.mySlot) return 4;
    return e.team === this.myTeam ? 3 : 2;
  }

  private platePush(e: ViewEntity, sx: number, sy: number): void {
    const p = this.platePool[this.plates.length] ?? (this.platePool[this.plates.length] = { e, sx, sy, layer: 0, dy: 0, stacked: 0, chip: false });
    p.e = e;
    p.sx = sx;
    p.sy = sy;
    p.layer = this.layerOf(e);
    p.dy = 0;
    p.stacked = 0;
    p.chip = false;
    p.bare = false;
    this.plates.push(p);
  }

  draw(frame: ViewFrame | null, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    this.resize();
    const r = liveRenderer();
    const k = r ? r.domElement.width / Math.max(1, this.w) : Math.min(this.maxDpr, viewport().dpr);
    this.atlas.beginFrame(k);
    this.batch.begin(k);
    if (!frame) return;
    const v = this.v;
    const plates = this.plates;
    plates.length = 0;
    const seen = this.seen;
    seen[0].clear();
    seen[1].clear();
    this.mirrored.clear();
    for (const e of frame.entities) if (e.kind === 'hero' && e.hero && (e.team === 0 || e.team === 1)) seen[e.team].add(e.hero);
    for (const h of seen[0]) if (seen[1].has(h)) this.mirrored.add(h);
    const edge: { e: ViewEntity; sx: number; sy: number }[] = [];
    this.selfOff = false;
    for (const e of frame.entities) {
      if (e.kind === 'fountain' || e.state === 'dead' || e.maxHp <= 0 || e.hp <= 0 || !SIZE[e.kind] || SIZE[e.kind][0] === 0) continue;
      if (e.kind === 'minion' && !this.minionBars) continue;
      const lift = LIFT[e.kind] * (e.kind === 'hero' ? heroScale(e) : 1);
      let drawn = e.kind === 'hero' && this.heroAt ? this.heroAt(e.id) : null;
      if (e.kind === 'minion' && this.minionAt) {
        drawn = this.minionAt(e.id);
        // not drawn by the minion view this frame: no bar floating over empty ground
        if (!drawn) continue;
      }
      if (drawn) v.set(drawn.x, lift, drawn.z).project(camera);
      else v.set(e.fx / 1000, lift, -e.fy / 1000).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.w;
      const sy = (-v.y * 0.5 + 0.5) * this.h;
      if (e.id === this.mySlot && offScreen(sx, sy, this.w, this.h)) {
        this.selfOff = true;
        this.selfSx = sx;
        this.selfSy = sy;
      }
      if (sx < -80 || sx > this.w + 80 || sy < -40 || sy > this.h + 40) {
        if (e.kind === 'hero' && e.team !== this.myTeam && e.team !== 2) edge.push({ e, sx, sy });
        continue;
      }
      this.platePush(e, sx, sy);
    }
    // heroes: the player's plate first (stays on its hero), then allies, then enemies; lower plates on screen first
    const heroes = plates.filter((p) => p.layer >= 2).sort((a, b) => b.layer - a.layer || b.sy - a.sy);
    const lay = declutter(
      heroes.map((p) => ({ x: p.sx, y: p.sy })),
      this.scale,
      4,
      this.phone,
    );
    heroes.forEach((p, i) => {
      p.dy = lay[i].dy;
      p.stacked = lay[i].depth;
    });
    // GFX-04: on a phone, allied bots in a fight show their bar only (the plates, pills and chips buried the heroes)
    if (this.phone) {
      const bare = bareAllies(
        heroes.map((p) => ({ id: p.e.id, team: p.e.team, sx: p.sx, sy: p.sy })),
        this.mySlot,
        this.myTeam,
        new Set(this.seats?.keys() ?? []),
      );
      for (const p of heroes) p.bare = bare.has(p.e.id);
    }
    // ×2 chips: a plate that had to move marks the plate it sits over
    for (let i = 0; i < heroes.length; i++) {
      if (heroes[i].stacked === 0) continue;
      const below = heroes.find((q, k) => k < i && Math.abs(q.sx - heroes[i].sx) < 40 * this.scale && Math.abs(q.sy - heroes[i].sy) < 30 * this.scale);
      if (below) below.chip = true;
    }
    plates.sort((a, b) => a.layer - b.layer);
    this.drawN++;
    if (this.drawN % 60 === 0) for (const [id, c] of this.chunks) if (this.drawN - c.seen > 60) this.chunks.delete(id);
    this.drawBeams(frame, camera, heroScale);
    this.drawLocks(frame, camera, heroScale);
    this.drawGuide(frame, camera);
    this.drawFountain(camera);
    // QA v2 #14: a hero plate at the screen edge slides in (it showed half names, "Gravy the Bru"); a name is up to
    // ~7 px a letter wider than the bar
    const pb = plateBox(this.scale, this.phone);
    for (const p of plates) {
      if (p.e.kind !== 'hero' || !p.e.hero) continue;
      const half = Math.max(pb.right, (this.nameOf(p.e).length * nameFont(this.phone) * 0.56) / 2 + 4);
      if (p.sx < -half || p.sx > this.w + half) continue; // off screen: the edge arrow says it
      p.sx = Math.min(Math.max(p.sx, Math.max(-pb.left, half) + 2), this.w - half - 2);
    }
    const anyHud = this.hudRects.length > 0 || this.sideRects.length > 0;
    for (const p of plates) {
      const fade = anyHud && p.e.id !== this.mySlot && this.underHud(p.sx, p.sy + p.dy);
      this.batch.alpha = fade ? 0.28 : 1;
      this.plate(p);
    }
    this.batch.alpha = 1;
    if (this.boxes) {
      this.boxes.length = 0;
      for (const p of plates) this.boxes.push(this.boxOf(p));
    }
    if (this.edgeArrows) this.drawEdge(frame, edge);
    if (this.selfOff && this.selfEdge) this.drawSelfEdge();
    if (r) this.gl.draw(r);
  }

  /**
   * The player's hero is off screen (camera panned, minimap look): a gold arrow at the edge toward it, larger than the
   * enemy arrows and labelled "You" (Space re-centres).
   */
  private drawSelfEdge(): void {
    const sc = this.scale;
    const s = 14 * sc;
    const e0 = edgeArrow(this.selfSx, this.selfSy, this.w, this.h, 34 * sc, this.safeTop);
    if (!e0) return;
    const p = clearOfRects(e0, 18 * sc, this.sideRects, this.h, this.w);
    const pulse = 1 + Math.sin(performance.now() / 160) * 0.06;
    const tri = this.atlas.get(`sarrow|${sc}`, 2 * (2.1 * s + 4), 2 * (0.95 * s + 4), (g) => {
      g.beginPath();
      g.moveTo(s * 2.1, 0);
      g.lineTo(s * 0.85, -s * 0.95);
      g.lineTo(s * 0.85, s * 0.95);
      g.closePath();
      g.lineJoin = 'round';
      g.lineWidth = 3.5;
      g.strokeStyle = V6.night;
      g.stroke();
      g.fillStyle = RELATION_CSS.self;
      g.fill();
    });
    this.batch.stamp(tri, p.x, p.y, pulse, e0.a);
    const fs = Math.round(10 * sc);
    const disc = this.atlas.get(`sdisc|${sc}`, 2 * (1.2 * s + 3), 2 * (1.2 * s + 3), (g) => {
      g.beginPath();
      g.arc(0, 0, s * 1.2, 0, Math.PI * 2);
      g.fillStyle = V6.ink(0.92);
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = RELATION_CSS.self;
      g.stroke();
      g.fillStyle = RELATION_CSS.self;
      g.font = FONT(700, fs);
      g.fillText('You', 0, 0.5);
    });
    this.batch.stamp(disc, p.x, p.y, pulse);
  }

  /** Arc points (CSS px) into the batch's scratch: centre, radius, from angle `a0` over `span` rad, `n` segments. */
  private arcPts(cx: number, cy: number, r: number, a0: number, span: number, n: number): number {
    const P = this.batch.pts;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      P[2 * i] = cx + Math.cos(a) * r;
      P[2 * i + 1] = cy + Math.sin(a) * r;
    }
    return n + 1;
  }

  /**
   * Raspberry's charge around the level badge (sim v9): a flickering spark ring while Charged (both teams see it), a grey
   * ring that empties during her own lockout (Shiny Coat then gives speed only).
   */
  private chargeRing(e: ViewEntity, cx: number, cy: number, r: number): void {
    const c = chargeRing(e);
    if (!c.state) return;
    const sc = this.scale;
    const rr = r + 2.5 * sc;
    if (c.state === 'charged') {
      // the flicker: four glow levels (the stamp per level is painted once)
      const lvl = Math.round((Math.sin(performance.now() / 60) + 1) * 1.5);
      const blur = (6 + (lvl / 1.5 - 1) * 3) * sc;
      const box = 2 * (rr + 1.5 * sc + blur + 2);
      const s = this.atlas.get(`chg|${rr.toFixed(2)}|${lvl}|${sc}`, box, box, (g) => {
        g.lineCap = 'round';
        g.lineWidth = 3 * sc;
        g.strokeStyle = V6.bolt;
        g.shadowColor = V6.boltTop;
        g.shadowBlur = blur;
        g.beginPath();
        g.arc(0, 0, rr, 0, Math.PI * 2);
        g.stroke();
      });
      this.batch.stamp(s, cx, cy);
      return;
    }
    const n = Math.max(2, Math.ceil(32 * c.frac));
    this.batch.polyline(this.batch.pts, this.arcPts(cx, cy, rr, -Math.PI / 2, Math.PI * 2 * c.frac, n), false, 2.5 * sc, 'rgba(160,156,170,0.95)');
  }

  /**
   * Sim v9: the Striking Pose "!" eye glyph right of a hero's name: this hero faces a Bengal winding up the pose and
   * will be stunned (turn away and it is only a slow).
   */
  private eyeGlyph(cx: number, cy: number): void {
    const sc = this.scale;
    const s = 9 * sc;
    const pop = 1 + Math.sin(performance.now() / 70) * 0.08;
    const st = this.atlas.get(`eye|${sc}`, 2.8 * s + 6, Math.max(1.6 * s, 12 * sc) + 6, (g) => {
      g.beginPath();
      g.moveTo(-s * 1.4, 0);
      g.quadraticCurveTo(0, -s * 1.5, s * 1.4, 0);
      g.quadraticCurveTo(0, s * 1.5, -s * 1.4, 0);
      g.closePath();
      g.fillStyle = V6.cream;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = V6.night;
      g.stroke();
      g.beginPath();
      g.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      g.fillStyle = V6.flame;
      g.fill();
      g.fillStyle = V6.night;
      g.font = FONT(800, Math.round(11 * sc));
      g.fillText('!', 0, 0.5);
    });
    this.batch.stamp(st, cx, cy, pop);
  }

  /** A bobbing gold chevron over the player's own plate, pointing down at the hero (found first in a pile). */
  private selfChevron(x: number, y: number): void {
    const sc = this.scale;
    const s = 8 * sc;
    const bob = Math.sin(performance.now() / 180) * 2.5 * sc;
    const st = this.atlas.get(`chev|${sc}`, 2 * s + 8, 1.1 * s + 8, (g) => {
      g.beginPath();
      g.moveTo(-s, -s * 0.55);
      g.lineTo(s, -s * 0.55);
      g.lineTo(0, s * 0.55);
      g.closePath();
      g.lineJoin = 'round';
      g.lineWidth = 3;
      g.strokeStyle = V6.night;
      g.stroke();
      g.fillStyle = RELATION_CSS.self;
      g.fill();
    });
    this.batch.stamp(st, x, y - s * 0.55 + bob);
  }

  /** Round 2: a red arrow at the screen edge toward each enemy hero just off screen (assassins came from nowhere). */
  private drawEdge(frame: ViewFrame, edge: readonly { e: ViewEntity; sx: number; sy: number }[]): void {
    const me = frame.byId.get(this.mySlot);
    if (!me || me.state === 'dead' || !edge.length) return;
    const sc = this.scale;
    const m = 26 * sc;
    const s = 11 * sc;
    const tri = this.atlas.get(`etri|${sc}`, 2 * (1.9 * s + 2), 2 * (0.75 * s + 2), (g) => {
      g.fillStyle = RELATION_CSS.enemy;
      g.beginPath();
      g.moveTo(s * 1.9, 0);
      g.lineTo(s * 0.9, -s * 0.75);
      g.lineTo(s * 0.9, s * 0.75);
      g.closePath();
      g.fill();
    });
    for (const { e, sx, sy } of edge) {
      if (Math.hypot(e.fx - me.fx, e.fy - me.fy) > Overhead.EDGE_RANGE) continue;
      // where the ray from the centre leaves the inset screen rectangle
      const p0 = edgeArrow(sx, sy, this.w, this.h, m, this.safeTop);
      if (!p0) continue;
      const { x, y } = clearOfRects(p0, s * 1.9, this.sideRects, this.h, this.w);
      const label = (e.hero ? HERO_TEXT[e.hero].title.replace('Sir ', '') : '?').slice(0, 2);
      const disc = this.atlas.get(`edisc|${label}|${sc}`, 2 * s * 1.15 + 4, 2 * s * 1.15 + 4, (g) => {
        g.fillStyle = V6.ink(0.88);
        g.beginPath();
        g.arc(0, 0, s * 1.15, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = V6.cream;
        g.font = FONT(700, Math.round(10 * sc));
        g.fillText(label, 0, 0.5);
      });
      // the disc and its letters, then the arrow (it never reaches the letters, so the order is the 2D one)
      this.batch.stamp(disc, x, y);
      this.batch.stamp(tri, x, y, 1, p0.a);
    }
  }

  /** GAPS A5: the lock's brackets round a plate, and a bar under it that drains over the lock's 5 s. */
  private lockBrackets(x: number, y: number, bw: number, bh: number, left: number): void {
    const m = 5 * this.scale;
    const k = 6 * this.scale;
    const x0 = x - m;
    const y0 = y - m;
    const x1 = x + bw + m;
    const y1 = y + bh + m;
    const P = this.batch.pts;
    for (const [dx, dy] of BRACKETS) {
      const bx = dx > 0 ? x0 : x1;
      const by = dy > 0 ? y0 : y1;
      P[0] = bx + dx * k;
      P[1] = by;
      P[2] = bx;
      P[3] = by;
      P[4] = bx;
      P[5] = by + dy * k;
      this.batch.polyline(P, 3, false, 2, RELATION_CSS.danger);
    }
    this.batch.rect(x, y1 + 2, bw * Math.max(0, Math.min(1, left)), 2, RELATION_CSS.danger);
  }

  /** A small gold crown (bounty). */
  private crown(x: number, y: number): void {
    const s = 9 * this.scale;
    const bob = Math.sin(performance.now() / 220) * 1.5;
    const st = this.atlas.get(`crown|${this.scale}`, 2 * s + 6, 1.4 * s + 6, (g) => {
      g.fillStyle = V6.logoGold;
      g.strokeStyle = V6.plumDeep;
      g.lineWidth = 2;
      crownPath(g, 0, 0, s);
      g.stroke();
      g.fill();
    });
    this.batch.stamp(st, x, y + bob);
  }

  /** Lane F (F6): a small crown in the danger colour with `pips` gold diamonds under it (Toys owned). */
  private fedMark(x: number, y: number, pips: number): void {
    const sc = this.scale;
    const s = 6 * sc;
    const d = 1.8 * sc;
    const gap = 4.4 * sc;
    const half = Math.max(0.7 * s, 0.5 * s + 4 * sc + d) + 2;
    const st = this.atlas.get(`fed|${pips}|${sc}`, Math.max(2 * s, pips * gap) + 6, 2 * half + 2, (g) => {
      g.fillStyle = '#ff7a59';
      g.strokeStyle = V6.night;
      g.lineWidth = 1.5;
      crownPath(g, 0, 0, s);
      g.stroke();
      g.fill();
      g.fillStyle = V6.logoGold;
      for (let i = 0; i < pips; i++) {
        const px = (i - (pips - 1) / 2) * gap;
        const py = s * 0.5 + 4 * sc;
        g.beginPath();
        g.moveTo(px, py - d);
        g.lineTo(px + d, py);
        g.lineTo(px, py + d);
        g.lineTo(px - d, py);
        g.closePath();
        g.fill();
      }
    });
    this.batch.stamp(st, x, y - 2 * sc);
  }

  /**
   * Duchess's Disdain (sim v11): a row of small crowns under the bar, lit in her purple, one per stack; the unlit ones
   * show how far the hero is from a Snub. Nothing without stacks.
   */
  private disdain(e: ViewEntity, cx: number, y: number): void {
    const { lit, max } = disdainPips(e);
    if (lit <= 0) return;
    const s = 4.5 * this.scale;
    const gap = 3 * s;
    const st = this.atlas.get(`dis|${lit}|${max}|${this.scale}`, (max - 1) * gap + 2 * s + 6, 1.4 * s + 6, (g) => {
      g.lineWidth = 1.5;
      g.strokeStyle = V6.ink(0.9);
      for (let i = 0; i < max; i++) {
        crownPath(g, (i - (max - 1) / 2) * gap, 0, s);
        g.fillStyle = i < lit ? '#b98cff' : V6.ink(0.55);
        g.fill();
        g.stroke();
      }
    });
    this.batch.stamp(st, cx, y);
  }

  /**
   * Domino's Spots (sim v15): a row of round black spots with a white rim under the bar (below Duchess's crowns when both show), one per Spot. Nothing without Spots.
   */
  private spots(e: ViewEntity, cx: number, y: number): void {
    const n = spotPips(e);
    if (n <= 0) return;
    const r = 3.4 * this.scale;
    const gap = 2.6 * r;
    const st = this.atlas.get(`spots|${n}|${this.scale}`, (n - 1) * gap + 2 * r + 5, 2 * r + 5, (g) => {
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.fillStyle = V6.night;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.arc((i - (n - 1) / 2) * gap, 0, r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    });
    this.batch.stamp(st, cx, y);
  }

  private drawLocks(frame: ViewFrame, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    if (!this.locks.length) return;
    const dt = 1 / 60;
    const P = this.batch.pts;
    for (const l of this.locks) {
      l.t -= dt;
      const s = frame.byId.get(l.src);
      const d = frame.byId.get(l.dst);
      if (!s || !d || s.state === 'dead' || d.state === 'dead') {
        l.t = -1;
        continue;
      }
      // out of the tower's reach (it re-targets): the lock-on is over
      if (Math.hypot(s.fx - d.fx, s.fy - d.fy) > 10000) {
        l.t = -1;
        continue;
      }
      const p0 = this.v.set(s.fx / 1000, s.kind === 'core' ? 4.5 : 5.6, -s.fy / 1000).project(camera);
      const z0 = p0.z;
      const x0 = (p0.x * 0.5 + 0.5) * this.w;
      const y0 = (-p0.y * 0.5 + 0.5) * this.h;
      const p1 = this.v.set(d.fx / 1000, 0.9 * (d.hero ? heroScale(d) : 1), -d.fy / 1000).project(camera);
      // a point behind the lens projects mirrored: the beam crossed the whole screen (trailer review)
      if (z0 > 1 || z0 < -1 || p1.z > 1 || p1.z < -1) continue;
      const x1 = (p1.x * 0.5 + 0.5) * this.w;
      const y1 = (-p1.y * 0.5 + 0.5) * this.h;
      const k = 1 - Math.max(0, l.t) / l.total;
      const blink = 0.65 + 0.35 * Math.sin(performance.now() / (k > 0.7 ? 40 : 90));
      const a = Math.max(0, Math.min(1, (0.55 + 0.4 * k) * blink));
      this.batch.line(x0, y0, x1, y1, (2 + 5 * k) * this.scale, DANGER_RGB, a);
      // a ground ring under the hero that closes in as the shot comes
      const r = (1.8 - 0.9 * k) * 1000;
      for (let i = 0; i < 24; i++) {
        const an = (i / 24) * Math.PI * 2;
        const q = this.v.set((d.fx + Math.cos(an) * r) / 1000, 0.1, -(d.fy + Math.sin(an) * r) / 1000).project(camera);
        P[2 * i] = (q.x * 0.5 + 0.5) * this.w;
        P[2 * i + 1] = (-q.y * 0.5 + 0.5) * this.h;
      }
      this.batch.polyline(P, 24, true, 3 * this.scale, DANGER_RGB, a);
      // Round 2: no "Tower aiming at you!" world text any more (it sat on CLANK!, damage numbers and plates); the words
      // go to the red tower alert bar (matchSession towerHit), the beam and the closing ring stay here.
    }
    this.locks = this.locks.filter((l) => l.t > -0.15);
  }

  /** A glowing red ring on the ground around the enemy fountain (it cannot be entered), rippling on contact. */
  private drawFountain(camera: THREE.Camera): void {
    const f = this.enemyFountain;
    if (!f) return;
    const since = (performance.now() - this.fountainHit) / 1000;
    const ripple = since < 1.2 ? 1 - since / 1.2 : 0;
    const pulse = 0.55 + 0.25 * Math.sin(performance.now() / 260);
    const P = this.batch.pts;
    for (let ring = 0; ring < (ripple > 0 ? 2 : 1); ring++) {
      const r = f.r + (ring ? (1 - ripple) * 2500 : 0);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const q = this.v.set((f.x + Math.cos(a) * r) / 1000, 0.12, -(f.y + Math.sin(a) * r) / 1000).project(camera);
        P[2 * i] = (q.x * 0.5 + 0.5) * this.w;
        P[2 * i + 1] = (-q.y * 0.5 + 0.5) * this.h;
      }
      const alpha = ring ? 0.8 * ripple : Math.min(1, pulse + 0.3 * ripple);
      this.batch.polyline(P, 40, true, (ring ? 3 : 5 + 4 * ripple) * this.scale, FOUNTAIN_RGB, alpha);
    }
  }

  private drawGuide(frame: ViewFrame, camera: THREE.Camera): void {
    const me = frame.byId.get(this.mySlot);
    const to = this.guide;
    if (!to || !me || me.state === 'dead') return;
    const dx = to.x - me.fx;
    const dy = to.y - me.fy;
    const d = Math.hypot(dx, dy);
    if (d < 3000) return;
    const ux = dx / d;
    const uy = dy / d;
    const t = (performance.now() / 1000) % 1;
    const P = this.batch.pts;
    for (let k = 0; k < 4; k++) {
      const along = 1500 + (k + t) * 1500;
      if (along > d - 800) break;
      const cx = me.fx + ux * along;
      const cy = me.fy + uy * along;
      const l = this.v.set((cx - uy * 600) / 1000, 0.15, -(cy + ux * 600) / 1000).project(camera);
      P[0] = (l.x * 0.5 + 0.5) * this.w;
      P[1] = (-l.y * 0.5 + 0.5) * this.h;
      const tip = this.v.set((cx + ux * 500) / 1000, 0.15, -(cy + uy * 500) / 1000).project(camera);
      P[2] = (tip.x * 0.5 + 0.5) * this.w;
      P[3] = (-tip.y * 0.5 + 0.5) * this.h;
      const r = this.v.set((cx + uy * 600) / 1000, 0.15, -(cy - ux * 600) / 1000).project(camera);
      P[4] = (r.x * 0.5 + 0.5) * this.w;
      P[5] = (-r.y * 0.5 + 0.5) * this.h;
      const a = Math.min(1, (k + 1 - t) / 1.5) * 0.85;
      this.batch.polyline(P, 3, false, 5 * this.scale, GUIDE_RGB, a);
    }
  }

  private drawBeams(frame: ViewFrame, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    const now = performance.now();
    const dt = this.lastDraw ? Math.min(0.1, (now - this.lastDraw) / 1000) : 0;
    this.lastDraw = now;
    if (!this.beams.length) return;
    const at = (e: ViewEntity, lift: number): [number, number] | null => {
      const v = this.v.set(e.fx / 1000, lift, -e.fy / 1000).project(camera);
      if (v.z > 1 || v.z < -1) return null;
      return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
    };
    for (const b of this.beams) {
      b.t -= dt;
      const s = frame.byId.get(b.src);
      const d = frame.byId.get(b.dst);
      if (!s || !d || s.state === 'dead' || d.state === 'dead') continue;
      const p0 = at(s, s.kind === 'core' ? 4.5 : 5.6);
      const p1 = at(d, 0.9 * (d.hero ? heroScale(d) : 1));
      if (!p0 || !p1) continue;
      const a = Math.max(0, Math.min(1, b.t / 0.35)) * 0.85;
      // dashed: 10 on, 6 off (× scale)
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (len < 1) continue;
      const ux = (p1[0] - p0[0]) / len;
      const uy = (p1[1] - p0[1]) / len;
      const on = 10 * this.scale;
      const off = 6 * this.scale;
      for (let u = 0; u < len; u += on + off) {
        const e = Math.min(len, u + on);
        this.batch.line(p0[0] + ux * u, p0[1] + uy * u, p0[0] + ux * e, p0[1] + uy * e, 4 * this.scale, FOUNTAIN_RGB, a);
      }
    }
    this.beams = this.beams.filter((b) => b.t > 0);
  }

  /** The screen box (CSS px) a plate covers: bar, level badge, name and status chip. */
  private boxOf(p: Plate): { kind: string; id: number; name: string; x0: number; y0: number; x1: number; y1: number; dy: number } {
    const e = p.e;
    const [bw0, bh0] = SIZE[e.kind];
    const bw = bw0 * this.scale;
    const bh = e.kind === 'hero' ? heroBarH(this.phone) : e.kind === 'minion' ? 4 : bh0 * this.scale;
    const sy = p.sy + p.dy;
    if (e.kind !== 'hero') return { kind: e.kind, id: e.id, name: '', x0: p.sx - bw / 2 - 2, y0: sy - bh / 2 - 2, x1: p.sx + bw / 2 + 2, y1: sy + bh / 2 + 2, dy: p.dy };
    const name = this.nameOf(e);
    const tw = this.atlas.measure(name, FONT(700, nameFont(this.phone)));
    const status = this.statusChips ? (e.charmed ? 'Charmed' : statusWord(e.buffs)) : '';
    const sw = status ? this.atlas.measure(status, FONT(700, Math.round(9 * this.scale))) + 14 * this.scale : 0;
    const b = plateBox(this.scale, this.phone);
    return { kind: 'hero', id: e.id, name, x0: Math.min(p.sx + b.left, p.sx - tw / 2 - 4), y0: sy + b.top, x1: Math.max(p.sx + b.right + sw, p.sx + tw / 2 + 4), y1: sy + Math.max(b.bottom, 9 * this.scale), dy: p.dy };
  }

  /**
   * Feel pass B5: the own plate's "You" and its arrow show for the first seconds of a match only (the session turns
   * this off after 10 s); the gold ring under the hero marks it from then on.
   */
  youLabel = true;

  private nameOf(e: ViewEntity): string {
    if (e.id === this.mySlot && !this.youLabel) return '';
    // lobby spec §3b: a worn card names the own plate after the cat, cut at 14 characters ("Bartholomew T…")
    if (this.selfName && e.id === this.mySlot && e.hero) return cutName(this.names[e.id] ?? HERO_TEXT[e.hero].title, 14);
    return plateName(e, this.mySlot, this.myTeam, this.mirrored, this.names);
  }

  /** LoL pass (lane C): the trailing chunk (HP, 0 = none) of a hero or structure bar this frame. */
  private chunkOf(e: ViewEntity): number {
    const now = performance.now();
    const prev = this.chunks.get(e.id) ?? null;
    const c = chunkStep(prev, Math.max(0, e.hp), e.maxHp, now);
    if (prev) {
      prev.trail = c.trail;
      prev.hp = c.hp;
      prev.at = c.at;
      prev.t = c.t;
      prev.seen = this.drawN;
    } else this.chunks.set(e.id, { ...c, seen: this.drawN });
    return Math.max(0, c.trail - Math.max(0, e.hp));
  }

  /**
   * LoL pass (lane C): a hero plate's framed bar: a 1 px black outline, a 1 px dark gap, a square level badge on the
   * left inside the frame, the HP in the relation colour, the shield as a white piece after it, then the pale trailing
   * damage chunk; thin ticks every 100 HP and thick ones every 1000.
   */
  private heroBar(e: ViewEntity, x: number, y: number, bw: number, bh: number): { bx: number; bs: number } {
    const q = this.batch;
    const total = Math.max(e.maxHp, e.hp + e.shield);
    const hp = Math.max(0, e.hp);
    const hpW = (hp / total) * bw;
    const shW = (Math.max(0, e.shield) / total) * bw;
    const chW = (Math.min(this.chunkOf(e), total - hp) / total) * bw;
    const bs = bh + 6;
    const bx = x - bs - 1;
    // outline, then the dark gap
    // v6 facelift: a night-0 outline, a plum gap (the logo's outline colour), a plum-deep level badge, a night-2 track
    q.rect(bx - 2, y - 3, bw + bs + 5, bh + 6, V6.night0);
    q.rect(bx - 1, y - 2, bw + bs + 3, bh + 4, V6.plum);
    // the level badge (square) and the empty bar
    q.rect(bx, y - 1, bs - 1, bh + 2, V6.plumDeep);
    q.rect(x, y, bw, bh, V6.night2);
    q.rect(x, y, hpW, bh, this.color(e));
    // a lighter top half reads as a lit bar
    q.rect(x, y, hpW, Math.max(1, bh * 0.35), 'rgba(255,255,255,0.18)');
    if (shW > 0) q.rect(x + hpW, y, shW, bh, '#f4f8ff');
    if (chW > 0.5) q.rect(x + hpW + shW, y, Math.min(chW, bw - hpW - shW), bh, 'rgba(255,241,184,0.92)');
    // a 1 px lower shade: the bar reads as a lit slab (the kit's ledge), inside the bar's own box
    if (hpW > 0 && bh >= 6) q.rect(x, y + bh - 1, hpW, 1, V6.ink(0.35));
    for (let k = 100; k < total; k += 100) {
      const tx = Math.round(x + (k / total) * bw);
      if (k % 1000 === 0) q.rect(tx - 1, y, 2, bh, 'rgba(10,6,18,0.95)');
      else q.rect(tx, y, 1, bh * 0.5, 'rgba(10,6,18,0.6)');
    }
    return { bx, bs };
  }

  private plate(p: Plate): void {
    const q = this.batch;
    const sc = this.scale;
    const e = p.e;
    const sx = p.sx;
    const sy = p.sy + p.dy;
    const hero = e.kind === 'hero';
    const [bw0, bh0] = SIZE[e.kind];
    const bw = bw0 * sc;
    // LoL pass (lane C): hero bars 10 px (phone 8), minion bars a flat 4 px
    const bh = hero ? heroBarH(this.phone) : e.kind === 'minion' ? 4 : bh0 * sc;
    const x = sx - bw / 2;
    const y = sy - bh / 2;
    const total = Math.max(e.maxHp, e.hp + e.shield);
    const hpW = (Math.max(0, e.hp) / total) * bw;
    const shW = (Math.max(0, e.shield) / total) * bw;
    if (p.dy < 0 && hero) {
      // a short leader line from a lifted plate down to its hero
      q.line(sx, sy + bh / 2 + 3, sx, p.sy - bh / 2, 1.5, V6.ink(0.7));
    }
    if (e.kind === 'minion') {
      // minions: no frame, no chunk (cheap): a dark track and the fill
      q.rect(x - 1, y - 1, bw + 2, bh + 2, V6.ink(0.85));
      q.rect(x, y, hpW, bh, this.color(e));
      return;
    }
    if (!hero) {
      const tw = bw + 4;
      const th = bh + 4;
      const bg = this.atlas.get(`rr|${tw.toFixed(2)}|${th.toFixed(2)}`, tw + 2, th + 2, (g) => {
        g.fillStyle = V6.ink(0.84);
        roundRect(g, -tw / 2, -th / 2, tw, th, 3);
        g.fill();
      });
      q.stamp(bg, sx, sy);
      q.rect(x, y, hpW, bh, this.color(e));
      if (shW > 0) q.rect(x + hpW, y, shW, bh, '#f4f8ff');
      if (e.kind === 'tower' || e.kind === 'core' || e.kind === 'pudding') {
        // structures: the trailing chunk, and tick marks every 500 HP
        const chW = (Math.min(this.chunkOf(e), total - Math.max(0, e.hp)) / total) * bw;
        if (chW > 0.5) q.rect(x + hpW + shW, y, Math.min(chW, bw - hpW - shW), bh, 'rgba(255,241,184,0.92)');
      }
      if (e.kind === 'tower' || e.kind === 'core') {
        for (let k = 500; k < total; k += 500) q.rect(x + (k / total) * bw, y, 1, k % 2500 === 0 ? bh : bh * 0.55, V6.ink(0.5));
      }
      if ((e.buffs & BuffFlag.Invulnerable) !== 0) q.strokeRect(x - 1, y - 1, bw + 2, bh + 2, 1.5, V6.ice);
      // V21-FUN §4.2: a burning tower or core (below 33% HP) wears the minimap's flame glyph left of its bar
      if ((e.kind === 'tower' || e.kind === 'core') && damageState(e.maxHp > 0 ? e.hp / e.maxHp : 1) >= 2) {
        const fs = Math.round(13 * sc);
        const fl = this.atlas.get(`flame|${fs}`, fs + 6, fs + 6, (g) => drawFlame(g, 0, 0, fs));
        q.stamp(fl, x - fs * 0.5 - 4, sy);
      }
      // Sim v21 (V21-FUN.md §3.1): a Fortified tower (sim v26, V26-TOWERS.md: heroes deal 45% less, minions 25% less and its bolts hit 25% harder before 4:00 / 5:30, Blitz 0:45): a small shield right of its bar
      if (e.kind === 'tower' && (e.buffs & BuffFlag.Fortified) !== 0) {
        const ss = Math.round(11 * sc);
        const sh = this.atlas.get(`fort|${ss}`, ss + 4, ss + 4, (g) => drawFortShield(g, ss));
        q.stamp(sh, x + bw + ss * 0.5 + 3, sy);
      }
      return;
    }
    const { bx, bs } = this.heroBar(e, x, y, bw, bh);
    if (this.targetLock && this.targetLock.id === e.id) this.lockBrackets(bx, y, bw + bs + 1, bh, this.targetLock.left);
    if (e.id === this.mySlot) {
      // the player's own plate: a gold frame so it is found first in a pile
      q.strokeRect(bx - 3.25, y - 4.25, bw + bs + 7.5, bh + 8.5, 1.5, RELATION_CSS.self);
      // feel pass B3: the touch HUD has no hero box any more: the own XP is a 3 px line under this bar
      const xf = ownXpFrac(e.level ?? 1, e.xp ?? 0);
      q.rect(x, y + bh + 2, bw, 3, V6.ink(0.85));
      q.rect(x, y + bh + 2, bw * xf, 3, V6.xp);
    }
    const lv = String(e.level ?? 1);
    const r = bs / 2;
    const bcx = bx + (bs - 1) / 2;
    this.chargeRing(e, bcx, sy, r);
    this.disdain(e, sx, y + bh + 8 * sc);
    this.spots(e, sx, y + bh + (disdainPips(e).lit > 0 ? 17 : 8) * sc);
    const stride = strideMeter(e);
    if (stride >= 0) {
      // Stilts's Stride under her bar (own team): sand while it builds, a hot terracotta when full (the pounce is ready)
      q.rect(x - 1, y + bh + 3, bw + 2, 4 * sc, V6.ink(0.9));
      q.rect(x, y + bh + 4, bw * stride, 2.5 * sc, stride >= 1 ? V6.flame : '#e8c27a');
    }
    const lvPx = Math.min(12, bh + 3);
    const lvSt = this.atlas.get(`lv|${lv}|${lvPx}`, lvPx * 1.4 + 6, lvPx + 6, (g) => {
      g.fillStyle = V6.cream;
      g.font = FONT(800, lvPx);
      g.fillText(lv, 0, 0.5);
    });
    q.stamp(lvSt, bcx, sy);
    if (p.bare) {
      this.statusMark(e, x, bw, sy);
      return;
    }
    const name = this.nameOf(e);
    const nf = nameFont(this.phone);
    const font = FONT(700, nf);
    const ny = y - 3 - nf / 2 - 3;
    const tw = this.atlas.measure(name, font);
    const seat = this.seats?.get(e.id);
    if (e.id !== this.mySlot) {
      // round 1: a solid side-coloured pill behind every other hero's name, so an enemy Clem never reads as yours
      const col = this.color(e);
      const ring = seat ? (seat.bot ? 'rgba(150,150,160,0.95)' : seat.ring) : '';
      const bot = !!seat?.bot;
      const rg = 7 * sc;
      const half = tw / 2 + 10 + (bot ? 15 * sc + rg + 3 : 0); // v6: +2 for the lean
      const pill = this.atlas.get(`pill|${name}|${col}|${nf}|${ring}|${bot ? 1 : 0}|${sc}`, 2 * half, Math.max(nf + 12, 2 * rg + 8), (g) => {
        // v6 facelift: the pill leans −8° (the kit's slant) with a night keyline under its lower edge
        g.fillStyle = col;
        leanRect(g, -tw / 2 - 4, -nf / 2 - 2, tw + 8, nf + 4);
        g.fill();
        g.fillStyle = V6.ink(0.28);
        g.fillRect(-tw / 2 - 4 - ((nf + 4) * LEAN) / 2 + 1, nf / 2 + 1, tw + 7, 1);
        if (ring) {
          // a friend: the slot ring around the pill (greyed while a bot flies it, with a robot glyph)
          g.strokeStyle = ring;
          g.lineWidth = 2.5;
          leanRect(g, -tw / 2 - 6, -nf / 2 - 4, tw + 12, nf + 8);
          g.stroke();
          if (bot) robotGlyph(g, tw / 2 + 15 * sc, 0, rg);
        }
        g.font = font;
        g.fillStyle = V6.night;
        g.fillText(name, 0, 0.5);
      });
      q.stamp(pill, sx, ny);
    } else if (!name) {
      // feel pass B5: no own name after the first seconds (the gold ring marks the hero)
    } else if (this.goldPlate) {
      const gold = this.atlas.get(`gold|${name}|${nf}`, tw + 20, nf + 10, (g) => {
        const grad = g.createLinearGradient(0, -nf / 2 - 3, 0, nf / 2 + 3);
        // v6 facelift: the gold bevel (gold-1 → gold-2, gold-3 rim) on the −8° lean, gold-4 text
        grad.addColorStop(0, V6.gold1);
        grad.addColorStop(1, V6.gold2);
        g.fillStyle = grad;
        leanRect(g, -tw / 2 - 6, -nf / 2 - 3, tw + 12, nf + 6);
        g.fill();
        g.strokeStyle = V6.gold3;
        g.lineWidth = 1.5;
        g.stroke();
        g.font = font;
        g.fillStyle = V6.gold4;
        g.fillText(name, 0, 0.5);
      });
      q.stamp(gold, sx, ny);
    } else {
      const col = this.color(e);
      const own = this.atlas.get(`own|${name}|${col}|${nf}`, tw + 10, nf + 10, (g) => {
        g.font = font;
        g.lineWidth = 3;
        g.strokeStyle = V6.ink(0.9);
        g.strokeText(name, 0, 0);
        g.fillStyle = col;
        g.fillText(name, 0, 0);
      });
      q.stamp(own, sx, ny);
    }
    if (this.watchers.has(e.id)) this.eyeGlyph(sx + tw / 2 + 14 * sc, ny);
    let chevronY = ny - nf / 2 - 5;
    if (e.id === this.mySlot && this.catName && name) {
      // the worn cat, small, above the own name (canvas text: never HTML)
      const cat = this.catName;
      const cf = FONT(600, Math.round(9 * sc));
      const cw = this.atlas.measure(cat, cf);
      const cy = ny - 13 * sc;
      const st = this.atlas.get(`cat|${cat}|${sc}`, cw + 10, 9 * sc + 10, (g) => {
        g.font = cf;
        g.lineWidth = 3;
        g.strokeStyle = V6.ink(0.85);
        g.strokeText(cat, 0, 0);
        g.fillStyle = V6.cream;
        g.fillText(cat, 0, 0);
      });
      q.stamp(st, sx, cy);
      chevronY = cy - 10 * sc;
    }
    if (e.id === this.mySlot && this.plateGem) {
      const gem = this.plateGem;
      const gr = 4 * sc;
      const st = this.atlas.get(`gem|${gem}|${sc}`, 1.5 * gr + 5, 2 * gr + 5, (g) => {
        g.fillStyle = gem;
        g.strokeStyle = V6.ink(0.9);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, -gr);
        g.lineTo(gr * 0.75, 0);
        g.lineTo(0, gr);
        g.lineTo(-gr * 0.75, 0);
        g.closePath();
        g.fill();
        g.stroke();
      });
      q.stamp(st, sx + tw / 2 + 10 * sc, ny);
    }
    if (e.id === this.mySlot && name) this.selfChevron(sx, chevronY);
    // the bounty crown sits left of the name (round 1: it was drawn over it: "Sir▲tus")
    // fun pass (playtest #13): a phone plate pushed up by the declutter (a 3v1) drops its crowns: three stacked crowned
    // plates over the fight were unreadable; the bottom plate keeps them
    const quiet = this.phone && p.stacked > 0;
    if (!quiet && this.bounty(e.id) > 0) this.crown(sx - tw / 2 - 14 * sc, ny);
    // Lane F (F6): an enemy ahead of you on Toys: a red-gold crown with its Toy pips right of the name
    const fed = quiet ? 0 : fedPips(e, this.myTeam, this.myToy);
    if (fed > 0) this.fedMark(sx + tw / 2 + (this.watchers.has(e.id) ? 28 : 14) * sc, ny, fed);
    if (p.chip) {
      // another hero's plate sits right above this one: say so (left of the level badge; status takes the right)
      const st = this.atlas.get(`x2|${sc}`, 22 * sc + 4, 14 * sc + 4, (g) => {
        g.fillStyle = V6.ink(0.92);
        roundRect(g, -11 * sc, -7 * sc, 22 * sc, 14 * sc, 4);
        g.fill();
        g.fillStyle = V6.cream;
        g.font = FONT(700, Math.round(10 * sc));
        g.fillText('×2', 0, 0.5);
      });
      q.stamp(st, bx - 16 * sc, sy);
    }
    this.statusMark(e, x, bw, sy);
  }

  /**
   * The status right of a hero bar: a word chip ("Rooted") on desktop; on a phone (audit GFX-04) a 14 px icon disc
   * with the status's letter, so a stacked fight is not a wall of words.
   */
  private statusMark(e: ViewEntity, x: number, bw: number, sy: number): void {
    const status = this.statusChips ? (e.charmed ? 'Charmed' : statusWord(e.buffs)) : '';
    if (!status) return;
    const sc = this.scale;
    const cx = x + bw + 6 * sc;
    const font = FONT(this.phone ? 800 : 700, Math.round(9 * sc));
    if (this.phone) {
      const r = 7 * sc;
      const st = this.atlas.get(`stp|${status}|${sc}`, 2 * r + 5, 2 * r + 5, (g) => {
        g.fillStyle = 'rgba(255,225,74,0.95)';
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = V6.ink(0.9);
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = V6.night;
        g.font = font;
        g.fillText(statusGlyph(status), 0, 0.5);
      });
      this.batch.stamp(st, cx + r, sy);
      return;
    }
    const tw = this.atlas.measure(status, font) + 8 * sc;
    const st = this.atlas.get(`std|${status}|${sc}`, tw + 4, 14 * sc + 4, (g) => {
      // v6 facelift: a bolt chip on the −8° lean (it warns, so it may wear the bolt), night text
      g.fillStyle = 'rgba(255,225,74,0.95)';
      leanRect(g, -tw / 2 + 1, -7 * sc, tw - 2, 14 * sc);
      g.fill();
      g.fillStyle = V6.night;
      g.font = font;
      g.textAlign = 'left';
      g.fillText(status, -tw / 2 + 4 * sc, 0.5);
    });
    this.batch.stamp(st, cx + tw / 2, sy);
  }
}

/** The lock brackets' corners: (x0, y0), (x1, y0), (x0, y1), (x1, y1), each opening inward. */
const BRACKETS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

/** The crown outline (bounty, fed mark, Disdain) centred on (x, y), half-width s. */
function crownPath(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - s, y + s * 0.5);
  g.lineTo(x - s, y - s * 0.4);
  g.lineTo(x - s * 0.5, y + s * 0.05);
  g.lineTo(x, y - s * 0.7);
  g.lineTo(x + s * 0.5, y + s * 0.05);
  g.lineTo(x + s, y - s * 0.4);
  g.lineTo(x + s, y + s * 0.5);
  g.closePath();
}

/** Audit GFX-04: the phone status icon's glyph (one letter or sign per status). Pure. */
export function statusGlyph(status: string): string {
  return ({ Stunned: '*', Rooted: 'R', Scared: '!', Napping: 'z', Challenged: 'C', Slowed: '~', 'Purr-ified': 'P', Charmed: '♥' } as Record<string, string>)[status] ?? status.slice(0, 1);
}

/** Feel pass B3: the own hero's share (0..1) of the way to its next level (1 at max level). Pure. */
export function ownXpFrac(lv: number, xp: number): number {
  const lo = XP.toLevel[lv - 1] ?? 0;
  const hi = XP.toLevel[lv] ?? lo;
  return lv >= XP.maxLevel || hi <= lo ? 1 : Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

/** Feel pass B5: a bot persona's first name ("Biscuit the Clem" → "Biscuit"); any other name as it is. Pure. */
export function shortPlateName(name: string): string {
  const m = /^(.+?) the \S/.exec(name);
  return m ? m[1] : name;
}

/** The label over a hero: "You" for the player, a team prefix on the enemy copy of a mirrored hero. Pure. */
export function plateName(e: Pick<ViewEntity, 'id' | 'team' | 'hero'>, mySlot: number, myTeam: number, mirrored: ReadonlySet<string>, names: readonly string[] = []): string {
  if (e.id === mySlot) return 'You';
  if (!e.hero) return '';
  // feel pass B5: the short name only ("Biscuit", not "Biscuit the Clem")
  const title = shortPlateName(names[e.id] ?? HERO_TEXT[e.hero].title);
  if (e.team !== myTeam && mirrored.has(e.hero) && (e.team === 0 || e.team === 1)) return `${TEAM[e.team].name} ${title}`;
  return title;
}

export function statusWord(b: number): string {
  if (b & BuffFlag.Stunned) return 'Stunned';
  if (b & BuffFlag.Rooted) return 'Rooted';
  if (b & BuffFlag.Feared) return 'Scared';
  if (b & BuffFlag.Channeling) return 'Napping';
  if (b & BuffFlag.Tethered) return 'Challenged';
  if (b & BuffFlag.Slowed) return 'Slowed';
  // Sim v17: the CC cap's immunity reads as its own word (it is not a Purr-ify).
  if (b & BuffFlag.Steadfast) return 'Steadfast';
  if (b & BuffFlag.Purrified) return 'Purr-ified';
  return '';
}

/** Party play (M4): a small robot head (a bot flies this friend's hero), centred on (x, y), half-size r. */
function robotGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.fillStyle = V6.ink(0.92);
  roundRect(g, x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4, 4);
  g.fill();
  g.fillStyle = V6.ice;
  roundRect(g, x - r, y - r * 0.7, 2 * r, 1.6 * r, 2);
  g.fill();
  g.fillRect(x - 0.6, y - r - 1, 1.2, r * 0.35);
  g.fillStyle = V6.night;
  g.fillRect(x - r * 0.55, y - r * 0.25, r * 0.35, r * 0.35);
  g.fillRect(x + r * 0.2, y - r * 0.25, r * 0.35, r * 0.35);
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** Sim v21: the Fortified shield (a cream heater shield with a gold rim and a bow), centred on (0, 0), `s` px tall. */
function drawFortShield(g: CanvasRenderingContext2D, s: number): void {
  const w = s * 0.8;
  g.beginPath();
  g.moveTo(-w / 2, -s / 2);
  g.lineTo(w / 2, -s / 2);
  g.lineTo(w / 2, 0);
  g.quadraticCurveTo(w / 2, s * 0.35, 0, s / 2);
  g.quadraticCurveTo(-w / 2, s * 0.35, -w / 2, 0);
  g.closePath();
  g.fillStyle = V6.cream;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = V6.logoGold;
  g.stroke();
  g.fillStyle = '#ff86a5';
  g.fillRect(-w / 2 + 1, -s * 0.12, w - 2, s * 0.18);
}
