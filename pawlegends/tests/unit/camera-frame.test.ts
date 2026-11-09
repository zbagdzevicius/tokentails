// @vitest-environment happy-dom
/**
 * Feel pass B1 (docs/plans/moba/FEEL-PASS.md): the fixed match camera. The hero sits at (50%, 54%) of the screen at
 * every phone size, Camera height step and yaw; the framing constants give the planned ground widths; the aim pan
 * only moves for the longest skills and never past 6 m; a peek returns in 150 ms; the fight camera no longer moves
 * the camera and its punch is a vignette.
 */
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { AIM_PAN, FOV, frameDist, groundReach, groundWidthAt, HERO_AT, PEEK_RETURN_S, PITCH, aimPan, reachAlong, returnShare } from '../../src/render/camera/frame';
import { CAMERA_HEIGHT_KEY, CAMERA_HEIGHT_MAX, CAMERA_HEIGHTS, CAMERA_STEPS, heightFactor, loadCameraHeight, parseCameraHeight, saveCameraHeight, stepHeight, wheelHeight } from '../../src/render/camera/height';
import { SHADOW_BOX, placeMatchCamera, shadowHalfFor, shadowMaxFor } from '../../src/render/renderer';
import { CAMERA_YAW } from '../../src/render/coords';
import { OUTER_DRESS } from '../../src/render/views/mapView';
import { FightCam, PUNCH_VIGNETTE } from '../../src/render/anim/cam';
import { bindCameraHeightRow, cameraHeightRowHtml } from '../../src/ui/cameraHeightRow';

const SIZES: [number, number][] = [
  [667, 375],
  [844, 390],
  [1440, 900],
];

