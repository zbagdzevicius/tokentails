import { PerspectiveCamera, Ray, Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../config';
import { buildGrid, hitCat, pickCat, type PickState } from './pick';
import { buildCatGeometry } from './catGeometry';
import { buildSlots, catAxis, catLook, extentOf, slotCost, VORTEX_INNER, vortexAngle, vortexSlot } from './slots';

describe('slots', () => {
  const big = buildSlots(3000);

  it('is a stable prefix: growing never moves an old cat', () => {
    const small = buildSlots(40);
    for (let i = 0; i < 40; i++) {
      expect(small.x[i]).toBe(big.x[i]);
      expect(small.z[i]).toBe(big.z[i]);
    }
  });

  it('keeps every cat outside the booth ring, ordered by cost', () => {
    for (let i = 0; i < big.count; i++) expect(big.r[i]).toBeGreaterThanOrEqual(LAYOUT.crowdInnerRadius);
    for (let i = 1; i < big.count; i++) {
      expect(slotCost(big.x[i], big.z[i])).toBeGreaterThanOrEqual(slotCost(big.x[i - 1], big.z[i - 1]) - 1e-4);
    }
  });

  it('fills the front (+Z, hero side) first', () => {
    for (let i = 0; i < 9; i++) expect(big.z[i]).toBeGreaterThan(0);
    let front = 0;
    for (let i = 0; i < 300; i++) if (big.z[i] > 0) front++;
    expect(front).toBeGreaterThan(170);
  });

  it('never stacks two cats closer than ~0.75 spacing', () => {
    const n = 800;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(big.x[i] - big.x[j], big.z[i] - big.z[j]);
        expect(d).toBeGreaterThan(LAYOUT.catSpacing * 0.7);
      }
    }
  });

  it('extent grows with the crowd', () => {
    expect(extentOf(big, 9)).toBeLessThan(6);
    expect(extentOf(big, 3000)).toBeGreaterThan(extentOf(big, 300));
  });

  it('vortex spins inner cats faster; no swirl at t = 0', () => {
    expect(vortexAngle(4, 0)).toBe(0);
    expect(vortexAngle(4, 1)).toBeGreaterThan(vortexAngle(40, 1));
  });

  it('cats face the booth on the floor and lie forward in the vortex', () => {
    const a = catAxis(0, 5, 1, 0, 0, { cx: 0, cy: 0, cz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fz: 0 });
    expect(a.fz).toBeCloseTo(-1);
    expect(a.uy).toBeCloseTo(1);
    const v = catAxis(0, 5, 1, 0, 1, { ...a });
    expect(v.uy).toBeLessThan(0.5);
    expect(v.cy).toBeGreaterThan(a.cy);
  });

  it('vortex spiral: even golden-angle slots from the inner ring out, never stacked', () => {
    const pts = Array.from({ length: 1500 }, (_, i) => vortexSlot(i));
    for (const p of pts) expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(VORTEX_INNER - 1e-6);
    for (let i = 0; i < 600; i++) {
      let nearest = Infinity;
      for (let j = 0; j < 1500; j++) if (j !== i) nearest = Math.min(nearest, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
      expect(nearest).toBeGreaterThan(LAYOUT.catSpacing * 0.55);
      expect(nearest).toBeLessThan(LAYOUT.catSpacing * 1.6);
    }
  });

  it('a near cat stays inside the 400-triangle budget', () => {
    const g = buildCatGeometry();
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    expect(tris).toBeLessThanOrEqual(400);
    g.dispose();
  });

  it('looks: cream to light ginger, height ±6%', () => {
    for (const s of [0, 0.1, 0.5, 0.99]) {
      const l = catLook(s);
      expect(l.fur).toBeGreaterThanOrEqual(0);
      expect(l.fur).toBeLessThanOrEqual(1);
      expect(l.scale).toBeGreaterThanOrEqual(0.94);
      expect(l.scale).toBeLessThanOrEqual(1.06);
    }
  });
});

describe('picking', () => {
  const layout = buildSlots(2000);
  const grid = buildGrid(layout, 2);
  const scale = new Float32Array(layout.count).fill(1);
  const state = (shown: number, vortex = 0, vortexT = 0): PickState => ({ layout, grid, shown, scale, vortex, vortexT });
  const camera = new PerspectiveCamera(50, 390 / 844, 0.1, 500);
  camera.position.set(0, 4, 18);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const rc = new Raycaster();

  function ndcOf(i: number, s: PickState): Vector2 {
    const a = catAxis(layout.x[i], layout.z[i], 1, s.vortexT, s.vortex, { cx: 0, cy: 0, cz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fz: 0 }, i);
    const p = new Vector3(a.cx, a.cy, a.cz).project(camera);
    return new Vector2(p.x, p.y);
  }

  it('finds the front cat under the pointer (grid path)', () => {
    const s = state(9);
    for (let i = 0; i < 9; i++) {
      rc.setFromCamera(ndcOf(i, s), camera);
      const got = pickCat(rc.ray, s);
      expect(got).not.toBeNull();
      // Either this cat, or one standing in front of it on the same ray.
      expect(hitCat(rc.ray, s, got!)).toBeLessThanOrEqual(hitCat(rc.ray, s, i));
      expect(Number.isFinite(hitCat(rc.ray, s, i))).toBe(true);
    }
    // From high above nothing occludes: exact.
    const high = new PerspectiveCamera(50, 1, 0.1, 500);
    high.position.set(0, 22, 9);
    high.lookAt(0, 0, 3);
    high.updateMatrixWorld();
    for (let i = 0; i < 9; i++) {
      const a = catAxis(layout.x[i], layout.z[i], 1, 0, 0, { cx: 0, cy: 0, cz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fz: 0 });
      const p = new Vector3(a.cx, a.cy + 0.3, a.cz).project(high);
      rc.setFromCamera(new Vector2(p.x, p.y), high);
      expect(pickCat(rc.ray, s)).toBe(i);
    }
  });

  it('agrees with brute force across a big crowd', () => {
    const s = state(2000);
    for (const i of [0, 50, 400, 1200]) {
      rc.setFromCamera(ndcOf(i, s), camera);
      const g = pickCat(rc.ray, s);
      expect(g).not.toBeNull();
      // A tiny vortex blend forces the brute-force path over every cat.
      const all = pickCat(rc.ray, { ...s, vortex: 2e-3 });
      expect(g).toBe(all);
    }
  });

  it('works in the vortex (brute force path), top-down', () => {
    const s = state(500, 1, 3);
    const top = new PerspectiveCamera(50, 1, 0.1, 500);
    top.position.set(0, 40, 0.01);
    top.lookAt(0, 0, 0);
    top.updateMatrixWorld();
    const a = catAxis(layout.x[7], layout.z[7], 1, 3, 1, { cx: 0, cy: 0, cz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fz: 0 }, 7);
    const p = new Vector3(a.cx, a.cy, a.cz).project(top);
    rc.setFromCamera(new Vector2(p.x, p.y), top);
    expect(pickCat(rc.ray, s)).toBe(7);
  });

  it('misses empty sky and hidden cats', () => {
    const s = state(9);
    expect(pickCat(new Ray(new Vector3(0, 5, 10), new Vector3(0, 1, 0)), s)).toBeNull();
    rc.setFromCamera(ndcOf(0, s), camera);
    expect(pickCat(rc.ray, { ...s, visible: (i) => i !== 0 })).not.toBe(0);
  });
});
