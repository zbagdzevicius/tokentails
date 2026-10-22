import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../../types';
import { KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { GO_TICK } from '../../core/sim/world';
import { AI, CLASSES } from '../../tuning';
import { bandAdj, bandRamp } from './rubber-band';

/** SIM_VERSION 11 (ITERATION-4.md F1, "pole is a prize"): the band's catch-up ramps in over 6 s after GO. */
describe('rubber band ramp-in after GO (F1)', () => {
  const at = (tick: number) => {
    const w = world(raceConfig(KITCHEN, { seed: 3, cls: 1, humans: [0] }));
    while (w.tick < tick) w.step([NO_INPUT]);
    return w;
  };
  /** the last AI slot that is not the player's rival (the rival rides a stronger band) */
  const cat = (w: ReturnType<typeof at>): number => {
    for (let j = w.st.karts.length - 1; j > 0; j--) if (!w.cfg.racers[j]?.rival) return j;
    return 7;
  };

  it('is 0 at GO, half at 3 s, full at 6 s and after', () => {
    expect(AI.bandRampTicks).toBe(360);
    expect(bandRamp(at(GO_TICK).ctx)).toBe(0);
    expect(bandRamp(at(GO_TICK + 180).ctx)).toBeCloseTo(0.5, 9);
    expect(bandRamp(at(GO_TICK + 360).ctx)).toBe(1);
    expect(bandRamp(at(GO_TICK + 500).ctx)).toBe(1);
  });

  it('a cat far behind a leading player gets no catch-up at GO, half of it at 3 s, all of it from 6 s', () => {
    const band = CLASSES[1];
    for (const [dt, f] of [
      [0, 0],
      [180, 0.5],
      [360, 1],
    ] as const) {
      const w = at(GO_TICK + dt);
      const ks = w.st.karts;
      const j = cat(w);
      ks[0].dist = ks[j].dist + 500; // the player (pole) far ahead of the cat
      expect(bandAdj(w.ctx, j)).toBeCloseTo(band.bandUp * f, 9);
    }
  });

  it('bandDown is not ramped: a cat far ahead of the player is held back from GO', () => {
    const band = CLASSES[1];
    const w = at(GO_TICK);
    const ks = w.st.karts;
    const j = cat(w);
    ks[j].dist = ks[0].dist + 500; // the cat far ahead of the player
    expect(bandAdj(w.ctx, j)).toBeCloseTo(-band.bandDown, 9);
  });
});
