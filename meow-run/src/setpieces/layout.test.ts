import { describe, expect, it } from 'vitest';
// core/player.ts touches the renderer, so the two feel numbers we need are mirrored here (see TUNING)
const TUNING = { bodyH: 1.1, latSpeed: 11 };
import { chasePlan, DOG } from './chaseplan';
import { fishOffset, hazardHalfWidth, vaultArc, vaultHeight, vaultYAt } from './layout';

describe('set-piece layout maths', () => {
  it('fish rows: line, arc peaks in the middle, wave swings both ways', () => {
    expect(fishOffset('line', 2, 5, 1, 0.8, 2, 2)).toEqual({ x: 1, y: 0.8 });
    expect(fishOffset('arc', 2, 5, 0, 0.8, 2, 2).y).toBeCloseTo(2.8);
    expect(fishOffset('arc', 0, 5, 0, 0.8, 2, 2).y).toBeCloseTo(0.8);
    const xs = [0, 1, 2, 3, 4, 5, 6].map((i) => fishOffset('wave', i, 7, 0, 0.8, 2, 2).x);
    expect(Math.max(...xs)).toBeGreaterThan(1.5);
    expect(Math.min(...xs)).toBeLessThan(-1.5);
  });
  it('vault arc: starts at the paw pad, lands past the rim, peaks at vaultHeight in the middle', () => {
    const a = vaultArc(100, 26);
    expect(a.plant).toBeLessThan(100);
    expect(a.land).toBeGreaterThan(126);
    expect(vaultYAt(100, 26, a.mid)).toBeCloseTo(vaultHeight(26));
    expect(vaultYAt(100, 26, a.plant - 1)).toBe(0);
    expect(vaultYAt(100, 26, a.land + 1)).toBe(0);
    // the arc clears the rims with room for the kitten's body
    expect(vaultYAt(100, 26, 100)).toBeGreaterThan(TUNING.bodyH);
    expect(vaultYAt(100, 26, 126)).toBeGreaterThan(TUNING.bodyH);
  });
  it('hazard widths: logs span the path by default, rocks are local', () => {
    expect(hazardHalfWidth('log', undefined, 9)).toBe(5);
    expect(hazardHalfWidth('log', { w: 4.5 }, 9)).toBe(2.25);
    expect(hazardHalfWidth('rock', { r: 1 }, 9)).toBeCloseTo(0.9);
  });
  it('chase rhythm: barks every 2.4..3.4 s, the dog telegraphs longer than a lateral dodge takes', () => {
    for (let i = 0; i < 20; i++) {
      expect(chasePlan(i, 'dog')).toBeGreaterThanOrEqual(2.4);
      expect(chasePlan(i, 'dog')).toBeLessThanOrEqual(3.4);
      expect([0, 1]).toContain(chasePlan(i, 'yarn'));
    }
    // crossing the snap zone at full lateral speed must fit inside the bark telegraph
    const zone = DOG.reach + DOG.headR + 0.4;
    expect(zone / TUNING.latSpeed).toBeLessThan(DOG.barkT);
  });
});