/** Screen px of world point p for a camera placed on `focus`. */
function screenOf(cam: THREE.PerspectiveCamera, p: THREE.Vector3, w: number, h: number): { x: number; y: number } {
  const v = p.clone().project(cam);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

describe('fixed framing', () => {
  it('puts the hero (the focus) at 50% across and 54% down, ±2 px, at every size, height step and yaw', () => {
    const cam = new THREE.PerspectiveCamera();
    for (const [w, h] of SIZES)
      for (const zoom of CAMERA_STEPS.map(heightFactor))
        for (const yaw of [0, -0.66, -0.66 + Math.PI, 1.3]) {
          const hero = new THREE.Vector3(37, 0, -21);
          placeMatchCamera(cam, hero, yaw, w, h, zoom);
          const s = screenOf(cam, hero, w, h);
          expect(Math.abs(s.x - HERO_AT.x * w)).toBeLessThanOrEqual(2);
          expect(Math.abs(s.y - HERO_AT.y * h)).toBeLessThanOrEqual(2);
        }
  });

  it('a walking hero stays on its spot: the camera follows rigidly (every frame the same screen px)', () => {
    const cam = new THREE.PerspectiveCamera();
    const [w, h] = [844, 390];
    const spots: { x: number; y: number }[] = [];
    for (let t = 0; t < 60; t++) {
      const hero = new THREE.Vector3(20 + t * 0.12, 0, -30 + Math.sin(t / 7) * 3);
      placeMatchCamera(cam, hero, -0.66, w, h);
      spots.push(screenOf(cam, hero, w, h));
    }
    const xs = spots.map((s) => s.x);
    const ys = spots.map((s) => s.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2);
  });

  it('pitch 52°, FOV 36°, 26 m across the hero row at 667x375 and 30 m at 844x390, ~27.8 m on desktop', () => {
    expect((PITCH * 180) / Math.PI).toBeCloseTo(52, 5);
    expect(FOV).toBe(36);
    expect(groundWidthAt(frameDist(667, 375), 667, 375)).toBeCloseTo(26, 3);
    expect(groundWidthAt(frameDist(844, 390), 844, 390)).toBeCloseTo(30, 3);
    expect(frameDist(844, 390)).toBeCloseTo(21.3, 1);
    expect(frameDist(667, 375)).toBeCloseTo(22.5, 1);
    expect(groundWidthAt(frameDist(1440, 900), 1440, 900)).toBeGreaterThan(27.3);
    expect(groundWidthAt(frameDist(1440, 900), 1440, 900)).toBeLessThan(28.3);
    // between the two phones it is linear, outside it is clamped
    const mid = groundWidthAt(frameDist(756, 380), 756, 380);
    expect(mid).toBeGreaterThan(27.8);
    expect(mid).toBeLessThan(28.2);
    expect(groundWidthAt(frameDist(600, 360), 600, 360)).toBeCloseTo(26, 3);
    expect(groundWidthAt(frameDist(932, 430), 932, 430)).toBeCloseTo(30, 3);
  });
});

describe('aim pan and peek return', () => {
  it('the aim pan stays within 6 m at every Camera height step and viewport', () => {
    for (const [w, h] of SIZES)
      for (const z of CAMERA_STEPS.map(heightFactor)) {
        const r = groundReach(frameDist(w, h) * z, w, h);
        for (const range of [7, 12, 16, 30, 80]) for (const [x, y] of [[1, 0], [0, 1], [0, -1]]) expect(aimPan(range, reachAlong(x, y, r))).toBeLessThanOrEqual(AIM_PAN.max);
      }
  });

  it('a 7 m skill never pans; the longest skills pan at most 6 m', () => {
    const half = groundWidthAt(frameDist(844, 390), 844, 390) / 2;
    expect(aimPan(7, half)).toBe(0);
    expect(aimPan(11, half)).toBe(0);
    expect(aimPan(16, half)).toBeGreaterThan(0);
    expect(aimPan(16, half)).toBeLessThanOrEqual(AIM_PAN.max);
    expect(aimPan(80, half)).toBe(AIM_PAN.max);
    expect(aimPan(0, half)).toBe(0);
  });

  for (const [w, h] of [
    [667, 375],
    [844, 390],
  ] as const)
    it(`${w}x${h}: the visible reach up and down the screen matches the camera, and a down-screen 9 m skill pans`, () => {
      const cam = new THREE.PerspectiveCamera();
      const d = frameDist(w, h);
      // yaw 0: screen-up on the ground is −Z
      placeMatchCamera(cam, new THREE.Vector3(0, 0, 0), 0, w, h);
      const r = groundReach(d, w, h);
      expect(screenOf(cam, new THREE.Vector3(0, 0, r.down), w, h).y).toBeCloseTo(h, 0);
      expect(screenOf(cam, new THREE.Vector3(0, 0, -r.up), w, h).y).toBeCloseTo(0, 0);
      expect(r.down).toBeGreaterThan(6);
      expect(r.down).toBeLessThan(8);
      expect(r.up).toBeGreaterThan(r.down * 1.6);
      expect(reachAlong(1, 0, r)).toBeCloseTo(r.side, 6);
      expect(reachAlong(0, -1, r)).toBeCloseTo(r.down, 6);
      // a 9 m skill: no pan aimed sideways or up, a pan aimed down-screen (it would end under the thumbs)
      expect(aimPan(9, reachAlong(1, 0, r))).toBe(0);
      expect(aimPan(9, reachAlong(0, 1, r))).toBe(0);
      expect(aimPan(9, reachAlong(0, -1, r))).toBeGreaterThan(2);
    });

  it('the return to the hero eases out and is done in 150 ms', () => {
    expect(PEEK_RETURN_S).toBeCloseTo(0.15, 5);
    expect(returnShare(0)).toBe(1);
    expect(returnShare(0.05)).toBeGreaterThan(returnShare(0.1));
    expect(returnShare(0.15)).toBe(0);
    expect(returnShare(1)).toBe(0);
  });
});

describe('fight camera', () => {
  it('never moves or zooms the camera; the own punch is a vignette, none under reduce motion', () => {
    const fc = new FightCam(null);
    expect('extra' in fc).toBe(false);
    expect('leanX' in fc).toBe(false);
    const got: [number, number][] = [];
    fc.onPunch = (ms, dark) => got.push([ms, dark]);
    fc.punch(0.05);
    expect(got).toEqual([[PUNCH_VIGNETTE.ms, PUNCH_VIGNETTE.dark]]);
    fc.reduced = true;
    fc.punch(0.05);
    expect(got.length).toBe(1);
  });

  it('still raises the fight flag for 4 heroes trading hits within 10 m', () => {
    const fc = new FightCam(null);
    fc.damage(0);
    fc.damage(1);
    const hs = [0, 1, 0, 1].map((team, i) => ({ x: i, z: 0, team, dead: false }));
    fc.update(0.016, hs, hs.length, 0, 0, true);
    expect(fc.fight).toBe(true);
  });
});

describe('Camera height setting', () => {
  beforeEach(() => localStorage.clear());

  it('five steps, closest first; Normal by default; any step name is remembered, anything else is Normal', () => {
    expect(CAMERA_STEPS).toEqual(['close', 'normal', 'high', 'higher', 'max']);
    expect(CAMERA_STEPS.map(heightFactor)).toEqual([0.88, 1, 1.12, 1.25, 1.4]);
    expect(loadCameraHeight()).toBe('normal');
    for (const h of CAMERA_STEPS) {
      saveCameraHeight(h);
      expect(localStorage.getItem(CAMERA_HEIGHT_KEY)).toBe(h);
      expect(loadCameraHeight()).toBe(h);
    }
    // an old 'high' keeps working; anything else is Normal
    localStorage.setItem(CAMERA_HEIGHT_KEY, 'high');
    expect(loadCameraHeight()).toBe('high');
    for (const bad of ['zoomed', '', 'HIGH', '1.4', 'constructor', 'toString'] as const) {
      localStorage.setItem(CAMERA_HEIGHT_KEY, bad);
      expect(loadCameraHeight()).toBe('normal');
    }
    expect(parseCameraHeight(null)).toBe('normal');
    expect(parseCameraHeight(1.4)).toBe('normal');
    expect(heightFactor('high')).toBeCloseTo(1.12, 5);
    expect(wheelHeight('normal', 120)).toBe('high');
    expect(wheelHeight('high', -120)).toBe('normal');
  });

  it('a step moves one at a time and clamps at both ends (no wrap)', () => {
    let h = stepHeight('close', 0);
    expect(h).toBe('close');
    const out: string[] = [];
    for (let i = 0; i < 6; i++) out.push((h = stepHeight(h, 1)));
    expect(out).toEqual(['normal', 'high', 'higher', 'max', 'max', 'max']);
    const back: string[] = [];
    for (let i = 0; i < 6; i++) back.push((h = stepHeight(h, -5)));
    expect(back).toEqual(['higher', 'high', 'normal', 'close', 'close', 'close']);
  });

  it('the row is a five-way control at the current step and saves the one tapped; it follows the wheel', () => {
    const root = document.createElement('div');
    root.innerHTML = cameraHeightRowHtml('normal');
    document.body.appendChild(root);
    const segs = [...root.querySelectorAll<HTMLElement>('[data-camh]')];
    expect(segs.map((b) => b.dataset.camh)).toEqual([...CAMERA_STEPS]);
    expect(segs.map((b) => b.textContent)).toEqual(['Close', 'Normal', 'High', 'Higher', 'Max']);
    expect(segs.filter((b) => b.classList.contains('on')).map((b) => b.dataset.camh)).toEqual(['normal']);
    expect(root.querySelector('[data-camh="normal"]')!.getAttribute('aria-pressed')).toBe('true');
    const picked: string[] = [];
    const off = bindCameraHeightRow(root, (h) => picked.push(h));
    root.querySelector<HTMLElement>('[data-camh="max"]')!.click();
    root.querySelector<HTMLElement>('[data-camh="close"]')!.click();
    expect(picked).toEqual(['max', 'close']);
    expect(loadCameraHeight()).toBe('close');
    expect(root.querySelectorAll('.on').length).toBe(1);
    expect(root.querySelector('[data-camh="close"]')!.classList.contains('on')).toBe(true);
    // the wheel (saveCameraHeight elsewhere) moves the highlight too
    saveCameraHeight('higher');
    expect(root.querySelector('[data-camh="higher"]')!.classList.contains('on')).toBe(true);
    expect(root.querySelectorAll('.on').length).toBe(1);
    expect(cameraHeightRowHtml('max')).toContain('data-camh="max" aria-pressed="true"');
    off();
    root.remove();
  });
});

describe('view-sized bounds at every Camera height step', () => {
  /** The view's ground corners for a camera on `focus` (null when a corner looks at the sky). */
  const groundCorners = (cam: THREE.PerspectiveCamera): THREE.Vector3[] | null => {
    const out: THREE.Vector3[] = [];
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const r = new THREE.Vector3(x, y, 0.5).unproject(cam).sub(cam.position);
      if (r.y >= -1e-4) return null;
      const t = -cam.position.y / r.y;
      out.push(new THREE.Vector3(cam.position.x + r.x * t, 0, cam.position.z + r.z * t));
    }
    return out;
  };

  it('the sun shadow box covers the whole visible ground up to Max, on phones, desktop and portrait (no clamp)', () => {
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 300);
    for (const [w, h] of [...SIZES, [1024, 768], [390, 844]] as [number, number][])
      for (const h0 of CAMERA_STEPS) {
        placeMatchCamera(cam, new THREE.Vector3(37, 0, -21), CAMERA_YAW, w, h, heightFactor(h0));
        const cs = groundCorners(cam)!;
        const c = cs.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(0.25);
        const far = Math.max(...cs.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
        const half = shadowHalfFor(far, shadowMaxFor(heightFactor(h0), 'med'));
        expect(half, `${w}x${h} ${h0}`).toBeGreaterThanOrEqual(far);
        expect(half).toBeLessThanOrEqual(SHADOW_BOX.max);
      }
  });

  it('at Max on every map corner, for both seats, every screen corner lands on the dressed outer ground', () => {
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 300);
    const W = 100;
    const H = 60;
    // landscape only: a portrait phone shows a rotate prompt instead of the match
    for (const [w, h] of SIZES)
      for (const yaw of [CAMERA_YAW, CAMERA_YAW + Math.PI])
        for (const [fx, fz] of [[0, 2], [W, 2], [0, -H - 2], [W, -H - 2]]) {
          placeMatchCamera(cam, new THREE.Vector3(fx, 0, fz), yaw, w, h, CAMERA_HEIGHT_MAX);
          for (const p of groundCorners(cam)!) {
            const sx = p.x;
            const sy = -p.z;
            expect(sx, `${w}x${h} ${fx},${fz}`).toBeGreaterThanOrEqual(-OUTER_DRESS.west);
            expect(sx).toBeLessThanOrEqual(W + OUTER_DRESS.east);
            expect(sy).toBeGreaterThanOrEqual(-OUTER_DRESS.south);
            expect(sy, `${w}x${h} ${fx},${fz}`).toBeLessThanOrEqual(H + OUTER_DRESS.north);
          }
        }
    expect(CAMERA_HEIGHT_MAX).toBe(CAMERA_HEIGHTS.max);
  });
});
