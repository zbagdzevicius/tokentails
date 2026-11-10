// @vitest-environment happy-dom
/**
 * V21-FUN §4 tower and core damage states (render only): the thresholds, the state never going back down, the crossing
 * hook (crack / ignite / "burning" callout), the cracks only on tower and core materials, the fire's tier rates (Low:
 * half, no embers), off-screen culling, the smoulder after a fall, and no allocation on the per-frame fire path.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CRACK_K, DAMAGE_POSE, FIRE, TOWER_DAMAGE, burningLine, damageState, fireRates, nextStage, type FireRates } from '../../src/render/views/towerDamage';
import { TowerFire, type FireSink, type FireSpec } from '../../src/render/fx/towerFire';
import { RUBBLE, STRUCT_ANIM, StructureView } from '../../src/render/views/towerView';
import { rigMaterial, RIG_CRACK_GLSL } from '../../src/render/views/rig';
import { towerBurningMoment } from '../../src/render/announcer';
import type { ViewFrame } from '../../src/render/interp';

function frame(entities: object[]): ViewFrame {
  return { entities, projectiles: [], byId: new Map() } as unknown as ViewFrame;
}
const tower = (hp: number, o: object = {}) => ({ id: 46, kind: 'tower', team: 0, fx: 30000, fy: 20000, hp, maxHp: 1000, buffs: 0, variant: 'outer', lane: 'sunny', yaw: 0, speed: 0, ...o });

/** A counting particle sink: one shared spec, emits counted per pool. */
function sink(): FireSink & { add: number; alpha: number; specs: Set<FireSpec> } {
  const spec = {} as FireSpec;
  let seed = 7;
  const s = {
    add: 0,
    alpha: 0,
    specs: new Set<FireSpec>(),
    rng: () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    },
    begin: () => {
      s.specs.add(spec);
      // field by field, as Particles.begin does (an object literal here would be the stub's own garbage)
      spec.vx = spec.vy = spec.vz = spec.rot = spec.spin = spec.gravity = spec.drag = 0;
      spec.a = spec.intensity = spec.stretch = 1;
      return spec;
    },
    emit: (additive: boolean) => {
      if (additive) s.add++;
      else s.alpha++;
      return 0;
    },
  };
  return s;
}

describe('damage state', () => {
  it('thresholds: clean ≥ 66%, cracked ≥ 33%, burning ≥ 15%, blazing below', () => {
    expect(damageState(1)).toBe(0);
    expect(damageState(TOWER_DAMAGE.cracked)).toBe(0);
    expect(damageState(0.659)).toBe(1);
    expect(damageState(TOWER_DAMAGE.burning)).toBe(1);
    expect(damageState(0.329)).toBe(2);
    expect(damageState(TOWER_DAMAGE.blazing)).toBe(2);
    expect(damageState(0.149)).toBe(3);
    expect(damageState(0)).toBe(3);
    expect(damageState(Number.NaN)).toBe(0);
    expect(CRACK_K[0]).toBe(0);
    expect(CRACK_K[3]).toBe(1);
  });

  it('nextStage never goes down', () => {
    expect(nextStage(-1, 1)).toBe(0);
    expect(nextStage(2, 0.9)).toBe(2);
    expect(nextStage(1, 0.2)).toBe(2);
    expect(nextStage(3, 0.5)).toBe(3);
  });

  it('the callout line names the lane, the base or the core', () => {
    expect(burningLine('tower', 'sunny')).toBe('Our Sunny Lane tower is burning!');
    expect(burningLine('tower', 'gutter')).toBe('Our Gutterway tower is burning!');
    expect(burningLine('tower', undefined)).toBe('Our base tower is burning!');
    expect(burningLine('core', 'sunny')).toBe('Our core is burning!');
    const m = towerBurningMoment('Our Sunny Lane tower is burning!');
    expect(m).toMatchObject({ key: 'towerBurning', size: 'callout', tone: 'info' });
  });
});

