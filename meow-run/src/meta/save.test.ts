import { describe, expect, it } from 'vitest';
import type { RunResult } from '../core/types';
import { defaultSave, isUnlocked, migrate, recordResult } from './save';

const run = (o: Partial<RunResult> = {}): RunResult => ({
  stageId: 'meadow',
  finished: true,
  score: 10000,
  bells: new Array(7).fill(true),
  bellCount: 7,
  bellsTotal: 7,
  fish: 20,
  distance: 2000,
  time: 100,
  hits: 0,
  respawns: 0,
  hearts: 3,
  maxMult: 10,
  stars: [true, true, true],
  ...o,
});

describe('save', () => {
  it('migrate never throws and fills defaults', () => {
    for (const raw of [null, undefined, 42, 'nope', '{"v":9}', [], { stages: 'x' }, { settings: { master: 5, quality: 'ultra' } }]) {
      const s = migrate(raw);
      expect(s.v).toBe(1);
      expect(s.settings.master).toBeLessThanOrEqual(1);
      expect(['auto', 'low', 'high']).toContain(s.settings.quality);
    }
    const tricky = Object.defineProperty({}, 'stages', { get: () => { throw new Error('x'); } });
    expect(migrate(tricky)).toEqual(defaultSave());
  });
  it('unlocks: meadow first, then gorge and endless, then sunset', () => {
    let s = defaultSave();
    expect(isUnlocked(s, 'meadow')).toBe(true);
    expect(isUnlocked(s, 'gorge')).toBe(false);
    expect(isUnlocked(s, 'endless')).toBe(false);
    const r = recordResult(s, run());
    s = r.save;
    expect(r.unlocked.sort()).toEqual(['endless', 'gorge']);
    expect(isUnlocked(s, 'sunset')).toBe(false);
    s = recordResult(s, run({ stageId: 'gorge' })).save;
    expect(isUnlocked(s, 'sunset')).toBe(true);
    expect(isUnlocked({ ...defaultSave(), unlockAll: true }, 'sunset')).toBe(true);
  });
  it('stars and bests only grow; an unfinished run counts a play only', () => {
    let s = recordResult(defaultSave(), run({ stars: [true, false, true], bellCount: 5 })).save;
    s = recordResult(s, run({ stars: [true, true, false], score: 50 })).save;
    expect(s.stages.meadow?.stars).toEqual([true, true, true]);
    expect(s.stages.meadow?.best).toBe(10000);
    s = recordResult(s, run({ finished: false, score: 99999, stars: [false, false, false] })).save;
    expect(s.stages.meadow?.best).toBe(10000);
    expect(s.stages.meadow?.plays).toBe(3);
    expect(s.tutorialDone).toBe(true);
  });
  it('round-trips through JSON', () => {
    const s = recordResult(defaultSave(), run()).save;
    expect(migrate(JSON.stringify(s))).toEqual(s);
  });
});
