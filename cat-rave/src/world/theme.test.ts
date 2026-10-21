import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../config';
import { FLASH_RGB } from './show';
import { COLOR_KEYS, THEMES, ThemeFader, hexRgb, mixTheme, themeFor, type Rgb } from './theme';

const lin = (hex: number): Rgb => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

describe('themes', () => {
  const g = THEMES.green;
  const r = THEMES.red;

  it('green and red have the same keys', () => {
    expect(Object.keys(r).sort()).toEqual(Object.keys(g).sort());
  });

  it('green is exactly the scene literals from before themes (byte-identical default)', () => {
    expect(g.sky).toEqual(lin(PALETTE.sky));
    expect(g.fog).toEqual(lin(PALETTE.fog));
    expect(g.moon).toEqual(lin(PALETTE.moon));
    expect(g.moonGlow).toEqual(lin(PALETTE.moonGlow));
    expect(g.floor).toEqual(lin(PALETTE.floor));
    expect(g.floorGlow).toEqual(lin(PALETTE.floorGlow));
    expect(g.boothGlow).toEqual(lin(PALETTE.boothGlow));
    expect(g.laser).toEqual(lin(0x39ff5a)); // world/index.ts laser green
    expect(g.boothPool).toEqual([0.212, 1.0, 0.254]); // floor.ts booth pool
    expect(g.zen).toEqual([0.0006, 0.003, 0.0012]); // sky.ts zenith
    expect(g.starTint).toEqual([0.75, 1.0, 0.85]);
    expect(g.moonTint).toEqual([0.86, 1.0, 0.8]);
    expect(g.boothTint).toEqual([0.9, 1.0, 0.9]);
    expect(g.boothInk).toEqual([0.02, 0.18, 0.06]);
    expect(g.spotTint).toEqual([0.75, 1.0, 0.8]);
    expect(g.dropFlash).toEqual([0.75, 1.0, 0.8]);
    expect(g.flashKey).toEqual([...FLASH_RGB.green]);
    expect(g.crowdGlow).toEqual(lin(PALETTE.floorGlow));
    expect(g.crowdFill).toEqual(lin(0x3dff6a));
    expect(g.djRim).toEqual(lin(0x3dff6a));
    expect(g.djRimLit).toEqual(lin(0x7dff9a));
    expect(g.kittenRim).toEqual(lin(0x3dff6a));
    expect(g.kittenRim2).toEqual(lin(0x6dff8c));
    expect(g.phonesGlow).toEqual([0.24, 1, 0.43]);
    expect(g.deckGreen).toEqual(lin(PALETTE.laserGreen));
    expect(g.vuGreen).toEqual([0.3, 1.0, 0.45]);
    expect(g.pawsRim).toEqual(lin(PALETTE.floorGlow));
    expect(g.bloomGain).toBe(1);
  });

  it('red uses the agreed key colours', () => {
    expect(r.sky).toEqual(hexRgb(0x0a0203));
    expect(r.moonGlow).toEqual(hexRgb(0xff2b3a));
    expect(r.floor).toEqual(hexRgb(0xd22838));
    expect(r.laser).toEqual(hexRgb(0xff3946));
    expect(r.flashKey).toEqual([1.0, 0.3, 0.25]);
  });

  it('red keys are R-dominant, its tints warm', () => {
    const keys = ['sky', 'fog', 'moonGlow', 'floor', 'floorGlow', 'boothGlow', 'laser', 'boothPool', 'zen', 'boothInk', 'flashKey', 'crowdGlow', 'crowdFill', 'djRim', 'djRimLit', 'kittenRim', 'kittenRim2', 'phonesGlow', 'deckGreen', 'vuGreen', 'pawsRim'] as const;
    for (const k of keys) {
      const [cr, cg, cb] = r[k];
      expect(cr, k).toBeGreaterThan(2 * cg);
      expect(cr, k).toBeGreaterThan(2 * cb);
    }
    for (const k of COLOR_KEYS) {
      const [cr, cg, cb] = r[k];
      expect(cr, k).toBeGreaterThanOrEqual(cg);
      expect(cr, k).toBeGreaterThanOrEqual(cb);
    }
  });

  it('bloomGain stays in [1, 1.8]', () => {
    for (const th of [g, r]) {
      expect(th.bloomGain).toBeGreaterThanOrEqual(1);
      expect(th.bloomGain).toBeLessThanOrEqual(1.8);
    }
  });

  it('mixTheme lerps every colour in linear space', () => {
    expect(mixTheme(g, r, 0)).toEqual(g);
    expect(mixTheme(g, r, 1)).toEqual(r);
    const mid = mixTheme(g, r, 0.5);
    for (const k of COLOR_KEYS) for (let i = 0; i < 3; i++) expect(mid[k][i]).toBeCloseTo((g[k][i] + r[k][i]) / 2, 12);
    expect(mid.bloomGain).toBeCloseTo((g.bloomGain + r.bloomGain) / 2, 12);
  });

  it('themeFor maps tracks to lights', () => {
    expect(themeFor('synth')).toBe('green');
    expect(themeFor('mix')).toBe('red');
  });

  it('a fader writes nothing until set, then eases to the target in its duration', () => {
    const f = new ThemeFader();
    expect(f.step(0.016)).toBeNull();
    f.set('red', 0.6);
    let last = f.step(0.3);
    expect(last).not.toBeNull();
    expect(last!.floor[0]).toBeGreaterThan(g.floor[0]);
    expect(last!.floor[0]).toBeLessThan(r.floor[0]);
    last = f.step(0.31);
    expect(last).toEqual(r);
    f.step(0.016);
    expect(f.step(0.016)).toBeNull();
    f.set('green', 0);
    expect(f.step(0.016)).toEqual(g);
  });
});
