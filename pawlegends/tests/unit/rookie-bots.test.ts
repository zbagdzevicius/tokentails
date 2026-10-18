/**
 * Rookie and Easy bots (sim v4, data/bots.ts DIFFICULTY_RULES and BOT_AI, src/sim/bots/brain.ts): the human's allies
 * carry it (follow, peel, leave it the kill), Rookie's scripted first fight, and the grouped team defending a raided
 * lane (pushLane).
 */
import { describe, expect, it } from 'vitest';
import { BOT_AI, BOT_MODE, DIFFICULTY_RULES } from '../../src/data/bots';
import { Op } from '../../src/sim/api';
import { pushLane } from '../../src/sim/bots';
import { step } from '../../src/sim/index';
import { refreshVision } from '../../src/sim/map/brush';
import { applyOrder } from '../../src/sim/units/hero';
import { G } from '../../src/sim/world';
import { heroMatch, hold, place, steps } from './heroes/kit-helpers';
import { quietMatch } from './sim-helpers';

const PUDDLE_OUTER = { x: 34000, y: 9000 };

/** A rookie match with the in-sim bots on, at 0:10, every hero at mid. */
function arena(difficulty: 'rookie' | 'easy' | 'normal' = 'rookie') {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
  (m.config as { difficulty: string }).difficulty = difficulty;
  m.world.globals[G.BotsOff] = 0;
  return m;
}

describe('Rookie and Easy bots (sim v4)', () => {
  it('carry allies: both on Rookie and Easy, none on Normal', () => {
    expect([DIFFICULTY_RULES.rookie.carryAllies, DIFFICULTY_RULES.easy.carryAllies, DIFFICULTY_RULES.normal.carryAllies]).toEqual([2, 2, 0]);
  });

  it('kill-steal guard: an ally leaves a nearly dead enemy hero the human is fighting close by', () => {
    const allyHits = (difficulty: 'rookie' | 'normal', hpBp: number): number => {
      const m = arena(difficulty);
      const w = m.world;
      place(m, 3, 50000, 30000, 2048);
      place(m, 2, 51500, 30000, 2048); // Brutus, an ally, next to the foe
      place(m, 0, 48000, 30000, 0); // the human, within BOT_AI.stealRange
      place(m, 1, 20000, 50000, 0);
      place(m, 4, 90000, 50000, 0);
      place(m, 5, 90000, 10000, 0);
      hold(m, 0, 3); // the human aims at the foe but never swings; the foe never swings back
      w.hp[3] = Math.trunc((w.maxHp[3] * hpBp) / 10000);
      w.stunT[3] = 1000; // it stays put
      applyOrder(m, 0, { op: Op.Attack, id: 3 });
      let hits = 0;
      for (let t = 0; t < 60; t++) {
        w.attackTimer[0] = 1 << 20;
        w.kHurt[3] = w.globals[G.Tick]; // in combat: no regen lifts it over the guard line
        step(m);
        for (const e of m.events) if (e.type === 'hit' && e.src === 2 && e.dst === 3) hits++;
        if (w.alive[3] === 0) break;
      }
      return hits;
    };
    const low = BOT_AI.stealHpBp - 500;
    expect(allyHits('rookie', low)).toBe(0); // left to the human
    expect(allyHits('rookie', 6000)).toBeGreaterThan(0); // above the line: the ally fights
    expect(allyHits('normal', low)).toBeGreaterThan(0); // Normal allies do not carry
  });

  it('Rookie: slot 3 walks into Sunny Lane at 0:15 for the first fight; on Normal it stays on its side', () => {
    const where = (difficulty: 'rookie' | 'normal'): number => {
      const m = quietMatch(3, true, difficulty);
      let minX = 1e9;
      let fought = false;
      while (m.world.globals[G.Tick] < DIFFICULTY_RULES.rookie.scriptFrom + 600) {
        step(m);
        // Walking there, not chasing a foe (sim v5: a Normal bot may chase a hero it fights across the river).
        fought ||= m.world.botMode[3] === BOT_MODE.Fight && difficulty === 'normal';
        if (m.world.y[3] > 40000 && !fought) minX = Math.min(minX, m.world.x[3]);
      }
      return minX;
    };
    expect(where('rookie')).toBeLessThan(50000); // crossed the river into Purrhaven's half of Sunny Lane
    expect(where('normal')).toBeGreaterThanOrEqual(45000);
  });

  it('grouped bots defend the lane where enemy heroes raid an own structure, if they have the numbers there', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    w.globals[G.Tick] = 300;
    for (const id of [0, 1, 2]) place(m, id, PUDDLE_OUTER.x + 2000 + id * 500, PUDDLE_OUTER.y + 1000);
    place(m, 3, PUDDLE_OUTER.x + 6000, PUDDLE_OUTER.y);
    place(m, 4, 80000, 50000);
    place(m, 5, 80000, 52000);
    refreshVision(w);
    expect(pushLane(w, 0, 1)).toBe(1); // one raider in Puddle, three of us close: defend Puddle
    // Three raiders and only this bot near: it does not walk into an outnumbered fight at home.
    place(m, 4, PUDDLE_OUTER.x + 6000, PUDDLE_OUTER.y + 800);
    place(m, 5, PUDDLE_OUTER.x + 6000, PUDDLE_OUTER.y - 800);
    for (const id of [0, 2]) place(m, id, 60000, 50000);
    refreshVision(w);
    expect(pushLane(w, 0, 1)).toBe(0); // back to the push rule (fewest enemy towers; tie: Sunny)
    steps(m, 1);
  });
});
