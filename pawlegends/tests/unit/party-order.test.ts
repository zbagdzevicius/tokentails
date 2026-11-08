/**
 * Party play N0, B2 (MULTIPLAYER.md §1.2): same-tick order. A forfeit from slot 0 and a slot-1 command on the same
 * tick fold into G.InputHash in a fixed order: slot 0's ping, slot 0's command, the forfeit, slot 1, slot 2. The
 * golden pins the resulting InputHash; any reorder (or a change to the slot fold) fails here.
 */
import { describe, expect, it } from 'vitest';
import { Op } from '../../src/sim/api';
import { result, step, tickOf } from '../../src/sim/index';
import { G } from '../../src/sim/world';
import { partyMatch } from './party-helpers';

/** Produced on this branch when the order was fixed; regenerate only with a PROTO/SIM bump. */
const GOLDEN_INPUT_HASH = 0x991330f4;

describe('party-order (B2 golden)', () => {
  it('forfeit and a slot-1 command on the same tick give the golden InputHash', () => {
    // Sim v14: with the dogs in the pool seed 2024's idle party loses at 6425 (before Normal's forfeit window), and
    // the old loop never left a match that had ended. InputHash folds only the commands, so the golden holds on 2025.
    // Sim v16 (B nav fixes): 2025's idle party falls before 7,300 too, so the seed is the first from 2025 still going
    // (InputHash folds only the commands, so the golden does not depend on it).
    const play = (seed: number) => {
      const m = partyMatch(seed, [0, 1, 2], 'normal');
      while (tickOf(m) < 7300 && !result(m)) step(m, tickOf(m) === 120 ? [{ op: Op.Move, x: 30000, y: 30000 }] : undefined);
      return m;
    };
    let seed = 2025;
    let m = play(seed);
    while (result(m) && seed < 2100) m = play(++seed);
    expect(result(m)).toBeNull();
    step(
      m,
      [{ op: Op.Ping, kind: 1, x: 40000, y: 30000, id: 255 }, { op: Op.Move, x: 41000, y: 29000 }, { op: Op.Forfeit }],
      [undefined, [{ op: Op.Move, x: 20000, y: 20000 }], [{ op: Op.Stop }]],
    );
    expect(result(m)?.reason).toBe('forfeit');
    const h = m.world.globals[G.InputHash] >>> 0;
    expect(h).toBe(GOLDEN_INPUT_HASH);
  });
});
