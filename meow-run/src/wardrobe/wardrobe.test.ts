import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, type SaveData } from '../meta/save';
import { ALL_ITEMS, CATALOG, COUNTERS, furColors, itemAt, itemByKey, patternId } from './catalog';
import { css, hexOf, hsl, luma, mix, rgbOf, shade } from './color';
import { DEFAULT_LOOK, decodeLook, encodeLook, LOOK_SLOTS, type Look } from './look';
import { isOwned, newlyOwned, normalizeLook, ownedKeys, progress, ruleProgress, ruleText, usedCounters } from './unlocks';

function sample(): SaveData {
  const s = defaultSave();
  s.stages.meadow = { stars: [true, true, false], best: 100, bestBells: 7, plays: 3, finished: true };
  s.stages.gorge = { stars: [true, false, false], best: 50, bestBells: 5, plays: 1, finished: true };
  s.totals = { runs: 9, fish: 120, distance: 3200 };
  s.endlessBest = { score: 1, distance: 2100 };
  s.ugcStats = { bestChain: 22, tricks: 30, clips: 0, photos: 1, shares: 2, challengesWon: 0, dailyPlays: 1, trailsFinished: 0 };
  return s;
}

describe('catalogue', () => {
  it('keys are unique and index = position', () => {
    const keys = new Set<string>();
    for (const slot of LOOK_SLOTS) {
      CATALOG[slot].forEach((it, i) => {
        expect(it.index).toBe(i);
        expect(it.slot).toBe(slot);
        expect(it.key.startsWith(`${slot}.`)).toBe(true);
        expect(keys.has(it.key)).toBe(false);
        keys.add(it.key);
      });
    }
    expect(keys.size).toBe(ALL_ITEMS.length);
  });
  it('slot sizes: at most 36, the brief minimums, at least 2 free', () => {
    const min: Record<string, number> = { fur: 9, pattern: 6, eyes: 5, hat: 8, scarf: 6, fx: 6 };
    for (const slot of LOOK_SLOTS) {
      const list = CATALOG[slot];
      expect(list.length).toBeLessThanOrEqual(36);
      expect(list.length).toBeGreaterThanOrEqual(min[slot]);
      expect(list.filter((it) => it.unlock.kind === 'free').length).toBeGreaterThanOrEqual(2);
      expect(list[0].unlock.kind).toBe('free');
    }
  });
  it('every counter kind unlocks something, with a positive target', () => {
    const used = usedCounters();
    for (const c of COUNTERS) expect(used.has(c)).toBe(true);
    for (const it of ALL_ITEMS) if (it.unlock.kind !== 'free') expect(it.unlock.n).toBeGreaterThan(0);
  });
  it('the UGC actions and milestones from the brief each unlock an item', () => {
    const has = (kind: string, n: number) => ALL_ITEMS.some((it) => it.unlock.kind === kind && 'n' in it.unlock && it.unlock.n === n);
    for (const [k, n] of [
      ['clips', 1],
      ['photos', 1],
      ['shares', 1],
      ['daily', 1],
      ['trailsFinished', 1],
      ['challengesWon', 1],
      ['chain', 20],
      ['chain', 50],
      ['tricks', 25],
      ['tricks', 100],
      ['stars', 3],
      ['stars', 6],
      ['stars', 9],
      ['bells', 7],
      ['bells', 14],
      ['bells', 21],
      ['endlessDist', 2000],
      ['endlessDist', 5000],
    ] as const)
      expect(has(k, n), `${k} ${n}`).toBe(true);
  });
  it('the brief items exist under stable keys', () => {
    for (const k of ['fur.galaxy', 'hat.crown', 'scarf.cape', 'fx.rainbow', 'eyes.odd', 'pattern.tuxedo']) expect(itemByKey(k)).toBeTruthy();
    expect(itemAt('hat', 99).key).toBe('hat.none');
    expect(patternId(0)).toBe('tabby');
    expect(furColors(8).specks).toBe(true);
    expect(furColors(0).base).toBe(0xf7953a);
    for (const it of CATALOG.fur) expect(it.colors.length).toBe(5);
    for (const it of CATALOG.eyes) expect(it.colors.length).toBe(3);
  });
});

