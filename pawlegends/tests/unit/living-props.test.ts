// @vitest-environment happy-dom
/**
 * Living pass P2 (render only): critters stay off the lanes, plazas and river, are seeded and pale, and are hidden on
 * Low; the structure life patch is uniforms only (one program per tier) with its own cache key; the orb bob stays
 * within 4 cm and never moves the structure's anchor; the fountain water is still on Low; a core's fall throws confetti
 * in the winner's colour (≤ 60 × debris) and leaves a warm-grey mound.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CROSSING, mirrorX } from '../../src/data/map';
import { mapInfo } from '../../src/sim/map/info';
import { ambientFor, type Ambient } from '../../src/render/ambient';
import { CRITTER, CRITTER_COLORS, CRITTERS, critterCount, critterSpots, kindAt, laneDistance } from '../../src/render/views/critters';
import { SPOUT, spoutDrops } from '../../src/render/views/fountainWater';
import { LIFE_PART, coreGeometry, fountainGeometry, ratGeometry, towerGeometry } from '../../src/render/views/models';
import { rigMaterial } from '../../src/render/views/rig';
import { CONFETTI, LIFE, STRUCT_ANIM, StructureView, confettiColors, confettiCount, lifeAmp, structureLifeMaterial } from '../../src/render/views/towerView';
import type { ViewFrame } from '../../src/render/interp';

const amb = (tier: 'low' | 'med' | 'high', reduced = false, phone = false): Ambient => ambientFor({ tier, phone }, reduced);
const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map() }) as unknown as ViewFrame;

/** mm distance from a point to a segment. */
function seg(x: number, y: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
}

describe('critters', () => {
  for (const id of ['crossing', 'hearthwood'] as const) {
    const info = mapInfo(id);
    const spots = critterSpots(info);

    it(`${id}: seeded spots, all ≥ 6 m (+ wander radius) from every lane centre line, off plazas and the river`, () => {
      expect(spots.length).toBe(CRITTERS.max);
      expect(critterSpots(info)).toEqual(spots);
      for (const s of spots) {
        const x = s.x * 1000;
        const y = -s.z * 1000;
        expect(laneDistance(info, x, y)).toBeGreaterThanOrEqual((CRITTERS.laneClear + s.r) * 1000);
        for (const f of info.fountains) expect(Math.hypot(f.x - x, f.y - y)).toBeGreaterThan(12000);
        for (const c of info.cores) expect(Math.hypot(c.x - x, c.y - y)).toBeGreaterThan(12000);
        const rv = info.river;
        if (rv.kind === 'band-x') expect(x < rv.a - 2000 || x > rv.b + 2000).toBe(true);
        else expect(Math.abs(x + y - rv.a)).toBeGreaterThan(rv.b + 2000);
      }
    });

    it(`${id}: the map's mix (a prefix keeps it) and pale colours, never team rose / sky or the bolt yellow`, () => {
      const kinds = new Set(spots.map((s) => s.kind));
      if (id === 'crossing') expect([...kinds].sort()).toEqual([CRITTER.butterfly, CRITTER.pollen]);
      else expect([...kinds].sort()).toEqual([CRITTER.firefly, CRITTER.leaf]);
      expect(spots.slice(0, 5).map((s) => s.kind)).toEqual([0, 1, 2, 3, 4].map((i) => kindAt(id, i)));
      const banned = [0xff3d7f, 0xc8135b, 0x39a6ff, 0x0d4fb8, 0xffe14a, 0xffd34d, 0xf7bc3c];
      const c = new THREE.Color();
      const hsl = { h: 0, s: 0, l: 0 };
      for (const list of Object.values(CRITTER_COLORS))
        for (const hex of list) {
          expect(banned).not.toContain(hex);
          c.setHex(hex).getHSL(hsl);
          // a saturated yellow (hue 45–65°) reads as "you"
          expect(hsl.h * 360 > 44 && hsl.h * 360 < 66 && hsl.s > 0.6 && hsl.l < 0.8).toBe(false);
        }
    });
  }

  it("Crossing's authored lane waypoints (both teams) are clear by 6 m too", () => {
    const spots = critterSpots(mapInfo('crossing'));
    for (const s of spots) {
      const x = s.x * 1000;
      const y = -s.z * 1000;
      for (const pts of Object.values(CROSSING.LANE_WAYPOINTS))
        for (let i = 0; i + 1 < pts.length; i++) {
          expect(seg(x, y, pts[i], pts[i + 1])).toBeGreaterThanOrEqual(6000);
          expect(seg(x, y, [mirrorX(pts[i][0]), pts[i][1]], [mirrorX(pts[i + 1][0]), pts[i + 1][1]])).toBeGreaterThanOrEqual(6000);
        }
    }
  });

  it('none on Low (level 0, hidden: 0 draws); Med fewer than High; reduce motion and phones fewer still', () => {
    expect(critterCount(amb('low'), 24)).toBe(0);
    expect(critterCount(amb('low', false, true), 24)).toBe(0);
    const med = critterCount(amb('med'), 24);
    const high = critterCount(amb('high'), 24);
    expect(med).toBeGreaterThan(0);
    expect(high).toBe(CRITTERS.max);
    expect(med).toBeLessThan(high);
    expect(critterCount(amb('high', true), 24)).toBeLessThan(high);
    expect(critterCount(amb('high', false, true), 24)).toBeLessThan(high);
    const v = new StructureView();
    expect(v.critters).not.toBeNull();
    const layer = v.critters!;
    expect(layer.mesh.parent).toBe(v.group);
    expect(layer.mesh.renderOrder).toBe(1);
    expect((layer.mesh.material as THREE.ShaderMaterial).depthWrite).toBe(false);
    v.setAmbient(amb('low'));
    expect(layer.mesh.visible).toBe(false);
    expect(layer.count).toBe(0);
    v.setAmbient(amb('high'));
    expect(layer.count).toBe(CRITTERS.max);
    v.dispose();
  });
});

