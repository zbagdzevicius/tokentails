import { describe, expect, it } from 'vitest';
import { finishBonus, MAX_MULT, multAfterHit, multAfterPickup, pickupPoints, respawnPenalty, speedAt, starsFor } from './scoring';

describe('scoring', () => {
  it('pickups scale with the multiplier', () => {
    expect(pickupPoints(50, 1)).toBe(50);
    expect(pickupPoints(50, 18)).toBe(900);
    expect(pickupPoints(50, 0)).toBe(50);
    expect(pickupPoints(50, 1000)).toBe(50 * MAX_MULT);
  });
  it('multiplier grows by one and halves on a hit', () => {
    expect(multAfterPickup(1)).toBe(2);
    expect(multAfterPickup(MAX_MULT)).toBe(MAX_MULT);
    expect(multAfterHit(18)).toBe(9);
    expect(multAfterHit(1)).toBe(1);
    expect(multAfterHit(3)).toBe(1);
  });
  it('respawn penalty and finish bonus', () => {
    expect(respawnPenalty(10000)).toBe(1000);
    expect(respawnPenalty(0)).toBe(0);
    expect(finishBonus(3)).toBe(3500);
  });
  it('stars: finish, all bells, score target', () => {
    const base = { finished: true, bellCount: 7, bellsTotal: 7, score: 9000 };
    expect(starsFor(base, 9000)).toEqual([true, true, true]);
    expect(starsFor({ ...base, bellCount: 6 }, 9000)).toEqual([true, false, true]);
    expect(starsFor({ ...base, score: 100 }, 9000)).toEqual([true, true, false]);
    expect(starsFor({ ...base, finished: false }, 9000)).toEqual([false, false, false]);
    expect(starsFor({ ...base, bellsTotal: 0 }, 0)).toEqual([false, false, false]);
  });
  it('speed ramps linearly and clamps', () => {
    const sp = { start: 18, max: 30, rampDist: 1000 };
    expect(speedAt(sp, 0)).toBe(18);
    expect(speedAt(sp, 500)).toBe(24);
    expect(speedAt(sp, 5000)).toBe(30);
  });
});
