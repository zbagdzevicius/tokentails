/** AI personalities (GDD 5.1): deterministic from the race seed and the slot, inside the class skill band. */
import type { Personality, RaceClass } from '../../types';
import { classTuning } from '../../tuning';
import { STREAM, draw, streamSeed } from '../../core/sim/rng';

export function personalityFor(seed: number, slot: number, cls: RaceClass): Personality {
  const h = { r: streamSeed(seed, STREAM.personality, slot) };
  const [lo, hi] = classTuning(cls).aiSkill;
  const skill = lo + (hi - lo) * draw(h, 'r');
  return {
    skill,
    aggression: draw(h, 'r'),
    mistakeRate: (1 - skill) * (cls === 0 ? 0.9 : 0.6),
    lineBias: (draw(h, 'r') - 0.5) * 0.8,
  };
}
