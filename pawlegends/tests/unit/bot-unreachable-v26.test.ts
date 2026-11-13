/**
 * Sim v26 (docs/plans/moba/V26-TOWERS.md §1.G): a laning bot on Hearthwood leaves an enemy minion it cannot walk to.
 * Found by tools/map5v5-probe.mjs (seed 3323107722, 6:08): a ranged minion shot a bot across the forest edge west of
 * an inner tower; the bot's attack order on it ended at a path that cannot reach it, and the bot stood there 20 s.
 * Also the fight hysteresis (BOT_AI.keepFightBp) that ended a fight / back-off flip seen on seed 666717508.
 */
import { describe, expect, it } from 'vitest';
import type { HeroId, MatchConfig } from '../../src/sim/api';
import { Op } from '../../src/sim/api';
import { BOT_AI } from '../../src/data/bots';
import { createMatch, createPlayerBotFor, playerBotCommands, step, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { G, Order } from '../../src/sim/world';
import { putMinion } from './sim-helpers';

const CATS: HeroId[] = ['lambo', 'sage', 'gabe', 'meatball', 'duchess'];
const DOGS: HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo'];

function hearthPvp(seed: number): MatchHandle {
  const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const seats = slots.map((slot) => ({ slot, hero: slot < 5 ? CATS[slot] : DOGS[slot - 5], trick: 'pounce' as const }));
  const { picks, tricks } = fillPicksParty(seed, seats, 'hearthwood');
  const config: MatchConfig = { seed, picks, tricks, difficulty: 'hard', humans: slots, mode: 'pvp', map: 'hearthwood' };
  return createMatch(config) as MatchHandle;
}

/** Step `n` ticks with slot 0's commands from `cmd` (the other slots send nothing). */
function stepTicks(m: MatchHandle, n: number, cmd: () => ReturnType<typeof playerBotCommands> = () => []): void {
  for (let k = 0; k < n; k++) {
    const own = cmd();
    step(m, own, [own]);
  }
}

describe('sim v26 bots: an unreachable minion', { timeout: 120_000 }, () => {
  it('the attack order stalls at the forest edge, and the bot walks off instead of standing on it', () => {
    const m = hearthPvp(3323107722);
    const w = m.world;
    // Past the gate barrier, before any wave reaches this spot.
    stepTicks(m, 200);
    // The probe's spot: bot slot 0 (team 0) south of the forest edge, a ranged Woof minion 2.8 m away across it.
    w.x[0] = 77500;
    w.y[0] = 111500;
    w.moveX[0] = 77500;
    w.moveY[0] = 111500;
    const minion = putMinion(m, 1, 74700, 111200, 'ranged');
    const attack = [{ op: Op.Attack, id: minion }] as ReturnType<typeof playerBotCommands>;
    stepTicks(m, 1, () => attack);
    stepTicks(m, 30);
    // The sim: an attack order on it walks a path that cannot reach it and then holds still.
    expect(w.order[0]).toBe(Order.Attack);
    expect(w.target[0]).toBe(minion);
    expect(w.pathDone[0]).toBe(1);
    expect(Math.hypot(w.x[0] - 77500, w.y[0] - 111500)).toBeLessThan(500);
    // The bot: it leaves the minion and walks on.
    const pilot = createPlayerBotFor(m, 'normal', 0);
    const start = w.globals[G.Tick];
    stepTicks(m, 60, () => playerBotCommands(m, pilot));
    expect(w.globals[G.Tick]).toBe(start + 60);
    expect(w.target[0] === minion && w.order[0] === Order.Attack).toBe(false);
    expect(Math.hypot(w.x[0] - 77500, w.y[0] - 111500)).toBeGreaterThan(2000);
  });

  it('keeps a fight it already took down to 80% of the power bar (Hearthwood)', () => {
    expect(BOT_AI.keepFightBp).toBe(8000);
  });
});
