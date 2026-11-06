/** Audit GFX-10: one full-screen layer at a time (render/fx/screenLayer.ts). */
import { afterEach, describe, expect, it } from 'vitest';
import { claimScreen, holdScreen, resetScreen } from '../../src/render/fx/screenLayer';
import { LowHp } from '../../src/render/fx/lowHp';

afterEach(() => resetScreen());

describe('GFX-10 screen layers', () => {
  it('a second flash inside the first one is skipped, then allowed after it', () => {
    expect(claimScreen(700, 1000)).toBe(true);
    expect(claimScreen(300, 1500)).toBe(false);
    expect(claimScreen(300, 1701)).toBe(true);
  });

  it('the low-health vignette holds the screen while it is on', () => {
    const v = new LowHp(null);
    v.update(0.2, false);
    expect(claimScreen(700, 10_000)).toBe(false);
    v.update(1, false);
    expect(claimScreen(700, 10_000)).toBe(true);
    holdScreen(true);
    v.dispose();
    expect(claimScreen(700, 20_000)).toBe(true);
  });
});
