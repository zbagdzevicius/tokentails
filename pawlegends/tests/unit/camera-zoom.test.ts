// @vitest-environment happy-dom
/**
 * Camera polish 2026-11-06 (founder: "zoomed in a little too much"): the default view ~17% further out on desktop and
 * phones, the player zoom (wheel, +/−, pinch, the Settings slider) clamped and remembered, the CF-05 intent
 * look-ahead, and the sun's shadow box following the visible ground.
 */
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { isoPitch, isoPosition } from '../../src/render/camera/IsoRig.js';
import { easeLookAhead, LOOK_AHEAD, lookAheadTarget } from '../../src/render/camera/lookAhead';
import { clampZoom, loadZoom, pinchZoom, saveZoom, stepZoom, ZOOM_DEFAULT, ZOOM_KEY, ZOOM_MAX, ZOOM_MAX_WIDE, ZOOM_MIN, zoomPercent } from '../../src/render/camera/zoom';
import { MOBA_DIST, MOBA_PITCH_DROP, SHADOW_BOX, SHORT_LANDSCAPE_ZOOM, shadowHalfFor } from '../../src/render/renderer';
import { CAMERA_FRAME } from '../../src/render/gameView';
import { actionFor, keyLabel } from '../../src/input/presets';
import { bindZoomRow, zoomRowHtml } from '../../src/ui/zoomSlider';
import { PINCH_PX, pinchCommitted, stickSteersAlone, TAP } from '../../src/input/touch/touchControls';

/** The old default zoom (before this pass). */
const OLD_DEFAULT = 0.88;

/** Ground width (m) across the focus row for a viewport, with the renderer's camera maths. */
function widthAtFocus(w: number, h: number, zoom: number): number {
  const short = h <= 480 && w / h >= 1.6;
  const d = MOBA_DIST * zoom * (short ? SHORT_LANDSCAPE_ZOOM : 1);
  const cam = new THREE.PerspectiveCamera(38, w / h, 0.5, 300);
  const p = { x: 0, y: 0, z: 0 };
  isoPosition({ x: 0, y: 0, z: 0 }, 0, Math.max(0.8, isoPitch(d) - MOBA_PITCH_DROP), d, p);
  cam.position.set(p.x, p.y, p.z);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const ground = (x: number): THREE.Vector3 => {
    const r = new THREE.Vector3(x, 0, 0.5).unproject(cam).sub(cam.position);
    return cam.position.clone().addScaledVector(r, -cam.position.y / r.y);
  };
  return ground(1).distanceTo(ground(-1));
}

describe('default framing', () => {
  it('the default view is 15–20% further out than before, on desktop and on phones', () => {
    const k = ZOOM_DEFAULT / OLD_DEFAULT;
    expect(k).toBeGreaterThanOrEqual(1.15);
    expect(k).toBeLessThanOrEqual(1.2);
    for (const [w, h] of [
      [1440, 900],
      [844, 390],
      [667, 375],
    ]) {
      const grow = widthAtFocus(w, h, ZOOM_DEFAULT) / widthAtFocus(w, h, OLD_DEFAULT);
      expect(grow, `${w}x${h}`).toBeGreaterThan(1.12);
      expect(grow, `${w}x${h}`).toBeLessThan(1.3);
    }
  });

  it('a 667x375 phone shows the longest skill (12 m) and a tower reach (7 m) on each side of the focus row', () => {
    const wide = widthAtFocus(667, 375, ZOOM_DEFAULT);
    expect(wide).toBeGreaterThan(24);
    expect(wide / 2).toBeGreaterThan(12);
    expect(widthAtFocus(1440, 900, ZOOM_DEFAULT)).toBeGreaterThan(30);
  });

  it('the default sits inside the player range, with room both ways', () => {
    expect(ZOOM_MIN).toBeLessThan(ZOOM_DEFAULT * 0.8);
    expect(ZOOM_MAX).toBeGreaterThan(ZOOM_DEFAULT * 1.2);
    expect(ZOOM_MAX_WIDE).toBeGreaterThan(ZOOM_MAX);
  });

  it('CF-05: the short-landscape lift is lower than the old −1.5 m', () => {
    expect(CAMERA_FRAME.shortBelow).toBeGreaterThan(-1.5);
    expect(CAMERA_FRAME.shortBelow).toBeLessThan(0);
  });
});

