/**
 * Heroes: one upright PPK-style character per slot (render/chars/: one skinned mesh, plus an ink outline hull on Med
 * and High), a relation ring underfoot, and the animation the snapshots imply: facing from the interpolated yaw with
 * a turn lean, a gait whose phase follows ground distance, the per-hero attack and cast, hit flinch, held poses for
 * block / channel / stun / fear, the faint pose and sink on death, the nap pose while recalling, a respawn pop, and
 * stealth. Render only: reads interpolated ViewEntity data, never the sim.
 */
import * as THREE from 'three';
import { BuffFlag, type HeroId } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { NX, NY, createGrid } from '../../sim/map/grid';
import { RELATION } from '../palette';
import { ELEMENT_COLOR, lookKey, type Look } from '../cosmetics';
import { boldRingTexture, dashRingTexture, DecalLayer, discTexture, ringTexture } from './decals';
import { HERO_RING } from './models';
import { casterDepthMaterial } from './rig';
import { DETAIL, makeHero, type Character, type CharState } from '../chars';
import type { MotionInput } from '../chars/motion';
import { getSkin, isCardSkinId } from '../skins/skinStore';
import { TierFx, type FxHero } from '../skins/tierFx';
import type { CardFx } from '../skins/cardFx';
import { skinFxFor } from '../skins/coatRung';
import { emptyProfile, foilColor, stageOf } from '../skins/effectKit';
import { STEADFAST_ALPHA, STEADFAST_OUTLINE, STEADFAST_RING_SCALE, isSteadfast } from '../steadfast';

export type Relation = 'self' | 'ally' | 'enemy' | 'neutral';

interface HeroRig {
  id: number;
  hero: HeroId;
  team: 0 | 1;
  key: string;
  ch: Character;
  yaw: number;
  deadT: number;
  wasDead: boolean;
  visible: boolean;
  flash: number;
  /** Last drawn position (m) for FX anchoring. */
  pos: THREE.Vector3;
  /** Frame stamp of the last frame that had this hero (replaces a per-frame Set, ANIM-SPEC D6). */
  seen: number;
  /** Smoothed planar velocity / acceleration (world m/s, m/s²) for springs and the dash stretch. */
  vx: number;
  vz: number;
  ax: number;
  az: number;
  /** Sim position (m) last frame (the velocity) and the smoothed visual push-apart offset (m). */
  simX: number;
  simZ: number;
  sepX: number;
  sepZ: number;
  /** The player's own hero: its see-through silhouette where a body or a tower hides it (null for everyone else). */
  xray: THREE.SkinnedMesh | null;
  /** Drawn body alpha (eased toward the stealth look; trailer v3.3 review). */
  alpha: number;
  /** PERF-IOS §8 Track B: the inputs `key` was built from, so a steady frame skips building the key string. */
  kLook: Look | null;
  kDress: number;
  kDetail: number;
  kOutline: boolean;
  kSelf: boolean;
}

/**
 * Visual push-apart (render only; the sim lets units overlap): heroes closer than `min` m are drawn pushed apart along
 * the line between them, each by at most `cap` m, so two bodies never fuse into one blob or stand inside each other.
 */
export const SEPARATION = Object.freeze({ min: 1.5, cap: 1.2, rate: 20, iters: 4, zK: 2.2, warm: 0.85 });

/**
 * Structures and big units a hero body is drawn clear of (render only): a hero is pushed out of a tower's, core's or
 * Pudding's footprint to `r` + BODY_R m, at most `cap` m (trailer review: Lambo stood half inside the tower base).
 */
export const OBSTACLE_CLEAR = Object.freeze({ bodyR: 0.5, cap: 3.2 });

/**
 * Per-hero body radius (m) for the push-apart (per-hero visual size, chars/heroSize.ts): HERO_RING × BODY_K, so two
 * Clems keep SEPARATION.min apart while wide Meatball and the tanks keep more room and tiny Pixel less. Render only.
 */
export const BODY_K = 0.37;
/** The most a big body's radius may add over two Clems' (m): a body drawn far from its sim point misreads skillshots. */
export const BODY_R_MAX = SEPARATION.min / 2 + 0.1;

/**
 * The player's own hero, seen through whatever stands in front of it (feel QA: big Lambo or Brutus bodies hid Clem at
 * spawn and in a fight): the same skinned mesh drawn again in the self gold, additive, only where it is BEHIND
 * something (depthFunc GreaterDepth). It draws after every other opaque body (renderOrder 1) and before the own body
 * (renderOrder 2), so the hero never x-rays itself. One draw, one shared material, render only.
 */
export const XRAY = Object.freeze({ color: 0xffb02e, opacity: 0.4 });
let xrayMat: THREE.MeshBasicMaterial | null = null;
function xrayMaterial(): THREE.MeshBasicMaterial {
  if (!xrayMat) {
    xrayMat = new THREE.MeshBasicMaterial({
      color: XRAY.color,
      opacity: XRAY.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      fog: false,
    });
    xrayMat.name = 'hero-xray';
  }
  return xrayMat;
}
export const bodyRadius = (hero: HeroId): number => Math.min(BODY_R_MAX, HERO_RING[hero] * BODY_K);

/** Scratch arrays for `layoutBodiesInto` (PERF-IOS §8 Track B: sized once, reused every frame). */
export interface LayoutScratch {
  out: { x: number; z: number }[];
  cur: { x: number; z: number }[];
  sq: { x: number; z: number }[];
  sep: { x: number; z: number }[];
  clr: { x: number; z: number };
}
export const layoutScratch = (): LayoutScratch => ({ out: [], cur: [], sq: [], sep: [], clr: new XZ() });
/**
 * A reused 2D point. A class, not an `{ x, z }` literal: literals share V8's map tree with every other `{ x, z }` in
 * the bundle, and one non-number stored in one of those makes every double store into these allocate a box.
 */
