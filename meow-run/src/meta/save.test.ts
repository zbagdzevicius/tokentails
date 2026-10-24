import { describe, expect, it } from 'vitest';
import type { RunResult } from '../core/types';
import { defaultSave, isUnlocked, migrate, recordResult, sanitizeName, SAVE_VERSION } from './save';

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
      expect(s.v).toBe(SAVE_VERSION);
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

  it('v1 saves migrate to v2 without losing progress', () => {
    const v1 = {
      v: 1,
      stages: { meadow: { stars: [true, true, false], best: 4321, bestBells: 6, plays: 4, finished: true } },
      endlessBest: { score: 900, distance: 1500 },
      unlockAll: false,
      settings: { master: 0.5, music: 0.2, sfx: 0.9, quality: 'low', reducedMotion: true, shake: 0.3 },
      tutorialDone: true,
      endingSeen: false,
      totals: { runs: 9, fish: 120, distance: 8000 },
    };
    const s = migrate(JSON.stringify(v1));
    expect(s.v).toBe(2);
    expect(s.stages.meadow?.best).toBe(4321);
    expect(s.settings.quality).toBe('low');
    expect(s.settings.capture).toBe('auto');
    expect(s.settings.clipVertical).toBe(true);
    expect(s.player.name).toBe('');
    expect(s.wardrobe.look).toBe('000000');
    expect(s.daily).toEqual({ day: '', best: 0, distance: 0 });
    expect(s.ugcStats.bestChain).toBe(0);
    expect(s.trails.mine).toEqual([]);
    expect(s.totals.runs).toBe(9);
  });
  it('v2 fields are validated', () => {
    const s = migrate({
      v: 2,
      settings: { capture: 'always', clipVertical: 'yes' },
      player: { name: '  <b>Mia</b>!!  the   great cat ' },
      wardrobe: { look: 'ZZZ', seen: ['hat.crown', 7, 'hat.crown', ''] },
      daily: { day: '2026-10-24', best: 512340, distance: -3 },
      ugcStats: { tricks: 12.7, bestChain: 'x' },
      trails: { mine: [{ code: '1abc', name: 'Doggo Dash', best: 10, finished: true, at: 5 }, { code: 3 }, null] },
    });
    expect(s.settings.capture).toBe('auto');
    expect(s.settings.clipVertical).toBe(true);
    expect(s.player.name).toBe('bMiab the grea');
    expect(s.wardrobe.look).toBe('000000');
    expect(s.wardrobe.seen).toEqual(['hat.crown']);
    expect(s.daily).toEqual({ day: '2026-10-24', best: 512340, distance: 0 });
    expect(s.ugcStats.tricks).toBe(12);
    expect(s.ugcStats.bestChain).toBe(0);
    expect(s.trails.mine).toHaveLength(1);
    expect(migrate(JSON.stringify(s))).toEqual(s);
  });
  it('names are safe for cards and links', () => {
    expect(sanitizeName('Žygis 🐱 <script>')).toBe('Žygis script');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName('a'.repeat(40))).toHaveLength(14);
  });
  it('daily and trail runs only add to the totals', () => {
    const base = recordResult(defaultSave(), run()).save;
    const r = recordResult(base, run({ stageId: 'daily', score: 5e5 }));
    expect(r.newBest).toBe(false);
    expect(r.unlocked).toEqual([]);
    expect(r.save.stages.daily).toBeUndefined();
    expect(r.save.totals.runs).toBe(base.totals.runs + 1);
    expect(recordResult(base, run({ stageId: 'trail' })).save.stages.trail).toBeUndefined();
    expect(isUnlocked(defaultSave(), 'trail')).toBe(true);
    expect(isUnlocked(defaultSave(), 'daily')).toBe(false);
    expect(isUnlocked(base, 'daily')).toBe(true);
  });
});
