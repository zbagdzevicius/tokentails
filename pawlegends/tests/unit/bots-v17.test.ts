/**
 * Sim v17 bots (docs/plans/moba/V17.md §3.1, §3.3): bots hold hard CC while the foe is CC-immune (Purr-ify or
 * Steadfast), and a bot with Purr-ify ready reads an enemy hard-CC windup it stands in and shrugs it off before it lands.
 */
import { describe, expect, it } from 'vitest';
import { BOT_AI, BOTS } from '../../src/data/bots';
import { Op } from '../../src/sim/api';
import { fightCast, purrifyCast, windupThreat } from '../../src/sim/bots/casts';
import { stun } from '../../src/sim/effects';
import { step } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import { applyOrder } from '../../src/sim/units/hero';
import { COOLDOWN_SLOTS } from '../../src/sim/world';
import { MID, heroMatch, hold, place, setLevel, steps } from './heroes/kit-helpers';

describe('sim v17 bots', () => {
  it('a Cacklejaw bot does not Gloat a Steadfast foe, and does once the immunity is shorter than the windup', () => {
    const m = heroMatch(['clem', 'sage', 'gabe', 'cacklejaw', 'sage', 'clem'], ['purrify', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce']);
    const w = m.world;
    for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
    place(m, 0, MID.x, MID.y, 0);
    place(m, 3, MID.x + 2000, MID.y, 2048);
    hold(m, 0, 1, 2, 3, 4, 5);
    // Only W ready: the Q dash and the R are on cooldown.
    w.cooldowns[3 * COOLDOWN_SLOTS + 0] = 999;
    w.cooldowns[3 * COOLDOWN_SLOTS + 2] = 999;
    const rng = new Rng(5);
    const c0 = fightCast(w, 3, 0, BOTS.normal, rng);
    expect(c0).toMatchObject({ op: Op.Cast, slot: 1 });
    stun(w, 0, 60); // reaches the Steadfast cap: 60 + 30 ticks immune
    expect(w.ccImmT[0]).toBeGreaterThan(9);
    expect(fightCast(w, 3, 0, BOTS.normal, rng)).toBeNull();
    // Easy bots stay naive.
    expect(fightCast(w, 3, 0, BOTS.easy, rng)).toMatchObject({ op: Op.Cast, slot: 1 });
    w.ccImmT[0] = 9;
    expect(fightCast(w, 3, 0, BOTS.normal, rng)).toMatchObject({ op: Op.Cast, slot: 1 });
  });

  it('Purr-ify on a read: inside Gabė R, after 8 ticks of her windup the bot cleanses; the charm then misses', () => {
    const m = heroMatch(['clem', 'sage', 'clem', 'gabe', 'sage', 'clem'], ['purrify', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce']);
    const w = m.world;
    for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -25000 : 25000), MID.y + (id % 3) * 7000, 0);
    place(m, 0, MID.x, MID.y, 0);
    place(m, 3, MID.x + 3000, MID.y, 2048);
    setLevel(m, 3, 10);
    hold(m, 0, 1, 2, 3, 4, 5);
    applyOrder(m, 3, { op: Op.Cast, slot: 3, x: MID.x, y: MID.y, id: 0 });
    expect(w.castPhase[3]).toBe(2);
    expect(windupThreat(w, 0)).toBe(-1);
    expect(purrifyCast(w, 0, BOTS.normal)).toBeNull();
    steps(m, BOT_AI.purrifyReadTicks);
    expect(windupThreat(w, 0)).toBe(3);
    const c = purrifyCast(w, 0, BOTS.normal);
    expect(c).toMatchObject({ op: Op.Trick });
    applyOrder(m, 0, c!);
    step(m);
    expect(w.ccImmT[0]).toBeGreaterThan(0);
    steps(m, 25);
    expect(w.fearSrc[0]).toBe(-1);
    expect(w.fearT[0]).toBe(0);
  });
});
