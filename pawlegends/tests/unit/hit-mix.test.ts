/**
 * Hit feel bank (audio pass 2, Nov 10): every bank sound bakes to short, audible PCM with distinct variants; per-play
 * variation never repeats the same variant twice in a row and keeps pitch and volume in a small band; the category
 * voice caps bound concurrent sounds and let the player's own steal from others; the announcer ducks the combat bus.
 */
import { describe, expect, it } from 'vitest';
import { PCM_RATE } from '../../src/audio/sfxDefs.js';
import {
  BANK_MAX_SECONDS,
  HIT_BANK,
  HIT_CAT_MAX,
  HIT_VARIANTS,
  HitVariation,
  HitVoices,
  RATE_JITTER,
  VOL_JITTER,
  attackStyle,
  heroSwingRate,
  natureBody,
  renderBankSound,
} from '../../src/audio/hitMix';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { NATURES } from '../../src/render/identity';

const peakOf = (p: Float32Array): number => p.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('hit bank sounds', () => {
  it.each(Object.keys(HIT_BANK))('%s: every variant is finite, audible, short and peaks at its level', (kind) => {
    for (let v = 0; v < HIT_VARIANTS; v++) {
      const pcm = renderBankSound(kind, v);
      expect(pcm.length).toBeGreaterThan(PCM_RATE * 0.03);
      expect(pcm.length).toBeLessThanOrEqual(Math.round(PCM_RATE * BANK_MAX_SECONDS));
      for (let i = 0; i < pcm.length; i++) expect(Number.isFinite(pcm[i])).toBe(true);
      expect(peakOf(pcm)).toBeCloseTo(HIT_BANK[kind].peak, 2);
    }
  });

  it('the variants differ from each other (no machine-gun) and the bake is deterministic', () => {
    for (const kind of Object.keys(HIT_BANK)) {
      const a = renderBankSound(kind, 0);
      const b = renderBankSound(kind, 1);
      expect(renderBankSound(kind, 1)).toEqual(b);
      const n = Math.min(a.length, b.length);
      let diff = 0;
      for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]);
      expect(diff / n, kind).toBeGreaterThan(0.002);
    }
  });

  it('a hit is transient + body (+ tail): the attack is sharp, the contact lands in the first 10 ms', () => {
    for (const kind of ['hitHero', 'hitHeavy', 'hitCrit', 'hitUnit', 'hitMagic', 'hitStructure', 'hurt']) {
      const pcm = renderBankSound(kind, 0);
      const first = peakOf(pcm.subarray(0, Math.round(PCM_RATE * 0.01)));
      expect(first, kind).toBeGreaterThan(0.25 * HIT_BANK[kind].peak);
      expect(HIT_BANK[kind].layers.length, kind).toBeGreaterThanOrEqual(3);
    }
    // heavier sounds last longer than light ones
    expect(renderBankSound('hitHeavy', 0).length).toBeGreaterThan(renderBankSound('hitOther', 0).length);
  });
});

describe('per-play variation', () => {
  it('never plays the same variant twice in a row, uses them all, and jitters pitch and volume in a small band', () => {
    let seed = 1;
    const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const v = new HitVariation(rng);
    const seen = new Set<number>();
    const rates: number[] = [];
    let prev = -1;
    for (let i = 0; i < 200; i++) {
      const p = v.next('hitHero');
      expect(p.variant).not.toBe(prev);
      expect(p.variant).toBeGreaterThanOrEqual(0);
      expect(p.variant).toBeLessThan(HIT_VARIANTS);
      expect(Math.abs(p.rate - 1)).toBeLessThanOrEqual(RATE_JITTER + 1e-9);
      expect(p.vol).toBeGreaterThanOrEqual(1 - VOL_JITTER - 1e-9);
      expect(p.vol).toBeLessThanOrEqual(1);
      seen.add(p.variant);
      rates.push(p.rate);
      prev = p.variant;
    }
    expect(seen.size).toBe(HIT_VARIANTS);
    expect(new Set(rates.map((r) => r.toFixed(3))).size).toBeGreaterThan(20);
  });

  it('reuses one result object (no allocation per hit)', () => {
    const v = new HitVariation();
    expect(v.next('a')).toBe(v.next('b'));
  });
});

describe('category voice caps', () => {
  const stopper = (): { stop: () => void; stopped: number } => {
    const s = { stopped: 0, stop: () => void s.stopped++ };
    return s;
  };

  it('others are dropped once a category is full; slots free up when their sound ends', () => {
    const v = new HitVoices();
    const max = HIT_CAT_MAX.hit;
    for (let i = 0; i < max; i++) {
      const s = v.admit('hit', 0, false);
      expect(s).toBeGreaterThanOrEqual(0);
      v.set('hit', s, 0, 0.3, false, null);
    }
    expect(v.live('hit', 0.1)).toBe(max);
    expect(v.admit('hit', 0.1, false)).toBe(-1);
    expect(v.dropped).toBe(1);
    // other categories are independent
    expect(v.admit('swing', 0.1, false)).toBeGreaterThanOrEqual(0);
    // after the sounds end, there is room again
    expect(v.admit('hit', 0.31, false)).toBeGreaterThanOrEqual(0);
  });

  it("the player's own sound steals the oldest of someone else's, and never loses to others", () => {
    const v = new HitVoices({ swing: 1, hit: 3, hurt: 1, ping: 1 });
    const srcs = [stopper(), stopper(), stopper()];
    for (let i = 0; i < 3; i++) {
      const s = v.admit('hit', i * 0.01, i === 1);
      v.set('hit', s, i * 0.01, 1, i === 1, srcs[i]);
    }
    const s = v.admit('hit', 0.05, true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(srcs[0].stopped).toBe(1); // the oldest other one, not the player's (srcs[1])
    expect(srcs[1].stopped).toBe(0);
    v.set('hit', s, 0.05, 1, true, stopper());
    // full of the player's sounds and one other: another other is dropped
    expect(v.admit('hit', 0.06, false)).toBe(-1);
    expect(v.stolen).toBe(1);
  });

  it('caps are small: a teamfight never plays more than a handful of each', () => {
    expect(HIT_CAT_MAX.hit).toBeLessThanOrEqual(8);
    expect(HIT_CAT_MAX.swing).toBeLessThanOrEqual(4);
    expect(HIT_CAT_MAX.hurt).toBeLessThanOrEqual(2);
  });
});

describe('per-hero and per-nature identity', () => {
  it('melee heroes claw or bonk, ranged ones shoot or cast, by their basic range and role', () => {
    for (const h of HERO_IDS) {
      const s = attackStyle(h);
      const melee = HEROES[h].base.range <= 2000;
      expect(melee ? ['claw', 'bonk'] : ['shot', 'bolt'], h).toContain(s);
      const r = heroSwingRate(h);
      expect(r).toBeGreaterThanOrEqual(0.92);
      expect(r).toBeLessThanOrEqual(1.08);
    }
    expect(new Set(HERO_IDS.map(heroSwingRate)).size).toBeGreaterThan(HERO_IDS.length / 2);
  });

  it('every skill nature has an impact body', () => {
    for (const n of NATURES) expect(['sharp', 'blunt', 'magic']).toContain(natureBody(n));
    expect(natureBody('fire')).toBe('magic');
    expect(natureBody('impact')).toBe('blunt');
    expect(natureBody('slash')).toBe('sharp');
  });
});
