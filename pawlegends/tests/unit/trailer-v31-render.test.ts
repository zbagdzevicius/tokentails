// @vitest-environment happy-dom
/**
 * Render bugs from the trailer v3 review (render only; nothing under src/sim changes): structures that strobed under
 * steady fire, a fallen core that turned into a see-through ghost box and then popped back, towers falling toward the
 * camera, bodies piled into one another and into towers and Pudding, damage numbers frozen over a core, Pudding
 * vanishing on one frame when calmed.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DAMAGE_FX, DamageNumbers } from '../../src/render/fx/DamageNumbers.js';
import { fallDirOf, hitPulse, PUDDING_OUT, RUBBLE_GROW, STRUCT_ANIM, STRUCT_HIT, StructureView } from '../../src/render/views/towerView';
import { clearOfObstacles, layoutBodies, OBSTACLE_CLEAR, SEPARATION } from '../../src/render/views/heroView';
import type { ViewFrame } from '../../src/render/interp';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map() }) as unknown as ViewFrame;
const core = { id: 55, kind: 'core', team: 1, fx: 90000, fy: 30000, hp: 100, maxHp: 1000, buffs: 0, yaw: 0, speed: 0 };
const tower = { ...core, id: 46, kind: 'tower', variant: 'outer' };
const pudding = { ...core, id: 62, kind: 'pudding', team: 2 };
type Item = { mesh: THREE.Mesh; material: THREE.Material & { transparent: boolean }; rig: { uFlashK: { value: number }; uOpacity: { value: number } } };
const item = (v: StructureView, id: number): Item | undefined => (v as unknown as { items: Map<number, Item> }).items.get(id);

describe('structure hit flash', () => {
  it('only the first hit after a quiet spell pulses; steady fire holds a light tint (no strobe)', () => {
    expect(hitPulse(STRUCT_HIT.gap + 0.1, 0)).toBe(STRUCT_HIT.pulse);
    expect(hitPulse(0.2, 0)).toBe(0);
    const v = new StructureView();
    v.update(frame([tower]), 1 / 60);
    const ks: number[] = [];
    // a hit every 0.2 s for 3 s
    for (let i = 0; i < 180; i++) {
      if (i % 12 === 0) v.hit(46);
      v.update(frame([tower]), 1 / 60);
      if (i > 90) ks.push(item(v, 46)!.rig.uFlashK.value);
    }
    // late in the burst the tint holds steady (the charge glow aside, it never jumps back to a white pulse)
    expect(Math.max(...ks)).toBeLessThan(0.35);
    expect(Math.max(...ks) - Math.min(...ks)).toBeLessThan(0.3);
    v.dispose();
  });
});

describe('core and tower falls', () => {
  it('a fallen core never stands up again, even while the frame still lists it (the match-end frame)', () => {
    const v = new StructureView();
    v.update(frame([core]), 1 / 60);
    v.fell(55);
    for (let t = 0; t < STRUCT_ANIM.fallCore + 0.5; t += 1 / 60) v.update(frame([core]), 1 / 60);
    expect(item(v, 55)!.mesh.visible).toBe(false);
    v.dispose();
  });

  it('a falling core is never drawn see-through, and its rubble grows in instead of popping on one frame', () => {
    const v = new StructureView();
    const rubble = (): THREE.Mesh[] => (v as unknown as { rubble: THREE.Mesh[] }).rubble;
    v.update(frame([core]), 1 / 60);
    v.fell(55);
    let lastScale = 0;
    let maxStep = 0;
    for (let t = 0; t < STRUCT_ANIM.fallCore + 0.3; t += 1 / 60) {
      v.update(frame([]), 1 / 60);
      const it0 = item(v, 55)!;
      if (it0.mesh.visible) {
        expect(it0.material.transparent).toBe(false);
        expect(it0.rig.uOpacity.value).toBe(1);
      }
      const r = rubble()[0];
      if (r) {
        maxStep = Math.max(maxStep, r.scale.x - lastScale);
        lastScale = r.scale.x;
      }
    }
    expect(rubble().length).toBeGreaterThan(0);
    // full size reached over RUBBLE_GROW s: no single frame adds more than a quarter of it
    expect(maxStep).toBeLessThan(rubble()[0].scale.x * 0.25);
    expect(RUBBLE_GROW).toBeGreaterThan(0.2);
    v.dispose();
  });

  it('a tower falls across the screen toward its own base, never toward the camera', () => {
    expect(Math.cos(fallDirOf(1))).toBeCloseTo(1);
    expect(Math.cos(fallDirOf(0))).toBeCloseTo(-1);
    expect(Math.abs(Math.sin(fallDirOf(1)))).toBeLessThan(1e-9);
  });

  it('calmed Pudding hops and shrinks away over PUDDING_OUT s instead of vanishing on one frame', () => {
    const v = new StructureView();
    let calmed = 0;
    v.onCalmed = () => calmed++;
    v.update(frame([pudding]), 1 / 60);
    v.update(frame([]), 1 / 60);
    expect(calmed).toBe(1);
    expect(item(v, 62)?.mesh.visible).toBe(true);
    for (let t = 0; t < PUDDING_OUT + 0.1; t += 1 / 60) v.update(frame([]), 1 / 60);
    expect(item(v, 62)).toBeUndefined();
    v.dispose();
  });
});

describe('bodies drawn apart', () => {
  it('three heroes on one spot fan out across the screen (x), far enough not to overlap', () => {
    const pts = [{ x: 10, z: 10 }, { x: 10, z: 10 }, { x: 10, z: 10.4 }];
    const o = layoutBodies(pts);
    const xs = pts.map((p, i) => p.x + o[i].x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(0.6);
    expect(xs[2] - xs[1]).toBeGreaterThan(0.6);
  });

  it('two heroes one behind the other are moved sideways, not along the line of sight', () => {
    const o = layoutBodies([{ x: 0, z: 0 }, { x: 0, z: 0.8 }]);
    expect(Math.abs(o[0].x - o[1].x)).toBeGreaterThan(Math.abs(o[0].z - o[1].z));
  });

  it('a body is drawn outside a tower or Pudding footprint, even standing on its centre', () => {
    const obs = [{ x: 0, z: 0, r: 2.1 }];
    const c = clearOfObstacles(0.3, 0.2, obs);
    expect(Math.hypot(0.3 + c.x, 0.2 + c.z)).toBeGreaterThanOrEqual(2.1 + OBSTACLE_CLEAR.bodyR - 1e-6);
    const o = layoutBodies([{ x: 0.05, z: 0 }, { x: -0.05, z: 0 }], obs);
    for (const [i, p] of [[0, 0.05], [1, -0.05]] as const) expect(Math.hypot(p + o[i].x, o[i].z)).toBeGreaterThan(2.1);
  });

  it('warm-started from last frame, a body inside a moving footprint keeps pushing out the same way', () => {
    const warm = [{ x: 2, z: 0 }];
    const o = layoutBodies([{ x: 0, z: 0 }], [{ x: 0, z: 0, r: 2 }], warm);
    expect(o[0].x).toBeGreaterThan(2);
    expect(SEPARATION.warm).toBeLessThan(1);
  });
});

describe('damage numbers', () => {
  const ctx = { game: { realTime: 0 }, camera: null };
  it('a counter merges hits for at most mergeMax s, then a new one starts (no number frozen in place)', () => {
    const d = new DamageNumbers(ctx);
    const pos = new THREE.Vector3();
    const first = d.show(pos, '10', 'normal', 7, 10);
    for (let t = 0.2; t < DAMAGE_FX.mergeMax + 0.5; t += 0.2) {
      ctx.game.realTime = t;
      d.show(pos, '10', 'normal', 7, 10);
    }
    expect(d.shown).toBeGreaterThan(1);
    expect(first.value).toBeLessThan(10 * ((DAMAGE_FX.mergeMax + 0.5) / 0.2));
  });

  it('the numbers of a fallen structure, and those round a core burst, fade at once', () => {
    ctx.game.realTime = 0;
    const d = new DamageNumbers(ctx);
    const a = d.show(new THREE.Vector3(0, 1, 0), '50', 'normal', 55, 50);
    const b = d.show(new THREE.Vector3(1, 1, 1), '30', 'normal', 24, 30);
    const c = d.show(new THREE.Vector3(20, 1, 20), '30', 'normal', 25, 30);
    d.dropKey(55);
    d.dropNear(0, 0, 3.5);
    expect(a.t).toBeGreaterThanOrEqual(a.life - DAMAGE_FX.fade);
    expect(b.t).toBeGreaterThanOrEqual(b.life - DAMAGE_FX.fade);
    expect(c.t).toBe(0);
  });
});
