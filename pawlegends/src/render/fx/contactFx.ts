/**
 * Living pass P3: units touch the world (render only; the sim is never read beyond its constants and the snapshot).
 *
 * - Footfalls (a hero's gait phase crossing a multiple of π, a minion's hop touching down) on the sand lanes kick up a
 *   puff of warm dust; on grass a blade of green flicks up (High).
 * - Wading (the river band off the bridge decks): a pale ring spreads on the water under the foot, a short V wake
 *   trails the body (Med/High, not under reduce motion) and a few droplets jump (High).
 * - Minions splash too (High only), at most MINION_RINGS_PER_S rings a second over all of them.
 *
 * Readability first: dust is capped per footfall and per second over every hero, a team fight near the camera keeps
 * only the player's own hero's contact FX, nothing is emitted for a stealthed enemy, an enemy standing in a bush no
 * ally has cleared, or anything the snapshot does not hold; the shared particle pools are only used while they are
 * under POOL_GUARD of their limit (combat VFX always win), and the rings are drawn into the heroes' existing ring
 * decal layer (0 extra draws). Low (ambient level 0) keeps only the own hero's water rings.
 *
 * Cosmetic randomness comes from the particle pools' render-only rng; nothing here feeds the sim.
 */
import { BuffFlag } from '../../sim/api';
import { bushAt } from '../../sim/map/brush';
import { CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, PLAYFIELD, PUDDING_SPOT, RAT_CAMP } from '../../data/map';
import { clearedBushes } from '../bushClear';
import { SHAPE } from './Particles.js';
import type { Ambient, AmbientFx } from '../ambient';

/** Caps and looks (tests read them). */
export const CONTACT = Object.freeze({
  /** Dust particles per footfall at most (High; Med emits 1). */
  dustPerStep: 2,
  /** Dust (and grass fleck) particles a second over every hero at most. */
  dustPerSec: 12,
  /** Minion splash rings a second over every minion at most (High only). */
  minionRingsPerSec: 4,
  /** A team fight: at least this many living heroes within `fightRadius` m of the camera focus. */
  fightHeroes: 4,
  fightRadius: 10,
  /** Nothing is emitted farther than this (m) from the camera focus (off screen). */
  near: 24,
  /** A pool fuller than this share of its limit takes no contact FX (combat VFX win). */
  poolGuard: 0.8,
  /** Reduce motion: counts × this; no wake streaks. */
  reducedCount: 0.6,
  /** Splash rings: life (s), start and end size (m), at most this many alive. */
  ringLife: 0.6,
  ringSize0: 0.45,
  ringSize1: 1.75,
  ringMax: 12,
});

/** Surface kinds under a foot. */
export const SURF = Object.freeze({ GRASS: 0, SAND: 1, WATER: 2, DECK: 3, STONE: 4 });
export type SurfaceKind = (typeof SURF)[keyof typeof SURF];

/** Half width (m) of a bridge deck across its lane: Crossing's BRIDGE_HALF (mapView), Hearthwood's 9.4 m deck / 2. */
const DECK_HALF = [5.7, 4.7] as const;
/** Crossing's Pudding island in the river (mapView: a 6.2–6.6 m sand disc): sand, not water. */
const ISLAND_R = 6.3;
/** The splash ring fades from foam white into the river's light blue (the ring layer blends normally). */
const RING_FROM = 0xf4fcff;
const RING_TO = 0x86cbe6;
// lighter than the lane's sand, so a puff reads against it (the lane paint is ≈ 0xe6c98f)
const DUST = 0xf7e9cc;
const FLECK = 0x7cc35e;
const DROP = 0xd8f2ff;
const WAKE = 0xeaf8ff;