describe('StructureView damage states', () => {
  it('tracks the state, fires the hook only on a crossing, never steps back, sets the crack uniforms', () => {
    const view = new StructureView();
    const seen: [number, number][] = [];
    view.onStage = (_id, _k, _t, st, prev) => seen.push([st, prev]);
    view.update(frame([tower(500)]), 1 / 60);
    // first sight at 50%: cracked, silently (a reconnect never plays a crack for old damage)
    expect(view.stageOf(46)).toBe(1);
    expect(seen).toEqual([]);
    view.update(frame([tower(300)]), 1 / 60);
    expect(view.stageOf(46)).toBe(2);
    view.update(frame([tower(900)]), 1 / 60);
    expect(view.stageOf(46)).toBe(2);
    view.update(frame([tower(100)]), 1 / 60);
    expect(seen).toEqual([
      [2, 1],
      [3, 2],
    ]);
    const mesh = view.group.children.find((c) => c.name === 'tower-46') as THREE.Mesh;
    const rig = (mesh.material as THREE.Material).userData.rig;
    expect(rig.uDmg.value).toBe(1);
    expect(rig.uEmber.value).toBe(1);
    view.dispose();
  });

  it('a damaged tower leans toward its fall side and wobbles while blazing; reduce motion keeps it upright', () => {
    const tilt = (m: THREE.Object3D): number => new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion).angleTo(new THREE.Vector3(0, 1, 0));
    const view = new StructureView();
    view.update(frame([tower(1000)]), 1 / 60);
    const mesh = view.group.children.find((c) => c.name === 'tower-46') as THREE.Mesh;
    expect(tilt(mesh)).toBeLessThan(1e-6);
    view.update(frame([tower(500)]), 1 / 60);
    expect(tilt(mesh)).toBeCloseTo(DAMAGE_POSE.lean[1], 4);
    const tilts: number[] = [];
    for (let i = 0; i < 90; i++) {
      view.update(frame([tower(50)]), 1 / 60);
      tilts.push(tilt(mesh));
    }
    expect(Math.max(...tilts) - Math.min(...tilts)).toBeGreaterThan(DAMAGE_POSE.wobble);
    view.dispose();
    const calm = new StructureView();
    calm.reduced = true;
    calm.update(frame([tower(1000)]), 1 / 60);
    calm.update(frame([tower(50)]), 1 / 60);
    expect(tilt(calm.group.children.find((c) => c.name === 'tower-46') as THREE.Object3D)).toBeLessThan(1e-6);
    calm.dispose();
  });

  it('cracks compile only into tower and core materials', () => {
    const plain = rigMaterial();
    const dmg = rigMaterial({ cracks: true });
    expect(plain.customProgramCacheKey()).toBe('pl-rig-v1');
    expect(dmg.customProgramCacheKey()).toBe('pl-rig-v1-dmg');
    const sh = (m: THREE.Material) => {
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      return shader;
    };
    expect(sh(plain).fragmentShader).not.toContain('plCrack');
    const d = sh(dmg);
    expect(d.fragmentShader).toContain('plCrack(vPlObj, uDmg)');
    expect(d.fragmentShader).toContain(RIG_CRACK_GLSL.trim().slice(0, 30));
    expect(d.vertexShader).toContain('vPlObj = transformed;');
    expect(Object.keys(d.uniforms)).toContain('uDmg');
  });

  it('burning and blazing towers emit fire through the pool; clean and cracked ones do not; the rubble smoulders', () => {
    const view = new StructureView();
    const p = sink();
    const fire = new TowerFire(p);
    view.fire = fire;
    for (let i = 0; i < 60; i++) view.update(frame([tower(500)]), 1 / 60);
    expect(p.add + p.alpha).toBe(0);
    for (let i = 0; i < 60; i++) view.update(frame([tower(300)]), 1 / 60);
    const burning = p.add + p.alpha;
    // Medium: ≈ 3 smoke + 6 flame licks (two sprites each) + 2.5 embers a second
    expect(burning).toBeGreaterThanOrEqual(FIRE.smoke + 2 * FIRE.flame + FIRE.ember - 3);
    expect(burning).toBeLessThanOrEqual(FIRE.smoke + 2 * FIRE.flame + FIRE.ember + 3);
    const before = p.add + p.alpha;
    for (let i = 0; i < 60; i++) view.update(frame([tower(100)]), 1 / 60);
    expect(p.add + p.alpha - before).toBeGreaterThan(burning * 1.7);
    view.fell(46);
    for (let t = 0; t < STRUCT_ANIM.fallTower + 0.05; t += 1 / 60) view.update(frame([]), 1 / 60);
    const s0 = fire.count.smoulder;
    for (let t = 0; t < 1; t += 1 / 60) view.update(frame([]), 1 / 60);
    expect(fire.count.smoulder - s0).toBeGreaterThanOrEqual(FIRE.smoulder - 1);
    for (let t = 0; t < RUBBLE.hold + 0.5; t += 1 / 60) view.update(frame([]), 1 / 60);
    const s1 = fire.count.smoulder;
    for (let t = 0; t < 1; t += 1 / 60) view.update(frame([]), 1 / 60);
    expect(fire.count.smoulder).toBe(s1);
    view.dispose();
  });
});

