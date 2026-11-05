/**
 * Party play N0, B1 (MULTIPLAYER.md §1.3, MANDATORY, merge checklist): a pilot is pure. Pilots run only on the
 * relay's referee; if one wrote hashed state (botOrd*, the world RNG, bot memory in the world) the referee's hash
 * would differ from every client's. 50 seeds, humans [0, 1, 2], a pinger driving slot 0 (it pings, so applyPing
 * runs): every playerBotCommands call for slots 0, 1 and 2 leaves the world hash and w.rng.state unchanged, and a
 * leader ping never changes botOrd* of slots 1 and 2.
 */
import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/sim/api';
import { createPlayerBotFor, hash, playerBotCommands, result, step, tickOf } from '../../src/sim/index';
import { NIGHTLY } from './bot-helpers';
import { partyMatch } from './party-helpers';

const SEEDS = 50;
/** Ticks per seed (the whole match in the nightly run). */
const TICKS = NIGHTLY ? 1e9 : 2400;

const ordState = (m: ReturnType<typeof partyMatch>, s: number) => [m.world.botOrd[s], m.world.botOrdT[s], m.world.botOrdX[s], m.world.botOrdY[s], m.world.botOrdId[s], m.world.botOp[s]];

describe('party-pilot-purity (B1, merge checklist)', { timeout: 600_000 }, () => {
  it('pilots for slots 0, 1 and 2 never change the world hash or the world RNG; pings never order human slots', () => {
    let pings = 0;
    let thinks = 0;
    for (let i = 0; i < SEEDS; i++) {
      const seed = Math.imul(i + 7, 0x9e3779b1) >>> 0;
      const m = partyMatch(seed, [0, 1, 2], (['easy', 'normal', 'hard'] as const)[i % 3]);
      const bots = [createPlayerBotFor(m, 'pinger', 0), createPlayerBotFor(m, 'normal', 1), createPlayerBotFor(m, 'easy', 2)];
      while (!result(m) && tickOf(m) < TICKS) {
        const out: Command[][] = [[], [], []];
        for (let s = 0; s < 3; s++) {
          const thinksNow = (tickOf(m) + s) % 6 === 0;
          const h0 = thinksNow ? hash(m) : 0;
          const r0 = m.world.rng.state;
          out[s] = playerBotCommands(m, bots[s]);
          expect(m.world.rng.state).toBe(r0);
          if (thinksNow) {
            thinks++;
            expect(hash(m)).toBe(h0);
          }
        }
        const before1 = ordState(m, 1);
        const before2 = ordState(m, 2);
        step(m, out[0], out);
        if (m.events.some((e) => e.type === 'ping')) {
          pings++;
          expect(ordState(m, 1)).toEqual(before1);
          expect(ordState(m, 2)).toEqual(before2);
          expect(m.events.some((e) => e.type === 'bark' && (e.id === 1 || e.id === 2))).toBe(false);
        }
      }
    }
    expect(thinks).toBeGreaterThan(SEEDS * 100);
    expect(pings).toBeGreaterThan(0);
  });

  it('a pilot never reads or clears botOrd* of its human slot (orderOf / think), even when an order is stored', () => {
    for (let i = 0; i < 20; i++) {
      const m = partyMatch(500 + i, [0, 1, 2]);
      const bots = [null, createPlayerBotFor(m, 'normal', 1), createPlayerBotFor(m, 'normal', 2)];
      while (tickOf(m) < 900) step(m);
      for (const s of [1, 2]) {
        // An expired order (as a pre-party bug or a future rule might leave it): the old orderOf would clear it.
        m.world.botOrd[s] = 1;
        m.world.botOrdT[s] = 0;
        m.world.botOrdId[s] = -1;
      }
      for (let k = 0; k < 12; k++) {
        for (const s of [1, 2]) {
          const h0 = hash(m);
          playerBotCommands(m, bots[s]!);
          expect(hash(m)).toBe(h0);
        }
        step(m);
      }
    }
  });
});
