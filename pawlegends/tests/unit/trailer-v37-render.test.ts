/**
 * Render bug from the trailer v3.6 review (render only; nothing under src/sim changes): a hero standing in a Catnip
 * Bush showed her legs and ring through a 60 % stipple of leaves (BUSH_CUT strength 0.6 from 0.7 m), which read as the
 * body clipping through the bush. The leaves are now cleared whole round the body, with a short dithered edge.
 */
import { describe, expect, it } from 'vitest';
import { BUSH_CUT, bushCutAt } from '../../src/render/views/mapView';

describe('a hero in a bush stands in a clean opening', () => {
  it('every leaf within a hero body radius (0.9 m) is cut, none past the outer radius', () => {
    for (const d of [0, 0.3, 0.6, 0.9]) expect(bushCutAt(d)).toBe(1);
    expect(bushCutAt(BUSH_CUT.outer)).toBe(0);
    expect(bushCutAt(2)).toBe(0);
  });
  it('the dithered edge is short (a stipple band under 0.5 m, not the 0.8 m half-cut band of v3.6)', () => {
    expect(BUSH_CUT.strength).toBe(1);
    expect(BUSH_CUT.outer - BUSH_CUT.inner).toBeLessThan(0.5);
    const mid = bushCutAt((BUSH_CUT.inner + BUSH_CUT.outer) / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
});