describe('TowerFire', () => {
  const run = (fire: TowerFire, stage: number, seconds: number): void => {
    const acc = new Float32Array(4);
    for (let t = 0; t < seconds; t += 1 / 60) fire.burn(10, -10, 7, stage, false, false, acc, 1 / 60);
  };

  it('Low: half the smoke and flames, no embers', () => {
    const med = new TowerFire(sink());
    run(med, 3, 10);
    const low = new TowerFire(sink());
    low.tier = 'low';
    run(low, 3, 10);
    expect(low.count.ember).toBe(0);
    expect(med.count.ember).toBeGreaterThan(0);
    expect(low.count.flame).toBeLessThan(med.count.flame * 0.6);
    expect(low.count.smoke).toBeLessThan(med.count.smoke * 0.6);
    const r: FireRates = { smoke: 0, flame: 0, ember: 0, smokeLife: 0 };
    expect(fireRates(1, 'high', r).flame).toBe(0);
    expect(fireRates(2, 'low', r).ember).toBe(0);
    expect(r.smokeLife).toBe(FIRE.smokeLifeLow);
  });

  it('live particles at Medium stay inside the §4.3 budget (≈ 17 a burning tower, double blazing)', () => {
    const r: FireRates = { smoke: 0, flame: 0, ember: 0, smokeLife: 0 };
    fireRates(2, 'med', r);
    // a flame lick is two sprites (body and core)
    const live = r.smoke * r.smokeLife + 2 * r.flame * FIRE.flameLife + r.ember * FIRE.emberLife;
    expect(live).toBeLessThan(18);
    fireRates(3, 'med', r);
    // four blazing towers on screen: under 10% of the 1,600 Medium budget
    expect(4 * (r.smoke * r.smokeLife * 1.2 + 2 * r.flame * FIRE.flameLife + r.ember * FIRE.emberLife)).toBeLessThan(160);
  });

  it('a structure outside the camera view emits nothing', () => {
    const fire = new TowerFire(sink());
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
    cam.position.set(0, 30, 30);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    fire.view(cam);
    expect(fire.inView(0, 0, 7)).toBe(true);
    expect(fire.inView(400, 0, 7)).toBe(false);
    const acc = new Float32Array(4);
    for (let i = 0; i < 120; i++) fire.burn(400, 0, 7, 3, false, false, acc, 1 / 60);
    expect(fire.count.smoke + fire.count.flame + fire.count.ember).toBe(0);
    for (let i = 0; i < 120; i++) fire.burn(0, 0, 7, 3, false, false, acc, 1 / 60);
    expect(fire.count.flame).toBeGreaterThan(0);
  });

  it('no allocation on the per-frame path: one shared spec, no `new`, literals or closures in burn / smoulder / take', () => {
    const p = sink();
    const fire = new TowerFire(p);
    const acc = new Float32Array(4);
    for (let i = 0; i < 2000; i++) {
      fire.burn(0, 0, 7, 3, (i & 1) === 1, (i & 7) === 0, acc, 1 / 60);
      fire.smoulder(0, 0, acc, 1 / 60);
    }
    expect(p.specs.size).toBe(1);
    // the hot methods' source: no constructor calls, array / object literals or arrow functions (a V8 heap delta is
    // too noisy to assert on: boxed doubles and JIT code count too)
    const src = readFileSync(`${process.cwd()}/src/render/fx/towerFire.ts`, 'utf8');
    for (const name of ['burn(', 'smoulder(', 'private take(']) {
      const at = src.indexOf(`  ${name}`);
      expect(at, name).toBeGreaterThan(0);
      const body = src.slice(src.indexOf('{', src.indexOf(')', at)), src.indexOf('\n  }\n', at));
      expect(body.length, name).toBeGreaterThan(name === 'private take(' ? 60 : 400);
      expect(body, name).not.toMatch(/\bnew\s|=>|=\s*\[|=\s*\{|\(\s*\{/);
    }
  });
});
