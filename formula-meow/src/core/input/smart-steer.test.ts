import { describe, expect, it } from 'vitest';
import { TRACKS } from '../track/tracks';
import { runNovice } from './novice';
import { STICK, stickSteer } from './smart-steer';

describe('touch stick curve (iteration 4, F2)', () => {
  it('is x^1.15 with a 4 px dead zone, full lock at 70 px, symmetric', () => {
    expect(STICK).toEqual({ dead: 4, full: 70, curve: 1.15 });
    expect(stickSteer(3.9)).toBe(0);
    expect(stickSteer(70)).toBe(1);
    expect(stickSteer(-120)).toBe(-1);
    expect(stickSteer(-30)).toBeCloseTo(-stickSteer(30), 12);
    // small corrections answer more than the old x^1.4 / 6 px stick
    for (const px of [8, 15, 25, 40]) expect(stickSteer(px)).toBeGreaterThan(stickSteer(px, 6, 1.4));
  });
});

/**
 * The plan's acceptance (ITERATION-4 F2): the novice line-follower on touch, 50cc, Kitchen / Café / Shelter, touches
 * walls in at most a quarter of the ticks it did with the SIM_VERSION 10 stick (x^1.4, 6 px, no assist), and finishes
 * within 8 s of the AI's mean. Two seeds per track keep the run near 10 s.
 */
describe('Smart Steer novice acceptance', () => {
  it('cuts the novice wall ticks to at most 1/4 and keeps it within 8 s of the 50cc AI', { timeout: 120_000 }, () => {
    let before = 0;
    let after = 0;
    for (const id of ['kitchen', 'cafe', 'shelter']) {
      const def = TRACKS.find((t) => t.id === id)!;
      for (const seed of [1, 2]) {
        const v10 = runNovice(def, { smartSteer: false, dead: 6, curve: 1.4, seed });
        const v11 = runNovice(def, { smartSteer: true, dead: STICK.dead, curve: STICK.curve, seed });
        before += v10.wallTicks;
        after += v11.wallTicks;
        expect(v11.time, `${id} seed ${seed} finished`).not.toBeNull();
        expect(v11.time! - v11.aiMean, `${id} seed ${seed} gap to the AI mean`).toBeLessThanOrEqual(8);
        expect(v11.assistTicks).toBeGreaterThan(0);
      }
    }
    expect(before).toBeGreaterThan(100);
    expect(after).toBeLessThanOrEqual(before / 4);
  });
});
