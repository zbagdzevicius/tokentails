import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_IDS, ARENA_IDS, BODY_IDS, CUP_IDS, HAT_IDS, TRACK_IDS, TRAIL_IDS } from '../../../content/ids';
import { validateTrack } from '../../../ugc/editor/validate';
import { simulate } from '../../sim/replay';
import { raceConfig } from '../../../test/fixtures';
import { createSimPlugins } from '../../../items-ai';
import { ALL_TRACKS, ARENAS, STUB_TRACKS, trackById } from '.';

describe('iteration 2 ids and the new tracks', () => {
  it('every frozen track and arena id resolves to a track of its own', () => {
    for (const id of [...TRACK_IDS, ...ARENA_IDS]) expect(trackById(id).id).toBe(id);
    expect(ALL_TRACKS.length).toBe(TRACK_IDS.length + ARENA_IDS.length);
    expect(BODY_IDS.length).toBe(6);
    expect(HAT_IDS.length).toBe(9);
    expect(TRAIL_IDS.length).toBe(6);
    expect(CUP_IDS).toEqual(['kibble', 'catnip']);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(26); // iteration 4 appends loop-de-meow, combo-king
  });

  for (const def of STUB_TRACKS) {
    it(`${def.name} passes the validator (authored rules) and a 50cc AI race on it finishes`, () => {
      const v = validateTrack(def, { pieces: 'authored' }); // authored set pieces keep the authored rules (doodle rules: the editor)
      expect(v.issues).toEqual([]);
      const cfg = { ...raceConfig(def, { seed: 3, cls: 0 }), tailTicks: 60 * 60 };
      const run = simulate(cfg, createSimPlugins(cfg));
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