export class XZ {
  x = 0.5;
  z = 0.5;
}
const grow = (a: { x: number; z: number }[], n: number): void => {
  while (a.length < n) a.push(new XZ());
};

/**
 * Drawn offsets (m) for bodies at `pts` (pure): pairwise push-apart and push-out of the `obs` footprints, relaxed over
 * a few passes so a hero squeezed between a tower and an ally is not pushed back into either. Each offset is capped
 * (`cap` for the push-apart share, OBSTACLE_CLEAR.cap overall).
 */
export function layoutBodies(
  pts: readonly { x: number; z: number }[],
  obs: readonly { x: number; z: number; r: number }[] = [],
  warm: readonly { x: number; z: number }[] | null = null,
  min = SEPARATION.min,
  cap = SEPARATION.cap,
  radii: readonly number[] | null = null,
): { x: number; z: number }[] {
  const ws = layoutScratch();
  layoutBodiesInto(pts, obs, warm, min, cap, radii, ws);
  return ws.out.slice(0, pts.length);
}

/** `layoutBodies` into `ws.out[0..pts.length)` with no allocation once the scratch arrays have grown (per frame). */
export function layoutBodiesInto(
  pts: readonly { x: number; z: number }[],
  obs: readonly { x: number; z: number; r: number }[],
  warm: readonly { x: number; z: number }[] | null,
  min: number,
  cap: number,
  radii: readonly number[] | null,
  ws: LayoutScratch,
): void {
  const n = pts.length;
  grow(ws.out, n);
  grow(ws.cur, n);
  grow(ws.sq, n);
  grow(ws.sep, n);
  const { out, cur, sq, sep, clr } = ws;
  // warm start from last frame's offsets (decaying): a body deep inside a moving footprint keeps pushing out the same
  // way instead of flipping sides frame to frame (trailer review: Clem stood in Pudding while he walked through her)
  for (let i = 0; i < n; i++) {
    const w = warm ? warm[i] : undefined;
    out[i].x = (w?.x ?? 0) * SEPARATION.warm;
    out[i].z = (w?.z ?? 0) * SEPARATION.warm;
    cur[i].x = pts[i].x + out[i].x;
    cur[i].z = pts[i].z + out[i].z;
  }
  // the gameplay camera looks north from above: two bodies one behind the other (along z) overlap on screen sooner
  // than two side by side, so depth counts zK times less and the push goes mostly sideways (screen x)
  const k = SEPARATION.zK;
  for (let it = 0; it < SEPARATION.iters; it++) {
    for (let i = 0; i < n; i++) {
      sq[i].x = cur[i].x;
      sq[i].z = cur[i].z / k;
    }
    spreadSideways(sq, n, min, cap, radii, sep);
    for (let i = 0; i < n; i++) {
      out[i].x += sep[i].x * 0.5;
      out[i].z += sep[i].z * 0.5;
      if (obs.length) {
        // a bigger body clears towers by more (OBSTACLE_CLEAR.bodyR is Clem's, radius 2.03 × BODY_K)
        const c = clearOfObstacles(pts[i].x + out[i].x, pts[i].z + out[i].z, obs, radii ? OBSTACLE_CLEAR.bodyR * (radii[i] / (2.03 * BODY_K)) : OBSTACLE_CLEAR.bodyR, OBSTACLE_CLEAR.cap, clr);
        out[i].x += c.x;
        out[i].z += c.z;
      }
      const ox = out[i].x;
      const oz = out[i].z;
      const l = Math.sqrt(ox * ox + oz * oz);
      const lim = OBSTACLE_CLEAR.cap;
      if (l > lim) {
        out[i].x *= lim / l;
        out[i].z *= lim / l;
      }
      cur[i].x = pts[i].x + out[i].x;
      cur[i].z = pts[i].z + out[i].z;
    }
  }
}

/**
 * Pairwise push-apart in the depth-scaled space (z / zK: depth counts less), biased sideways: two bodies one behind the other are moved
 * apart across the screen (x), not further along the line of sight, where they would still overlap (pure; writes `out[0..n)`).
 */
function spreadSideways(pts: readonly { x: number; z: number }[], n: number, min: number, cap: number, radii: readonly number[] | null, out: { x: number; z: number }[]): void {
  for (let i = 0; i < n; i++) {
    out[i].x = 0;
    out[i].z = 0;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[j].x - pts[i].x;
      const dz = pts[j].z - pts[i].z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const m = radii ? radii[i] + radii[j] : min;
      if (d >= m) continue;
      const push = (m - d) / 2;
      const side = Math.abs(dx) > 1e-3 ? Math.sign(dx) : j % 2 === 0 ? 1 : -1;
      let ux = d > 1e-4 ? dx / d : side;
      let uz = d > 1e-4 ? dz / d : 0;
      if (Math.abs(ux) < 0.8) ux = side * 0.8;
      uz *= 0.6;
      const l = Math.sqrt(ux * ux + uz * uz) || 1;
      ux /= l;
      uz /= l;
      out[i].x -= ux * push;
      out[i].z -= uz * push;
      out[j].x += ux * push;
      out[j].z += uz * push;
    }
  }
  for (let i = 0; i < n; i++) {
    const o = out[i];
    const l = Math.sqrt(o.x * o.x + o.z * o.z);
    if (l > cap) {
      o.x *= cap / l;
      o.z *= cap / l;
    }
  }
}

