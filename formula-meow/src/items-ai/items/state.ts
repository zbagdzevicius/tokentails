/**
 * Item entities (items-ai lane, GDD 4): the plain-data contents of `RaceState.items`. Projectiles and traps are
 * flat records of numbers so the state hash can fold them in a fixed field order. Positions are kept both in world
 * space (for collisions and the view) and in track space (`dist` = continuous distance since the start line, `d` =
 * lateral offset, + = right), which is how the homing yarn and the Laser Dot move.
 */
import type { RaceState } from '../../types';
import type { BuiltTrack } from '../../core/track/build';
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

/** Signed along-track gap folded into one lap (−L/2..L/2), for items that meet karts a lap apart. */
export function lapGap(t: BuiltTrack, a: number): number {
  return a - t.length * Math.round(a / t.length);
}

const PROJ_F: readonly (keyof Proj)[] = ['id', 'kind', 'owner', 'x', 'y', 'z', 'vx', 'vz', 'si', 'dist', 'd', 'life', 'bounces', 'target', 'imm', 'hitMask', 'age'];
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
