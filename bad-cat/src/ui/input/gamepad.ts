/**
 * Gamepad input (GDD 5.2, deferred past M2, built for the full game): the left stick or the d-pad moves (the same
 * 8-way quantiser with hysteresis as the touch stick, so a pad feels like the thumb), A jumps, X or B swats, Y grabs,
 * Start pauses. Polled once per sim tick through the Gamepad API; button presses are latched on the rising edge so a
 * tap shorter than a tick still counts, exactly like the keyboard. No pad (or no API): every read is at rest.
 */
import { BTN_GRAB, BTN_JUMP, BTN_SWAT, type Dir8, type Speed } from '../../types';
import { keysToDir, quantiseStick, STICK_REST, type StickState } from './quantise';

/** Stick deflection below this is rest. */
export const PAD_DEAD_ZONE = 0.22;

/** Standard mapping (https://w3c.github.io/gamepad/#remapping) button indices. */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export interface PadSnapshot {
  axes: readonly number[];
  pressed: readonly boolean[];
}

export interface GamepadInput {
  /** Direction + speed now (dir 0 at rest). Call once per tick before take(). */
  read(): { dir: Dir8; speed: Speed };
  /** Button bits pressed since the last take(). */
  take(): number;
  /** True once any pad has been seen (the HUD can switch its hints). */
  readonly connected: boolean;
  setEnabled(on: boolean): void;
  onPause(fn: (() => void) | null): void;
  dispose(): void;
}

type PadSource = () => readonly (PadSnapshot | null)[];

/** The first connected standard pad of `navigator.getGamepads()`, as a plain snapshot. */
function browserPads(): readonly (PadSnapshot | null)[] {
  try {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    const pads = nav?.getGamepads?.() ?? [];
    return Array.from(pads, (p) =>
      p && p.connected ? { axes: Array.from(p.axes), pressed: Array.from(p.buttons, (b) => !!b && (b.pressed || b.value > 0.5)) } : null,
    );
  } catch {
    return [];
  }
}

/** Pure mapping of one pad snapshot to buttons (tested). */
export function padButtons(pressed: readonly boolean[]): number {
  let bits = 0;
  if (pressed[PAD.A]) bits |= BTN_JUMP;
  if (pressed[PAD.X] || pressed[PAD.B]) bits |= BTN_SWAT;
  if (pressed[PAD.Y]) bits |= BTN_GRAB;
  return bits;
}

export function createGamepad(source: PadSource = browserPads): GamepadInput {
  let stick: StickState = STICK_REST;
  let held = 0;
  let latched = 0;
  let startHeld = false;
  let enabled = true;
  let connected = false;
  let pause: (() => void) | null = null;

  const first = (): PadSnapshot | null => {
    for (const p of source()) if (p) return p;
    return null;
  };

  return {
    read() {
      const pad = first();
      if (!pad) {
        stick = STICK_REST;
        held = 0;
        return { dir: 0, speed: 0 };
      }
      connected = true;
      const now = padButtons(pad.pressed);
      if (enabled) latched |= now & ~held;
      held = now;
      const start = !!pad.pressed[PAD.START];
      if (start && !startHeld && enabled) pause?.();
      startHeld = start;
      if (!enabled) {
        stick = STICK_REST;
        return { dir: 0, speed: 0 };
      }
      const dpad = keysToDir(!!pad.pressed[PAD.UP], !!pad.pressed[PAD.RIGHT], !!pad.pressed[PAD.DOWN], !!pad.pressed[PAD.LEFT]);
      if (dpad !== 0) {
        stick = STICK_REST;
        return { dir: dpad, speed: 2 };
      }
      const dx = Number(pad.axes[0]) || 0;
      const dy = Number(pad.axes[1]) || 0;
      // Pads drift more than a thumb on glass: a wider dead zone than the touch stick's.
      if (Math.hypot(dx, dy) < PAD_DEAD_ZONE) {
        stick = STICK_REST;
        return { dir: 0, speed: 0 };
      }
      stick = quantiseStick(stick, dx, dy, 1);
      return { dir: stick.dir, speed: stick.speed };
    },
    take() {
      const out = latched;
      latched = 0;
      return out;
    },
    get connected() {
      return connected;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        stick = STICK_REST;
        latched = 0;
      }
    },
    onPause(fn) {
      pause = fn;
    },
    dispose() {
      pause = null;
    },
  };
}