/** The offset (m) that moves a body at (x, z) out of every footprint circle (pure; 0 when clear). Writes `out` when given. */
export function clearOfObstacles(
  x: number,
  z: number,
  obs: readonly { x: number; z: number; r: number }[],
  bodyR: number = OBSTACLE_CLEAR.bodyR,
  cap: number = OBSTACLE_CLEAR.cap,
  out: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number } {
  let ox = 0;
  let oz = 0;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const dx = x + ox - o.x;
    const dz = z + oz - o.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const min = o.r + bodyR;
    if (d >= min) continue;
    const ux = d > 1e-4 ? dx / d : 0;
    const uz = d > 1e-4 ? dz / d : 1;
    ox += ux * (min - d);
    oz += uz * (min - d);
  }
  const l = Math.sqrt(ox * ox + oz * oz);
  if (l > cap) {
    ox *= cap / l;
    oz *= cap / l;
  }
  out.x = ox;
  out.z = oz;
  return out;
}

/**
 * MAP-GAPS A25 (cosmetic stopgap; the sim fix is MAP-GAPS B7): the static wall cells (rocks, forest) round each body
 * as footprint circles (cell centre, radius WALL_CELL_R m), so a body that grazes a corner is not drawn inside the
 * rock or the trees. A body on the next cell's centre is not pushed (1 m ≥ the body's 0.5 + 0.5).
 */
export const WALL_CELL_R = 0.5;
let wallGrid: Uint8Array | null = null;
const wallSeen = new Set<number>();
/** Reused wall-cell records (wallObstacles' default output is fresh objects; the per-frame caller passes `pool`). */
export function wallObstacles(pts: readonly { x: number; z: number }[], out: { x: number; z: number; r: number }[] = [], pool: { x: number; z: number; r: number }[] | null = null): { x: number; z: number; r: number }[] {
  wallGrid ??= createGrid().walls;
  out.length = 0;
  const seen = wallSeen;
  seen.clear();
  for (let pi = 0; pi < pts.length; pi++) {
    const p = pts[pi];
    const ci = Math.floor(p.x);
    const cj = Math.floor(-p.z);
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const c = j * NX + i;
        if (!wallGrid[c] || seen.has(c)) continue;
        seen.add(c);
        const k = out.length;
        if (pool) {
          if (pool.length <= k) pool.push({ x: 0, z: 0, r: 0 });
          const o = pool[k];
          o.x = i + 0.5;
          o.z = -(j + 0.5);
          o.r = WALL_CELL_R;
          out.push(o);
        } else out.push({ x: i + 0.5, z: -(j + 0.5), r: WALL_CELL_R });
      }
    }
  }
  return out;
}

/** Pairwise push-apart offsets (pure): for points (x, z) m, the offset (m) each is drawn at. Coincident points fan out. */
export function separate(pts: readonly { x: number; z: number }[], min = SEPARATION.min, cap = SEPARATION.cap): { x: number; z: number }[] {
  const out = pts.map(() => ({ x: 0, z: 0 }));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      // a tiny fixed spread per index (golden angle), so heroes on one spot fan out round it instead of lining up
      let dx = pts[j].x + Math.cos(j * 2.39996) * 0.01 - pts[i].x - Math.cos(i * 2.39996) * 0.01;
      let dz = pts[j].z + Math.sin(j * 2.39996) * 0.01 - pts[i].z - Math.sin(i * 2.39996) * 0.01;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-4) {
        // coincident: a fixed direction per pair (golden angle), so three stacked heroes fan out instead of lining up
        dx = Math.cos(j * 2.39996) - Math.cos(i * 2.39996);
        dz = Math.sin(j * 2.39996) - Math.sin(i * 2.39996);
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        d = 1e-4;
      }
      const push = (min - d) / 2;
      const ux = d > 1e-4 ? dx / d : dx;
      const uz = d > 1e-4 ? dz / d : dz;
      out[i].x -= ux * push;
      out[i].z -= uz * push;
      out[j].x += ux * push;
      out[j].z += uz * push;
    }
  }
  for (const o of out) {
    const l = Math.hypot(o.x, o.z);
    if (l > cap) {
      o.x *= cap / l;
      o.z *= cap / l;
    }
  }
  return out;
}

/** Peak hit-flash mix on a hero (trailer review: 0.42 turned a hit or tower-locked hero into a white body). */
export const HIT_FLASH_MAX = 0.22;

/**
 * The stealth look (render only): the body eases toward `alpha` at `rate` per s and back, and its outline hull stays
 * on until the body is below `outlineBelow`. Trailer v3.3 review: a dog hero whose stealth lasted 3 ticks snapped to a
 * pale, see-through grey copy without its outline and popped back (read as a broken material or a model popping in).
 */
export const STEALTH_LOOK = Object.freeze({ alpha: 0.42, rate: 8, outlineBelow: 0.6 });

/** The drawn body alpha this frame (pure): eased from `prev` toward the stealth look or full. */
export function stealthAlpha(prev: number, stealth: boolean, dt: number): number {
  const want = stealth ? STEALTH_LOOK.alpha : 1;
  const v = prev + (want - prev) * Math.min(1, Math.max(0, dt) * STEALTH_LOOK.rate);
  return Math.abs(v - want) < 0.01 ? want : v;
}

/**
 * After the match ends the render clock stops, so every body froze in its last pose (trailer v3.3 review: the heroes
 * held one pose after VICTORY!). Once the clock has stood still for `after` s past the end, the bodies idle on real
 * time (render only; hit-stops during play still hold their pose).
 */
export const END_IDLE = Object.freeze({ after: 0.25 });

/** The animation step this frame (pure): the render clock's step, or real time once the ended clock stands still. */
export function animStep(dtR: number, dt: number, ended: boolean, stillT: number): number {
  return ended && dtR <= 1e-4 && stillT >= END_IDLE.after ? dt : dtR;
}

