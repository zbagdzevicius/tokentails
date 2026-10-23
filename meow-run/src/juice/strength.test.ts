import { describe, expect, it } from 'vitest';
import { speedLineStrength, type SpeedState } from './strength';

const base: SpeedState = { speed: 18, mode: 'run', ability: null, sincePounce: 99, boostT: 0, boostMul: 1, sinceHit: 99 };

describe('speed lines', () => {
  it('are off at the starting speed and grow with speed', () => {
    expect(speedLineStrength(base, false)).toBe(0);
    expect(speedLineStrength({ ...base, speed: 26 }, false)).toBeGreaterThan(speedLineStrength({ ...base, speed: 23 }, false));
    expect(speedLineStrength({ ...base, speed: 99 }, false)).toBeLessThanOrEqual(1);
  });
  it('kick in on boosts, pounces, the vault and the cloud', () => {
    expect(speedLineStrength({ ...base, boostT: 1, boostMul: 1.4 }, false)).toBeGreaterThan(0.4);
    expect(speedLineStrength({ ...base, sincePounce: 0 }, false)).toBeGreaterThan(0.4);
    expect(speedLineStrength({ ...base, ability: 'vault' }, false)).toBeGreaterThan(0.4);
    expect(speedLineStrength({ ...base, ability: 'cloud' }, false)).toBeGreaterThan(0.3);
  });
  it('soften for reduced motion, hits and the finish', () => {
    const full = speedLineStrength({ ...base, speed: 30, ability: 'vault' }, false);
    expect(speedLineStrength({ ...base, speed: 30, ability: 'vault' }, true)).toBeCloseTo(full * 0.35);
    expect(speedLineStrength({ ...base, speed: 30, sinceHit: 0.1 }, false)).toBeLessThan(speedLineStrength({ ...base, speed: 30 }, false));
    expect(speedLineStrength({ ...base, speed: 30, mode: 'finish' }, false)).toBeLessThan(0.2);
  });
});
