// @vitest-environment happy-dom
/**
 * Structure falls (render only): a tower cracks, topples over its base edge and hits the ground (one impact, chunks
 * thrown), then breaks up into rubble along its fall line; a core bursts on its killing blow. Reduce motion keeps the
 * short shrink and throws nothing; the quality share scales the chunks.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FALL_SHAPE, STRUCT_ANIM, StructureView } from '../../src/render/views/towerView';
import type { ViewFrame } from '../../src/render/interp';

function frame(entities: object[]): ViewFrame {
  return { entities, projectiles: [], byId: new Map() } as unknown as ViewFrame;
}
const tower = { id: 46, kind: 'tower', team: 1, fx: 30000, fy: 20000, hp: 100, maxHp: 1000, buffs: 0, variant: 'outer', yaw: 0, speed: 0 };
const core = { ...tower, id: 55, kind: 'core', variant: undefined };

/** Angle (rad) between the mesh's up axis and world up. */
const tilt = (m: THREE.Object3D): number => new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion).angleTo(new THREE.Vector3(0, 1, 0));

function run(view: StructureView, e: object, seconds: number, dt = 1 / 60): void {
  view.update(frame([e]), dt);
  view.fell((e as { id: number }).id);
  for (let t = 0; t < seconds; t += dt) view.update(frame([]), dt);
}

describe('structure falls', () => {
  it('a tower topples (not a sink): near-flat at the impact, one impact with its length, chunks, rubble along the line', () => {
    const view = new StructureView();
    const hits: number[] = [];
    view.onImpact = (_x, _z, _dx, _dz, len) => hits.push(len);
    const mesh = () => view.group.children.find((c) => c.name === 'tower-46') as THREE.Mesh;
    run(view, tower, STRUCT_ANIM.fallTower * (FALL_SHAPE.hit + 0.03));
    expect(tilt(mesh())).toBeGreaterThan(1.2);
    expect(hits.length).toBe(1);
    expect(hits[0]).toBeGreaterThan(3);
    const debris = view.group.children.find((c) => c.name === 'structure-debris') as THREE.InstancedMesh;
    expect(debris.count).toBeGreaterThan(0);
    for (let t = 0; t < STRUCT_ANIM.fallTower; t += 1 / 60) view.update(frame([]), 1 / 60);
    expect(mesh().visible).toBe(false);
    expect(hits.length).toBe(1);
    view.dispose();
  });

  it('a core bursts on the killing blow, early in its fall', () => {
    const view = new StructureView();
    let burst = -1;
    let t = 0;
    view.onImpact = (_x, _z, _dx, _dz, len, isCore) => {
      if (isCore && len === 0 && burst < 0) burst = t;
    };
    view.update(frame([core]), 1 / 60);
    view.fell(55);
    for (; t < STRUCT_ANIM.fallCore; t += 1 / 60) view.update(frame([]), 1 / 60);
    expect(burst).toBeGreaterThanOrEqual(0);
    expect(burst).toBeLessThan(0.12);
    view.dispose();
  });

  it('reduce motion: no topple and no chunks; low quality throws fewer chunks than high', () => {
    const calm = new StructureView();
    calm.reduced = true;
    let n = 0;
    calm.onImpact = () => n++;
    run(calm, tower, STRUCT_ANIM.fallTower * 0.7);
    const m = calm.group.children.find((c) => c.name === 'tower-46') as THREE.Mesh;
    expect(tilt(m)).toBeLessThan(0.01);
    expect(n).toBe(0);
    calm.dispose();
    const live = (k: number): number => {
      const v = new StructureView();
      v.debris = k;
      run(v, tower, STRUCT_ANIM.fallTower * (FALL_SHAPE.hit + 0.02));
      const d = v.group.children.find((c) => c.name === 'structure-debris') as THREE.InstancedMesh;
      const out = new THREE.Matrix4();
      let alive = 0;
      for (let i = 0; i < d.count; i++) {
        d.getMatrixAt(i, out);
        if (new THREE.Vector3().setFromMatrixScale(out).x > 0) alive++;
      }
      v.dispose();
      return alive;
    };
    expect(live(0.35)).toBeLessThan(live(1));
    expect(live(0)).toBe(0);
  });
});