describe('structure life patch', () => {
  it('chains onto the rig material, keeps one program per tier (uniforms only) and bumps the cache key', () => {
    for (const cracks of [false, true]) {
      const m = structureLifeMaterial(rigMaterial({ cracks }));
      expect(m.customProgramCacheKey()).toBe(cracks ? 'pl-rig-v1-dmg-life1' : 'pl-rig-v1-life1');
      const lib = THREE.ShaderLib.lambert;
      const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      // the rig's own patch still applies, then the life patch after it
      expect(shader.vertexShader).toContain('plPart(aPart)');
      expect(shader.vertexShader).toContain('plLife(aPart)');
      expect(shader.vertexShader.indexOf('mat3 plRy')).toBeLessThan(shader.vertexShader.indexOf('mat3 plLife'));
      expect(shader.fragmentShader).toContain('plWater(gl_FragColor.rgb');
      expect(shader.uniforms.uLifeA).toBe(m.userData.life.uLifeA);
      expect(shader.uniforms.uDmg).toBeDefined();
      expect(shader.vertexShader).not.toMatch(/#define\s+PL_LIFE/);
    }
  });

  it('the models tag the moving parts: orb, yarn ball (pivot scaled with the core), rat head and tail, basin and spout water', () => {
    const parts = (g: THREE.BufferGeometry): Set<number> => new Set(Array.from(g.getAttribute('aPart').array as Float32Array));
    expect(parts(towerGeometry(0, 'outer')).has(LIFE_PART.orb)).toBe(true);
    expect(parts(towerGeometry(1, 'inner')).has(LIFE_PART.orb)).toBe(true);
    const core = coreGeometry(0);
    expect(parts(core).has(LIFE_PART.yarn)).toBe(true);
    const piv = core.getAttribute('aPivot');
    const part = core.getAttribute('aPart');
    for (let i = 0; i < part.count; i++) if (part.getX(i) === LIFE_PART.yarn) expect(piv.getY(i)).toBeCloseTo(3.1 * 0.72, 4);
    const rat = parts(ratGeometry());
    expect(rat.has(LIFE_PART.head) && rat.has(LIFE_PART.tail)).toBe(true);
    const f = parts(fountainGeometry(0));
    expect(f.has(LIFE_PART.water) && f.has(LIFE_PART.spout)).toBe(true);
  });

  it('lifeAmp: half bob on Low (none with reduce motion), the ambient motion on Med / High', () => {
    expect(lifeAmp(null)).toBe(LIFE.lowBob);
    expect(lifeAmp(amb('low'))).toBe(LIFE.lowBob);
    expect(lifeAmp(amb('low', true))).toBe(0);
    expect(lifeAmp(amb('med'))).toBeCloseTo(0.7);
    expect(lifeAmp(amb('high'))).toBe(1);
    expect(lifeAmp(amb('high', true))).toBeCloseTo(0.3);
  });

  it('the orb bobs ≤ 4 cm and glows ≤ ±10% on High, no glow on Low; the tower stays on its entity point', () => {
    const tower = { id: 40, kind: 'tower', team: 0, fx: 34000, fy: 51000, hp: 1000, maxHp: 1000, buffs: 0, variant: 'outer', yaw: 0, speed: 0, state: 'idle' };
    for (const tier of ['low', 'high'] as const) {
      const v = new StructureView();
      v.setAmbient(amb(tier));
      const mesh = (): THREE.Mesh => v.group.children.find((c) => c.name === 'tower-40') as THREE.Mesh;
      let maxBob = 0;
      let maxGlow = 0;
      const seen = new Set<number>();
      for (let i = 0; i < 300; i++) {
        v.update(frame([tower]), 1 / 30);
        const life = (mesh().material as THREE.Material).userData.life;
        maxBob = Math.max(maxBob, Math.abs(life.uLifeA.value.y));
        maxGlow = Math.max(maxGlow, Math.abs(life.uLifeB.value.y));
        seen.add(Math.round(life.uLifeA.value.x * 100));
        expect(mesh().position.x).toBeCloseTo(34, 5);
        expect(mesh().position.z).toBeCloseTo(-51, 5);
      }
      expect(maxBob).toBeLessThanOrEqual(LIFE.bob + 1e-9);
      expect(maxBob).toBeGreaterThan(tier === 'low' ? 0.01 : 0.03);
      if (tier === 'low') expect(maxGlow).toBe(0);
      else expect(maxGlow).toBeGreaterThan(0.05);
      expect(maxGlow).toBeLessThanOrEqual(LIFE.glow + 1e-9);
      expect(seen.size).toBeGreaterThan(10);
      v.dispose();
    }
  });

  it('the fountain water is still on Low (amplitude 0) and ripples on Med / High; spout drops ≤ 6 a second', () => {
    const f = { id: 60, kind: 'fountain', team: 0, fx: 3000, fy: 30000, hp: 1, maxHp: 1, buffs: 0, yaw: 0, speed: 0, state: 'idle' };
    let drops = 0;
    const particles = {
      room: () => true,
      claim: (_a: boolean, n: number) => n,
      begin: () => ({}),
      emit: () => {
        drops++;
        return 0;
      },
      single: () => 0,
      burst: () => undefined,
    };
    for (const tier of ['low', 'med', 'high'] as const) {
      drops = 0;
      const v = new StructureView();
      v.setAmbient(amb(tier));
      v.setAmbientFx({ particles, shock: {} } as never);
      for (let i = 0; i < 120; i++) v.update(frame([f]), 1 / 60);
      const m = v.group.children.find((c) => c.name === 'fountain-60') as THREE.Mesh;
      const w = (m.material as THREE.Material).userData.life.uLifeW.value;
      if (tier === 'low') {
        expect(w.x).toBe(0);
        expect(drops).toBe(0);
      } else {
        expect(w.x).toBeGreaterThan(0.3);
        expect(drops).toBeGreaterThan(0);
        expect(drops).toBeLessThanOrEqual(SPOUT.rate * 2 + 1);
      }
      v.dispose();
    }
    const acc = new Float32Array(1);
    let n = 0;
    for (let i = 0; i < 600; i++) n += spoutDrops(acc, 1 / 60, 1);
    expect(n).toBeLessThanOrEqual(SPOUT.rate * 10);
    expect(spoutDrops(new Float32Array(1), 1, 0)).toBe(0);
  });

  it('an undisturbed rat sniffs, sways its tail and shows a Zz on Med; nothing on Low', () => {
    const rat = { id: 70, kind: 'camp', team: 2, fx: 30000, fy: 30000, hp: 100, maxHp: 100, buffs: 0, variant: 'rat', yaw: 0.5, speed: 0, state: 'idle' };
    for (const tier of ['low', 'med'] as const) {
      let zz = 0;
      const particles = {
        room: () => true,
        claim: (_a: boolean, n: number) => n,
        begin: () => ({}) as Record<string, number>,
        emit() {
          zz++;
          return 0;
        },
        single: () => 0,
        burst: () => undefined,
      };
      const v = new StructureView();
      v.setAmbient(amb(tier));
      v.setAmbientFx({ particles, shock: {} } as never);
      let yaw = 0;
      for (let i = 0; i < 60 * 8; i++) {
        v.update(frame([rat]), 1 / 60);
        const m = v.group.children.find((c) => c.name === 'camp-70') as THREE.Mesh;
        yaw = Math.max(yaw, Math.abs((m.material as THREE.Material).userData.life.uLifeA.value.z));
        // a few cm of shuffle at most, round its sim point
        expect(Math.hypot(m.position.x - 30, m.position.z + 30)).toBeLessThan(0.08);
      }
      expect(yaw).toBeGreaterThan(0.1);
      if (tier === 'low') expect(zz).toBe(0);
      else expect(zz).toBeGreaterThan(0);
      v.dispose();
    }
  });
});

describe('core fall', () => {
  it("confetti in the winner's colour (≤ 60 × debris), a light burst, and a warm-grey mound", () => {
    expect(confettiCount(1)).toBe(CONFETTI.max);
    expect(confettiCount(0.35)).toBeLessThanOrEqual(21);
    expect(confettiCount(0)).toBe(0);
    expect(confettiColors(0)).toContain(0xff3d7f);
    expect(confettiColors(1)).toContain(0x39a6ff);
    for (const [team, swap, want] of [[1, false, 0xff3d7f], [0, false, 0x39a6ff], [1, true, 0x39a6ff]] as const) {
      const colours: number[] = [];
      let pieces = 0;
      let flash = 0;
      const particles = {
        room: () => true,
        claim: (_a: boolean, n: number) => n,
        begin: () => ({}),
        emit: () => 0,
        single: () => {
          flash++;
          return 0;
        },
        burst: (_p: THREE.Vector3, o: { n: number; color: number; shape: number }) => {
          colours.push(o.color);
          pieces += o.n;
        },
      };
      const v = new StructureView();
      v.styleSwap = swap;
      v.setAmbient(amb('high'));
      v.setAmbientFx({ particles, shock: {} } as never);
      const core = { id: 55, kind: 'core', team, fx: 90000, fy: 30000, hp: 0, maxHp: 1000, buffs: 0, yaw: 0, speed: 0, state: 'idle' };
      v.update(frame([core]), 1 / 60);
      v.fell(55);
      for (let t = 0; t < STRUCT_ANIM.fallCore + 0.5; t += 1 / 60) v.update(frame([]), 1 / 60);
      expect(colours).toContain(want);
      expect(pieces).toBe(CONFETTI.max);
      expect(flash).toBeGreaterThan(0);
      const mound = v.group.children.find((c) => (c as THREE.Mesh).userData?.flat) as THREE.Mesh;
      expect(mound).toBeTruthy();
      expect(mound.scale.y).toBeLessThan(mound.scale.x * 0.3);
      const c = (mound.material as THREE.MeshLambertMaterial).color;
      // warm grey: red over blue
      expect(c.r).toBeGreaterThan(c.b);
      v.dispose();
    }
  });
});
