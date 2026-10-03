import { describe, expect, it } from 'vitest';
import type { LevelDef, SimState } from '../../types';
import { HEIST_01_SOLUTION, getHeist01 } from '../../levels';
import { initSim, stepSim } from '../../sim/sim';
import { decodeInputs } from '../../sim/replay';
import { activeHint, objectiveStage, objectiveText, pawRating, scoreBreakdown } from '../logic';

const level = {
  key: { id: 'k', tile: { x: 1, y: 1 } },
  crate: { id: 'c', tile: { x: 1, y: 1 }, catId: 'bob', catName: 'Mochi' },
  meta: { title: 't', parTicks: 3600, meowRadiusTiles: 5, investigateTicks: 60, hints: [{ x0: 0, y0: 0, x1: 2, y1: 2, text: 'hi' }] },
} as unknown as LevelDef;

describe('HUD logic', () => {
  it('objective stages', () => {
    expect(objectiveStage({ keyTaken: false, rescued: false, won: false }, level)).toBe('KEY');
    expect(objectiveStage({ keyTaken: true, rescued: false, won: false }, level)).toBe('RESCUE');
    expect(objectiveText({ keyTaken: true, rescued: false, won: false }, level)).toBe('Free Mochi from the crate');
    expect(objectiveStage({ keyTaken: true, rescued: true, won: false }, level)).toBe('EXIT');
    expect(objectiveStage({ keyTaken: true, rescued: true, won: true }, level)).toBe('DONE');
    const noKey = { ...level, key: null } as LevelDef;
    expect(objectiveStage({ keyTaken: false, rescued: false, won: false }, noKey)).toBe('RESCUE');
    const custom = { ...level, meta: { ...level.meta, objectives: ['A', 'B {cat}', 'C'] } } as LevelDef;
    expect(objectiveText({ keyTaken: true, rescued: false, won: false }, custom)).toBe('B Mochi');
  });

  it('hint zones by active cat tile', () => {
    const cat = (x: number, y: number) => ({ pos: { x: x * 16 + 8, y: y * 16 + 8 } });
    const st = { cats: [cat(1, 1), cat(9, 9)], activeIndex: 0 } as never;
    expect(activeHint(st, level)).toBe('hi');
    expect(activeHint({ ...(st as object), activeIndex: 1 } as never, level)).toBeNull();
  });

  it('score breakdown mirrors the sim rule', () => {
    expect(scoreBreakdown({ coins: 17, rescued: true, ticks: 30 * 152 })).toEqual({ coins: 17, coinPoints: 170, rescuePoints: 50, timePenalty: 15, total: 205 });
    expect(scoreBreakdown({ coins: 0, rescued: false, ticks: 30 * 600 }).total).toBe(0);
    // Same rules as the campaign stars: win, every coin, never spotted at or under par.
    expect(pawRating({ coins: 20, rescued: true, ticks: 3000, spottedCount: 0 }, 20, 3600)).toBe(3);
    expect(pawRating({ coins: 17, rescued: true, ticks: 3000, spottedCount: 0 }, 20, 3600)).toBe(2);
    expect(pawRating({ coins: 20, rescued: true, ticks: 3000, spottedCount: 1 }, 20, 3600)).toBe(2);
    expect(pawRating({ coins: 2, rescued: false, ticks: 9000, spottedCount: 4 }, 20, 3600)).toBe(0);
  });

  it('heist-01: the 5-line objectives walk the tutorial first, then key / rescue / exit', () => {
    const level = getHeist01();
    let s: SimState = initSim(level, HEIST_01_SOLUTION.seed, HEIST_01_SOLUTION.catIds);
    const seen: string[] = [objectiveText(s, level)];
    for (const input of decodeInputs(HEIST_01_SOLUTION.runs)) {
      s = stepSim(level, s, input);
      const o = objectiveText(s, level);
      if (o !== seen[seen.length - 1]) seen.push(o);
    }
    expect(seen).toEqual([...level.meta.objectives!, 'Heist complete!']);
    expect(objectiveText({ keyTaken: false, rescued: false, won: false }, level)).toBe(level.meta.objectives![0]);
  });

  it('heist-01: tutorial hints follow the plate state and use touch wording on touch', () => {
    const level = getHeist01();
    let s: SimState = initSim(level, HEIST_01_SOLUTION.seed, HEIST_01_SOLUTION.catIds);
    expect(activeHint(s, level)).toMatch(/WASD/);
    expect(activeHint(s, level, true)).toBe('Move with the joystick. Stay out of the guard dog’s vision cone: wait for it to turn its back.');
    let afterSwap: string | null = null;
    const hints = new Set<string>();
    for (const input of decodeInputs(HEIST_01_SOLUTION.runs)) {
      s = stepSim(level, s, input);
      const t = activeHint(s, level, true);
      if (t) hints.add(t);
      if (input.swap && s.platesDown[0] && afterSwap === null) afterSwap = activeHint(s, level);
    }
    // Right after the first swap (plate held by the other cat) the hint says the door is open.
    expect(afterSwap).toMatch(/Door’s open/);
    for (const t of hints) expect(t).not.toMatch(/WASD|Q \/ Tab|Space|Press E\b|\{/);
  });
});
