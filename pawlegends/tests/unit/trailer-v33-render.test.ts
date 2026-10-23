// @vitest-environment happy-dom
/**
 * Render bugs from the trailer v3.2 review (render only; nothing under src/sim changes): a damage number pinned on the
 * dog core for 1.6 s under the victory slow motion (the merge clock is real time, which crawls there, so every hit
 * re-merged into one unrisen counter), and the falling core lifted to a pale grey see-through-looking box by its white
 * fall glow (the mix runs in linear light).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DamageNumbers, DAMAGE_FX } from '../../src/render/fx/DamageNumbers.js';
import type { ViewFrame } from '../../src/render/interp';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map((entities as { id: number }[]).map((e) => [e.id, e])) }) as unknown as ViewFrame;
const base = { team: 1, hp: 100, maxHp: 100, shield: 0, buffs: 0, yaw: 0, speed: 0, state: 'idle' };

describe('a damage number never outlives its drawn lifetime under a slow real-time clock', () => {
  it('steady hits merge for at most mergeMax s of drawn time, then a new counter starts and the old one rises out', () => {
    const ctx = { game: { realTime: 0 }, camera: null };
    const d = new DamageNumbers(ctx);
    const pos = new THREE.Vector3();
    const first = d.show(pos, '10', 'normal', 55, 10);
    // the victory slow motion: real time crawls (0.01 s per drawn frame), a hit on the core every drawn frame
    let alive = 0;
    for (let f = 1; f <= 240; f++) {
      d.render(1 / 60);
      ctx.game.realTime += 0.01;
      d.show(pos, '10', 'normal', 55, 10);
      if (first.active && first.kind === 'num' && first.key === 55) alive = f;
    }
    expect(alive / 60).toBeLessThanOrEqual(DAMAGE_FX.mergeMax + DAMAGE_FX.life + 0.05);
    expect(d.shown).toBeGreaterThan(1);
  });
});

describe('the falling core glows warm and faint (no grey ghost box)', () => {
  it('its fall tint is a warm colour at a small share', async () => {
    const { StructureView, FALL_FLASH } = await import('../../src/render/views/towerView');
    expect(FALL_FLASH.core).toBeLessThanOrEqual(0.06);
    const v = new StructureView();
    const core = { ...base, id: 55, kind: 'core', team: 1, fx: 90000, fy: 30000, hp: 100, maxHp: 1000 };
    v.update(frame([core]), 1 / 60);
    type Item = { rig: { uFlashK: { value: number }; uFlash: { value: THREE.Color } }; dieT: number };
    const item = (v as unknown as { items: Map<number, Item> }).items.get(55) as Item;
    v.update(frame([]), 1 / 60);
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      v.update(frame([]), 1 / 60);
      peak = Math.max(peak, item.rig.uFlashK.value);
    }
    expect(peak).toBeLessThanOrEqual(FALL_FLASH.core + 1e-6);
    const c = item.rig.uFlash.value;
    expect(c.r).toBeGreaterThan(c.b);
    expect(c.getHex()).toBe(FALL_FLASH.color);
  });
});

describe('a minion is never drawn inside a hero body', () => {
  it('a cadet standing 0.4 m from a hero is drawn at least MINION_CLEAR - 0.05 m from it', async () => {
    const { MinionInstances, MINION_CLEAR } = await import('../../src/render/views/minionInstances');
    const m = new MinionInstances();
    m.heroes = [{ x: 90, z: -30 }];
    const minion = { ...base, id: 100, kind: 'minion', variant: 'melee', team: 0, fx: 90400, fy: 30000 };
    for (let i = 0; i < 3; i++) m.update(frame([minion]), 1 / 60, i / 60);
    const at = m.drawnAt.get(100);
    expect(at).toBeTruthy();
    expect(Math.hypot((at?.x ?? 0) - 90, (at?.z ?? 0) + 30)).toBeGreaterThanOrEqual(MINION_CLEAR - 0.05);
  });
});

describe('bolts read as balls, the core shot is small', () => {
  it('the bolt material is shaded toward its silhouette and the core shot radius is at most 0.45 m', async () => {
    const { shadeBolts, look, BOLT_CORE_SIZE } = await import('../../src/render/views/projectileView');
    const { PROJECTILE_KIND } = await import('../../src/data/towers');
    expect(BOLT_CORE_SIZE).toBeLessThanOrEqual(0.45);
    expect(look(PROJECTILE_KIND.core, 1).size).toBe(BOLT_CORE_SIZE);
    const m = new THREE.MeshBasicMaterial();
    shadeBolts(m);
    const sh = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <opaque_fragment>', uniforms: {} };
    (m.onBeforeCompile as (s: typeof sh) => void)(sh);
    expect(sh.fragmentShader).toContain('vBoltN');
    expect(sh.vertexShader).toContain('instanceMatrix');
  });
});

describe('a minion squeezed between two heroes is drawn clear of both', () => {
  it('pushed out of one hero, it is not left inside the other', async () => {
    const { MinionInstances, MINION_CLEAR } = await import('../../src/render/views/minionInstances');
    const m = new MinionInstances();
    m.heroes = [{ x: 90, z: -30 }, { x: 90.9, z: -30 }];
    const minion = { ...base, id: 101, kind: 'minion', variant: 'melee', team: 0, fx: 90450, fy: 30100 };
    for (let i = 0; i < 3; i++) m.update(frame([minion]), 1 / 60, i / 60);
    const at = m.drawnAt.get(101) as { x: number; z: number };
    for (const h of m.heroes) expect(Math.hypot(at.x - h.x, at.z - h.z)).toBeGreaterThanOrEqual(MINION_CLEAR - 0.25);
  });
});