/** Fun pass (playtest #4): the Toy ring colour by tier (1 bronze, 2 silver, 3 and 4 gold). */
const TOY_METAL = [0xd99560, 0xdfe6f0, 0xffd34d] as const;

/** The player's own ring is this much larger than a relation ring (it sits outside the hero's footprint). */
export const SELF_RING_SCALE = 1.15;
/** Seconds between the own ring's outward pings. */
const SELF_PING = 1.3;

/** Sim v9 status glows underfoot: Avietė's charge (her sparks) and a charm (Gabė's hearts). */
const CHARGE_GLOW = 0xffe24d;
const CHARM_GLOW = 0xff6fa8;

/** Wrap an angle difference to -PI..PI. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The animation state a hero snapshot implies. */
export function charState(e: Pick<ViewEntity, 'state' | 'buffs' | 'speed' | 'charmed'>): CharState {
  if (e.state === 'dead') return 'dead';
  if (e.state === 'napping') return 'napping';
  if (e.buffs & BuffFlag.Stunned) return 'stunned';
  // Sim v9: a charmed hero walks to its charmer (Gabė's Under Her Spell), it does not cower.
  if (e.buffs & BuffFlag.Feared) return e.charmed ? 'moving' : 'feared';
  if (e.buffs & BuffFlag.Blocking) return 'blocking';
  if (e.buffs & BuffFlag.Channeling) return 'channel';
  return (e.speed * 30) / 1000 > 0.35 ? 'moving' : 'idle';
}

export class HeroView {
  readonly group = new THREE.Group();
  /** Sim v21: how high (m) a hero flies off a Boing Bed right now, and its spin (rad); null = never (funView). */
  liftOf: ((id: number) => number) | null = null;
  spinOf: ((id: number) => number) | null = null;
  private rigs = new Map<number, HeroRig>();
  /** v3.6: where hero `id` was drawn this frame (m, after the visual push-apart), or null when it has no rig. */
  drawnAt(id: number): { x: number; z: number } | null {
    const r = this.rigs.get(id);
    return r ? r.pos : null;
  }
  // Normal blending: an additive red ring on sand reads yellow, like an ally's (enemy rings must read red).
  private rings = new DecalLayer(ringTexture(), 8, { additive: false, y: 0.05, name: 'hero-rings' });
  /** Round 0: a chroma reads at match zoom: a soft element-coloured glow underfoot, pulsing with the stride. */
  private auras = new DecalLayer(discTexture(), 8, { additive: true, y: 0.045, renderOrder: 1, name: 'hero-chroma' });
  /**
   * The player's own hero (brawl readability): a thick gold ring on an ink band, breathing, plus a ping ring that
   * rolls outward every SELF_PING s. Both draw after every VFX layer (renderOrder 9; particles 6–7, shockwaves 4–7),
   * so sparks and shockwaves never bury them; the depth test stays on, so the hero's body still sits in front.
   */
  private selfRing = new DecalLayer(boldRingTexture(), 1, { y: 0.065, renderOrder: 9, name: 'hero-self-ring' });
  /**
   * Fun pass (playtest #4: "nothing on the model changes" after a Toy): each Toy tier shows underfoot on every hero, a
   * turning dashed ring in the tier's metal (bronze, silver, gold; tier 4 adds a second, counter-turning ring), so a
   * fed enemy and your own spike read at a glance. Two rings a hero at most: capacity 12.
   */
  private toyRings = new DecalLayer(dashRingTexture(), 12, { additive: false, y: 0.055, renderOrder: 2, name: 'hero-toy-rings' });
  private selfPing = new DecalLayer(ringTexture(), 1, { additive: true, y: 0.06, renderOrder: 9, name: 'hero-self-ping' });
  private time = 0;
  /** Seconds the render clock has stood still, and the real time idled since the match ended (END_IDLE). */
  private stillT = 0;
  private endIdle = 0;
  private frameNo = 0;
  /** Render tick of the last frame (clips run on the render clock, so hitstop holds them: D5). */
  private lastTick = NaN;
  /** The animation director (render/anim/director.ts); null keeps the legacy animator (lobby, tests). */
  director: { respawned(id: number): void; emote?(id: number): boolean } | null = null;
  mySlot = 0;
  myTeam: 0 | 1 = 0;
  /** Round 2: team 0 is the dogs (the human picked a dog); each team's cloth follows its species. */
  styleSwap = false;
  /** No visual push-apart (tests that read exact positions). */
  reducedSep = false;
  /** Footprints (m) of standing structures and Pudding this frame (gameView): bodies are drawn outside them. */
  obstacles: readonly { x: number; z: number; r: number }[] = [];
  private sepObs: { x: number; z: number; r: number }[] = [];
  private wallObs: { x: number; z: number; r: number }[] = [];
  private readonly sepPts: { x: number; z: number }[] = [];
  private readonly sepIds: number[] = [];
  private readonly sepWarm: { x: number; z: number }[] = [];
  private readonly sepR: number[] = [];
  private readonly sepPtPool: { x: number; z: number }[] = [];
  private readonly sepWarmPool: { x: number; z: number }[] = [];
  private readonly wallPool: { x: number; z: number; r: number }[] = [];
  private readonly sepWs = layoutScratch();
  /** The animator's input, reused for every hero every frame (Animator.update reads it and keeps nothing). */
  private readonly motionIn: MotionInput = { state: 'idle', speed: 0, height: 1, yawRate: 0, now: undefined, vx: 0, vz: 0, ax: 0, az: 0 };
  shadows = true;
  /** Mesh detail and the outline hull (quality tier: Low is lighter and has no hull, POC.md §10). */
  detail: number = DETAIL.med;
  outlines = true;
  /** PERF-IOS: which heroes get the hull: all, the own hero and enemies ('key', phones), the own hero, none. */
  outlineScope: 'all' | 'key' | 'own' | 'none' = 'all';
  /** Render-only looks per hero slot (the player's cosmetics; bots wear the default). */
  looks = new Map<number, Look>();
  /** Card skin rarity effects (render/skins/tierFx.ts); null = none (the lobby). GameView sets it with its particles. */
  tierFx: TierFx | null = null;
  /** The camera focus (m) for the team-fight test. */
  focus = { x: 0, z: 0 };
  private readonly fxHero: FxHero = { id: 0, x: 0, z: 0, rung: 'COMMON', element: 'FIRE', self: false, moving: false, stealth: false, dead: false, napping: false, phase: 0 };
  private readonly fxPos: { x: number; z: number; dead: boolean }[] = Array.from({ length: 8 }, () => ({ x: 0, z: 0, dead: true }));
  /** Wave C (C4): per slot, the last drawn frame's team and stealth, and a reused CardFx. */
  private readonly slotTeam = new Uint8Array(16);
  private readonly slotStealth = new Uint8Array(16);
  private readonly cardOut: CardFx[] = Array.from({ length: 16 }, () => emptyProfile());
  /** CARD-SKINS.md: per slot, the hero level last drawn (Awakened stage), and what the cached profile was built from. */
  private readonly slotLevel = new Uint8Array(16).fill(1);
  private readonly profCoat: (string | null)[] = new Array<string | null>(16).fill(null);
  private readonly profRev = new Int32Array(16).fill(-1);
  private readonly profMeta = new Int8Array(16).fill(-1);
  private readonly profHero: (HeroId | null)[] = new Array<HeroId | null>(16).fill(null);
  private readonly profHit: (CardFx | null)[] = new Array<CardFx | null>(16).fill(null);

