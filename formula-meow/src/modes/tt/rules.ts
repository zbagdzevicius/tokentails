/**
 * Time trial rules (`RaceConfig.mode = 'tt'`, inside the sim, GDD 3.1 math only): no AI (the field is the player
 * alone), no item boxes, three Catnips in hand at the start, and a `checkpoint` event at every third of every lap
 * (a = checkpoint index from 0, b = ticks since GO). The last checkpoint of the last lap is the finish line.
 * State lives in `RaceState.mode.tt` and is hashed, so ghosts replay exactly.
 */
import type { RaceState } from '../../types';
import type { ModeRules, SimContext } from '../../core/sim/plugins';
import { fnvInt } from '../../core/sim/hash';

export const TT_CHECKS_PER_LAP = 3;
export const TT_CATNIPS = 3;
/** item boxes never come back in a time trial */
const BOX_OFF = 1_000_000_000;

interface TtState {
  /** next checkpoint index per kart */
  next: number[];
}

const ttOf = (st: RaceState): TtState => (st.mode as { tt: TtState }).tt;

/** Distance along the race of checkpoint `c` (0-based). */
export function checkpointDist(lapLength: number, c: number): number {
  return ((c + 1) * lapLength) / TT_CHECKS_PER_LAP;
}

export function createTtRules(): ModeRules {
  return {
    init(ctx: SimContext) {
      const st = ctx.st;
      (st.mode as { tt?: TtState }).tt = { next: st.karts.map(() => 0) };
      for (const k of st.karts) {
        k.item = 'catnip';
        k.itemCount = TT_CATNIPS;
        k.rouletteTicks = 0;
      }
      for (const b of st.boxes) b.respawn = BOX_OFF;
    },
    step(ctx: SimContext) {
      const st = ctx.st;
      const tt = ttOf(st);
      const total = st.laps * TT_CHECKS_PER_LAP;
      for (let i = 0; i < st.karts.length; i++) {
        const k = st.karts[i];
        while (tt.next[i] < total && k.dist >= checkpointDist(st.lapLength, tt.next[i])) {
          ctx.emit({ type: 'checkpoint', kart: i, a: tt.next[i], b: st.tick - ctx.goTick });
          tt.next[i]++;
        }
      }
      for (const b of st.boxes) if (b.respawn < BOX_OFF / 2) b.respawn = BOX_OFF;
    },
    itemRow: () => [0, 0, 0, 1, 0, 0, 0, 0],
    hash(st, h) {
      const tt = ttOf(st);
      if (!tt) return h;
      for (const n of tt.next) h = fnvInt(h, n);
      return h;
    },
  };
}