let grid: Uint8Array | null = null;
let gridMap: object | null = null;
let GW = 0;
let GH = 0;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** 1 m cells of the bound map (sim map constants, read only): sand lanes and the rat camp, river, decks, plazas. */
function buildGrid(): Uint8Array {
  const W = MAP.width / 1000;
  const H = MAP.height / 1000;
  GW = Math.ceil(W);
  GH = Math.ceil(H);
  const g = new Uint8Array(GW * GH);
  const point = MAP.point === 1;
  const lanes: number[][] = [];
  for (const key of Object.keys(LANE_WAYPOINTS) as (keyof typeof LANE_WAYPOINTS)[]) {
    const pts = (LANE_WAYPOINTS[key] ?? []).map(([x, y]) => [x / 1000, y / 1000] as const);
    if (pts.length < 2) continue;
    // team 0's half and its reflection as two polylines: on Hearthwood a lane carries on past the river as another
    // lane's reflection (LANE_PARTNER), so joining a lane's ends with its own reflection would run along the river
    lanes.push(pts.flatMap(([x, y]) => [x, y]));
    lanes.push(pts.flatMap(([x, y]) => [W - x, point ? H - y : y]));
  }
  const laneHalf = MAP.laneWidth / 2000;
  const deck = DECK_HALF[point ? 1 : 0];
  const riverSum = ((PLAYFIELD as { riverSum?: number }).riverSum ?? 7071) / 1000;
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  const base = PLAYFIELD.base.map((v) => v / 1000);
  const camp = [RAT_CAMP.x / 1000, RAT_CAMP.y / 1000];
  const fx = FOUNTAIN.x / 1000;
  const fy = FOUNTAIN.y / 1000;
  const fr = FOUNTAIN.radius / 1000 + 1.5;
  const cx0 = CORE.x / 1000;
  const cy0 = CORE.y / 1000;
  const ix = PUDDING_SPOT.x / 1000;
  const iy = PUDDING_SPOT.y / 1000;
  for (let cy = 0; cy < GH; cy++) {
    for (let cx = 0; cx < GW; cx++) {
      const x = cx + 0.5;
      const y = cy + 0.5;
      let lane = Infinity;
      for (const pl of lanes) for (let i = 0; i + 3 < pl.length; i += 2) lane = Math.min(lane, segDist(x, y, pl[i], pl[i + 1], pl[i + 2], pl[i + 3]));
      const river = point ? Math.abs(x + y - W) <= riverSum : x >= r0 && x <= r1;
      const mx = W - x;
      const my = point ? H - y : y;
      let s: SurfaceKind = SURF.GRASS;
      if (river && !point && Math.hypot(x - ix, y - iy) <= ISLAND_R) s = SURF.SAND;
      else if (river) s = lane <= deck ? SURF.DECK : SURF.WATER;
      else if (point ? Math.hypot(x - fx, y - fy) <= fr || Math.hypot(mx - fx, my - fy) <= fr || Math.hypot(x - cx0, y - cy0) <= 6 || Math.hypot(mx - cx0, my - cy0) <= 6 : (x >= base[0] && x <= base[2] && y >= base[1] && y <= base[3]) || (mx >= base[0] && mx <= base[2] && y >= base[1] && y <= base[3]))
        s = SURF.STONE;
      else if (lane <= laneHalf || (!point && (Math.hypot(x - camp[0], y - camp[1]) <= 5.5 || Math.hypot(mx - camp[0], y - camp[1]) <= 5.5))) s = SURF.SAND;
      g[cy * GW + cx] = s;
    }
  }
  return g;
}

/** The surface under a three.js ground point (m; z = −sim y). Off the map is grass. Rebuilt when another map binds. */
export function surfaceAt(x: number, z: number): SurfaceKind {
  if (gridMap !== MAP || !grid) {
    grid = buildGrid();
    gridMap = MAP;
  }
  const cx = Math.floor(x);
  const cy = Math.floor(-z);
  if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return SURF.GRASS;
  return grid[cy * GW + cx] as SurfaceKind;
}

/** The snapshot fields the hidden-unit rule reads. */
export interface ContactEntity {
  id: number;
  kind: string;
  team: number;
  state: string;
  buffs: number;
  fx: number;
  fy: number;
  x: number;
  y: number;
}

/**
 * The hidden-unit rule (pure): never react to a stealthed enemy, or an enemy in a bush no ally of ours stands in
 * (`cleared`, bushClear.ts order). Allies and neutrals always show.
 */
