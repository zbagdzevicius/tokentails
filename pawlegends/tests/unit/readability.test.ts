/**
 * In-match readability (render and UI only): one team-colour encoding everywhere, hero nameplates that never pile on
 * each other, damage numbers capped per target, and the PPK chibi proportions the visual pass set (2026-10-17):
 * Clem's head about half her height, her rest blade off her face, bars above every hero's top, results moods.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { MINION_BAR_CSS, RELATION, RELATION_CSS, TEAM } from '../../src/render/palette';
import { HERO_TOP, heroBuilt, makeHero } from '../../src/render/chars';
import { HERO_SCALE } from '../../src/render/views/models';
import { DAMAGE_FX, DamageNumbers } from '../../src/render/fx/DamageNumbers.js';
import { declutter, plateBox } from '../../src/ui/overhead';

const HEROES: HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw'];
const hue = (hex: number): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).h * 360;

describe('team colour encoding (rings, plates, minimap, towers)', () => {
  it('our side is the Purrhaven rose, the enemy the Woof blue, yellow only for you', () => {
    expect(RELATION.ally).toBe(TEAM[0].main);
    const enemy = hue(RELATION.enemy);
    expect(enemy).toBeGreaterThan(200);
    expect(enemy).toBeLessThan(250);
    expect(Math.abs(hue(TEAM[1].main) - enemy)).toBeLessThan(15);
    // the enemy is never red any more (red read as "our pink"); red is kept for threats only
    expect(RELATION.danger).not.toBe(RELATION.enemy);
    for (const css of [RELATION_CSS.ally, RELATION_CSS.enemy, MINION_BAR_CSS.ally, MINION_BAR_CSS.enemy]) expect(css).toMatch(/^#[0-9a-f]{6}$/i);
    expect(hue(Number(`0x${RELATION_CSS.enemy.slice(1)}`))).toBeGreaterThan(200);
  });
});

describe('hero nameplate declutter', () => {
  it('a plate overlapping one already placed moves up by a plate height; apart plates stay put', () => {
    const b = plateBox(1);
    const h = b.bottom - b.top + 2;
    const out = declutter(
      [
        { x: 400, y: 200 },
        { x: 410, y: 204 },
        { x: 405, y: 198 },
        { x: 700, y: 200 },
      ],
      1,
    );
    expect(out[0]).toEqual({ dy: 0, depth: 0 });
    // each lifted plate sits exactly one plate height above the one it overlapped
    expect(204 + out[1].dy).toBeCloseTo(200 - h, 5);
    expect(198 + out[2].dy).toBeCloseTo(200 - 2 * h, 5);
    expect(out[3]).toEqual({ dy: 0, depth: 0 });
  });
});

describe('damage numbers', () => {
  it('merge repeat hits on one target and keep at most perKey numbers per target', () => {
    let t = 0;
    const dn = new DamageNumbers({ game: { get realTime() { return t; } }, cam: { isIso: true, distance: 27 } });
    const p = new THREE.Vector3();
    for (let i = 0; i < 4; i++) dn.show(p, '10', 'hurt', 7, 10);
    expect(dn.merged).toBe(3);
    for (let i = 0; i < 6; i++) {
      t += DAMAGE_FX.mergeWindow + 0.05;
      dn.show(p, '10', 'hurt', 7, 10);
    }
    const live = (dn as unknown as { pool: { active: boolean; key: unknown; t: number; life: number }[] }).pool.filter((n) => n.active && n.key === 7 && n.t < n.life - DAMAGE_FX.fade);
    expect(live.length).toBeLessThanOrEqual(DAMAGE_FX.perKey);
  });
});

describe('PPK chibi proportions', () => {
  it("Clem's head is about half her height (PPK), bigger than before the pass", () => {
    const c = makeHero('clem', 0, null);
    c.object.updateMatrixWorld(true);
    const neck = new THREE.Vector3().setFromMatrixPosition(c.rig.bone('head').matrixWorld).y;
    const top = HERO_TOP.clem;
    // from the neck joint to the ear tips is the head; the bow sits on top of that
    expect((top - neck) / top).toBeGreaterThan(0.42);
    c.dispose();
  });
  it('overhead bars sit above every hero top (ears, bow, plume)', () => {
    for (const h of HEROES) {
      const g = heroBuilt(h, 0).geometry;
      g.computeBoundingBox();
      const top = g.boundingBox!.max.y * makeHeroHeight(h);
      expect(Math.abs(top - HERO_TOP[h]) / HERO_TOP[h]).toBeLessThan(0.04);
      expect(HERO_SCALE[h] * 1.62).toBeGreaterThan(HERO_TOP[h]);
    }
  });
  it("Clem's rest blade stays off her face (lobby and idle)", () => {
    const c = makeHero('clem', 0, null);
    c.object.updateMatrixWorld(true);
    const head = c.rig.bone('head');
    const w = c.rig.bone('weapon').matrixWorld;
    const toHead = head.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    for (let s = 0.1; s <= 0.7; s += 0.05) {
      v.set(0, s, 0).applyMatrix4(w).applyMatrix4(toHead);
      // head space (before its scale): the face is |x| < 0.17, y 0.03..0.32, in front (z > 0)
      const onFace = Math.abs(v.x) < 0.17 && v.y > 0.03 && v.y < 0.32 && v.z > 0;
      expect(onFace).toBe(false);
    }
    c.dispose();
  });
  it('results moods: cheer lifts the arms, sad drops the head', () => {
    const idle = makeHero('clem', 0, null);
    const sad = makeHero('clem', 0, null);
    const cheer = makeHero('clem', 0, null);
    sad.anim.mood = 'sad';
    cheer.anim.mood = 'cheer';
    for (const c of [idle, sad, cheer]) for (let i = 0; i < 40; i++) c.anim.update(1 / 30, { state: 'idle', speed: 0, height: c.height, yawRate: 0 });
    const y = (c: ReturnType<typeof makeHero>, b: 'head' | 'pawL'): number => {
      c.object.updateMatrixWorld(true);
      return new THREE.Vector3().setFromMatrixPosition(c.rig.bone(b).matrixWorld).y;
    };
    expect(y(sad, 'head')).toBeLessThan(y(idle, 'head'));
    expect(y(cheer, 'pawL')).toBeGreaterThan(y(idle, 'pawL'));
    for (const c of [idle, sad, cheer]) c.dispose();
  });
});

function makeHeroHeight(h: HeroId): number {
  const c = makeHero(h, 0, null);
  const height = c.height;
  c.dispose();
  return height;
}
