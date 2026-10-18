/**
 * The naive player-bot (src/sim/bots/naive.ts, data/bots.ts NAIVE): the fun gates' stand-in for a first-timer. It
 * reaches the sim only through commands (so its matches record and verify like a human's), mashes Q / E / R, never
 * naps or uses its Paw Trick or W, and takes the first talent. The 200-seed bounds are the fun gates
 * (`npm run match -- --gate fun1`, `--gate fun2`); this file checks the rules and a small sample.
 */
import { describe, expect, it } from 'vitest';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, replayRecord, result, step } from '../../src/sim/index';
import { verifyReplay } from '../../src/sim/server';
import { TALENT_TIERS } from '../../src/sim/world';
import { heroFor, trickFor } from './bot-helpers';

function playNaive(seed: number, difficulty: 'rookie' | 'easy') {
  const { picks, tricks } = fillPicks(seed, heroFor(seed), trickFor(seed));
  const m = createMatch({ seed, picks, tricks, difficulty });
  const bot = createPlayerBot(m, 'naive');
  const cmds: Command[] = [];
  while (!result(m)) {
    const c = playerBotCommands(m, bot);
    cmds.push(...c);
    step(m, c);
  }
  return { m, res: result(m)!, cmds };
}

describe('naive player-bot (fun gates)', { timeout: 300000 }, () => {
  it('plays through commands only: casts Q / E / R, never W, Nap or the Trick; takes talent 1; the replay verifies', () => {
    const { m, res, cmds } = playNaive(1, 'rookie');
    const ops = new Set(cmds.map((c) => c.op));
    expect(ops.has(Op.Nap)).toBe(false);
    expect(ops.has(Op.Trick)).toBe(false);
    const slots = new Set(cmds.flatMap((c) => (c.op === Op.Cast ? [c.slot] : [])));
    expect([...slots].sort()).toEqual([0, 2, 3]);
    for (const c of cmds) if (c.op === Op.Talent) expect(c.choice).toBe(0);
    expect(m.world.talents[0 * TALENT_TIERS]).toBe(0);
    const rec = replayRecord(m)!;
    expect(verifyReplay(rec)).toMatchObject({ ok: true, outcome: res.outcome, finalHash: rec.finalHash });
  });

  it('v4 bounds on a small sample: wins most Rookie matches, with few deaths and its own takedowns', () => {
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => playNaive(s, 'rookie'));
    const wins = runs.filter((r) => r.res.outcome === 'won').length;
    expect(wins).toBeGreaterThanOrEqual(6);
    const deaths = runs.map((r) => r.res.stats[0].deaths).sort((a, b) => a - b);
    expect(deaths[Math.floor(deaths.length / 2)]).toBeLessThanOrEqual(3);
    const takedowns = runs.map((r) => r.res.stats[0].kills + r.res.stats[0].assists).sort((a, b) => a - b);
    expect(takedowns[Math.floor(takedowns.length / 2)]).toBeGreaterThanOrEqual(5);
  });
});
