/** Bots (POC.md §7.2, §15 items 9 and 12): lanes, retreat, reaction delay, the brush rule, replays, difficulty. */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES, BOTS, BOT_TEAMS } from '../../src/data/bots';
import { BUSHES, FOUNTAIN, mirrorX } from '../../src/data/map';
import { TIMELINE } from '../../src/data/timeline';
import { botParams } from '../../src/sim/bots';
import { step } from '../../src/sim/index';
import { visibleTo } from '../../src/sim/map/brush';
import { verifyReplay } from '../../src/sim/server';
import { G, UnitState } from '../../src/sim/world';
import { NIGHTLY, playBots } from './bot-helpers';
import { heroMatch, hold, place, steps } from './heroes/kit-helpers';
import { quietMatch } from './sim-helpers';

const botsOn = <T extends { world: { globals: Int32Array } }>(m: T): T => {
  m.world.globals[G.BotsOff] = 0;
  return m;
};

describe('bots (§7.2)', { timeout: 300000 }, () => {
  it('the match difficulty sets the enemy bots; the human’s allies play at the allied level', () => {
    const easy = quietMatch(3);
    // Allies play at BOT_TEAMS.allies but group when the enemy difficulty does.
    expect(botParams(easy, 1)).toEqual({ ...BOTS[BOT_TEAMS.allies], groupAt: BOTS.easy.groupAt });
    expect(botParams(easy, 2)).toBe(botParams(easy, 1));
    for (const s of [3, 4, 5]) expect(botParams(easy, s)).toBe(BOTS.easy);
    expect(BOTS.easy.reactionTicks).toBe(18);
    expect(BOTS.normal.reactionTicks).toBe(9);
    // Sim v4: low lines (a bot stays in a fight it can still win), so fights end in takedowns.
    expect(BOTS.easy.retreatHpBp).toBe(800);
    expect(BOTS.normal.retreatHpBp).toBe(1200);
  });

  it('bots walk out to their lanes: Sunny, Puddle and the roamer', () => {
    // Normal: on Rookie and Easy the human's allies carry (follow the human, DifficultyRules.carryAllies).
    const m = quietMatch(11, true, 'normal');
    while (m.world.globals[G.Tick] < TIMELINE.firstWave + 600) step(m);
    const w = m.world;
    // Slot 1 and 4 play Puddle (bottom), slot 3 Sunny (top); every bot left its fountain.
    expect(w.y[1]).toBeLessThan(20000);
    expect(w.y[4]).toBeLessThan(20000);
    expect(w.y[3]).toBeGreaterThan(40000);
    for (const s of [1, 2]) expect(w.x[s]).toBeGreaterThan(FOUNTAIN.x + 10000);
    for (const s of [3, 4, 5]) expect(w.x[s]).toBeLessThan(mirrorX(FOUNTAIN.x) - 10000);
  });

  it('sim v9: bots play the shelter champions and cast all four of their slots', () => {
    const casts = new Map<string, Set<number>>();
    for (const seed of [5, 6, 7, 8]) {
      const m = botsOn(heroMatch(['clem', 'lambo', 'aviete', 'brutus', 'cacklejaw', 'brutus'], undefined, seed));
      const m2 = botsOn(heroMatch(['clem', 'bengas', 'gabe', 'brutus', 'cacklejaw', 'brutus'], undefined, seed));
      for (const match of [m, m2]) {
        const picks = match.config.picks;
        for (let t = 0; t < 30 * 300 && !match.ended; t++) {
          step(match);
          for (const e of match.events) {
            if (e.type !== 'cast' || e.src < 1 || e.src > 2 || e.slot > 3) continue;
            const h = picks[e.src];
            if (!casts.has(h)) casts.set(h, new Set());
            casts.get(h)!.add(e.slot);
          }
        }
      }
    }
    for (const h of ['lambo', 'aviete', 'bengas', 'gabe']) expect([...(casts.get(h) ?? [])].sort(), h).toEqual([0, 1, 2, 3]);
  });

  it('a badly hurt bot goes home (walks or naps)', () => {
    const m = botsOn(heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'clem', 'sage']));
    const w = m.world;
    place(m, 4, 60000, 30000);
    w.hp[4] = Math.trunc(w.maxHp[4] / 50); // 2%: under BOT_AI.retreatAlwaysBp of the retreat line (sim v4)
    const before = Math.abs(w.x[4] - mirrorX(FOUNTAIN.x));
    steps(m, 60);
    const napping = w.state[4] === UnitState.Napping || w.napT[4] > 0;
    expect(napping || Math.abs(w.x[4] - mirrorX(FOUNTAIN.x)) < before).toBe(true);
  });

  it('reaction delay: an Easy bot acts on a newly seen hero after 18 ticks, a Normal one after 9', () => {
    const delay = (difficulty: 'easy' | 'normal'): number => {
      const m = botsOn(heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'sage', 'clem']));
      (m.config as { difficulty: string }).difficulty = difficulty;
      const w = m.world;
      for (let id = 0; id < 6; id++) place(m, id, id < 3 ? 20000 : 80000, 10000 + id * 7000);
      hold(m, 0);
      // sim v8: past the opening truce (DifficultyRules.truceUntil), when enemy bots may pick the human
      w.globals[G.Tick] = DIFFICULTY_RULES.easy.truceUntil;
      // A weak human 4 m from Woof's Sage, which is rooted in place.
      place(m, 0, 50000, 30000);
      place(m, 4, 54000, 30000);
      w.hp[0] = 60;
      w.rootT[4] = 600;
      const start = w.globals[G.Tick];
      for (let i = 0; i < 60; i++) {
        step(m);
        if (w.botFoe[4] === 0) return w.globals[G.Tick] - 1 - start;
      }
      return -1;
    };
    const easy = delay('easy');
    const normal = delay('normal');
    expect(easy).toBeGreaterThanOrEqual(BOTS.easy.reactionTicks);
    expect(normal).toBeGreaterThanOrEqual(BOTS.normal.reactionTicks);
    expect(normal).toBeLessThan(easy);
  });

  it('bots never target a unit their team’s snapshot leaves out (§15 item 9)', () => {
    const m = botsOn(heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'clem', 'sage']));
    const w = m.world;
    const bush = BUSHES[0];
    const HIDER = 3;
    for (let id = 0; id < 6; id++) place(m, id, id < 3 ? 15000 : 85000, 10000 + id * 7000);
    hold(m, 0);
    place(m, HIDER, bush.x, bush.y);
    w.stunT[HIDER] = 900;
    // Purrhaven's Sage and Brutus stand rooted 4 m from the bush.
    place(m, 1, bush.x - 4000, bush.y);
    place(m, 2, bush.x - 4000, bush.y + 1500);
    w.rootT[1] = 900;
    w.rootT[2] = 900;
    for (let i = 0; i < 120; i++) {
      step(m);
      expect(visibleTo(w, HIDER, 0)).toBe(false);
      for (const s of [1, 2]) {
        expect(w.target[s]).not.toBe(HIDER);
        expect(w.botFoe[s]).not.toBe(HIDER);
        expect(w.castId[s]).not.toBe(HIDER);
      }
    }
    expect(w.hp[HIDER]).toBe(w.maxHp[HIDER]);
    // Revealed, the same hero is engaged within the reaction delay plus a think or two.
    w.revealT[HIDER] = 300;
    let engaged = false;
    for (let i = 0; i < 60 && !engaged; i++) {
      step(m);
      engaged = w.botFoe[1] === HIDER || w.botFoe[2] === HIDER;
    }
    expect(engaged).toBe(true);
  });

  it('a player-bot match is deterministic and its replay verifies', () => {
    const a = playBots(7, 'novice', 'easy');
    const b = playBots(7, 'novice', 'easy');
    expect(a.result.finalHash).toBe(b.result.finalHash);
    const v = verifyReplay(a.replay);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.finalHash).toBe(a.result.finalHash);
    expect(a.replay.inputs.length).toBeLessThan(40000);
  });

  it('smoke: Normal bot matches end by a core kill before 11:00', () => {
    for (const seed of [21, 22, 23]) {
      const r = playBots(seed, 'normal', 'normal').result;
      expect(r.reason).toBe('core');
      expect(r.ticks).toBeLessThan(TIMELINE.safetyEnd);
    }
  });
});

