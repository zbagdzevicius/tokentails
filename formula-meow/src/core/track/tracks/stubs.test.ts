import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_IDS, ARENA_IDS, BODY_IDS, CUP_IDS, HAT_IDS, TRACK_IDS, TRAIL_IDS } from '../../../content/ids';
import { validateTrack } from '../../../ugc/editor/validate';
import { simulate } from '../../sim/replay';
import { raceConfig } from '../../../test/fixtures';
import { createSimPlugins } from '../../../items-ai';
import { ALL_TRACKS, ARENAS, STUB_TRACKS, trackById } from '.';

describe('iteration 2 ids and stub tracks', () => {
  it('every frozen track and arena id resolves to a track of its own', () => {
    for (const id of [...TRACK_IDS, ...ARENA_IDS]) expect(trackById(id).id).toBe(id);
    expect(ALL_TRACKS.length).toBe(TRACK_IDS.length + ARENA_IDS.length);
    expect(BODY_IDS.length).toBe(6);
    expect(HAT_IDS.length).toBe(9);
    expect(TRAIL_IDS.length).toBe(6);
    expect(CUP_IDS).toEqual(['kibble', 'catnip']);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(24);
  });

  for (const def of [...STUB_TRACKS, ...ARENAS]) {
    it(`${def.name} is a valid track and a 50cc AI race on it finishes`, () => {
      const v = validateTrack(def);
      expect(v.issues).toEqual([]);
      if (def.kind === 'arena') return;
      const run = simulate({ ...raceConfig(def, { seed: 3, cls: 0 }), tailTicks: 60 * 60 }, createSimPlugins());
      expect(run.world.st.karts.every((k) => k.finished)).toBe(true);
    });
  }

  it('an arena round has no laps and ends at its time limit', () => {
    const def = ARENAS[0];
    const cfg = { ...raceConfig(def, { seed: 2 }), mode: 'battle' as const, timeLimitTicks: 60 * 20 };
    const run = simulate(cfg, createSimPlugins(cfg));
    expect(run.world.done).toBe(true);
    expect(run.world.st.karts.every((k) => k.lap === 0 && !k.finished)).toBe(true);
    expect(run.world.st.events.some((e) => e.type === 'wrongWay' || e.type === 'lap')).toBe(false);
  });
});
