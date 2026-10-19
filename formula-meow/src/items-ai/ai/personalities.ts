/**
 * AI personalities (GDD 5.1): deterministic from the race seed and the slot, inside the class skill band.
 *
 * Iteration 2 (feel lane): skills are spread by rank, not drawn independently. The seed shuffles the 8 grid slots;
 * each slot's rank in that shuffle places its skill evenly across the band (plus a little jitter), so every field
 * has a quick front-runner, a midfield and a straggler. Independent draws often gave seven near-identical cats, and
 * the race drove as one pack.
 */
import type { Personality, RaceClass } from '../../types';
import { classTuning } from '../../tuning';
import { STREAM, draw, rngFloat, streamSeed } from '../../core/sim/rng';

const SLOTS = 8;

/** Skill rank 0..1 of `slot` in the seed's shuffle of the 8 slots. */
export function skillRank(seed: number, slot: number): number {
  const key = (s: number) => rngFloat(streamSeed(seed, STREAM.personality, 100 + s));
  const mine = key(slot);
  let below = 0;
  for (let s = 0; s < SLOTS; s++) if (s !== slot && (key(s) < mine || (key(s) === mine && s < slot))) below++;
  return below / (SLOTS - 1);
}

export function personalityFor(seed: number, slot: number, cls: RaceClass): Personality {
  const h = { r: streamSeed(seed, STREAM.personality, slot) };
  const [lo, hi] = classTuning(cls).aiSkill;
  const jitter = (draw(h, 'r') - 0.5) * 0.12;
  const u = Math.max(0, Math.min(1, skillRank(seed, slot) + jitter));
  const skill = lo + (hi - lo) * u;
  return {
    skill,
    aggression: draw(h, 'r'),
    mistakeRate: (1 - skill) * (cls === 0 ? 0.9 : 0.6),
    lineBias: (draw(h, 'r') - 0.5) * 0.8,
  };
}
