/**
 * Sim v16 S-PvP same-tick order (docs/plans/moba/V16.md §3.1.4): slot 0's ping, command and forfeit; slot 3's ping and
 * forfeit; slots 1..5 in order (slot 3's command at its position); then the bots. Every one of them on one tick folds
 * into G.InputHash in that order; the golden pins it, so any reorder fails here (like party-order.test.ts for PvE).
 */
import { describe, expect, it } from 'vitest';
import { Op } from '../../src/sim/api';
import { result, step, tickOf } from '../../src/sim/index';
import { G } from '../../src/sim/world';
import { pvpMatch } from './pvp-helpers';

/** Produced on this branch when the order was fixed; regenerate only with a SIM bump. */
const GOLDEN_INPUT_HASH = 0x617b3754;

describe('pvp-order (S-PvP golden)', () => {
  it('pings, commands and forfeits of both leads plus four seats on one tick give the golden InputHash', () => {
    const m = pvpMatch(2026, [0, 1, 2, 3, 4, 5]);
    while (tickOf(m) < 7300 && !result(m)) step(m, tickOf(m) === 120 ? [{ op: Op.Move, x: 30000, y: 30000 }] : undefined);
    expect(result(m)).toBeNull();
    const ping = (x: number) => ({ op: Op.Ping, kind: 1, x, y: 30000, id: 255 }) as const;
    step(
      m,
      [ping(40000), { op: Op.Move, x: 41000, y: 29000 }, { op: Op.Forfeit }],
      [
        undefined,
        [{ op: Op.Move, x: 20000, y: 20000 }],
        [{ op: Op.Stop }],
        [ping(60000), { op: Op.Move, x: 59000, y: 31000 }, { op: Op.Forfeit }],
        [{ op: Op.Move, x: 80000, y: 40000 }],
        [{ op: Op.Stop }],
      ],
    );
    expect(result(m)?.reason).toBe('forfeit');
    const h = m.world.globals[G.InputHash] >>> 0;
    expect(h).toBe(GOLDEN_INPUT_HASH);
  });
});
