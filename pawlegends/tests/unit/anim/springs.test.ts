/** ANIM-SPEC §5 / §12 springs.test: tail and ear chains stay stable and NaN-free at dt 1/30, 1/60 and 1/144. */
import { describe, expect, it } from 'vitest';
import { SpringChain } from '../../../src/render/anim/springs';
import { HERO_SPRINGS } from '../../../src/render/anim/common';
import { HERO_IDS } from '../../../src/data/heroes';
import { SPRING_RATE } from '../../../src/render/anim/layers';

describe('spring chains', { timeout: 60000 }, () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144])
    for (const tier of ['low', 'med'] as const)
      it(`stable at dt ${dt.toFixed(4)} (${tier})`, () => {
        for (const h of HERO_IDS) {
          const c = new SpringChain(6);
          c.tune(HERO_SPRINGS[h].tail);
          const rate = SPRING_RATE[tier];
          let maxAbs = 0;
          for (let i = 0; i < 2000; i++) {
            const t = i * dt;
            // a dash (huge accel spikes), a flip (body rate), turns
            const ax = i % 90 === 0 ? 600 : Math.sin(t * 3) * 20;
            const inp = { ax, az: Math.cos(t * 2) * 15, yawRate: Math.sin(t) * 6, pitchRate: i % 200 < 10 ? 19 : 0, rollRate: 0 };
            c.step(dt, inp, rate.hz, rate.steps);
            for (const v of c.theta) {
              expect(Number.isFinite(v)).toBe(true);
              maxAbs = Math.max(maxAbs, Math.abs(v));
            }
          }
          expect(maxAbs).toBeLessThanOrEqual(c.limit + 1e-6);
          // settles with no input
          for (let i = 0; i < 600; i++) c.step(dt, { ax: 0, az: 0, yawRate: 0, pitchRate: 0, rollRate: 0 }, rate.hz, rate.steps);
          for (const v of c.theta) expect(Math.abs(v)).toBeLessThan(0.02);
        }
      });
});
