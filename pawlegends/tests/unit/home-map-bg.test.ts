/** Home's map backdrops (render/lobby/mapViews.ts, HOME-MAP-BACKDROPS.md): the spots, the order, the crop, the rotation clock. */
import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FADE_S, FEET, MAP_VIEWS, MapRotation, PIC_ASPECT, PIC_FOV, REL_DEG, ROTATE_S, coverCrop, mapViewEvery, mapViewOff, mapViewOrder, mapViewOverride, mapViewUrl } from '../../src/render/lobby/mapViews';

const ART = new URL('../../../pawlegends-web/public/pawlegends-art/lobby-maps/', import.meta.url);
const run = (r: MapRotation, seconds: number, o: { paused?: boolean; hold?: boolean; ready?: (i: number) => boolean } = {}, dt = 1 / 30) => {
  let f = { from: r.current, to: r.current, k: 0 };
  for (let t = 0; t < seconds - 1e-9; t += dt) f = r.tick(dt, { paused: !!o.paused, hold: o.hold, ready: o.ready ?? (() => true) });
  return f;
};

describe('Home map backdrops', () => {
  it('18 spots on the six maps, three each, every picture baked at both sizes and web-sized', () => {
    expect(MAP_VIEWS).toHaveLength(18);
    expect(new Set(MAP_VIEWS.map((v) => v.id)).size).toBe(18);
    const per = new Map<string, number>();
    for (const v of MAP_VIEWS) per.set(v.map, (per.get(v.map) ?? 0) + 1);
    expect([...per.values()]).toEqual([3, 3, 3, 3, 3, 3]);
    for (const v of MAP_VIEWS) {
      expect(Math.hypot(...v.sunDir)).toBeCloseTo(1, 2);
      for (const w of [1920, 1280]) {
        const f = new URL(`${v.id}-${w}.webp`, ART);
        expect(existsSync(f), f.pathname).toBe(true);
        // the 1920 set is ≤ 110 KB a picture, the 1280 set ≤ 50 KB (one at a time over the network)
        expect(statSync(f).size).toBeLessThan(w === 1920 ? 110_000 : 50_000);
      }
    }
  });

  it('the order shows one spot of each map in turn, never the same map twice in a row', () => {
    const o = mapViewOrder();
    expect([...o].sort((a, b) => a - b)).toEqual(MAP_VIEWS.map((_, i) => i));
    for (let i = 0; i < o.length; i++) expect(MAP_VIEWS[o[i]].map).not.toBe(MAP_VIEWS[o[(i + 1) % o.length]].map);
  });

  it('pictures: 1920 on a wide screen, 1280 on phones and Low, from the art root with the build query', () => {
    expect(mapViewUrl('quarry-01-geode', { root: 'https://pawlegends.app/pawlegends-art/', rev: '?v=abc', bufferWidth: 2880, low: false })).toBe('https://pawlegends.app/pawlegends-art/lobby-maps/quarry-01-geode-1920.webp?v=abc');
    expect(mapViewUrl('quarry-01-geode', { root: '/pawlegends-art/', bufferWidth: 2880, low: true })).toBe('/pawlegends-art/lobby-maps/quarry-01-geode-1280.webp');
    expect(mapViewUrl('quarry-01-geode', { root: '/a/', bufferWidth: 1266, low: false })).toBe('/a/lobby-maps/quarry-01-geode-1280.webp');
  });

  it('query hooks: ?mapbg=<id> pins a spot, ?mapbg=off is the poster fallback, ?mapbgEvery shortens the stay', () => {
    expect(mapViewOverride('?mapbg=pitch-02-goal-mouth')).toBe(MAP_VIEWS.findIndex((v) => v.id === 'pitch-02-goal-mouth'));
    expect(mapViewOverride('?mapbg=nowhere')).toBeNull();
    expect(mapViewOverride('')).toBeNull();
    expect(mapViewOff('?mapbg=off')).toBe(true);
    expect(mapViewOff('?mapbg=quarry-01-geode')).toBe(false);
    expect(mapViewEvery('?mapbgEvery=3')).toBe(3);
    expect(mapViewEvery('?mapbgEvery=0.2')).toBe(ROTATE_S);
    expect(mapViewEvery('')).toBe(ROTATE_S);
  });

  it('the cover crop keeps the feet where the picture has them, on any screen', () => {
    for (const a of [844 / 390, 1440 / 900, 16 / 9, 21 / 9, 1, 2.6]) {
      const c = coverCrop(a);
      // inside the picture, the screen's aspect
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
      expect((c.w * PIC_ASPECT) / c.h).toBeCloseTo(a, 6);
      // the feet's screen position is the picture's
      expect((FEET[0] - c.x) / c.w).toBeCloseTo(FEET[0], 6);
      expect((FEET[1] - c.y) / c.h).toBeCloseTo(FEET[1], 6);
    }
    expect(coverCrop(PIC_ASPECT)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("each spot's camera puts the feet at FEET of the picture (the champion stands on the spot)", () => {
    const cam = new THREE.PerspectiveCamera(PIC_FOV, PIC_ASPECT, 0.1, 500);
    for (const v of MAP_VIEWS) {
      cam.position.set(0, v.h, v.gd);
      cam.lookAt(new THREE.Vector3(...v.target));
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const p = new THREE.Vector3(0, 0, 0).project(cam);
      expect((p.x + 1) / 2, v.id).toBeCloseTo(FEET[0], 2);
      expect((1 - p.y) / 2, v.id).toBeCloseTo(FEET[1], 2);
    }
    expect(REL_DEG).toBe(45);
  });

  it('rotation: each spot stays ROTATE_S, then the next fades in over FADE_S and becomes the shown one', () => {
    const o = mapViewOrder();
    const r = new MapRotation(o, o[5]);
    expect(r.current).toBe(o[5]);
    expect(run(r, ROTATE_S - 0.1)).toEqual({ from: o[5], to: o[5], k: 0 });
    const mid = run(r, 0.1 + FADE_S / 2);
    expect(mid.from).toBe(o[5]);
    expect(mid.to).toBe(o[6]);
    expect(mid.k).toBeGreaterThan(0.2);
    expect(mid.k).toBeLessThan(0.8);
    expect(run(r, FADE_S)).toEqual({ from: o[6], to: o[6], k: 0 });
    // and it wraps round the order
    const last = new MapRotation(o, o[o.length - 1]);
    expect(last.upcoming).toBe(o[0]);
  });

  it('rotation waits for the next picture, and stands still while paused or held (reduced motion, ?mapbg=)', () => {
    const o = mapViewOrder();
    const r = new MapRotation(o, o[0]);
    // the next picture is not in: the spot holds past ROTATE_S, then fades as soon as it arrives
    expect(run(r, ROTATE_S + 5, { ready: () => false }).k).toBe(0);
    expect(run(r, 0.2).to).toBe(o[1]);
    // paused (tab hidden, a panel over Home): the clock stops
    const p = new MapRotation(o, o[0]);
    expect(run(p, ROTATE_S * 3, { paused: true })).toEqual({ from: o[0], to: o[0], k: 0 });
    expect(p.age).toBe(0);
    // held: never moves
    const h = new MapRotation(o, o[3]);
    expect(run(h, ROTATE_S * 3, { hold: true })).toEqual({ from: o[3], to: o[3], k: 0 });
    // a fade already running finishes even if Home is covered half way
    const f = new MapRotation(o, o[0]);
    run(f, ROTATE_S + 0.2);
    expect(run(f, FADE_S, { paused: true })).toEqual({ from: o[1], to: o[1], k: 0 });
  });

  it('a failed picture is skipped without a fade', () => {
    const o = mapViewOrder();
    const r = new MapRotation(o, o[2]);
    r.skip();
    expect(r.current).toBe(o[3]);
    expect(r.age).toBe(0);
  });
});
