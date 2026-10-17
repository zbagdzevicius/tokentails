/**
 * Internal state extension and event helpers.
 *
 * `SimStateL1` adds one integer the frozen `SimState` lacks: `btnBuf`, the buttons pressed while the cat
 * was mid-step or in a SWAT/GRAB lock. They fire on the first tick the cat is free again, so a tap is never
 * lost (GDD 5.1 input latch). It is a plain number, so structuredClone and hashState carry it.
 */
import { HumanSt, SIM_VERSION, type HumanStateName, type SimEvent, type SimState } from '../types';

export interface SimStateL1 extends SimState {
  btnBuf: number;
  /**
   * Auto-hop (SIM_VERSION 3): consecutive at-rest ticks the stick has pushed into a cell exactly one level up.
   * At AUTO_HOP_TICKS the cat jumps as if JUMP was pressed (touch players never have to find the button).
   */
  autoHop: number;
  /** SIM_VERSION 4: 1 once the cat has moved in the current continuous stretch of being in a cone ('seen' fired). */
  spotted: number;
  // ----- v5 internals (set by initSim only when rules >= 5, hashed only then) -----
  /** 1 while the current step is a puddle slide (slides never chain). */
  slideStep?: number;
  /** 1 when something made noise this tick (the napper's meter decays only on quiet ticks). */
  noisy?: number;
  /** Prop index of the accomplice's wish (RoomDef.accomplice.wishPropIndex), -1 none. */
  wishProp?: number;
  /** Human index of the napper, -1 none. */
  napper?: number;
  /** Cable cells of cable lamps: [propIndex, x, z, propIndex, x, z, ...]. */
  cables?: number[];
  /** v6: squared cone length of the humans (49 normal rooms, 100 boss rooms); 0/undefined = the full mask. */
  coneR2?: number;
  /** v6: suspicion cap of this run (FTUE_SUSPICION_CAP in the first heist); 0/undefined = SUSPICION_MAX. */
  suspCap?: number;
  /** v6: stack items cap of this room (PARTY_STACK_CAP in the Party room); 0/undefined = no cap. */
  stackCap?: number;
  /**
   * v7 seat chain: the cell (z * w + x + 1) the cat hops on to when the seat jump it is in lands, 0 none. JUMP at a
   * surface two levels up hops onto a seat first and then up, as one press.
   */
  chainHop?: number;
  /** v8: 1 while the cat is red-pawed (frozen in a cone beside a fresh mess); the event fires once per stretch. */
  redpaw?: number;
  /** v8: human index + 1 whose eyes follow the cat (he saw it move during this look), 0 none. */
  track?: number;
}

/** Rule set of a state (SimState.rules; states made before rules existed count as the current version). */
export function rulesOf(s: SimState): number {
  return s.rules ?? SIM_VERSION;
}
/** True when the v8 rules (QA round 3 balance) run. */
export function isV8(s: SimState): boolean {
  return (s.rules ?? SIM_VERSION) >= 8;
}
/** True when the v7 rules (QA round 2 game feel) run. */
export function isV7(s: SimState): boolean {
  return (s.rules ?? SIM_VERSION) >= 7;
}
/** True when the v6 rules (review round 1 balance) run. */
export function isV6(s: SimState): boolean {
  return (s.rules ?? SIM_VERSION) >= 6;
}
/** True when the v5 rules (FULL build) run. */
export function isV5(s: SimState): boolean {
  return (s.rules ?? SIM_VERSION) >= 5;
}

export function internal(s: SimState): SimStateL1 {
  const x = s as SimStateL1;
  if (typeof x.btnBuf !== 'number') x.btnBuf = 0;
  if (typeof x.autoHop !== 'number') x.autoHop = 0;
  if (typeof x.spotted !== 'number') x.spotted = 0;
  return x;
}

const HUMAN_NAMES: readonly HumanStateName[] = ['busy', 'telegraph', 'look', 'fakeout', 'event', 'nap'];
export function humanStateName(st: HumanSt): HumanStateName {
  return HUMAN_NAMES[st];
}

/** Short emoji timeline for the share card (GDD 7). */
export function timelineOf(events: readonly SimEvent[], stamp: number): string {
  let out = '';
  let n = 0;
  for (const e of events) {
    let c = '';
    if (e.t === 'target') c = '🎯';
    else if (e.t === 'break' || e.t === 'spill') c = '💥';
    else if (e.t === 'seen') c = '👀';
    else if (e.t === 'stash') c = '🧦';
    else if (e.t === 'framed') c = '🤖';
    if (c && n < 16) {
      out += c;
      n++;
    }
  }
  return out + (stamp === 1 ? '😇' : stamp === 3 ? '🚨' : '😼');
}
