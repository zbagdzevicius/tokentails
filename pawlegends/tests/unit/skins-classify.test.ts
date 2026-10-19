/**
 * Card skins (GDD §7.2): the sprite classifier (render/skins/classify.ts) on real Token Tails sprites: the repo's
 * own base sheets (client/public/heist-game/assets/cats) and two variant sprites copied as fixtures
 * (tests/fixtures/skins: PINKIE saiyan, RASCAL bow-tie-red). Fur, pattern, eyes and the variant accent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../tools/lib/png.mjs';
import { accentOf, classifySprite, deltaE, frameOf, hsl, rowOf, sheetFrames } from '../../src/render/skins/classify';

const SHEETS = path.resolve(__dirname, '../../../client/public/heist-game/assets/cats');
const FIX = path.resolve(__dirname, '../fixtures/skins');
const sheet = (file: string) => decodePng(new Uint8Array(fs.readFileSync(file)));
const local = (name: string) => classifySprite(sheetFrames(sheet(path.join(SHEETS, `${name}.png`))));
const L = (c: number): number => hsl(c)[2];

describe('classifySprite (8 sprite fixtures)', () => {
  it('PICKLES: a dark brown tabby with green eyes', () => {
    const c = local('pickles');
    expect(c.pattern).toBe('tabby');
    expect(L(c.fur)).toBeLessThan(0.4);
    expect(hsl(c.eyes as number)[0]).toBeGreaterThan(60);
    expect(hsl(c.eyes as number)[0]).toBeLessThan(110);
    expect(c.confidence).toBeGreaterThanOrEqual(0.5);
  });
  it('GREY: a solid grey cat with a white chest and orange eyes', () => {
    const c = local('grey');
    expect(c.pattern).toBe('solid');
    expect(hsl(c.fur)[1]).toBeLessThan(0.05);
    expect(L(c.fur)).toBeGreaterThan(0.35);
    expect(c.white).not.toBeNull();
    expect(hsl(c.eyes as number)[0]).toBeLessThan(40);
  });
  it('FICUS: a black tuxedo (white muzzle, chest and paws)', () => {
    const c = local('ficus');
    expect(c.pattern).toBe('tuxedo');
    expect(L(c.fur)).toBeLessThan(0.1);
    expect(L(c.white as number)).toBeGreaterThan(0.9);
  });
  it('CASTIEL: a white solid cat with teal eyes', () => {
    const c = local('castiel');
    expect(c.pattern).toBe('solid');
    expect(L(c.fur)).toBeGreaterThan(0.9);
    const [h] = hsl(c.eyes as number);
    expect(h).toBeGreaterThan(150);
    expect(h).toBeLessThan(190);
  });
  it('RASCAL: an orange coat (its faint stripes are an override: render/skins/overrides.json)', () => {
    const c = local('rascal');
    const [h, s] = hsl(c.fur);
    expect(h).toBeGreaterThan(25);
    expect(h).toBeLessThan(45);
    expect(s).toBeGreaterThan(0.6);
  });
  it('LEGEND: a solid black cat; the near-black outline does not become the deep colour of a pattern', () => {
    const c = local('legend');
    expect(c.pattern).toBe('solid');
    expect(L(c.fur)).toBeLessThan(0.1);
  });
  it('PINKIE saiyan (a variant: orange hair): the fur stays the cat, the hair is the accent', () => {
    const s = sheet(path.join(FIX, 'PINKIE_saiyan.png'));
    const c = classifySprite([frameOf(s, 0, 4, 'idle')]);
    expect(c.colours).toBeGreaterThan(20);
    const base = local('pinkie');
    const fam = rowOf(base);
    const acc = accentOf([frameOf(s, 0, 4, 'idle')], [fam.base, fam.deep, fam.light, fam.cream, fam.eyes, fam.nose, fam.earInner]);
    expect(acc).not.toBeNull();
    // the saiyan hair is a saturated orange-yellow
    const [h, sat] = hsl(acc as number);
    expect(h).toBeGreaterThan(20);
    expect(h).toBeLessThan(60);
    expect(sat).toBeGreaterThan(0.5);
  });
  it('RASCAL bow-tie-red: the accent is the red bow tie', () => {
    const s = sheet(path.join(FIX, 'RASCAL_bow-tie-red.png'));
    const fam = rowOf(local('rascal'));
    const acc = accentOf([frameOf(s, 0, 4, 'idle')], [fam.base, fam.deep, fam.light, fam.cream, fam.eyes, fam.nose, fam.earInner]) as number;
    expect(deltaE(acc, 0xd02020)).toBeLessThan(40);
  });
  it('FOX (not a cat): an outlier reads as a solid coat with low confidence', () => {
    const c = classifySprite(sheetFrames(sheet(path.join(SHEETS, 'fox.png'))), { outlier: true });
    expect(c.pattern).toBe('solid');
    expect(c.confidence).toBeLessThan(0.5);
  });
});

describe('rowOf (the chibi mapping)', () => {
  it('base = fur ×1.08, deep = secondary or fur 35% darker, cream = white, eyes fall back to amber', () => {
    const r = rowOf({ pattern: 'solid', fur: 0x646464, secondary: null, white: null, patch: null, orange: null, dark: null, eyes: null, nose: null, earInner: null, confidence: 1, colours: 4 });
    expect(r.base).toBe(0x6c6c6c);
    expect(r.deep).toBe(0x464646);
    expect(r.light).toBe(r.cream);
    expect(r.eyes).toBe(0xf2b84b);
  });
  it('calico: a cream base with orange patches and dark ones', () => {
    const r = rowOf({ pattern: 'calico', fur: 0xffffff, secondary: 0xe08020, white: 0xffffff, patch: null, orange: 0xe08020, dark: 0x202020, eyes: 0x88aa22, nose: 0x6a4438, earInner: 0xd58971, confidence: 1, colours: 8 });
    expect(r.base).toBe(0xffffff);
    expect(r.patch).toBeDefined();
    expect(L(r.deep)).toBeLessThan(0.2);
  });
});