export function hiddenFor(e: Pick<ContactEntity, 'team' | 'buffs' | 'fx' | 'fy'>, myTeam: number, cleared: readonly boolean[]): boolean {
  if (e.team === myTeam || e.team === 2) return false;
  if ((e.buffs & BuffFlag.Stealth) !== 0) return true;
  const b = bushAt(Math.round(e.fx), Math.round(e.fy));
  return b >= 0 && !cleared[b];
}

/** The particle pools ContactFx uses (Particles.js; a test stub only needs these). */
export interface ContactParticles {
  add: { count: number; limit: number };
  alpha: { count: number; limit: number };
  burst(pos: { x: number; y: number; z: number }, o: Record<string, unknown>): void;
}

/** A ground decal layer (views/decals.ts DecalLayer.add). */
export interface RingSink {
  add(x: number, z: number, size: number, color: number, alpha?: number, yaw?: number): void;
}

const mixCh = (a: number, b: number, k: number, s: number): number => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
const mixHex = (a: number, b: number, k: number): number => (mixCh(a, b, k, 16) << 16) | (mixCh(a, b, k, 8) << 8) | mixCh(a, b, k, 0);

export class ContactFx {
  level: 0 | 1 | 2 = 0;
  reduced = false;
  density = 0;
  private time = 0;
  /** A team fight near the camera this frame: only the own hero's contact FX. */
  fight = false;
  private fX = 0;
  private fZ = 0;
  private myTeam = 0;
  private mySlot = -1;
  private ents: readonly ContactEntity[] = [];
  private cleared: boolean[] = [];
  private clearedOk = false;
  /** Token buckets (refilled per second, capped at one second's worth). */
  private dustBudget = 0;
  private ringBudget = 0;
  /** Per hero slot: the last gait step (floor(phase / π)); NaN = not seen. */
  private readonly steps = new Float64Array(64).fill(NaN);
  /** Splash rings: x, z, birth time (s), alive flag per slot; a full pool reuses the oldest. */
  private readonly rings = new Float64Array(CONTACT.ringMax * 3);
  private readonly ringOn = new Uint8Array(CONTACT.ringMax);
  private readonly at = { x: 0, y: 0, z: 0 };
  private readonly dir = { x: 0, y: 0, z: 0 };
  private readonly dust: Record<string, unknown> = { n: 1, exact: true, shape: SHAPE.PUFF, color: DUST, alpha: 0.6, size: [0.22, 0.32], sizeEnd: 2.2, life: [0.45, 0.7], speed: [0.3, 0.8], spread: 1.1, up: 0.35, drag: 3, jitter: 0.08 };
  private readonly fleck: Record<string, unknown> = { n: 1, exact: true, shape: SHAPE.FEATHER, color: FLECK, alpha: 0.9, size: [0.06, 0.09], life: [0.35, 0.45], speed: [0.3, 0.7], up: 1.3, gravity: 7, spin: 6, drag: 0.5 };
  private readonly drop: Record<string, unknown> = { n: 2, exact: true, shape: SHAPE.DROPLET, color: DROP, alpha: 0.8, size: [0.07, 0.1], life: [0.35, 0.5], speed: [0.4, 0.9], up: 1.8, gravity: 9, drag: 0.3, jitter: 0.08 };
  private readonly wake: Record<string, unknown> = { n: 1, exact: true, shape: SHAPE.SOFT, color: WAKE, alpha: 0.55, size: [0.15, 0.2], sizeEnd: 1.7, life: [0.38, 0.5], speed: [0.9, 1.25], spread: 0.12, stretch: 2.2, drag: 2.6 };
  /** Emitted so far (tests and e2e telemetry). */
  readonly counts = { dust: 0, flecks: 0, rings: 0, wake: 0, drops: 0, minionRings: 0 };

  constructor(readonly particles: ContactParticles | null) {}

  setAmbient(a: Ambient): void {
    this.level = a.level;
    this.reduced = a.reduced;
    this.density = a.density;
  }

