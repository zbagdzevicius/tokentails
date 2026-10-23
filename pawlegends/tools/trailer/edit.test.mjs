// The v4 edit plan (no ffmpeg): 15 s mapping, base pictures, push/bump geometry, shakes, grade windows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { framePlan, gradeWindows, rangesExpr, shakeAt, zoomFrames, zoomGeometry } from './edit-plan.mjs';
import { CORE_HIT, CUTS, impacts, post, sourceFrame } from './mg-timeline.mjs';

const edl = JSON.parse(readFileSync(new URL('./edl.json', import.meta.url), 'utf8'));

describe('trailer v4 edit plan', () => {
  it('the 15 s cut maps onto the master (storyboard §7)', () => {
    expect(sourceFrame('15', 0)).toBe(0);
    expect(sourceFrame('15', 100)).toBe(206); // Clem's Tumble
    expect(sourceFrame('15', 200)).toBe(400); // 3V3
    expect(sourceFrame('15', 400)).toBe(800); // Pack Hunt
    expect(sourceFrame('15', CORE_HIT - 825)).toBe(CORE_HIT); // the core burst
    expect(sourceFrame('15', 528)).toBe(1028); // the tower hits the ground
    expect(edl.bpm).toBe(144);
  });

  it('every output frame has exactly one base picture; the end card is a plate from the f1625 beat; no HUD band in 9:16', () => {
    const plan = framePlan('30', '9x16', edl, { hasPlate: (f) => f >= 1625, footageSize: () => [1080, 1920] });
    expect(plan).toHaveLength(1800);
    expect(plan.filter((p) => p.kind === 'band')).toEqual([]);
    expect(plan.find((p) => p.f === 1624).kind).not.toBe('plate');
    expect(plan.find((p) => p.f === 1625).kind).toBe('plate');
  });

  it('the music dips under every designed impact (the core burst among them); the 15 s cut keeps its own', () => {
    expect(impacts('30')).toContain(25);
    expect(impacts('30')).toContain(CORE_HIT);
    expect(impacts('15')).toContain(CORE_HIT - 825);
    expect(impacts('15').every((f) => f >= 0 && f < 750)).toBe(true);
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
    expect(Math.hypot(shakeAt(shakes, CORE_HIT + 1).x, shakeAt(shakes, CORE_HIT + 1).y)).toBeGreaterThan(1);
  });

  it('every frame is graded; the impacts get the chromatic split', () => {
    const g = gradeWindows('30', edl);
    expect(g.graded).toEqual([[0, 1799]]);
    expect(g.strong).toContainEqual([CORE_HIT, CORE_HIT + 2]);
    expect(rangesExpr([])).toBe('0');
    expect(gradeWindows('15', edl).graded).toEqual([[0, 899]]);
  });
});
