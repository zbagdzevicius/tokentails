// The v2 edit plan (no ffmpeg): 15 s mapping, base pictures, push/bump geometry, shakes, grade windows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { framePlan, gradeWindows, rangesExpr, shakeAt, zoomFrames, zoomGeometry } from './edit-plan.mjs';
import { CUTS, post, sourceFrame } from './mg-timeline.mjs';

const edl = JSON.parse(readFileSync(new URL('./edl.json', import.meta.url), 'utf8'));

describe('trailer v2 edit plan', () => {
  it('the 15 s cut maps onto the master (storyboard §7)', () => {
    expect(sourceFrame('15', 0)).toBe(0);
    expect(sourceFrame('15', 100)).toBe(200); // Clem's Tumble
    expect(sourceFrame('15', 200)).toBe(400); // 3V3
    expect(sourceFrame('15', 400)).toBe(800); // Pack Hunt
    expect(sourceFrame('15', 775)).toBe(1525); // the core impact
    expect(edl.bpm).toBe(144);
  });

  it('every output frame has exactly one base picture; the 9:16 HUD shot is a band', () => {
    const plan = framePlan('30', '9x16', edl, {
      hasPlate: (f) => f >= 1600,
      footageSize: (src) => (src >= 1225 && src <= 1299 ? [1864, 860] : [1080, 1920]),
    });
    expect(plan).toHaveLength(1800);
    expect(plan.filter((p) => p.kind === 'band').map((p) => p.f)).toEqual(Array.from({ length: 75 }, (_, i) => 1225 + i));
    expect(plan.find((p) => p.f === 1700).kind).toBe('plate');
    expect(edl.band['9x16'].segs).toHaveLength(1);
  });

  it('zoom-punches land on the impacts at 104 %', () => {
    const z = zoomFrames('30', '16x9', edl);
    for (const b of post('30').bump) expect(Math.max(...[0, 1, 2, 3].map((i) => z.get(b.f + i).z))).toBeCloseTo(1.04, 5);
    expect(z.has(600)).toBe(false);
    const g = zoomGeometry(1920, 1080, { z: 1.04, ax: 960, ay: 540 });
    expect(Math.abs((960 * g.sw) / 1920 - g.x - 960)).toBeLessThanOrEqual(1);
  });

  it('shakes start on their frame, decay to rest and stay inside the margin', () => {
    const shakes = post('30').shake;
    for (let n = 0; n < CUTS[30]; n++) {
      const s = shakeAt(shakes, n);
      expect(Math.abs(s.x)).toBeLessThan(edl.shakeMargin);
      expect(Math.abs(s.y)).toBeLessThan(edl.shakeMargin);
    }
    expect(shakeAt(shakes, 600)).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(shakeAt(shakes, 1526).x, shakeAt(shakes, 1526).y)).toBeGreaterThan(1);
  });

  it('every frame is graded; the impacts get the chromatic split', () => {
    const g = gradeWindows('30', edl);
    expect(g.graded).toEqual([[0, 1799]]);
    expect(g.strong).toContainEqual([1525, 1526]);
    expect(rangesExpr([])).toBe('0');
    expect(gradeWindows('15', edl).graded).toEqual([[0, 899]]);
  });
});
