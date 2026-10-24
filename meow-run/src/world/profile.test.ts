import { describe, expect, it } from 'vitest';
import { THEME_IDS } from './themeIds';
import { PALETTES } from './palette';
import { CORRIDOR, LAT, NL, profileAt, sideProfile, styleWeights, type StyleW } from './profile';
import { fbm1, hash1, vnoise2 } from './noise';

describe('noise', () => {
  it('stays in [0, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const v = fbm1(i * 0.37, 3);
      const w = vnoise2(i * 0.13, i * 0.07, 2);
      const h = hash1(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

describe('side profile', () => {
  const out = new Float32Array(NL);
  for (const id of THEME_IDS) {
    const mix = PALETTES[id].mix;
    it(`${id}: the corridor beside the path stays clear and heights are finite`, () => {
      for (let s = 0; s < 4000; s += 3) {
        for (const side of [-1, 1] as const) {
          sideProfile(out, { s, side, kind: 'ground', bankDeg: 0, floorRel: -26, mix, seed: 7 });
          for (let i = 0; i < NL; i++) expect(Number.isFinite(out[i])).toBe(true);
          for (let i = 0; i < NL && LAT[i] <= CORRIDOR; i++) expect(out[i]).toBeLessThanOrEqual(0.31);
          expect(out[NL - 1]).toBeCloseTo(-29, 3);
        }
      }
    });
    it(`${id}: the style mix roughly matches the palette`, () => {
      const w: StyleW = { cliff: 0, hill: 0, drop: 0 };
      const acc = { cliff: 0, hill: 0, drop: 0 };
      let n = 0;
      for (let s = 0; s < 60000; s += 5) {
        styleWeights(s, 1, mix, 5, w);
        acc.cliff += w.cliff;
        acc.hill += w.hill;
        acc.drop += w.drop;
        n++;
      }
      expect(Math.abs(acc.cliff / n - mix.cliff)).toBeLessThan(0.15);
      expect(Math.abs(acc.drop / n - mix.drop)).toBeLessThan(0.15);
    });
  }
  it('chasm kinds cut a trench to the valley floor beside the path, clear of the camera', () => {
    for (const kind of ['gap', 'bridge'] as const) {
      for (let s = 0; s < 400; s += 13) {
        sideProfile(out, { s, side: 1, kind, bankDeg: 0, floorRel: -20, mix: PALETTES.meadow.mix, seed: 1 });
        for (let i = 0; i < NL; i++) if (LAT[i] <= 7) expect(out[i]).toBeLessThan(-20);
        expect(out[NL - 1]).toBeLessThan(-20);
      }
    }
  });
  it('the cloud canyon is deep under the ride and walled at the sides', () => {
    for (let s = 0; s < 600; s += 7) {
      sideProfile(out, { s, side: -1, kind: 'cloud', bankDeg: 0, floorRel: -30, mix: PALETTES.sunset.mix, seed: 1 });
      expect(profileAt(out, 6)).toBeLessThan(-30);
      expect(profileAt(out, 22)).toBeGreaterThan(0);
    }
  });
  it('a banked wall rises on the high side and falls on the low side', () => {
    const hi = new Float32Array(NL);
    const lo = new Float32Array(NL);
    // bank -55: the left side (-1) is lower, so the right side (+1) is the high cliff
    sideProfile(hi, { s: 300, side: 1, kind: 'wall', bankDeg: -55, floorRel: -30, mix: PALETTES.gorge.mix, seed: 2 });
    sideProfile(lo, { s: 300, side: -1, kind: 'wall', bankDeg: -55, floorRel: -30, mix: PALETTES.gorge.mix, seed: 2 });
    expect(profileAt(hi, 3)).toBeGreaterThan(3);
    expect(profileAt(lo, 4)).toBeLessThan(-10);
  });
  it('river banks shelve under the water at the edge', () => {
    sideProfile(out, { s: 50, side: -1, kind: 'river', bankDeg: 0, floorRel: -25, mix: PALETTES.gorge.mix, seed: 3 });
    expect(out[0]).toBeLessThan(0);
  });
});
