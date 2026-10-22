/**
 * Doodles that start spectacular (iteration 4, F10): auto-stunts on fresh finger doodles, Spice it up, and the
 * Surprise track generator (50 seeds: every one validates, passes the drive check and round-trips the track code).
 */
import { describe, expect, it } from 'vitest';
import { decodeTrackCode, encodeTrack } from '../codec/track-code';
import { validateSetPieces, validateTrack } from './validate';
import { buildTrack } from '../../core/track/build';
import { autoStunts, randomDoodles, seedOf, spiceUp, surpriseTrack } from './surprise';
import { randomDoodles as testDoodles } from '../../test/doodles';

describe('auto-stunts on a fresh doodle', () => {
  const doodles = randomDoodles(30, 3);

  it('places at least one stunt on ≥ 90 % of finger doodles, every set valid and drivable', () => {
    let placed = 0;
    let loops = 0;
    for (const d of doodles) {
      const def = structuredClone(d);
      const kinds = autoStunts(def, seedOf(def));
      if (kinds.length) placed++;
      if (kinds.includes('loop')) loops++;
      expect(validateSetPieces(def, buildTrack(def), { ugc: true })).toEqual([]);
      // the full validator, the phone bot's drive check included
      expect(validateTrack(def).ok, d.id).toBe(true);
    }
    expect(placed / doodles.length).toBeGreaterThanOrEqual(0.9);
    // a loop goes in wherever a long enough straight exists (about a third to a half of round finger loops)
    expect(loops).toBeGreaterThan(0);
  }, 180_000);

  it('is reproducible from the doodle (the same drawing gets the same stunts)', () => {
    const a = structuredClone(doodles[4]);
    const b = structuredClone(doodles[4]);
    autoStunts(a, seedOf(a));
    autoStunts(b, seedOf(b));
    expect(a.setPieces).toEqual(b.setPieces);
    expect(a.features).toEqual(b.features);
  });

  it('Spice it up re-rolls the stunts and the item spots, and the track stays valid', () => {
    const def = structuredClone(doodles[7]);
    autoStunts(def, seedOf(def));
    const seen = new Set<string>();
    for (let r = 1; r <= 4; r++) {
      spiceUp(def, (seedOf(def) + r * 0x9e3779b1) >>> 0);
      expect(validateTrack(def).ok).toBe(true);
      expect(def.features.filter((f) => f.kind === 'items')).toHaveLength(2);
      expect(def.features.filter((f) => f.kind === 'start')).toHaveLength(1);
      seen.add(JSON.stringify([def.features, def.setPieces]));
    }
    expect(seen.size).toBeGreaterThan(1);
  }, 90_000);

  it('the test helper still hands out the same doodles (moved, re-exported)', () => {
    expect(testDoodles(3, 3)).toEqual(randomDoodles(3, 3));
  });
});

describe('Surprise track', () => {
  it('50 seeds: every track validates, passes the drive check and round-trips the track code', () => {
    let withLoop = 0;
    let stunts = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const def = surpriseTrack(seed);
      expect(def, `seed ${seed}`).not.toBeNull();
      const v = validateTrack(def!);
      expect(v.ok, `seed ${seed}: ${v.issues[0]?.message}`).toBe(true);
      expect(def!.name.length).toBeGreaterThan(0);
      const back = decodeTrackCode(encodeTrack(def!));
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(back.track.points).toEqual(def!.points);
      expect(back.track.features).toEqual(def!.features);
      expect(back.track.setPieces ?? []).toEqual(def!.setPieces ?? []);
      expect(back.track.theme).toBe(def!.theme);
      if (def!.setPieces?.some((p) => p.kind === 'loop')) withLoop++;
      if (def!.setPieces?.length) stunts++;
    }
    // squircle strokes have straights: most surprises get a loop, nearly all get some stunt
    expect(withLoop).toBeGreaterThanOrEqual(35);
    expect(stunts).toBeGreaterThanOrEqual(48);
  }, 120_000);

  it('is the same track for the same seed', () => {
    expect(surpriseTrack(77)).toEqual(surpriseTrack(77));
    expect(surpriseTrack(77)).not.toEqual(surpriseTrack(78));
  });
});