describe('player zoom', () => {
  beforeEach(() => localStorage.clear());

  it('starts at the default, remembers a choice under the v2 key and clamps what it reads', () => {
    expect(loadZoom()).toBe(ZOOM_DEFAULT);
    // a zoom saved against the old default is not carried over
    localStorage.setItem('pawlegends.zoom', '0.8');
    expect(loadZoom()).toBe(ZOOM_DEFAULT);
    saveZoom(1.2);
    expect(localStorage.getItem(ZOOM_KEY)).toBe('1.200');
    expect(loadZoom()).toBeCloseTo(1.2, 5);
    localStorage.setItem(ZOOM_KEY, '9');
    expect(loadZoom()).toBe(ZOOM_MAX_WIDE);
    localStorage.setItem(ZOOM_KEY, 'junk');
    expect(loadZoom()).toBe(ZOOM_DEFAULT);
  });

  it('+/− step like a wheel notch and stop at the limits', () => {
    const out = stepZoom(1, 1);
    expect(out).toBeGreaterThan(1.07);
    expect(out).toBeLessThan(1.12);
    expect(stepZoom(1, -1)).toBeLessThan(0.94);
    let z = ZOOM_DEFAULT;
    for (let i = 0; i < 40; i++) z = stepZoom(z, 1);
    expect(z).toBe(ZOOM_MAX);
    for (let i = 0; i < 40; i++) z = stepZoom(z, 1, ZOOM_MAX_WIDE);
    expect(z).toBe(ZOOM_MAX_WIDE);
    for (let i = 0; i < 80; i++) z = stepZoom(z, -1);
    expect(z).toBe(ZOOM_MIN);
  });

  it('+ and − (main row and keypad) are the zoom keys', () => {
    expect(actionFor('Equal')).toBe('zoomIn');
    expect(actionFor('NumpadAdd')).toBe('zoomIn');
    expect(actionFor('Minus')).toBe('zoomOut');
    expect(actionFor('NumpadSubtract')).toBe('zoomOut');
    expect(keyLabel('zoomIn')).toBe('+');
  });

  it('a pinch: spreading the fingers zooms in, pinching them together zooms out, both clamped', () => {
    expect(pinchZoom(1, 100, 200)).toBeCloseTo(Math.max(ZOOM_MIN, 0.5), 5);
    expect(pinchZoom(1, 200, 160)).toBeCloseTo(1.25, 5);
    expect(pinchZoom(1, 200, 20)).toBe(ZOOM_MAX);
    expect(pinchZoom(1.1, 0, 50)).toBe(clampZoom(1.1));
  });

  it('the slider shows the view against the default and saves what it is moved to', () => {
    expect(zoomPercent(ZOOM_DEFAULT)).toBe(100);
    const root = document.createElement('div');
    root.innerHTML = zoomRowHtml();
    document.body.appendChild(root);
    const seen: number[] = [];
    bindZoomRow(root, (z) => seen.push(z));
    const input = root.querySelector<HTMLInputElement>('input[data-zoom]')!;
    expect(Number(input.min)).toBe(ZOOM_MIN);
    expect(Number(input.value)).toBeCloseTo(ZOOM_DEFAULT, 2);
    input.value = '1.2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen.at(-1)).toBeCloseTo(1.2, 5);
    expect(loadZoom()).toBeCloseTo(1.2, 5);
    expect(root.querySelector('[data-zoom-out]')!.textContent).toBe(`${zoomPercent(1.2)}%`);
    root.querySelector<HTMLElement>('[data-zoom-reset]')!.click();
    expect(loadZoom()).toBe(ZOOM_DEFAULT);
    expect(seen.at(-1)).toBe(ZOOM_DEFAULT);
    root.remove();
  });

  it('an open slider follows a zoom saved elsewhere (+/−, the wheel or a pinch while the pause menu is up)', () => {
    const root = document.createElement('div');
    root.innerHTML = zoomRowHtml();
    document.body.appendChild(root);
    const seen: number[] = [];
    bindZoomRow(root, (z) => seen.push(z));
    saveZoom(1.25);
    expect(Number(root.querySelector<HTMLInputElement>('input[data-zoom]')!.value)).toBeCloseTo(1.25, 2);
    expect(root.querySelector('[data-zoom-out]')!.textContent).toBe(`${zoomPercent(1.25)}%`);
    // showing a zoom saved elsewhere does not call back into the match (it already has it)
    expect(seen).toEqual([]);
    root.remove();
    saveZoom(1.1);
    expect(root.querySelector('[data-zoom-out]')!.textContent).toBe(`${zoomPercent(1.25)}%`);
  });
});

