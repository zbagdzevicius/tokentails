/**
 * Item entities (items-ai lane, GDD 4): the plain-data contents of `RaceState.items`. Projectiles and traps are
 * flat records of numbers so the state hash can fold them in a fixed field order. Positions are kept both in world
 * space (for collisions and the view) and in track space (`dist` = continuous distance since the start line, `d` =
 * lateral offset, + = right), which is how the homing yarn and the Laser Dot move.
 */
import type { RaceState } from '../../types';
import type { BuiltTrack } from '../../core/track/build';
import type { BuiltBranch } from '../../core/track/branch';
import { cosL, sinL } from '../../core/sim/fixed';
import { fnvFloat, fnvInt } from '../../core/sim/hash';

export const ProjKind = { Hairball: 0, YarnBall: 1, Laser: 2 } as const;
export type ProjKind = (typeof ProjKind)[keyof typeof ProjKind];
export const TrapKind = { Yarn: 0, Cucumber: 1 } as const;
export type TrapKind = (typeof TrapKind)[keyof typeof TrapKind];

export interface Proj {
  id: number;
  kind: ProjKind;
  owner: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  /** track sample hint, continuous distance, lateral offset */
  si: number;
  dist: number;
  d: number;
  /** ticks left */
  life: number;
  bounces: number;
  /** kart it homes on (yarn ball, Laser Dot), -1 none */
  target: number;
  /** ticks during which the owner cannot be hit */
  imm: number;
  /** Laser Dot: bit k set once kart k was made to chase it (each kart is chased once, B17); ticks since fired */
  hitMask: number;
  age: number;
  /** SIM_VERSION 10, yarn ball: +1 rolls along the lap (+s), -1 against it (thrown by a kart facing back, an arena) */
  dir: number;
  /** SIM_VERSION 10, yarn ball: the alternative route it rolls on (`dist`/`d` are measured on it), -1 = the main loop */
  branch: number;
}

export interface Trap {
  id: number;
  kind: TrapKind;
  owner: number;
  x: number;
  y: number;
  z: number;
  dist: number;
  d: number;
  life: number;
  /** cucumber lob: ticks left in the air (not collidable), the total, and the launch point */
  flight: number;
  flightMax: number;
  fx: number;
  fy: number;
  fz: number;
  imm: number;
}

export interface ItemsState {
  proj: Proj[];
  traps: Trap[];
  /** race-wide Laser Dot cooldown after one resolves, ticks */
  laserCd: number;
  /** kart the Laser Dot warning is showing for (ETA < 1.5 s), -1 none */
  laserWarn: number;
  nextId: number;
  /** stats for the balance harness: uses and landed hits per item kind index (ITEM_IDS order) */
  uses: number[];
  hits: number[];
}

export function newItemsState(): ItemsState {
  return { proj: [], traps: [], laserCd: 0, laserWarn: -1, nextId: 1, uses: [0, 0, 0, 0, 0, 0, 0, 0], hits: [0, 0, 0, 0, 0, 0, 0, 0] };
}

/** The items lane's slot of the race state (created on first access, so a bare RaceState works too). */
export function itemsOf(st: RaceState): ItemsState {
  const slot = st.items as { s?: ItemsState };
  if (!slot.s) slot.s = newItemsState();
  return slot.s;
}

/** Sample index for a continuous track distance (sample 0 is the start line). */
export function sampleAt(t: BuiltTrack, dist: number): number {
  const L = t.length;
  let s = dist - L * Math.floor(dist / L);
  if (s >= L) s -= L;
  return Math.min(t.n - 1, Math.floor(s / t.step));
}

/** World position of (dist, d) on the road centre surface, written into `out`. */
export function trackPoint(t: BuiltTrack, dist: number, d: number, out: { x: number; y: number; z: number; si: number }): void {
  const i = sampleAt(t, dist);
  out.si = i;
  out.x = t.px[i] - t.tz[i] * d;
  out.z = t.pz[i] + t.tx[i] * d;
  out.y = t.py[i] + d * t.bank[i];
}

/** The built branch with id `id`, or null (-1 = the main loop). */
export function branchOf(t: BuiltTrack, id: number): BuiltBranch | null {
  if (id < 0) return null;
  const b = t.branches[id];
  return b && b.id === id ? b : (t.branches.find((x) => x.id === id) ?? null);
}

/**
 * Branch sample for a lap distance on branch `b` (SIM_VERSION 10): `dist` maps linearly onto the branch from its fork
 * to its merge (core/track/branch.ts `s0`, `sk`). -1 when `dist` is outside that range (before the fork, past the merge).
 */
export function branchSampleAt(t: BuiltTrack, b: BuiltBranch, dist: number): number {
  const L = t.length;
  let ds = dist - b.s0;
  ds -= L * Math.floor(ds / L);
  const u = ds / b.sk;
  if (u > b.length) return -1;
  return Math.min(b.m - 1, Math.floor(u / b.step));
}

/**
 * World position of (dist, d) on route `branch` (SIM_VERSION 10): on a branch (`d` from its centre line) when `dist`
 * lies on it, else on the main loop (`trackPoint`). `out.si` is the main sample the query would report (the branch's
 * direction-matched `mapI`). Returns the branch sample, or -1 when the point is on the main loop.
 */
export function routePoint(t: BuiltTrack, dist: number, d: number, branch: number, out: { x: number; y: number; z: number; si: number }): number {
  const b = branchOf(t, branch);
  const j = b ? branchSampleAt(t, b, dist) : -1;
  if (!b || j < 0) {
    trackPoint(t, dist, d, out);
    return -1;
  }
  out.si = b.mapI[j];
  out.x = b.px[j] - b.tz[j] * d;
  out.z = b.pz[j] + b.tx[j] * d;
  out.y = b.py[j] + d * b.bank[j];
  return j;
}

/**
 * +1 when kart k faces along the lap (+s) at its sample, -1 when it faces against it (SIM_VERSION 10): which way along
 * the road "forward" and "back" are for its items. In a race that is nearly always +1; in an arena, where cats roam
 * both ways round the ring, it is half the time -1.
 */
export function facing(t: BuiltTrack, k: { heading: number; si: number }): number {
  return sinL(k.heading) * t.tx[k.si] + cosL(k.heading) * t.tz[k.si] >= 0 ? 1 : -1;
}

/** Signed along-track gap folded into one lap (−L/2..L/2), for items that meet karts a lap apart. */
export function lapGap(t: BuiltTrack, a: number): number {
  return a - t.length * Math.round(a / t.length);
}

const PROJ_F: readonly (keyof Proj)[] = ['id', 'kind', 'owner', 'x', 'y', 'z', 'vx', 'vz', 'si', 'dist', 'd', 'life', 'bounces', 'target', 'imm', 'hitMask', 'age', 'dir', 'branch'];
const TRAP_F: readonly (keyof Trap)[] = ['id', 'kind', 'owner', 'x', 'y', 'z', 'dist', 'd', 'life', 'flight', 'flightMax', 'fx', 'fy', 'fz', 'imm'];

export function hashItems(st: RaceState, h: number): number {
  const s = itemsOf(st);
  h = fnvInt(h, s.proj.length);
  for (const p of s.proj) for (const f of PROJ_F) h = fnvFloat(h, p[f]);
  h = fnvInt(h, s.traps.length);
  for (const p of s.traps) for (const f of TRAP_F) h = fnvFloat(h, p[f]);
  h = fnvInt(h, s.laserCd);
  h = fnvInt(h, s.laserWarn);
  return fnvInt(h, s.nextId);
}
