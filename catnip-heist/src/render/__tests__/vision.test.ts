import { describe, expect, it } from 'vitest';
import { SUBTILE, type SimState } from '../../types';
import { compileLevel, inBounds, isOpaque, lineOfSight, tileOf } from '../../sim/grid';
import { guardSeesPoint, initSim, stepSim } from '../../sim/sim';
import { decodeInputs } from '../../sim/replay';
import { HEIST_01_SOLUTION, getHeist01 } from '../../levels';
import * as THREE from 'three';
import { clipTileToCone, makePoly, VisionCones, type ConeInput, type Poly } from '../vision';

/** Point (relative to the cone origin) inside a convex polygon, with tolerance eps (tiles). */
function inside(p: Poly, x: number, z: number, eps: number): boolean {
  let pos = true, neg = true;
  for (let i = 0; i < p.n; i++) {
    const j = (i + 1) % p.n;
    const ex = p.x[j] - p.x[i], ez = p.z[j] - p.z[i];
    const len = Math.hypot(ex, ez);
    if (len < 1e-9) continue;
    const cr = (ex * (z - p.z[i]) - ez * (x - p.x[i])) / len;
    if (cr < -eps) pos = false;
    if (cr > eps) neg = false;
  }
  return pos || neg;
}

describe('vision cones match the sim', () => {
  it('the drawn cone covers exactly the points the sim can see (heist-01 solution)', () => {
    const level = getHeist01();
    const c = compileLevel(level);
    const A = makePoly(), B = makePoly();
    let s: SimState = initSim(level, HEIST_01_SOLUTION.seed, HEIST_01_SOLUTION.catIds);
    const offs = [1, 4, 8, 12, 15];
    let checked = 0;
    let bad = 0;
    const inputs = decodeInputs(HEIST_01_SOLUTION.runs);
    for (let t = 0; t < inputs.length; t++) {
      s = stepSim(level, s, inputs[t]);
      if (t % 7 !== 0) continue;
      for (const g of s.guards) {
        const gt = tileOf(g.pos);
        const ox = g.pos.x / SUBTILE, oz = g.pos.y / SUBTILE;
        const r = g.visionTiles + 1;
        for (let ty = gt.y - r; ty <= gt.y + r; ty++)
          for (let tx = gt.x - r; tx <= gt.x + r; tx++) {
            if (!inBounds(c, tx, ty) || isOpaque(c, tx, ty, s.doorsOpen)) continue;
            const los = lineOfSight(c, gt, { x: tx, y: ty }, s.doorsOpen);
            const n = clipTileToCone(ox, oz, g.facing.x, g.facing.y, g.visionTiles, tx, ty, A, B);
            for (const oy of offs)
              for (const oxs of offs) {
                const p = { x: tx * SUBTILE + oxs, y: ty * SUBTILE + oy };
                const simSees = guardSeesPoint(c, g, p, s.doorsOpen);
                const rx = p.x / SUBTILE - ox, rz = p.y / SUBTILE - oz;
                const drawnLoose = los && n >= 3 && inside(A, rx, rz, 0.02);
                const drawnStrict = los && n >= 3 && inside(A, rx, rz, -0.02);
                checked++;
                if (simSees && !drawnLoose) bad++;
                if (drawnStrict && !simSees) bad++;
              }
          }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(bad).toBe(0);
  });
});

describe('vision cone cache', () => {
  it('rebuilds only when a cone changes and draws the same geometry as a full rebuild', () => {
    const level = getHeist01();
    const c = compileLevel(level);
    const radius = Math.max(...level.guards.map((g) => g.visionTiles));
    const cached = new VisionCones(level.guards.length, radius);
    const fresh = new VisionCones(level.guards.length, radius);
    const color = new THREE.Color(1, 0.8, 0.2);
    let doors: readonly boolean[] = [];
    const sees = (gx: number, gy: number, tx: number, ty: number) =>
      inBounds(c, tx, ty) && !isOpaque(c, tx, ty, doors) && lineOfSight(c, { x: gx, y: gy }, { x: tx, y: ty }, doors);
    const inputs: ConeInput[] = level.guards.map(() => ({ x: 0, z: 0, fx: 1, fz: 0, radius: 0, color, alpha: 0.3, visible: true }));
    let s: SimState = initSim(level, HEIST_01_SOLUTION.seed, HEIST_01_SOLUTION.catIds);
    const ticks = decodeInputs(HEIST_01_SOLUTION.runs);
    const pos = (v: VisionCones) => {
      const a = (v.mesh.geometry.attributes.position as THREE.BufferAttribute).array;
      return Array.from(a.slice(0, v.vertexCount * 3));
    };
    let calls = 0;
    for (let t = 0; t < ticks.length; t++) {
      s = stepSim(level, s, ticks[t]);
      doors = s.doorsOpen;
      s.guards.forEach((g, i) => Object.assign(inputs[i], { x: g.pos.x / SUBTILE, z: g.pos.y / SUBTILE, fx: g.facing.x, fz: g.facing.y, radius: g.visionTiles }));
      const key = doors.reduce((k, o, i) => k + (o ? 2 ** i : 0), 0);
      // Two animation frames per tick: the second must not rebuild.
      for (let f = 0; f < 2; f++) {
        cached.update(inputs, sees, key);
        calls++;
      }
      if (t % 5 === 0) {
        fresh.update(inputs, sees);
        expect(pos(cached)).toEqual(pos(fresh));
      }
    }
    expect(cached.vertexCount).toBeGreaterThan(0);
    expect(cached.rebuilds).toBeLessThanOrEqual(ticks.length);
    expect(cached.rebuilds).toBeLessThan(calls / 2 + 1);
  });
});
