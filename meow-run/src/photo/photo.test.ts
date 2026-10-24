import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyFilter, FILTERS, matchingPixelBlock, pinkAlpha, PINK_A, type Img } from './filters';
import { FRAMES, frameInsets } from './frames';
import { clampDist, clampPan, clampPitch, DIST_MAX, DIST_MIN, flatBasis, orbitOffset, PAN_MAX, PITCH_MAX, PITCH_MIN, wrapYaw, DEG } from './orbit';
import { clampSize, fromPx, MAX_STICKERS, SIZE_MAX, SIZE_MIN, spawnSpot, STICKERS, stickerSvg, toPx } from './stickers';

/** a synthetic 8x8 image: a colour gradient with a few saturated pixels */
function synth(w = 8, h = 8): Img {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (x * 255) / (w - 1);
      data[i + 1] = (y * 255) / (h - 1);
      data[i + 2] = ((x + y) * 255) / (w + h - 2);
      data[i + 3] = 255;
    }
  data.set([255, 0, 0, 255], 0);
  if (data.length >= 8) data.set([0, 0, 255, 255], 4);
  return { data, width: w, height: h };
}
const grey = (v: number, w = 8, h = 8): Img => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([v, v, v, 255], i);
  return { data, width: w, height: h };
};

describe('filters', () => {
  it('none leaves the pixels alone', () => {
    const a = synth();
    const before = a.data.slice();
    applyFilter(a, 'none');
    expect([...a.data]).toEqual([...before]);
  });
  it('noir gives r = g = b with more contrast', () => {
    const a = synth();
    applyFilter(a, 'noir');
    for (let i = 0; i < a.data.length; i += 4) {
      expect(a.data[i]).toBe(a.data[i + 1]);
      expect(a.data[i + 1]).toBe(a.data[i + 2]);
      expect(a.data[i + 3]).toBe(255);
    }
    const dark = grey(60);
    const light = grey(200);
    applyFilter(dark, 'noir');
    applyFilter(light, 'noir');
    expect(light.data[0] - dark.data[0]).toBeGreaterThan(140);
  });
  it('warm raises red against blue', () => {
    const g = grey(128);
    applyFilter(g, 'warm');
    expect(g.data[0] / g.data[2]).toBeGreaterThan(1.05);
    const a = synth();
    const before = a.data.slice();
    applyFilter(a, 'warm');
    let rb0 = 0;
    let rb1 = 0;
    for (let i = 8; i < a.data.length; i += 4) {
      rb0 += before[i] - before[i + 2];
      rb1 += a.data[i] - a.data[i + 2];
    }
    expect(rb1).toBeGreaterThan(rb0);
  });
  it('pixel makes uniform blocks', () => {
    const a = synth(16, 16);
    applyFilter(a, 'pixel', { pixelBlock: 4 });
    for (let by = 0; by < 16; by += 4)
      for (let bx = 0; bx < 16; bx += 4) {
        const ref = (by * 16 + bx) * 4;
        for (let y = by; y < by + 4; y++)
          for (let x = bx; x < bx + 4; x++) {
            const i = (y * 16 + x) * 4;
            expect([a.data[i], a.data[i + 1], a.data[i + 2]]).toEqual([a.data[ref], a.data[ref + 1], a.data[ref + 2]]);
          }
      }
    // the default 1/8 on an 8x8 image is one block
    const b = synth();
    applyFilter(b, 'pixel');
    for (let i = 0; i < b.data.length; i += 4) expect(b.data[i]).toBe(b.data[0]);
  });
  it('dreamy keeps the size, brightens and lifts the edges pink', () => {
    const a = grey(100, 8, 8);
    applyFilter(a, 'dreamy');
    expect(a.data.length).toBe(8 * 8 * 4);
    expect(a.width).toBe(8);
    expect(a.data[(4 * 8 + 4) * 4]).toBeGreaterThan(100);
    // the corner is pinker (r > g) than the centre
    const c = 0;
    expect(a.data[c] - a.data[c + 1]).toBeGreaterThan(a.data[(3 * 8 + 4) * 4] - a.data[(3 * 8 + 4) * 4 + 1]);
    expect(pinkAlpha(0.5, 0.45)).toBe(0);
    expect(pinkAlpha(0, 0)).toBeGreaterThan(0);
    expect(pinkAlpha(-1, -1)).toBeCloseTo(PINK_A);
  });
  it('never produces NaN and handles odd and tiny sizes', () => {
    for (const id of FILTERS)
      for (const [w, h] of [
        [8, 8],
        [7, 3],
        [1, 1],
        [13, 9],
      ]) {
        const a = synth(w, h);
        applyFilter(a, id);
        for (let i = 0; i < a.data.length; i++) expect(Number.isNaN(a.data[i])).toBe(false);
        expect(a.data.length).toBe(w * h * 4);
      }
    applyFilter({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, 'dreamy');
  });
  it('matches the live pixel size', () => {
    expect(matchingPixelBlock(1280, 1280)).toBe(5);
    expect(matchingPixelBlock(1920, 1280)).toBe(7);
    expect(matchingPixelBlock(0, 0)).toBe(8);
  });
});

describe('stickers', () => {
  it('has at least 8 procedural stickers with unique ids', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const s of STICKERS) expect(stickerSvg(s)).toMatch(/^<svg viewBox="-50 -50 100 100"/);
    expect(MAX_STICKERS).toBe(12);
  });
  it('normalised <-> pixel maths round-trips', () => {
    const p = { x: 0.25, y: 0.75, size: 0.2 };
    const px = toPx(p, 1280, 720);
    expect(px).toEqual({ x: 320, y: 540, size: 144 });
    const back = fromPx(px.x, px.y, 1280, 720);
    expect(back.x).toBeCloseTo(0.25);
    expect(back.y).toBeCloseTo(0.75);
    // the same normalised sticker lands on the same spot of a bigger export with the same aspect
    const big = toPx(p, 1920, 1080);
    expect(big.x / 1920).toBeCloseTo(px.x / 1280);
    expect(big.size / 1080).toBeCloseTo(px.size / 720);
    expect(fromPx(-50, 9999, 100, 100)).toEqual({ x: 0, y: 1 });
    expect(clampSize(9)).toBe(SIZE_MAX);
    expect(clampSize(0)).toBe(SIZE_MIN);
    expect(clampSize(NaN)).toBeGreaterThan(SIZE_MIN);
  });
  it('spawns new stickers near the centre, inside the image', () => {
    for (let i = 0; i < MAX_STICKERS; i++) {
      const s = spawnSpot(i);
      expect(s.x).toBeGreaterThan(0.05);
      expect(s.x).toBeLessThan(0.95);
      expect(Math.hypot(s.x - 0.5, s.y - 0.45)).toBeLessThan(0.25);
    }
  });
});

