// The edit plan (no ffmpeg): beat-grid mapping, push/bump geometry, shakes, grade windows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { framePlan, gradeWindows, rangesExpr, shakeAt, zoomFrames, zoomGeometry } from './edit-plan.mjs';
import { CUTS, post, sourceFrame } from './mg-timeline.mjs';

const edl = JSON.parse(readFileSync(new URL('./edl.json', import.meta.url), 'utf8'));

describe('trailer edit plan', () => {
  it('the 15 s cut lands on the 30 s master on bar lines (storyboard §7)', () => {
    expect(sourceFrame('15', 0)).toBe(0);
    expect(sourceFrame('15', 120)).toBe(240); // S06, the drop
    expect(sourceFrame('15', 240)).toBe(360); // S07
    expect(sourceFrame('15', 420)).toBe(900); // the tower falls on the beat
    expect(sourceFrame('15', 570)).toBe(1410); // the S24 hang
    expect(sourceFrame('15', 600)).toBe(1440); // the core falls
    expect(sourceFrame('15', 720)).toBe(1560); // end card
    for (let f = 1; f < CUTS[15]; f++) {
      const jump = sourceFrame('15', f) - sourceFrame('15', f - 1);
      if (jump !== 1) expect(f % 120).toBe(0); // every splice is on a bar line
    }
  });

  it('every output frame has exactly one base picture', () => {
    const plan = framePlan('30', '9x16', edl, {
      hasPlate: (f) => (f >= 120 && f <= 185) || f >= 1560,
      footageSize: (src) => (src >= 1020 && src <= 1079 ? [1864, 860] : [1080, 1920]),
    });
    expect(plan).toHaveLength(1800);
    expect(plan.filter((p) => p.kind === 'band').map((p) => p.f)).toEqual(Array.from({ length: 60 }, (_, i) => 1020 + i));
    expect(plan.find((p) => p.f === 150).kind).toBe('plate');
    expect(plan.find((p) => p.f === 183).kind).toBe('plate');
    expect(plan.find((p) => p.f === 659).kind).toBe('footage');
    expect(plan.find((p) => p.f === 600).kind).toBe('footage');
    // the HUD band is one fixed crop of the whole phone frame (no reframe mid-shot)
    expect(edl.band['9x16'].segs).toHaveLength(1);
  });

  it('no digital push-ins (S19 is the gameplay camera 1:1); bumps land on the skin flips', () => {
    const z = zoomFrames('30', '16x9', edl);
    for (const f of [630, 645, 659, 1030, 1046, 1079]) expect(z.has(f)).toBe(false);
    for (const b of post('30').bump) expect(z.get(b.f).z).toBeCloseTo(1.04, 5);
    const g = zoomGeometry(1920, 1080, { z: 1.35, ax: 935, ay: 205 });
    // the anchor stays put on screen (within a pixel of rounding)
    expect(Math.abs((935 * g.sw) / 1920 - g.x - 935)).toBeLessThanOrEqual(1);
    expect(Math.abs((205 * g.sh) / 1080 - g.y - 205)).toBeLessThanOrEqual(1);
  });

  it('flashes are additive blooms: never on frame 0, never two within 4 frames, 40-70 %', () => {
    for (const cut of ['30', '15']) {
      const fl = post(cut).flash;
      expect(fl.every((x) => x.f >= 1 && x.a >= 0.4 && x.a <= 0.7)).toBe(true);
      for (let i = 1; i < fl.length; i++) expect(fl[i].f - fl[i - 1].f).toBeGreaterThanOrEqual(4);
    }
  });

  it('shakes start on their frame, decay to rest and stay inside the margin', () => {
    const shakes = post('30').shake;
    for (let n = 0; n < CUTS[30]; n++) {
      const s = shakeAt(shakes, n);
      expect(Math.abs(s.x)).toBeLessThan(edl.shakeMargin);
      expect(Math.abs(s.y)).toBeLessThan(edl.shakeMargin);
    }
    expect(shakeAt(shakes, 600)).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(shakeAt(shakes, 901).x, shakeAt(shakes, 901).y)).toBeGreaterThan(1);
  });

  it('the photo and the match cut are never graded; the impacts get the chromatic split', () => {
    const g = gradeWindows('30', edl);
    expect(g.graded).toEqual([[0, 119], [240, 1799]]);
    expect(g.strong).toEqual([[0, 1], [90, 91], [900, 901], [1440, 1441]]);
    expect(rangesExpr([])).toBe('0');
    expect(gradeWindows('15', edl).graded).toEqual([[0, 899]]);
  });
});