  constructor() {
    this.group.name = 'heroes';
    this.group.add(this.rings.mesh, this.toyRings.mesh);
    this.group.add(this.auras.mesh);
    this.group.add(this.selfRing.mesh, this.selfPing.mesh);
  }

  relationOf(e: { id: number; team: number }): Relation {
    if (e.id === this.mySlot) return 'self';
    if (e.team === 2) return 'neutral';
    return e.team === this.myTeam ? 'ally' : 'enemy';
  }

  /** Quality tier: rebuilds the heroes at the new detail on their next frame. */
  setQuality(low: boolean, outlines: boolean | 'all' | 'key' | 'own' | 'none'): void {
    this.detail = low ? DETAIL.low : DETAIL.med;
    this.outlineScope = outlines === true ? 'all' : outlines === false ? 'none' : outlines;
    this.outlines = this.outlineScope !== 'none';
  }

  /** The hull for this hero under the scope: allies and companions read by their rings on a phone. */
  private outlineFor(team: number, self: boolean): boolean {
    const sc = this.outlineScope;
    return sc === 'all' || (sc === 'own' && self) || (sc === 'key' && (self || team !== this.myTeam));
  }

  private drop(r: HeroRig): void {
    this.group.remove(r.ch.object);
    r.ch.dispose();
    this.rigs.delete(r.id);
  }

