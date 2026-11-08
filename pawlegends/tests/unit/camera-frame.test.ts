// @vitest-environment happy-dom
/**
 * Feel pass B1 (docs/plans/moba/FEEL-PASS.md): the fixed match camera. The hero sits at (50%, 54%) of the screen at
 * every phone size, Camera height step and yaw; the framing constants give the planned ground widths; the aim pan
 * only moves for the longest skills and never past 6 m; a peek returns in 150 ms; the fight camera no longer moves
 * the camera and its punch is a vignette.
 */
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { AIM_PAN, FOV, frameDist, groundWidthAt, HERO_AT, PEEK_RETURN_S, PITCH, aimPan, returnShare } from '../../src/render/camera/frame';
import { CAMERA_HEIGHT_KEY, heightFactor, loadCameraHeight, saveCameraHeight, wheelHeight } from '../../src/render/camera/height';
import { placeMatchCamera } from '../../src/render/renderer';
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
      for (const zoom of [heightFactor('normal'), heightFactor('high')])
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
  it('a 7 m skill never pans; the longest skills pan at most 6 m', () => {
    const half = groundWidthAt(frameDist(844, 390), 844, 390) / 2;
    expect(aimPan(7, half)).toBe(0);
    expect(aimPan(11, half)).toBe(0);
    expect(aimPan(16, half)).toBeGreaterThan(0);
    expect(aimPan(16, half)).toBeLessThanOrEqual(AIM_PAN.max);
    expect(aimPan(80, half)).toBe(AIM_PAN.max);
    expect(aimPan(0, half)).toBe(0);
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

  it('Normal by default, remembers High per device, and the wheel only picks one of the two', () => {
    expect(loadCameraHeight()).toBe('normal');
    saveCameraHeight('high');
    expect(localStorage.getItem(CAMERA_HEIGHT_KEY)).toBe('high');
    expect(loadCameraHeight()).toBe('high');
    localStorage.setItem(CAMERA_HEIGHT_KEY, 'zoomed');
    expect(loadCameraHeight()).toBe('normal');
    expect(heightFactor('high')).toBeCloseTo(1.12, 5);
    expect(wheelHeight('normal', 120)).toBe('high');
    expect(wheelHeight('high', -120)).toBe('normal');
  });

  it('the Settings row shows both steps and saves the one tapped', () => {
    const root = document.createElement('div');
    root.innerHTML = cameraHeightRowHtml('normal');
    document.body.appendChild(root);
    const picked: string[] = [];
    const off = bindCameraHeightRow(root, (h) => picked.push(h));
    root.querySelector<HTMLElement>('[data-camh="high"]')!.click();
    expect(picked).toEqual(['high']);
    expect(loadCameraHeight()).toBe('high');
    expect(root.querySelector('[data-camh="high"]')!.classList.contains('on')).toBe(true);
    off();
    root.remove();
  });
});