  /** Start a frame (HeroView.update, before any hero): the clock, the buckets and the team-fight test. */
  begin(dt: number, entities: readonly ContactEntity[], mySlot: number, myTeam: number, focusX: number, focusZ: number): void {
    // the buckets cap at one second's worth, so a long frame grants no more than that
    const step = Math.max(0, dt);
    this.time += step;
    this.mySlot = mySlot;
    this.myTeam = myTeam;
    this.fX = focusX;
    this.fZ = focusZ;
    this.ents = entities;
    this.clearedOk = false;
    const rate = this.dustRate();
    this.dustBudget = Math.min(rate, this.dustBudget + rate * step);
    this.ringBudget = Math.min(CONTACT.minionRingsPerSec, this.ringBudget + CONTACT.minionRingsPerSec * step);
    let n = 0;
    const r2 = CONTACT.fightRadius * CONTACT.fightRadius;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.kind !== 'hero' || e.state === 'dead') continue;
      const dx = e.fx / 1000 - focusX;
      const dz = -e.fy / 1000 - focusZ;
      if (dx * dx + dz * dz <= r2) n++;
    }
    this.fight = n >= CONTACT.fightHeroes;
  }

  /** Dust particles a second over every hero (the cap scaled by the ambient density, never above CONTACT.dustPerSec). */
  dustRate(): number {
    if (this.level === 0) return 0;
    return CONTACT.dustPerSec * Math.max(0.4, Math.min(1, this.density * (this.level === 2 ? 1 : 2)));
  }

  /** Is `e` hidden from us (hiddenFor, with this frame's cleared bushes built once on demand)? */
  hidden(e: ContactEntity): boolean {
    if (e.team === this.myTeam || e.team === 2) return false;
    if (!this.clearedOk) {
      clearedBushes(this.ents, this.myTeam, this.cleared);
      this.clearedOk = true;
    }
    return hiddenFor(e, this.myTeam, this.cleared);
  }

  private room(): boolean {
    const p = this.particles;
    if (!p) return false;
    return p.alpha.count < p.alpha.limit * CONTACT.poolGuard && p.add.count < p.add.limit * CONTACT.poolGuard;
  }

  private near(x: number, z: number): boolean {
    const dx = x - this.fX;
    const dz = z - this.fZ;
    return dx * dx + dz * dz <= CONTACT.near * CONTACT.near;
  }

  private count(n: number): number {
    return this.reduced ? Math.max(1, Math.round(n * CONTACT.reducedCount)) : n;
  }

  /**
   * Hero `e` drawn at (x, z) facing `yaw` with gait phase `phase` (Animator.stridePhase): on a new footfall while it
   * moves, the surface's contact FX. Returns the surface kind emitted for (−1: none).
   */
  hero(e: ContactEntity, x: number, z: number, yaw: number, phase: number, moving: boolean): number {
    const id = e.id;
    const step = Math.floor(phase / Math.PI);
    const slot = id >= 0 && id < this.steps.length ? id : -1;
    const was = slot >= 0 ? this.steps[slot] : NaN;
    if (slot >= 0) this.steps[slot] = step;
    if (!moving || e.state === 'dead' || was !== was || step === was) return -1;
    const self = id === this.mySlot;
    if (this.level === 0 && !self) return -1;
    if (this.fight && !self) return -1;
    if (!this.near(x, z) || this.hidden(e)) return -1;
    const s = surfaceAt(x, z);
    // the foot: alternate sides of the body, under it
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    const side = (step & 1) === 0 ? 0.17 : -0.17;
    const px = x - fz * side;
    const pz = z + fx * side;
    if (s === SURF.WATER) {
      this.ring(px, pz);
      if (this.level === 0 || !this.room()) return s;
      if (!this.reduced) {
        // a short V wake: two streaks out and back from behind the body
        for (const k of [-1, 1]) {
          const bx = -fx * 0.55 + -fz * k * 0.85;
          const bz = -fz * 0.55 + fx * k * 0.85;
          const l = Math.sqrt(bx * bx + bz * bz) || 1;
          this.dir.x = bx / l;
          this.dir.y = 0;
          this.dir.z = bz / l;
          this.wake.dir = this.dir;
          this.at.x = x - fx * 0.3;
          this.at.y = 0.07;
          this.at.z = z - fz * 0.3;
          this.particles!.burst(this.at, this.wake);
          this.counts.wake++;
        }
      }
      if (this.level === 2) {
        this.at.x = px;
        this.at.y = 0.1;
        this.at.z = pz;
        this.drop.n = this.count(2);
        this.particles!.burst(this.at, this.drop);
        this.counts.drops += this.drop.n as number;
      }
      return s;
    }
    if (this.level === 0 || !this.room()) return -1;
    if (s === SURF.SAND) {
      const n = this.count(this.level === 2 ? CONTACT.dustPerStep : 1);
      if (this.dustBudget < n) return -1;
      this.dustBudget -= n;
      this.at.x = px;
      this.at.y = 0.12;
      this.at.z = pz;
      this.dir.x = -fx;
      this.dir.y = 0.3;
      this.dir.z = -fz;
      this.dust.dir = this.dir;
      this.dust.n = n;
      this.particles!.burst(this.at, this.dust);
      this.counts.dust += n;
      return s;
    }
    if (s === SURF.GRASS && this.level === 2 && (step & 1) === 0) {
      if (this.dustBudget < 1) return -1;
      this.dustBudget -= 1;
      this.at.x = px;
      this.at.y = 0.08;
      this.at.z = pz;
      this.particles!.burst(this.at, this.fleck);
      this.counts.flecks++;
      return s;
    }
    return -1;
  }

  /** A minion's footfall at (x, z) (MinionInstances): a splash ring when it wades (High only, rate-capped). */
  minionStep(e: ContactEntity, x: number, z: number): boolean {
    if (this.level < 2 || this.fight || this.ringBudget < 1) return false;
    if (!this.near(x, z) || surfaceAt(x, z) !== SURF.WATER || this.hidden(e)) return false;
    this.ringBudget -= 1;
    this.ring(x, z);
    this.counts.minionRings++;
    return true;
  }

  private ring(x: number, z: number): void {
    let best = 0;
    let bestT = Infinity;
    for (let i = 0; i < CONTACT.ringMax; i++) {
      if (!this.ringOn[i]) {
        best = i;
        break;
      }
      if (this.rings[i * 3 + 2] < bestT) {
        bestT = this.rings[i * 3 + 2];
        best = i;
      }
    }
    this.ringOn[best] = 1;
    this.rings[best * 3] = x;
    this.rings[best * 3 + 1] = z;
    this.rings[best * 3 + 2] = this.time;
    this.counts.rings++;
  }

  /** Rings alive now. */
  get liveRings(): number {
    let n = 0;
    for (let i = 0; i < CONTACT.ringMax; i++) if (this.ringOn[i] && this.time - this.rings[i * 3 + 2] < CONTACT.ringLife) n++;
    return n;
  }

  /** Draw the live splash rings into a ground decal layer (HeroView's ring layer: no extra draw). */
  drawRings(out: RingSink): void {
    const L = CONTACT.ringLife;
    for (let i = 0; i < CONTACT.ringMax; i++) {
      if (!this.ringOn[i]) continue;
      const k = (this.time - this.rings[i * 3 + 2]) / L;
      if (k >= 1) {
        this.ringOn[i] = 0;
        continue;
      }
      const g = 1 - (1 - k) * (1 - k);
      const size = CONTACT.ringSize0 + (CONTACT.ringSize1 - CONTACT.ringSize0) * g;
      out.add(this.rings[i * 3], this.rings[i * 3 + 1], size, mixHex(RING_FROM, RING_TO, Math.min(1, k * 1.15)), 1);
    }
  }
}

const registry = new WeakMap<object, ContactFx>();
/** The one ContactFx for these shared pools (HeroView and MinionInstances both resolve it from setAmbientFx). */
export function contactFor(fx: AmbientFx): ContactFx {
  const key = fx.particles as object;
  let c = registry.get(key);
  if (!c) {
    c = new ContactFx(fx.particles as unknown as ContactParticles);
    registry.set(key, c);
  }
  return c;
}
