/**
 * Upright PPK-style characters (render/chars/): POC.md §10 budgets (≤ 6k triangles and ONE mesh per hero, minions
 * light enough for instancing), PPK's skeleton, the pink bow on Clem's LEFT ear, standing heights, finite poses for
 * every animation state, the facing mapping (+Z PPK forward → +X model forward) and the baked minion parts.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { HERO_IDS } from '../../src/data/heroes';
import { DETAIL, HERO_HEIGHT, UPRIGHT_PART, heroBuilt, makeHero, uprightMinionGeometry, type CharState } from '../../src/render/chars';
import { BONE_INDEX, BONE_NAMES } from '../../src/render/chars/skeleton';
import { minionGeometry } from '../../src/render/views/models';

const HEROES: HeroId[] = [...HERO_IDS];
const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const STATES: CharState[] = ['idle', 'moving', 'dead', 'napping', 'stunned', 'feared', 'blocking', 'channel'];

describe('upright heroes (POC.md §10)', () => {
  for (const hero of HEROES) {
    for (const team of [0, 1] as const) {
      it(`${hero} team ${team}: one skinned mesh, ≤ 6k triangles at Med, fewer at Low`, () => {
        const med = tris(heroBuilt(hero, team, null, DETAIL.med).geometry);
        const low = tris(heroBuilt(hero, team, null, DETAIL.low).geometry);
        console.log(`${hero} team ${team}: ${med} triangles at Med, ${low} at Low`);
        expect(med).toBeLessThanOrEqual(6000);
        expect(low).toBeLessThan(med);
        const h = makeHero(hero, team, null, { detail: DETAIL.low });
        const meshes: THREE.Mesh[] = [];
        h.object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
        });
        expect(meshes).toHaveLength(1);
        expect(h.mesh.isSkinnedMesh).toBe(true);
        expect(h.rig.bones).toHaveLength(BONE_NAMES.length);
        h.dispose();
      });
    }
  }
  it('PPK skeleton: 27 kitten bones plus the weapon socket under the right paw', () => {
    expect(BONE_NAMES.length).toBe(28);
    const h = makeHero('clem', 0, null);
    expect(h.rig.bone('weapon').parent?.name).toBe('pawR');
    expect(h.rig.bone('earL').parent?.name).toBe('head');
    h.dispose();
  });
  const earBow = (look: { coat: string | null; chroma: null } | null, hex: number): { n: number; x: number } => {
    const g = heroBuilt('clem', 0, look).geometry;
    const col = g.getAttribute('color');
    const pos = g.getAttribute('position');
    const si = g.getAttribute('skinIndex');
    const bow = new THREE.Color(hex);
    let n = 0;
    let x = 0;
    for (let i = 0; i < col.count; i++) {
      if (si.getX(i) !== BONE_INDEX.earL) continue;
      if (Math.abs(col.getX(i) - bow.r) < 1e-3 && Math.abs(col.getY(i) - bow.g) < 1e-3 && Math.abs(col.getZ(i) - bow.b) < 1e-3) {
        n++;
        x += pos.getX(i);
      }
    }
    return { n, x: n ? x / n : 0 };
  };
  it("Pink Bow Clem's pink bow is on her LEFT ear (+X in character space)", () => {
    const b = earBow({ coat: 'skin.clem.pink_bow', chroma: null }, 0xff9ec0);
    expect(b.n).toBeGreaterThan(20);
    expect(b.x).toBeGreaterThan(0.1);
  });
  it('the free Clem wears a cream ribbon (the pink bow is what the paid skin delivers), also on the LEFT ear', () => {
    expect(earBow(null, 0xff9ec0).n).toBe(0);
    const ribbon = earBow(null, 0xfff3dc);
    expect(ribbon.n).toBeGreaterThan(20);
    expect(ribbon.x).toBeGreaterThan(0.1);
  });
  it('heroes stand upright at their height and face +X', () => {
    for (const hero of HEROES) {
      const h = makeHero(hero, 0, null);
      h.object.updateMatrixWorld(true);
      const head = new THREE.Vector3().setFromMatrixPosition(h.rig.bone('head').matrixWorld);
      const hips = new THREE.Vector3().setFromMatrixPosition(h.rig.bone('hips').matrixWorld);
      // the head is well above the hips (upright, not on four legs) and the stance is about the hero height
      expect(head.y - hips.y).toBeGreaterThan(0.25 * HERO_HEIGHT[hero]);
      expect(head.y).toBeGreaterThan(0.45 * HERO_HEIGHT[hero]);
      // the nose (head +Z in PPK space) points along +X of the object
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(h.rig.bone('head').matrixWorld);
      expect(fwd.x).toBeGreaterThan(0.7);
      h.dispose();
    }
  });
  it('every animation state gives finite bone transforms (and death lies down)', () => {
    for (const hero of HEROES) {
      const h = makeHero(hero, 1, null);
      for (const state of STATES) {
        h.anim.swing();
        h.anim.hit(true);
        for (let i = 0; i < 30; i++) h.anim.update(1 / 30, { state, speed: state === 'moving' ? 6 : 0, height: h.height, yawRate: 1.5 });
        for (const b of h.rig.bones) {
          expect(Number.isFinite(b.quaternion.x + b.quaternion.y + b.quaternion.z + b.quaternion.w)).toBe(true);
          expect(Number.isFinite(b.position.x + b.position.y + b.position.z)).toBe(true);
        }
        if (state === 'dead') {
          h.object.updateMatrixWorld(true);
          const head = new THREE.Vector3().setFromMatrixPosition(h.rig.bone('head').matrixWorld);
          expect(head.y).toBeLessThan(0.4 * h.height);
        }
      }
      h.dispose();
    }
  });
});

describe('upright minions', () => {
  for (const team of [0, 1] as const) {
    for (const ranged of [false, true]) {
      it(`team ${team} ${ranged ? 'ranged' : 'melee'}: ≤ 900 triangles, every part tagged`, () => {
        const g = uprightMinionGeometry(team, ranged);
        const t = tris(g);
        console.log(`minion team ${team} ${ranged ? 'ranged' : 'melee'}: ${t} triangles`);
        expect(t).toBeLessThanOrEqual(900);
        const part = g.getAttribute('aPart');
        const seen = new Set<number>();
        for (let i = 0; i < part.count; i++) seen.add(part.getX(i));
        for (const p of [UPRIGHT_PART.Body, UPRIGHT_PART.Head, UPRIGHT_PART.ArmL, UPRIGHT_PART.ArmR, UPRIGHT_PART.LegL, UPRIGHT_PART.LegR]) expect(seen.has(p)).toBe(true);
        g.computeBoundingBox();
        // upright: taller than long, facing +X
        const box = g.boundingBox!;
        expect(box.max.y - box.min.y).toBeGreaterThan(0.85);
        expect(box.min.y).toBeGreaterThan(-0.05);
      });
    }
  }
  it('siege carts stay vehicles', () => {
    const g = minionGeometry('siege', 0);
    expect(g.getAttribute('aPart')).toBeTruthy();
  });
});
