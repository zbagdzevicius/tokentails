/**
 * Feel pass B5 (docs/plans/moba/FEEL-PASS.md): positioning and readability. Plates read the short name; off-screen
 * arrows on the top or bottom edge slide sideways off the HUD (on a side edge, up or down); each kind of enemy hard
 * CC has its own short sound; the own heavy hits and kills stop the clock for 50 ms (capped at 90 ms).
 */
import { describe, expect, it } from 'vitest';
import { clearOfRects, plateName, shortPlateName } from '../../src/ui/overhead';
import { CC_CUE, ccKindOf } from '../../src/render/ccCue';
import { FREEZE_CAP_MS, HITSTOP_MS, Juice } from '../../src/render/juice';

describe('name plates', () => {
  it('a bot persona shows its first name only; titles and "You" stay', () => {
    expect(shortPlateName('Biscuit the Clem')).toBe('Biscuit');
    expect(shortPlateName('Sir Brutus')).toBe('Sir Brutus');
    expect(shortPlateName('Noodle the Gabby')).toBe('Noodle');
    expect(plateName({ id: 3, team: 1, hero: 'clem' }, 0, 0, new Set(), ['', '', '', 'Biscuit the Clem'])).toBe('Biscuit');
    expect(plateName({ id: 0, team: 0, hero: 'clem' }, 0, 0, new Set(), ['Simas'])).toBe('You');
  });
});

describe('off-screen arrows keep clear of the HUD', () => {
  const W = 844;
  const H = 390;
  // the ATK button and Q in the bottom-right corner
  const rects = [
    { left: 720, top: 270, right: 816, bottom: 366 },
    { left: 640, top: 300, right: 704, bottom: 364 },
  ];
  it('an arrow on the bottom edge slides sideways toward the middle, off every box', () => {
    const p = clearOfRects({ x: 760, y: 356 }, 18, rects, H, W);
    expect(p.y).toBe(356);
    expect(p.x).toBeLessThan(640 - 18);
  });
  it('an arrow on the right edge slides up off the box', () => {
    const p = clearOfRects({ x: 826, y: 300 }, 18, [{ left: 800, top: 260, right: 844, bottom: 340 }], H, W);
    expect(p.x).toBe(826);
    expect(p.y).toBeLessThan(260 - 18);
  });
});

describe('enemy hard-CC cues', () => {
  it('reads the CC kind from the hero data', () => {
    expect(ccKindOf('bengas', 1)).toBe('stun');
    expect(ccKindOf('gabe', 3)).toBe('charm');
    expect(ccKindOf('cacklejaw', 1)).toBe('fear');
    expect(ccKindOf('lambo', 3)).toBe('root');
    expect(ccKindOf('clem', 0)).toBeNull();
    expect(ccKindOf(undefined, 0)).toBeNull();
  });
  it('every kind has its own sound (name and rate pair)', () => {
    const keys = Object.values(CC_CUE).map((c) => `${c.name}@${c.rate}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('hitstop', () => {
  it('50 ms on own heavy hits and kills, never longer than 90 ms', () => {
    expect(HITSTOP_MS).toBe(50);
    expect(FREEZE_CAP_MS).toBe(90);
    const j = new Juice(null as unknown as HTMLElement);
    j.hitstop(HITSTOP_MS);
    let frozen = 0;
    for (let k = 0; k < 20; k++) if (j.timeScale(1 / 60) === 0) frozen++;
    expect(frozen).toBeGreaterThanOrEqual(2);
    expect(frozen).toBeLessThanOrEqual(4);
  });
});
