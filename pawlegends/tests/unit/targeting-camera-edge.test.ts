/**
 * TARGETING.md §2, live check (Nov 16): the body pick projects each unit's selection cylinder. A tower under or
 * behind the camera (the desktop camera over the enemy base, the mid tower behind it) projected as a capsule
 * thousands of px wide, so every click on a hero, a minion or the core picked that tower. `screenBodies` now drops a
 * body that is not wholly in front of the camera or whose feet and head are both far off screen.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PICK_BODY, pickBody, screenBodies } from '../../src/input/unitPick';

const W = 1440;
const H = 900;
const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 }) } as unknown as HTMLElement;

/** The live camera of a 5v5 peek at the enemy core (fov 36, 21 m up, 16.4 m back from the focus). */
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(36, W / H, 0.5, 400);
  c.position.set(112, 21, -95.6);
  c.lookAt(112, 0, -112);
  c.updateMatrixWorld();
  return c;
}

const s = (id: number, kind: keyof typeof PICK_BODY, xm: number, zm: number) => ({ id, kind, x: xm * 1000, y: -zm * 1000 });

describe('body pick near the camera plane', () => {
  const core = s(129, 'core', 112, -112);
  const inner = s(127, 'tower', 106.5, -115.5);
  // the mid towers behind the camera: one with its head behind the near plane, one under the camera
  const under = s(124, 'tower', 120, -74);
  const below = s(120, 'tower', 82, -82);
  const behind = s(123, 'tower', 120, -48);

  it('drops structures under or behind the camera instead of projecting a giant capsule', () => {
    const bodyOf = screenBodies(camera(), canvas);
    for (const u of [under, below, behind]) expect(bodyOf(u)).toBeNull();
    for (const u of [core, inner]) {
      const b = bodyOf(u);
      expect(b).not.toBeNull();
      expect(b!.r).toBeLessThan(H / 3);
    }
  });

  it('a click on the core or a hero beside it is not taken by a tower behind the camera', () => {
    const bodyOf = screenBodies(camera(), canvas);
    const hero = s(7, 'hero', 108, -108);
    const all = [under, below, behind, inner, core, hero];
    const cb = bodyOf(core)!;
    expect(pickBody(all, bodyOf, (cb.fx + cb.hx) / 2, (cb.fy + cb.hy) / 2)?.id).toBe(129);
    const hb = bodyOf(hero)!;
    expect(pickBody(all, bodyOf, (hb.fx + hb.hx) / 2, (hb.fy + hb.hy) / 2)?.id).toBe(7);
    // empty ground at the bottom of the screen picks nothing
    expect(pickBody(all, bodyOf, 200, H - 20)).toBeNull();
  });

  it('a tall tower whose feet are just below the bottom edge still counts', () => {
    const c = camera();
    // a tower placed so its feet project ~10% below the screen
    const bodyOf = screenBodies(c, canvas);
    let found = false;
    for (let z = -106; z < -96 && !found; z += 0.1) {
      const t = s(200, 'tower', 112, z);
      const v = new THREE.Vector3(112, 0, z).project(c);
      if (v.y < -1.05 && v.y > -1.3) {
        const b = bodyOf(t);
        expect(b).not.toBeNull();
        expect(b!.hy).toBeLessThan(H);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});