describe('CF-05 intent look-ahead', () => {
  const t = { x: 0, z: 0 };
  it('leads toward the walking direction, more on the short down-screen side, nothing when standing', () => {
    lookAheadTarget({ vx: 4, vz: 0, aimDx: null, aimDz: null, scale: 1 }, t);
    expect(t.x).toBeCloseTo(LOOK_AHEAD.move, 5);
    expect(t.z).toBe(0);
    lookAheadTarget({ vx: 0, vz: 4, aimDx: null, aimDz: null, scale: 1 }, t);
    expect(t.z).toBeGreaterThan(LOOK_AHEAD.move);
    expect(t.z).toBeLessThanOrEqual(LOOK_AHEAD.max + 1e-9);
    lookAheadTarget({ vx: 0.3, vz: 0.2, aimDx: null, aimDz: null, scale: 1 }, t);
    expect(t.x).toBe(0);
    expect(t.z).toBe(0);
  });

  it('an aimed skill wins over the walk, and the lead grows with the zoom', () => {
    lookAheadTarget({ vx: 4, vz: 0, aimDx: 0, aimDz: -6, scale: 1 }, t);
    expect(t.x).toBeCloseTo(0, 9);
    expect(t.z).toBeCloseTo(-LOOK_AHEAD.aim, 5);
    lookAheadTarget({ vx: 0, vz: 0, aimDx: 0, aimDz: -6, scale: 1.3 }, t);
    expect(t.z).toBeCloseTo(-LOOK_AHEAD.aim * 1.3, 5);
  });

  it('eases in over a fraction of a second, not in one frame', () => {
    const cur = { x: 0, z: 0 };
    easeLookAhead(cur, { x: 2, z: 0 }, 1 / 60);
    expect(cur.x).toBeGreaterThan(0);
    expect(cur.x).toBeLessThan(0.2);
    for (let i = 0; i < 120; i++) easeLookAhead(cur, { x: 2, z: 0 }, 1 / 60);
    expect(cur.x).toBeCloseTo(2, 1);
  });
});

describe('shadow box', () => {
  it('follows the visible ground in 2 m steps, clamped', () => {
    expect(shadowHalfFor(20)).toBe(24);
    expect(shadowHalfFor(25)).toBe(28);
    expect(shadowHalfFor(0)).toBe(SHADOW_BOX.min);
    expect(shadowHalfFor(400)).toBe(SHADOW_BOX.max);
    expect(shadowHalfFor(Infinity)).toBe(SHADOW_BOX.max);
  });
});

describe('pinch next to the joystick (QA 2026-11-07)', () => {
  const pt = (x0: number, y0: number, x = x0, y = y0) => ({ x0, y0, x, y });
  it('a second-finger tap or a steering thumb alone never becomes a pinch', () => {
    // the thumb steers 40 px while the other finger rests: the gap changes, but one finger did not move
    expect(pinchCommitted(pt(150, 250, 190, 250), pt(520, 160))).toBe(false);
    // a tap that wobbles within TAP.px
    expect(pinchCommitted(pt(150, 250, 190, 250), pt(520, 160, 520 + TAP.px - 1, 160))).toBe(false);
  });
  it('both fingers spreading or closing by PINCH_PX is a pinch', () => {
    expect(pinchCommitted(pt(360, 210, 345, 210), pt(440, 210, 455, 210))).toBe(true);
    expect(pinchCommitted(pt(300, 210, 315, 210), pt(500, 210, 485, 210))).toBe(true);
    // both moved, the same way (a two-finger drag): the gap barely changes
    expect(pinchCommitted(pt(300, 210, 320, 230), pt(500, 210, 520, 230 + PINCH_PX / 2))).toBe(false);
  });
});

describe('a still joystick that starts steering alone leaves the pinch (QA 2026-11-07)', () => {
  const pt = (x0: number, y0: number, x = x0, y = y0) => ({ x0, y0, x, y });
  it('the thumb pushed 50 px while the other finger rests: steering alone', () => {
    expect(stickSteersAlone(pt(150, 250, 200, 250), pt(520, 160))).toBe(true);
    expect(stickSteersAlone(pt(150, 250, 200, 250), pt(520, 160, 520 + TAP.px, 160))).toBe(true);
  });
  it('both fingers moving (a pinch on its way), or a thumb still inside 2 × TAP.px: not yet', () => {
    expect(stickSteersAlone(pt(360, 210, 330, 210), pt(440, 210, 470, 210))).toBe(false);
    expect(stickSteersAlone(pt(360, 210, 360 - TAP.px * 2, 210), pt(440, 210))).toBe(false);
    // the symmetric pinch of the e2e spec: whichever finger's move lands first, the other is past TAP.px by then
    expect(stickSteersAlone(pt(360, 210, 360 - 30, 210), pt(440, 210, 440 + 25, 210))).toBe(false);
  });
});
