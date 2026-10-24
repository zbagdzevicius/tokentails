// Gameplay input: keyboard, mouse and the touch stick/buttons. FROZEN.
// Menu keys (Enter, Esc, P, R) are handled by meta-ui in src/ui/, not here.
import { initAudio } from '../audio/sfx';
import { isTouch, renderer } from './engine';

export const keys = new Set<string>();
export const stick = { x: 0, y: 0, active: false, id: -1, ox: 0, oy: 0 };
export const touchState = { zoom: false };

export interface Actions {
  swat(): void;
  pounce(): void;
  ultra(): void;
}

const $ = (id: string) => document.getElementById(id)!;

export function endStick(): void {
  stick.active = false;
  stick.x = stick.y = 0;
  $('knob').style.display = 'none';
}

export function releaseAll(): void {
  touchState.zoom = false;
  endStick();
  keys.clear();
}

/** Movement input in camera space: x right, z forward, magnitude <= ~1.4 before clamping. */
export function moveInput(out: { x: number; z: number }): void {
  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (stick.active) {
    ix += stick.x;
    iz -= stick.y;
  }
  out.x = ix;
  out.z = iz;
}

export const zoomHeld = () => keys.has('ShiftLeft') || keys.has('ShiftRight') || touchState.zoom;

export function initInput(act: Actions): void {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    initAudio();
    if (e.code === 'KeyJ' || e.code === 'KeyF') act.swat();
    if (e.code === 'Space' || e.code === 'KeyK') {
      e.preventDefault();
      act.pounce();
    }
    if (e.code === 'KeyE' || e.code === 'KeyL' || e.code === 'KeyQ') act.ultra();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  renderer.domElement.addEventListener('pointerdown', (e) => {
    initAudio();
    if (e.pointerType === 'mouse') {
      if (e.button === 0) act.swat();
      if (e.button === 2) act.pounce();
    }
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  if (isTouch) document.body.classList.add('touch');
  const stickEl = $('stick');
  const knob = $('knob');
  stickEl.addEventListener('pointerdown', (e) => {
    initAudio();
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    knob.style.display = 'block';
    knob.style.left = `${e.clientX}px`;
    knob.style.top = `${e.clientY - stickEl.getBoundingClientRect().top}px`;
    try {
      stickEl.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  });
  stickEl.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    const dx = e.clientX - stick.ox;
    const dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, d / 55) / (d || 1);
    stick.x = dx * k;
    stick.y = dy * k;
    (knob.firstElementChild as HTMLElement).style.transform = `translate(${stick.x * 35}px, ${stick.y * 35}px)`;
  });
  stickEl.addEventListener('pointerup', endStick);
  stickEl.addEventListener('pointercancel', endStick);
  const tap = (id: string, fn: () => void) =>
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      fn();
    });
  tap('tbSwat', act.swat);
  tap('tbPounce', act.pounce);
  tap('tbUltra', act.ultra);
  const tbZoom = $('tbZoom');
  tbZoom.addEventListener('pointerdown', (e) => {
    touchState.zoom = true;
    try {
      tbZoom.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) tbZoom.addEventListener(ev, () => (touchState.zoom = false));
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll());
}
