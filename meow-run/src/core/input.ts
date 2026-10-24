// Gameplay input: keyboard and touch gestures. FROZEN.
// Keyboard: A/D or arrows steer, Space/W/Up jump (again in the air = pounce), S/Down slide (in the air: fast fall),
// E/Shift ability, Esc/P pause (only while playing; resuming and menu keys belong to meta-ui).
// Touch (anywhere that is not a button / .ui element): drag sideways = analog steer, flick left/right = dodge,
// swipe up = jump, swipe down = slide, tap = ability.
import { initAudio } from '../audio/synth';
import { isTouch } from './engine';
import type { Action } from './types';

export const keys = new Set<string>();

export const input = {
  /** analog steer from a touch drag, -1..1 */
  touchSteer: 0,
  /** remaining seconds of a flick dodge, and its direction */
  dodgeT: 0,
  dodgeDir: 0,
  /** bots and tests: when not null it replaces the human steer (-1..1) */
  botSteer: null as number | null,
  /** last gesture for the HUD hints: 'swipe-up' | 'swipe-down' | 'flick-left' | 'flick-right' | 'tap' | '' */
  lastGesture: '',
};

let handler: (a: Action) => void = () => {};

/** Synthetic action (touch buttons, bots, tests). Same path as a key press. */
export function press(a: Action): void {
  handler(a);
}

/** -1..1, + = right. Keyboard + touch drag + flick dodge, or the bot override. */
export function steerAxis(): number {
  if (input.botSteer !== null) return Math.max(-1, Math.min(1, input.botSteer));
  let v = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) v -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) v += 1;
  v += input.touchSteer;
  if (input.dodgeT > 0) v += input.dodgeDir;
  return Math.max(-1, Math.min(1, v));
}

/** fixed step: decay the flick dodge */
export function stepInput(dt: number): void {
  if (input.dodgeT > 0) input.dodgeT = Math.max(0, input.dodgeT - dt);
}

export function releaseAll(): void {
  keys.clear();
  input.touchSteer = 0;
  input.dodgeT = 0;
  gestures.clear();
}

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'jump',
  KeyW: 'jump',
  ArrowUp: 'jump',
  KeyS: 'slide',
  ArrowDown: 'slide',
  KeyE: 'ability',
  ShiftLeft: 'ability',
  ShiftRight: 'ability',
  Escape: 'pause',
  KeyP: 'pause',
};

interface Gesture {
  x0: number;
  y0: number;
  t0: number;
  steering: boolean;
  fired: boolean;
}
const gestures = new Map<number, Gesture>();
const FLICK_PX = 38;
const FLICK_MS = 320;
const DRAG_PX = 60; // drag distance for full steer
const TAP_PX = 14;
const TAP_MS = 260;

/** True when the event target is UI (buttons, menus) that should keep the pointer. */
const isUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, label, .ui');

export function initInput(onAction: (a: Action) => void): void {
  handler = onAction;
  addEventListener('keydown', (e) => {
    initAudio();
    const a = KEY_ACTIONS[e.code];
    if (a && !(e.target instanceof HTMLInputElement)) {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) keys.add(e.code);
      if (!e.repeat) onAction(a);
      return;
    }
    if (!e.repeat) keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll());

  if (isTouch) document.body.classList.add('touch');
  addEventListener('pointerdown', (e) => {
    initAudio();
    if (e.pointerType === 'mouse' || isUi(e.target)) return;
    gestures.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: performance.now(), steering: false, fired: false });
  });
  addEventListener('pointermove', (e) => {
    const g = gestures.get(e.pointerId);
    if (!g) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const ms = performance.now() - g.t0;
    // vertical swipes fire as soon as they are recognisable (responsive jumps)
    if (!g.fired && !g.steering && ms < FLICK_MS && Math.abs(dy) > FLICK_PX && Math.abs(dy) > Math.abs(dx) * 1.2) {
      g.fired = true;
      input.lastGesture = dy < 0 ? 'swipe-up' : 'swipe-down';
      onAction(dy < 0 ? 'jump' : 'slide');
      return;
    }
    if (!g.fired && Math.abs(dx) > TAP_PX && Math.abs(dx) >= Math.abs(dy)) g.steering = true;
    if (g.steering) input.touchSteer = Math.max(-1, Math.min(1, dx / DRAG_PX));
  });
  const end = (e: PointerEvent) => {
    const g = gestures.get(e.pointerId);
    if (!g) return;
    gestures.delete(e.pointerId);
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const ms = performance.now() - g.t0;
    if (g.steering) {
      input.touchSteer = 0;
      // a quick sideways flick also nudges (a dodge) after the finger lifts
      if (ms < FLICK_MS && Math.abs(dx) > FLICK_PX) {
        input.dodgeDir = Math.sign(dx);
        input.dodgeT = 0.16;
        input.lastGesture = dx < 0 ? 'flick-left' : 'flick-right';
      }
      return;
    }
    if (!g.fired && e.type === 'pointerup' && ms < TAP_MS && Math.hypot(dx, dy) < TAP_PX) {
      input.lastGesture = 'tap';
      onAction('ability');
    }
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}
