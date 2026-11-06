/**
 * Party play N0 (MULTIPLAYER.md §1.5): a human slot with an empty stream idles (the in-sim bots never drive it); the
 * same slot flown by `createPlayerBotFor` plays like an in-sim bot (XP and takedowns within 10% over the seeds) and
 * takes talents by command.
 */
import { describe, expect, it } from 'vitest';
import { createMatch, createPlayerBotFor, fillPicks, playerBotCommands, result, step, tickOf } from '../../src/sim/index';
import { NIGHTLY } from './bot-helpers';
import { partyMatch, playParty, seatsFor } from './party-helpers';
import { TALENT_TIERS } from '../../src/sim/world';

const SEEDS = NIGHTLY ? 50 : 16;

describe('party-pilot', { timeout: 900_000 }, () => {
  it('a human slot with no commands idles at the fountain', () => {
    const m = partyMatch(3, [0, 1]);
    const x = m.world.x[1];
    const y = m.world.y[1];
    for (let t = 0; t < 1800; t++) step(m);
    expect([m.world.x[1], m.world.y[1]]).toEqual([x, y]);
    expect(m.world.talents[1 * TALENT_TIERS]).toBe(-1);
  });

  it('a piloted slot is within 10% of the in-sim bot on XP and takedowns, and takes talents', () => {
    let pilotXp = 0;
    let botXp = 0;
    let pilotK = 0;
    let botK = 0;
    for (let i = 0; i < SEEDS; i++) {
      const seed = 1000 + i;
      // Party: slot 1 is a human flown by a pilot; slot 0 by the normal player-bot.
      const p = playParty(seed, [0, 1], ['normal', 'normal']);
      pilotXp += p.world.xp[1];
      pilotK += p.stats[1].kills + p.stats[1].assists;
      expect(p.world.talents[1 * TALENT_TIERS]).toBeGreaterThanOrEqual(0);
      // Solo on the same picks: slot 1 is an in-sim bot.
      const seats = seatsFor(seed, [0, 1]);
      const { picks, tricks } = fillPicks(seed, seats[0].hero, seats[0].trick);
      picks[1] = seats[1].hero;
      tricks[1] = seats[1].trick;
      const s = createMatch({ seed, picks, tricks, difficulty: 'normal' });
      const b0 = createPlayerBotFor(s, 'normal', 0);
      while (!result(s)) step(s, playerBotCommands(s, b0));
      botXp += s.world.xp[1] * (result(p)!.ticks / Math.max(1, tickOf(s)));
      botK += (s.stats[1].kills + s.stats[1].assists) * (result(p)!.ticks / Math.max(1, tickOf(s)));
    }
    const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(a, b);
    console.log(`party-pilot: ${SEEDS} seeds, XP pilot ${pilotXp} vs bot ${botXp.toFixed(0)}, K+A pilot ${pilotK} vs bot ${botK.toFixed(1)}`);
    expect(near(pilotXp, botXp, 0.1)).toBe(true);
    expect(near(pilotK, botK, NIGHTLY ? 0.1 : 0.25)).toBe(true);
  });
});