describe('orbit', () => {
  it('clamps pitch, distance and pan', () => {
    expect(clampPitch(2)).toBe(PITCH_MAX);
    expect(clampPitch(-2)).toBe(PITCH_MIN);
    expect(clampDist(0)).toBe(DIST_MIN);
    expect(clampDist(99)).toBe(DIST_MAX);
    expect(clampPan(new THREE.Vector3(10, 0, 0)).length()).toBeCloseTo(PAN_MAX);
    expect(Math.abs(wrapYaw(Math.PI * 3))).toBeCloseTo(Math.PI, 5);
    expect(wrapYaw(0.5 + Math.PI * 4)).toBeCloseTo(0.5, 5);
    expect(Math.abs(wrapYaw(-Math.PI * 2.5))).toBeCloseTo(Math.PI / 2);
  });
  it('yaw 0 is in front of Mochi, +yaw swings to her right', () => {
    const fwd = new THREE.Vector3(0, 0, 1);
    const f = new THREE.Vector3();
    const r = new THREE.Vector3();
    flatBasis(fwd, f, r);
    expect(r.x).toBeCloseTo(-1); // LANES.md: a +z runner's right is world -x
    const o = orbitOffset({ yaw: 0, pitch: 0, dist: 4 }, fwd, new THREE.Vector3());
    expect(o.z).toBeCloseTo(4);
    const side = orbitOffset({ yaw: 90 * DEG, pitch: 0, dist: 4 }, fwd, new THREE.Vector3());
    expect(side.x).toBeCloseTo(-4);
    const up = orbitOffset({ yaw: 0, pitch: 60 * DEG, dist: 4 }, fwd, new THREE.Vector3());
    expect(up.length()).toBeCloseTo(4);
    expect(up.y).toBeCloseTo(4 * Math.sin(60 * DEG));
  });
});

describe('frames', () => {
  it('insets stay inside the image', () => {
    for (const id of FRAMES)
      for (const [w, h] of [
        [1280, 720],
        [390, 844],
      ]) {
        const i = frameInsets(id, w, h);
        expect(i.l + i.r).toBeLessThan(w * 0.5);
        expect(i.t + i.b).toBeLessThan(h * 0.5);
      }
  });
});
