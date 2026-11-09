// @vitest-environment happy-dom
/**
 * PERF-IOS §8 Track A: the WebGL overlay that replaced the full-screen overhead 2D canvas (render/overlay/): colour
 * parsing, rect snapping, stamps, mitred polylines, the shelf packer and the stamp cache (a steady frame paints no
 * stamp), and the overhead drawing a busy frame without a 2D canvas in the DOM.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_QUADS, QUAD_FLOATS, QuadBatch, VERT_FLOATS, parseColor } from '../../src/render/overlay/quadBatch';
import { ShelfPacker, StampAtlas, FULL_SHARE } from '../../src/render/overlay/atlas';
import { Overhead } from '../../src/ui/overhead';
import type { ViewFrame } from '../../src/render/interp';

const vx = (b: QuadBatch, q: number, v: number): number[] => Array.from(b.data.slice(q * QUAD_FLOATS + v * VERT_FLOATS, q * QUAD_FLOATS + (v + 1) * VERT_FLOATS));

describe('parseColor', () => {
  it('reads hex and rgba, and caches', () => {
    expect(parseColor('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(parseColor('#fff')).toEqual([1, 1, 1, 1]);
    const c = parseColor('rgba(255,246,206,0.92)');
    expect(c[3]).toBeCloseTo(0.92);
    expect(c[0]).toBeCloseTo(1);
    expect(parseColor('rgba(255,246,206,0.92)')).toBe(c);
    expect(parseColor('nonsense')[3]).toBe(0);
  });
});

describe('QuadBatch', () => {
  it('snaps rects to device px, at least 1 px, premultiplied, with the batch alpha', () => {
    const b = new QuadBatch();
    b.begin(1.25);
    b.rect(10.3, 4.1, 0.4, 8, '#ff0000');
    const tl = vx(b, 0, 0);
    const br = vx(b, 0, 2);
    expect(tl.slice(0, 2)).toEqual([13, 5]);
    expect(br[0] - tl[0]).toBeGreaterThanOrEqual(1);
    b.alpha = 0.5;
    b.rect(0, 0, 4, 4, 'rgba(255,0,0,0.5)');
    const v = vx(b, 1, 0);
    expect(v[4]).toBeCloseTo(0.25);
    expect(v[7]).toBeCloseTo(0.25);
    expect(v[9]).toBe(-1);
  });

  it('skips empty and invisible rects; drops past MAX_QUADS', () => {
    const b = new QuadBatch();
    b.begin(1);
    b.rect(0, 0, 0, 5, '#fff');
    b.rect(0, 0, 5, 5, 'rgba(0,0,0,0)');
    expect(b.count).toBe(0);
    for (let i = 0; i < MAX_QUADS + 3; i++) b.rect(0, 0, 1, 1, '#fff');
    expect(b.count).toBe(MAX_QUADS);
    expect(b.dropped).toBe(3);
  });

  it('places an unscaled stamp 1:1 on whole device px; a scaled one scales about its centre', () => {
    const b = new QuadBatch();
    b.begin(2);
    const s = { u0: 0, v0: 0, u1: 0.1, v1: 0.1, pw: 20, ph: 10 };
    b.stamp(s, 50, 20);
    expect(vx(b, 0, 0).slice(0, 2)).toEqual([90, 35]);
    expect(vx(b, 0, 2).slice(0, 2)).toEqual([110, 45]);
    b.stamp(s, 50, 20, 2);
    expect(vx(b, 1, 0).slice(0, 2)).toEqual([80, 30]);
    expect(vx(b, 1, 2).slice(0, 2)).toEqual([120, 50]);
  });

  it('a polyline is one quad a segment; neighbours share the mitred join; the AA edge spans ±(hw + 1)', () => {
    const b = new QuadBatch();
    b.begin(1);
    b.polyline([0, 0, 10, 0, 10, 10], 3, false, 4, '#fff');
    expect(b.count).toBe(2);
    // segment 1 ends where segment 2 starts (same vertices at the join)
    expect(vx(b, 0, 1).slice(0, 2)).toEqual(vx(b, 1, 0).slice(0, 2));
    expect(vx(b, 0, 2).slice(0, 2)).toEqual(vx(b, 1, 3).slice(0, 2));
    expect(vx(b, 0, 0)[8]).toBe(3);
    expect(vx(b, 0, 3)[8]).toBe(-3);
    expect(vx(b, 0, 0)[9]).toBe(2);
    b.begin(1);
    b.polyline([0, 0, 10, 0, 10, 10, 0, 10], 4, true, 2, '#fff');
    expect(b.count).toBe(4);
  });
});

describe('ShelfPacker and StampAtlas', () => {
  it('packs on shelves and refuses what does not fit', () => {
    const p = new ShelfPacker(100, 50);
    expect(p.alloc(60, 20)).toEqual({ x: 0, y: 0 });
    expect(p.alloc(30, 10)).toEqual({ x: 60, y: 0 });
    expect(p.alloc(30, 10)).toEqual({ x: 0, y: 20 });
    expect(p.alloc(10, 40)).toBeNull();
    expect(p.alloc(200, 1)).toBeNull();
  });

  it('paints a stamp once per key and scale; a full atlas clears at the next frame', () => {
    const a = new StampAtlas(256, 256);
    // happy-dom has no 2D canvas: a stand-in context whose every method is a no-op
    a.g = new Proxy({}, { get: () => () => ({ width: 10 }), set: () => true }) as unknown as CanvasRenderingContext2D;
    a.beginFrame(2);
    let painted = 0;
    const paint = (): void => void painted++;
    const s1 = a.get('x', 10, 5, paint);
    expect(s1?.pw).toBe(20);
    expect(s1?.ph).toBe(10);
    expect(a.get('x', 10, 5, paint)).toBe(s1);
    expect(painted).toBe(1);
    a.beginFrame(2);
    expect(a.get('x', 10, 5, paint)).toBe(s1);
    expect(painted).toBe(1);
    // a new scale (dynamic resolution) repaints
    a.beginFrame(1.5);
    a.get('x', 10, 5, paint);
    expect(painted).toBe(2);
    const g0 = a.generation;
    for (let i = 0; i < 400 && a.packer.used <= FULL_SHARE; i++) a.get(`k${i}`, 30, 30, paint);
    a.beginFrame(1.5);
    expect(a.generation).toBe(g0 + 1);
    expect(a.size).toBe(0);
  });
});

describe('overhead plates draw without a 2D canvas', () => {
  const base = { team: 0, hp: 600, maxHp: 1000, shield: 100, buffs: 0, yaw: 0, speed: 0, state: 'idle', level: 4 };
  const ents = [
    { ...base, id: 0, kind: 'hero', hero: 'clem', fx: 90000, fy: 30000 },
    { ...base, id: 1, kind: 'hero', hero: 'lambo', fx: 90500, fy: 30200 },
    { ...base, id: 5, kind: 'hero', hero: 'duchess', team: 1, fx: 91000, fy: 30500, stacks: 2 },
    { ...base, id: 100, kind: 'minion', fx: 89000, fy: 29000, hp: 40, maxHp: 100 },
    { ...base, id: 50, kind: 'tower', team: 1, fx: 93000, fy: 28000, hp: 3000, maxHp: 4000 },
  ];
  const frame = { entities: ents, projectiles: [], zones: [], byId: new Map(ents.map((e) => [e.id, e])), tick: 0 } as unknown as ViewFrame;
  const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 500);
  cam.position.set(90, 25, -10);
  cam.lookAt(90, 0, -30);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();

  it('emits quads for every plate, adds no canvas to the page, and paints no stamp on a steady frame', () => {
    const host = document.createElement('div');
    const o = new Overhead(host);
    o.mySlot = 0;
    o.myTeam = 0;
    o.draw(frame, cam, () => 1);
    expect(host.querySelector('canvas')).toBeNull();
    const first = o.stats;
    expect(first.quads).toBeGreaterThan(20);
    o.draw(frame, cam, () => 1);
    const second = o.stats;
    expect(second.quads).toBe(first.quads);
    expect(second.paints).toBe(first.paints);
  });
});

describe('phone shadow stand-ins', () => {
  it('scenery blobs merge per tile into 8-triangle octahedra; only an orthographic frustum (the sun) sees them', async () => {
    const { casterChunks, CASTER_TILE } = await import('../../src/render/views/mapView');
    const { orthoFrustum } = await import('../../src/render/chars');
    const blobs = [
      { x: 1, y: 2, z: 1, rx: 1, ry: 2, rz: 1 },
      { x: 3, y: 2, z: 2, rx: 1, ry: 2, rz: 1 },
      { x: CASTER_TILE * 3 + 1, y: 2, z: 0, rx: 1, ry: 1, rz: 1 },
    ];
    const ms = casterChunks(blobs);
    expect(ms).toHaveLength(2);
    expect(ms.reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0)).toBe(24);
    const ortho = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.5, 500);
    ortho.position.set(0, 40, 0);
    ortho.lookAt(0, 0, 0);
    ortho.updateMatrixWorld();
    const persp = new THREE.PerspectiveCamera(40, 2, 0.5, 300);
    persp.position.set(0, 20, 10);
    persp.lookAt(0, 0, 0);
    persp.updateMatrixWorld();
    const fr = (c: THREE.Camera): THREE.Frustum => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    expect(orthoFrustum(fr(ortho))).toBe(true);
    expect(orthoFrustum(fr(persp))).toBe(false);
    ms[0].updateMatrixWorld();
    expect(ms[0].intersectsFrustum(fr(ortho))).toBe(true);
    expect(ms[0].intersectsFrustum(fr(persp))).toBe(false);
  });
});

describe('dynamic resolution (governor)', () => {
  it('late frames shrink the buffer in 0.05 steps within seconds, to 0.8, before the first governor step', async () => {
    const { ThermalGovernor, DYN_RES, dynRes } = await import('../../src/render/perf/governor');
    dynRes.scale = 1;
    const g = new ThermalGovernor();
    let t = 0;
    const scales: number[] = [];
    let firstStepAt = -1;
    while (t < 8000) {
      t += 33.4;
      const r = g.sample({ frameMs: 33.4, workMs: 4, targetMs: 1000 / 60, now: t });
      if (r !== null && firstStepAt < 0) firstStepAt = t;
      if (scales.at(-1) !== g.res.scale) scales.push(g.res.scale);
    }
    expect(scales).toEqual([1, 0.95, 0.9, 0.85, 0.8]);
    expect(dynRes.scale).toBe(DYN_RES.MIN);
    expect(firstStepAt).toBeGreaterThan(4000);
    dynRes.scale = 1;
  });

  it('a busy main thread with no missed refresh leaves the resolution alone; clean frames bring it back up slowly', async () => {
    const { ResScaler, DYN_RES } = await import('../../src/render/perf/governor');
    const r = new ResScaler();
    let t = 0;
    for (; t < 3000; t += 16.7) r.sample(t, false);
    expect(r.scale).toBe(1);
    for (const end = t + 2100; t < end; t += 33.4) r.sample(t, true);
    expect(r.scale).toBe(0.9);
    for (const end = t + DYN_RES.UP_CLEAN_MS - 2000; t < end; t += 16.7) r.sample(t, false);
    expect(r.scale).toBe(0.9);
    for (const end = t + 4000; t < end; t += 16.7) r.sample(t, false);
    expect(r.scale).toBe(0.95);
    // held down while a governor step is above its floor
    for (const end = t + 60_000; t < end; t += 16.7) r.sample(t, false, false);
    expect(r.scale).toBe(0.95);
  });
});

describe('overdraw view', () => {
  it('reads counts back from red (×5 per layer): average, p95, max and the share over 3 and 6', async () => {
    const { overdrawStats, overdrawOn } = await import('../../src/render/renderer');
    const px = new Uint8Array(4 * 10);
    const counts = [1, 1, 1, 1, 2, 2, 4, 4, 7, 10];
    counts.forEach((c, i) => (px[i * 4] = c * 5));
    const s = overdrawStats(px);
    expect(s.avg).toBeCloseTo(3.3);
    expect(s.max).toBe(10);
    expect(s.over3).toBeCloseTo(0.4);
    expect(s.over6).toBeCloseTo(0.2);
    expect(overdrawOn('?overdraw=1')).toBe(true);
    expect(overdrawOn('?x=1')).toBe(false);
  });
});