describe('unlocks', () => {
  it('counts progress from a sample save', () => {
    const p = progress(sample());
    expect(p).toMatchObject({ stars: 3, bells: 12, fish: 120, distance: 3200, endlessDist: 2100, chain: 22, tricks: 30, daily: 1, photos: 1, shares: 2, clips: 0, challengesWon: 0, trailsFinished: 0 });
  });
  it('a fresh save owns only the free items', () => {
    const s = defaultSave();
    const owned = ownedKeys(s);
    expect(owned).toEqual(ALL_ITEMS.filter((it) => it.unlock.kind === 'free').map((it) => it.key));
  });
  it('ownership follows the counters', () => {
    const s = sample();
    expect(isOwned(itemByKey('fur.silver')!, s)).toBe(true); // stars 3
    expect(isOwned(itemByKey('fur.midnight')!, s)).toBe(true); // bells 7
    expect(isOwned(itemByKey('hat.beanie')!, s)).toBe(false); // bells 14
    expect(isOwned(itemByKey('eyes.odd')!, s)).toBe(true); // chain 20
    expect(isOwned(itemByKey('scarf.cape')!, s)).toBe(false); // chain 50
    expect(isOwned(itemByKey('hat.propeller')!, s)).toBe(true); // endless 2000
    expect(isOwned(itemByKey('hat.party')!, s)).toBe(true); // first share
    expect(isOwned(itemByKey('hat.flowers')!, s)).toBe(true); // first photo
    expect(isOwned(itemByKey('fx.hearts')!, s)).toBe(false); // first clip
  });
  it('newlyOwned skips seen items and the classic ones', () => {
    const s = sample();
    const fresh = newlyOwned(s).map((it) => it.key);
    expect(fresh).toContain('fur.silver');
    expect(fresh).not.toContain('fur.classic');
    s.wardrobe = { look: '000000', seen: ['fur.silver'] };
    expect(newlyOwned(s).map((it) => it.key)).not.toContain('fur.silver');
    s.wardrobe.seen = ownedKeys(s);
    expect(newlyOwned(s)).toEqual([]);
  });
  it('rule text and progress', () => {
    expect(ruleText({ kind: 'bells', n: 14 })).toBe('Collect 14 bells');
    expect(ruleText({ kind: 'distance', n: 5000 })).toBe('Run 5,000 m in total');
    expect(ruleText({ kind: 'clips', n: 1 })).toBe('Save a clip');
    expect(ruleText({ kind: 'free' })).toBe('Free');
    const p = progress(sample());
    expect(ruleProgress({ kind: 'bells', n: 14 }, p)).toEqual({ have: 12, need: 14, frac: 12 / 14 });
    expect(ruleProgress({ kind: 'fish', n: 50 }, p).frac).toBe(1);
    for (const it of ALL_ITEMS) expect(ruleText(it.unlock).length).toBeGreaterThan(3);
  });
  it('survives a garbage save through migrate', () => {
    const s = migrate({ stages: 'x', ugcStats: { clips: 'lots' }, totals: null });
    expect(progress(s).clips).toBe(0);
    expect(ownedKeys(s).length).toBeGreaterThan(5);
  });
});

describe('normalizeLook and the codec', () => {
  it('out-of-range indices fall back to classic', () => {
    expect(normalizeLook(decodeLook('zzzzzz'))).toEqual(DEFAULT_LOOK);
    expect(normalizeLook({ fur: 8, hat: 7, scarf: 5, fx: 3 })).toEqual({ fur: 8, pattern: 0, eyes: 0, hat: 7, scarf: 5, fx: 3 });
    expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
    expect(normalizeLook({ fur: -2, hat: 1.5 as number })).toEqual(DEFAULT_LOOK);
  });
  it('with a save, unowned items fall back to classic', () => {
    const look: Look = { fur: 8, pattern: 2, eyes: 3, hat: 7, scarf: 1, fx: 1 };
    const s = sample();
    // galaxy (stars 9) and crown (bells 21) are locked; spots (tricks 25), odd eyes (chain 20), red scarf, sparkles owned
    expect(normalizeLook(look, s)).toEqual({ fur: 0, pattern: 2, eyes: 3, hat: 0, scarf: 1, fx: 1 });
    expect(normalizeLook(look)).toEqual(look);
  });
  it('round trips every catalogue item', () => {
    for (const slot of LOOK_SLOTS)
      for (const it of CATALOG[slot]) {
        const l: Look = { ...DEFAULT_LOOK, [slot]: it.index };
        expect(decodeLook(encodeLook(l))).toEqual(l);
      }
    expect(encodeLook(DEFAULT_LOOK)).toBe('000000');
    expect(decodeLook('3a0210')).toEqual({ fur: 3, pattern: 10, eyes: 0, hat: 2, scarf: 1, fx: 0 });
    expect(decodeLook('bad')).toEqual(DEFAULT_LOOK);
  });
});

describe('colour helpers', () => {
  it('converts and clamps', () => {
    expect(rgbOf(0x123456)).toEqual([0x12, 0x34, 0x56]);
    expect(hexOf(300, -5, 128.6)).toBe(0xff0081);
    expect(css(0x0a0b0c)).toBe('#0a0b0c');
    expect(css(0xff0000, 0.5)).toBe('rgba(255,0,0,0.500)');
    expect(rgbOf(NaN)).toEqual([0, 0, 0]);
  });
  it('mixes, shades and measures', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0x102030, 0xffffff, 0)).toBe(0x102030);
    expect(mix(0x102030, 0xffffff, 7)).toBe(0xffffff);
    expect(shade(0x808080, -1)).toBe(0);
    expect(shade(0x808080, 1)).toBe(0xffffff);
    expect(luma(0xffffff)).toBeCloseTo(1);
    expect(luma(0)).toBe(0);
    expect(hsl(0, 1, 0.5)).toBe(0xff0000);
    expect(hsl(120, 1, 0.5)).toBe(0x00ff00);
    expect(hsl(240, 1, 0.5)).toBe(0x0000ff);
    expect(hsl(-120, 1, 0.5)).toBe(0x0000ff);
  });
});
