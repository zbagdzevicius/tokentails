/**
 * Feel pass B2 (docs/plans/moba/FEEL-PASS.md): the map reads diagonally, as in LoL and MLBB. For each seat, its own
 * fountain projects left of and below the enemy fountain, the base-to-base line about 31° above the horizontal; a
 * drag up and to the right on screen aims up and to the right of the hero on screen, for both seats.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CAMERA_YAW, cameraYaw, screenToSim, setViewTeam, simToScreen, toX, toZ } from '../../src/render/coords';
import { FOUNTAIN, mirrorX } from '../../src/data/map';
import { placeMatchCamera } from '../../src/render/renderer';

const px = (cam: THREE.PerspectiveCamera, x: number, z: number, w: number, h: number): [number, number] => {
  const v = new THREE.Vector3(x, 0, z).project(cam);
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
};

afterEach(() => setViewTeam(0));

describe('diagonal map', () => {
  it('the ground yaw is −38° (team 1: another 180°)', () => {
    expect((CAMERA_YAW * 180) / Math.PI).toBeCloseTo(-38, 5);
    setViewTeam(1);
    expect(cameraYaw()).toBeCloseTo(CAMERA_YAW + Math.PI, 9);
  });

  for (const team of [0, 1] as const)
    for (const [w, h] of [
      [667, 375],
      [844, 390],
    ] as const)
      it(`team ${team} at ${w}x${h}: own fountain bottom left, enemy fountain top right, 31° ± 3° on screen`, () => {
        setViewTeam(team);
        const own = { x: toX(team === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x)), z: toZ(FOUNTAIN.y) };
        const foe = { x: toX(team === 0 ? mirrorX(FOUNTAIN.x) : FOUNTAIN.x), z: toZ(FOUNTAIN.y) };
        const cam = new THREE.PerspectiveCamera();
        // from the own fountain (spawn) and from mid-map
        for (const at of [own, { x: 50, z: -30 }]) {
          placeMatchCamera(cam, new THREE.Vector3(at.x, 0, at.z), cameraYaw(), w, h);
          const a = px(cam, own.x, own.z, w, h);
          const b = px(cam, foe.x, foe.z, w, h);
          expect(a[0]).toBeLessThan(b[0]);
          expect(a[1]).toBeGreaterThan(b[1]);
          const deg = (Math.atan2(a[1] - b[1], b[0] - a[0]) * 180) / Math.PI;
          expect(Math.abs(deg - 31)).toBeLessThanOrEqual(3);
        }
      });

  for (const team of [0, 1] as const)
    it(`team ${team}: a drag 100 px up and right aims up and right of the hero on screen`, () => {
      setViewTeam(team);
      const [w, h] = [844, 390];
      const cam = new THREE.PerspectiveCamera();
      const hero = { x: 40, z: -25 };
      placeMatchCamera(cam, new THREE.Vector3(hero.x, 0, hero.z), cameraYaw(), w, h);
      // touchControls.dragTarget: screen (dx right, dy UP) → sim direction, × range
      const d = screenToSim(100, 100);
      const l = Math.hypot(d.x, d.y);
      const range = 6000;
      const aimX = hero.x * 1000 + (d.x / l) * range;
      const aimY = -hero.z * 1000 + (d.y / l) * range;
      const p0 = px(cam, hero.x, hero.z, w, h);
      const p1 = px(cam, toX(aimX), toZ(aimY), w, h);
      expect(p1[0]).toBeGreaterThan(p0[0] + 20);
      expect(p1[1]).toBeLessThan(p0[1] - 10);
    });

  for (const team of [0, 1] as const)
    for (const [w, h] of [
      [667, 375],
      [844, 390],
    ] as const)
      it(`team ${team} at ${w}x${h}: a thumb angle lands on the same screen angle (the tilt's ground squash undone)`, () => {
        setViewTeam(team);
        const cam = new THREE.PerspectiveCamera();
        const hero = { x: 40, z: -25 };
        placeMatchCamera(cam, new THREE.Vector3(hero.x, 0, hero.z), cameraYaw(), w, h);
        const p0 = px(cam, hero.x, hero.z, w, h);
        for (const deg of [0, 20, 32, 45, 48, 60, 90, 135, 200, 300]) {
          const r = (deg * Math.PI) / 180;
          const d = screenToSim(Math.cos(r), Math.sin(r));
          const l = Math.hypot(d.x, d.y);
          // a short step (2 m) so the perspective barely bends it
          const p1 = px(cam, hero.x + (d.x / l) * 2, hero.z - (d.y / l) * 2, w, h);
          const got = (Math.atan2(p0[1] - p1[1], p1[0] - p0[0]) * 180) / Math.PI;
          const err = Math.abs(((got - deg + 540) % 360) - 180);
          expect(err).toBeLessThanOrEqual(2);
        }
      });

  it('simToScreen undoes screenToSim for both seats', () => {
    for (const team of [0, 1]) {
      setViewTeam(team);
      for (const [x, y] of [
        [1, 0],
        [0.3, -2],
        [-5, 4],
      ]) {
        const s = screenToSim(x, y);
        const b = simToScreen(s.x, s.y);
        expect(b.x).toBeCloseTo(x, 9);
        expect(b.y).toBeCloseTo(y, 9);
      }
    }
  });
});