/**
 * §15 item 12, nightly (PAWLEGENDS_NIGHTLY=1): 400 seeds each (more than the 200 asked; the Normal result sat
 * near its 40% floor before sim v3), in parallel processes on the bundled sim. The novice is slot 0; its two allies play at
 * BOT_TEAMS.allies (Normal) and the three enemies at the match difficulty (POC.md §7.2 decision).
 */
describe.skipIf(!NIGHTLY)('bots nightly (§15 item 12)', { timeout: 3600000 }, () => {
  const rate = async (difficulty: 'easy' | 'normal'): Promise<number> => {
    const { runBatch } = await import('../../tools/lib/batch.mjs');
    const { rows } = await runBatch({ profile: 'novice', difficulty, from: 1, seeds: 400 });
    const r = (100 * rows.filter((x) => x.winner === 0).length) / rows.length;
    console.log(`bots nightly: novice vs ${difficulty}, ${rows.length} seeds, wins ${r.toFixed(1)}%`);
    return r;
  };
  it('the novice beats Easy bots at least 85% of the time', async () => {
    expect(await rate('easy')).toBeGreaterThanOrEqual(85);
  });
  it('the novice beats Normal bots 40% to 60% of the time', async () => {
    const r = await rate('normal');
    expect(r).toBeGreaterThanOrEqual(40);
    expect(r).toBeLessThanOrEqual(60);
  });
});