  private ensure(e: ViewEntity): HeroRig {
    let r = this.rigs.get(e.id);
    const look = this.looks.get(e.id) ?? null;
    const hero = e.hero ?? 'clem';
    const team = (e.team === 1 ? 1 : 0) as 0 | 1;
    // round 2: the cloth follows the species (a dog-picking human's team wears the Woof blue)
    const dress = (this.styleSwap ? 1 - team : team) as 0 | 1;
    const self = e.id === this.mySlot;
    const outline = this.outlineFor(e.team, self);
    // a steady frame: the same inputs as the rig's key (no key string built)
    if (r && r.hero === hero && r.kLook === look && r.kDress === dress && r.kDetail === this.detail && r.kOutline === outline && r.kSelf === self) return r;
    const key = `${hero}:${dress}:${lookKey(look)}:${this.detail}:${outline ? 1 : 0}:${self ? 1 : 0}`;
    if (r && r.key === key) {
      r.kLook = look;
      r.kDress = dress;
      r.kDetail = this.detail;
      r.kOutline = outline;
      r.kSelf = self;
    }
    if (r && r.key !== key) {
      this.drop(r);
      r = undefined;
    }
    if (!r) {
      const ch = makeHero(hero, dress, look, { detail: this.detail, outline, shadows: this.shadows, match: true, self });
      // no outline hull (Low): a darker ink rim keeps the silhouette off the sand (ivory Clem faded into the lane)
      if (!outline) ch.material.userData.u.uRim.value = 0.78;
      ch.object.name = `hero-${e.id}`;
      ch.mesh.customDepthMaterial = casterDepthMaterial('skinned');
      this.group.add(ch.object);
      let xray: THREE.SkinnedMesh | null = null;
      if (self) {
        xray = new THREE.SkinnedMesh(ch.mesh.geometry, xrayMaterial());
        xray.name = 'hero-xray';
        xray.frustumCulled = false;
        xray.castShadow = false;
        xray.renderOrder = 1;
        ch.mesh.renderOrder = 2;
        if (ch.outline) ch.outline.renderOrder = 2;
        ch.mesh.parent?.add(xray);
        xray.bind(ch.mesh.skeleton, ch.mesh.bindMatrix);
      }
      r = { id: e.id, hero, team, key, ch, yaw: e.yaw, deadT: 0, wasDead: e.state === 'dead', visible: true, flash: 0, pos: new THREE.Vector3(toX(e.fx), 0, toZ(e.fy)), seen: -1, vx: 0, vz: 0, ax: 0, az: 0, simX: toX(e.fx), simZ: toZ(e.fy), sepX: 0, sepZ: 0, xray, alpha: 1, kLook: look, kDress: dress, kDetail: this.detail, kOutline: outline, kSelf: self };
      this.rigs.set(e.id, r);
    }
    return r;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const r of this.rigs.values()) r.ch.mesh.castShadow = on;
  }

  /** A basic attack or ability swing by `id`. */
  swing(id: number): void {
    this.rigs.get(id)?.ch.anim.swing();
  }

  /** A cast pose by `id`. */
  cast(id: number): void {
    this.rigs.get(id)?.ch.anim.cast();
  }

  /** Play an emote pose on hero `id` (render only). Returns false when that hero is not drawn. */
  emote(id: number, pose: string, seconds = 1.4): boolean {
    const r = this.rigs.get(id);
    if (!r || !r.visible) return false;
    // a filled hero plays its own authored emote; stubs keep the legacy pose
    if (this.director?.emote?.(id)) return true;
    r.ch.anim.emote(pose, seconds);
    return true;
  }

  hit(id: number, heavy = false): void {
    const r = this.rigs.get(id);
    if (!r) return;
    r.flash = heavy ? 1 : 0.75;
    r.ch.anim.hit(heavy);
  }

  /** Last drawn position (m) of a hero, for FX. */
  positionOf(id: number): THREE.Vector3 | null {
    const r = this.rigs.get(id);
    return r && r.visible ? r.pos : null;
  }

  /** The drawn hero `id` (character, hero, team, place) for the animation director, or null. */
  rigOf(id: number): HeroRig | null {
    return this.rigs.get(id) ?? null;
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    const stamp = ++this.frameNo;
    // the render clock's step (0 while a hitstop holds it): animation time, so impact poses hold (D5)
    const dtR = this.lastTick === this.lastTick ? Math.max(0, Math.min(0.1, (frame.tick - this.lastTick) / 30)) : dt;
    this.lastTick = frame.tick;
    // the ended match: the clock stands still, the bodies keep idling on real time (END_IDLE)
    const ended = frame.latest?.clock?.phase === 'ended';
    this.stillT = dtR > 1e-4 ? 0 : this.stillT + dt;
    const aStep = animStep(dtR, dt, ended, this.stillT);
    const idleEnd = ended && aStep !== dtR;
    if (idleEnd) this.endIdle += dt;
    else if (!ended) this.endIdle = 0;
    const now = frame.tick / 30 + this.endIdle;
    this.rings.begin();
    this.toyRings.begin();
    this.auras.begin();
    this.selfRing.begin();
    this.selfPing.begin();
    const fx = this.tierFx;
    if (fx) {
      let n = 0;
      for (const e of frame.entities) {
        if (e.kind !== 'hero' || n >= this.fxPos.length) continue;
        const q = this.fxPos[n++];
        q.x = toX(e.fx);
        q.z = toZ(e.fy);
        q.dead = e.state === 'dead';
      }
      for (let i = n; i < this.fxPos.length; i++) this.fxPos[i].dead = true;
      fx.begin(dt, this.focus.x, this.focus.z, this.fxPos);
    }
    // the visual push-apart targets for this frame (render only)
    this.sepPts.length = 0;
    this.sepIds.length = 0;
    this.sepWarm.length = 0;
    this.sepR.length = 0;
    const ents = frame.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.kind !== 'hero') continue;
      // PERF-IOS §8 Track B: the point records are reused (one per hero slot), not built every frame
      const n = this.sepPts.length;
      if (this.sepPtPool.length <= n) {
        this.sepPtPool.push(new XZ());
        this.sepWarmPool.push(new XZ());
      }
      const pt = this.sepPtPool[n];
      pt.x = toX(e.fx);
      pt.z = toZ(e.fy);
      this.sepPts.push(pt);
      this.sepIds.push(e.id);
      const was = this.rigs.get(e.id);
      const w = this.sepWarmPool[n];
      w.x = was?.sepX ?? 0;
      w.z = was?.sepZ ?? 0;
      this.sepWarm.push(w);
      this.sepR.push(e.hero ? bodyRadius(e.hero) : SEPARATION.min / 2);
    }
    // MAP-GAPS A25: the structures plus the wall cells round the heroes
    this.sepObs.length = 0;
    for (let i = 0; i < this.obstacles.length; i++) this.sepObs.push(this.obstacles[i]);
    const walls = wallObstacles(this.sepPts, this.wallObs, this.wallPool);
    for (let i = 0; i < walls.length; i++) this.sepObs.push(walls[i]);
    if (!this.reducedSep) layoutBodiesInto(this.sepPts, this.sepObs, this.sepWarm, SEPARATION.min, SEPARATION.cap, this.sepR, this.sepWs);
    const sep = this.reducedSep ? null : this.sepWs.out;
    for (let ei = 0; ei < ents.length; ei++) {
      const e = ents[ei];
      if (e.kind !== 'hero') continue;
      const r = this.ensure(e);
      r.seen = stamp;
      const ch = r.ch;
      const dead = e.state === 'dead';
      const simX = toX(e.fx);
      const simZ = toZ(e.fy);
      const si = sep ? this.sepIds.indexOf(e.id) : -1;
      const k = Math.min(1, dt * SEPARATION.rate);
      const tx = si >= 0 ? sep![si].x : 0;
      const tz = si >= 0 ? sep![si].z : 0;
      r.sepX += (tx - r.sepX) * k;
      r.sepZ += (tz - r.sepZ) * k;
      const x = simX + r.sepX;
      const z = simZ + r.sepZ;
      // planar velocity and acceleration (smoothed), for the springs and the dash stretch
      if (dtR > 1e-4) {
        const vx = (simX - r.simX) / dtR;
        const vz = (simZ - r.simZ) / dtR;
        const teleport = vx * vx + vz * vz > 900;
        const nvx = teleport ? 0 : vx;
        const nvz = teleport ? 0 : vz;
        const k = Math.min(1, dtR * 18);
        const ax = (nvx - r.vx) / dtR;
        const az = (nvz - r.vz) / dtR;
        r.ax += (Math.max(-80, Math.min(80, ax)) - r.ax) * k;
        r.az += (Math.max(-80, Math.min(80, az)) - r.az) * k;
        r.vx += (nvx - r.vx) * Math.min(1, dtR * 30);
        r.vz += (nvz - r.vz) * Math.min(1, dtR * 30);
      }
      r.pos.set(x, 0, z);
      r.simX = simX;
      r.simZ = simZ;
      if (dead && !r.wasDead) r.deadT = 0;
      if (!dead && r.wasDead) {
        ch.anim.respawn();
        this.director?.respawned(e.id);
      }
      r.wasDead = dead;
      if (dead) r.deadT += dt;
      // facing: the interpolated yaw, with the yaw rate for the turn lean
      const dyaw = dead ? 0 : wrap(e.yaw - r.yaw);
      const yawRate = dt > 0 ? dyaw / dt : 0;
      r.yaw = dead ? r.yaw : e.yaw;
      // object space (facing +X): the velocity and acceleration the root and springs read
      const cy = Math.cos(r.yaw);
      const sy = Math.sin(r.yaw);
      ch.anim.stack.yaw = r.yaw;
      const mi = this.motionIn;
      mi.state = idleEnd && !dead ? 'idle' : charState(e);
      mi.speed = idleEnd ? 0 : (e.speed * 30) / 1000;
      mi.height = ch.height;
      mi.yawRate = yawRate;
      mi.now = this.director ? now : undefined;
      mi.vx = r.vx * cy - r.vz * sy;
      mi.vz = r.vx * sy + r.vz * cy;
      mi.ax = r.ax * cy - r.az * sy;
      mi.az = r.ax * sy + r.az * cy;
      ch.anim.update(this.director ? aStep : dt, mi);
      const sink = dead ? Math.max(0, (r.deadT - 1.2) * 0.8) : 0;
      r.visible = !(dead && r.deadT > 2.6);
      ch.object.visible = r.visible;
      ch.object.position.set(x, -sink + (this.liftOf ? this.liftOf(e.id) : 0), z);
      ch.object.rotation.y = r.yaw + (this.spinOf ? this.spinOf(e.id) : 0);
      r.flash = Math.max(0, r.flash - dt * 5);
      const u = ch.material.userData.u;
      const fall = dead ? Math.min(1, r.deadT / 0.35) : 0;
      // the hit flash is capped so it never washes out the coat (a flashing pug read as a pale-pink blob)
      u.uFlashK.value = dead ? 0.35 * fall : Math.min(HIT_FLASH_MAX, r.flash * 0.3);
      u.uFlash.value.setHex(dead ? 0x6b6b80 : 0xffffff);
      const stealth = (e.buffs & BuffFlag.Stealth) !== 0;
      if (r.xray) r.xray.visible = !dead && !stealth;
      if (e.id >= 0 && e.id < 16) {
        this.slotTeam[e.id] = e.team === 1 ? 1 : 0;
        this.slotStealth[e.id] = stealth ? 1 : 0;
        this.slotLevel[e.id] = Math.max(1, Math.min(255, e.level ?? 1));
      }
      // eased (STEALTH_LOOK): a stealth of a few ticks is a shimmer, never a grey copy popping in and out
      r.alpha = stealthAlpha(r.alpha, stealth, dt);
      if (u.uOpacity.value !== r.alpha) {
        const was = u.uOpacity.value < 1;
        u.uOpacity.value = r.alpha;
        const tr = r.alpha < 1;
        if (tr !== was || ch.material.transparent !== tr) {
          ch.material.transparent = tr;
          ch.material.needsUpdate = true;
        }
        if (ch.outline) ch.outline.visible = r.alpha >= STEALTH_LOOK.outlineBelow;
      }
      // card skins (GDD §7.2) and rung coats (CARD-SKINS.md): Epic glints, the recall nap motif, Legendary foil and
      // recall flourish, the Awakened steps; never an aura
      const lookCoat = this.looks.get(e.id)?.coat;
      const skin = fx && isCardSkinId(lookCoat) ? getSkin(lookCoat) : null;
      const prof = fx && e.id >= 0 && e.id < 16 ? this.cardOf(e.id) : null;
      if (fx && (skin || prof)) {
        const h = this.fxHero;
        h.id = e.id;
        h.x = x;
        h.z = z;
        h.rung = prof ? prof.rung : skin!.rung;
        h.element = prof ? prof.element : skin!.element;
        h.self = e.id === this.mySlot;
        h.featured = !!skin?.featured; // pawlegends: Nature only for the player's real roster
        h.coat = !skin;
        h.profile = prof;
        h.moving = charState(e) === 'moving';
        h.stealth = stealth;
        h.dead = dead;
        h.napping = e.state === 'napping';
        h.phase = ch.anim.stridePhase;
        const foil = fx.hero(h);
        u.uFoil.value = foil;
        if (foil > 0) u.uFoilColor.value.setHex(prof ? foilColor(prof) : ELEMENT_COLOR[h.element]);
      } else u.uFoil.value = 0;
      if (!dead) {
        const rel = this.relationOf(e);
        if (rel === 'self') {
          const size = HERO_RING[r.hero] * SELF_RING_SCALE;
          this.selfRing.add(x, z, size * (1 + Math.sin(this.time * 5) * 0.035), RELATION.self, 0.92 + Math.sin(this.time * 5) * 0.08);
          const ph = (this.time % SELF_PING) / SELF_PING;
          this.selfPing.add(x, z, size * (1 + ph * 0.6), RELATION.self, (1 - ph) * 0.9);
        } else this.rings.add(x, z, HERO_RING[r.hero], RELATION[rel], 0.75);
        const toy = Math.min(4, Math.max(0, e.toy ?? 0));
        if (toy > 0 && !stealth) {
          const metal = TOY_METAL[Math.min(3, toy) - 1];
          // normal blending (an additive bronze vanished on sand and water at 667 × 375), outside the own gold ring
          const ts = HERO_RING[r.hero] * (rel === 'self' ? SELF_RING_SCALE * 1.32 : 1.4);
          this.toyRings.add(x, z, ts, metal, 0.75 + toy * 0.06, this.time * (0.5 + toy * 0.15) + e.id);
          if (toy >= 4) this.toyRings.add(x, z, ts * 1.14, metal, 0.8, -this.time * 0.9 + e.id);
        }
        const chroma = this.looks.get(e.id)?.chroma;
        if (chroma && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.45, ELEMENT_COLOR[chroma], 0.55 + Math.sin(this.time * 3 + e.id) * 0.12);
        // Sim v9: Avietė's charge (a fast spark flicker both teams see: the counterplay) and a charmed hero's pink glow.
        if (e.charged && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.7, CHARGE_GLOW, 0.75 + Math.sin(this.time * 14 + e.id) * 0.25);
        // Sim v17: Shiny Coat's 0.5 s fill: a fainter, faster flicker both teams see (the counterplay: back off now).
        else if (e.charging && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.45, CHARGE_GLOW, 0.4 + Math.sin(this.time * 24 + e.id) * 0.2);
        // Sim v17 Steadfast: the white outline while the CC-cap immunity runs.
        if (isSteadfast(e.buffs) && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * STEADFAST_RING_SCALE, STEADFAST_OUTLINE, STEADFAST_ALPHA);
        if (e.charmed) this.auras.add(x, z, HERO_RING[r.hero] * 1.5, CHARM_GLOW, 0.7 + Math.sin(this.time * 6) * 0.2);
      }
    }
    this.hideStamp = stamp;
    this.rigs.forEach(this.hideUnseen);
    fx?.end();
    this.rings.end();
    this.toyRings.end();
    this.auras.end();
    this.selfRing.end();
    this.selfPing.end();
  }

  /**
   * Wave C (C4) + CARD-SKINS.md: what hero `id`'s skin adds (render/skins/effectKit.ts profile): its card skin, else
   * its store or pass coat's fixed rung (a card wins when both exist). As the Skin effects setting allows: Off hides
   * every skin, Mine only hides the others'. Tints always; the extras follow tierFx's caps (another hero's only on
   * Med / High and outside a team fight; never from a stealthed hero). Reuses one object per slot, and rebuilds its
   * colours only when the look, the skin's revision, the viewer relation or the hero changes (nothing per frame).
   */
  cardOf(id: number): CardFx | null {
    if (id < 0 || id >= 16) return null;
    const fx = this.tierFx;
    const mode = fx?.mode ?? 'all';
    const self = id === this.mySlot;
    if (mode === 'off' || (mode === 'mine' && !self)) return null;
    const coat = this.looks.get(id)?.coat ?? null;
    const skin = isCardSkinId(coat) ? getSkin(coat) : null;
    const low = fx?.low ?? false;
    const extras = this.slotStealth[id] === 0 && (self || (!low && !(fx?.teamFight ?? false)));
    const team: 0 | 1 = this.slotTeam[id] === 1 ? 1 : 0;
    const hero = this.rigs.get(id)?.hero ?? null;
    const rev = skin ? skin.rev : 0;
    const mate = team === this.myTeam;
    const meta = (self ? 2 : 0) + team + (mate ? 4 : 0);
    const level = this.slotLevel[id];
    if (coat !== this.profCoat[id] || rev !== this.profRev[id] || meta !== this.profMeta[id] || hero !== this.profHero[id]) {
      this.profCoat[id] = coat;
      this.profRev[id] = rev;
      this.profMeta[id] = meta;
      this.profHero[id] = hero;
      this.profHit[id] = skinFxFor(skin, coat, hero, id, self, team, extras, low, level, this.cardOut[id], mate);
    }
    const p = this.profHit[id];
    if (!p) return null;
    p.extras = extras;
    p.low = low;
    p.stage = p.awakened ? stageOf(level) : 0;
    return p;
  }

  private hideStamp = 0;
  private readonly hideUnseen = (r: HeroRig): void => {
    if (r.seen !== this.hideStamp) {
      r.ch.object.visible = false;
      r.visible = false;
    }
  };

  dispose(): void {
    for (const r of [...this.rigs.values()]) this.drop(r);
    xrayMat?.dispose();
    xrayMat = null;
    this.rings.dispose();
    this.toyRings.dispose();
    this.auras.dispose();
    this.selfRing.dispose();
    this.selfPing.dispose();
  }
}

export interface LobbyHero {
  /** Place and turn this (it faces +X at rotation.y 0, like the match models). */
  object: THREE.Group;
  /** The character (animator, mesh) for idle life and the hop. */
  ch: Character;
  dispose(): void;
}

/** A standalone hero for the lobby turntable, the results screen and the portraits (full detail, outlined). */
export function lobbyHero(hero: HeroId, team: 0 | 1 = 0, look?: Look | null, o: { outline?: boolean } = {}): LobbyHero {
  const ch = makeHero(hero, team, look ?? null, { detail: DETAIL.lobby, outline: o.outline ?? true, shadows: true });
  return { object: ch.object, ch, dispose: () => ch.dispose() };
}
