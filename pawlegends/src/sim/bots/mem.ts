/**
 * Bot memory: what a bot remembers between thinks (mode, lane, foe, Pudding decision, awareness for the reaction
 * delay, its last order). In-sim bots (slots 1..5) keep it in the world, so it is hashed and replays reproduce it.
 * An outside player-bot (slot 0 in headless runs) keeps its own copy, outside the world: it only ever reaches the
 * sim through commands, exactly like a human.
 */
import { CAPS } from '../../data/map';
import type { World } from '../world';

export interface BotMem {
  mode: Uint8Array;
  lane: Uint8Array;
  foe: Int32Array;
  pud: Int32Array;
  seen: Int32Array;
  op: Uint8Array;
  x: Int32Array;
  y: Int32Array;
  tid: Int32Array;
  slip: Int32Array;
}

/** The in-sim bots' memory: views on the world's arrays. */
export function worldMem(w: World): BotMem {
  return { mode: w.botMode, lane: w.botLane, foe: w.botFoe, pud: w.botPud, seen: w.botSeen, op: w.botOp, x: w.botX, y: w.botY, tid: w.botId, slip: w.botSlip };
}

/** A fresh memory for an outside player-bot. */
export function createMem(): BotMem {
  const h = CAPS.heroes;
  return {
    mode: new Uint8Array(h),
    lane: new Uint8Array(h),
    foe: new Int32Array(h).fill(-1),
    pud: new Int32Array(h).fill(-1),
    seen: new Int32Array(h * h).fill(-1),
    op: new Uint8Array(h),
    x: new Int32Array(h),
    y: new Int32Array(h),
    tid: new Int32Array(h).fill(-1),
    slip: new Int32Array(h).fill(-1),
  };
}
