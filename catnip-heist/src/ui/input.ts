/**
 * Input layer: keyboard + gamepad + virtual (touch) sources -> one `Input` per sim tick.
 *
 *   const input = createInput();
 *   input.onPause = () => app.togglePause();
 *   // in the fixed 30 Hz loop:
 *   const inp = input.sample();       // edges (swap/interact/meow) are consumed here
 *
 * Buttons are EDGE-TRIGGERED: a press between two samples yields `true` on exactly one sample,
 * even if the key was released again before the tick ran. Holding a key never repeats.
 * Movement is held state (-1|0|1 per axis), read fresh on every sample with no smoothing or
 * buffering: a keydown is applied on the very next tick, a keyup stops the cat on the next tick.
 * A direction key tapped entirely between two samples still counts for that one sample, so a quick
 * tap always nudges the cat. Opposite directions cancel.
 */
import type { Axis, Input } from '../types';

export type ButtonName = 'swap' | 'interact' | 'meow';
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export interface InputOptions {
  /** Where keyboard events are read. Default: window. */
  target?: EventTarget;
  /**
   * Optional remap from "screen" direction (dx right, dy down) to sim grid direction, e.g. to make
   * Up move diagonally on an isometric camera. Must return -1|0|1 components.
   */
  mapDir?: (dx: Axis, dy: Axis) => [Axis, Axis];
  /** Poll gamepads with requestAnimationFrame (edges are never lost between ticks). Default true. */
  gamepad?: boolean;
}

export interface InputController {
  /** Build the Input for one tick and consume pending button edges. */
  sample(): Input;
  /** Peek at the current held direction without consuming anything. */
  peekDir(): { dx: Axis; dy: Axis };
  /** Virtual button press (touch UI, HUD portrait tap). Counts as one edge. */
  press(button: ButtonName): void;
  /** Virtual analog stick, components in [-1, 1] (y down). Pass (0, 0) to release. */
  setStick(x: number, y: number): void;
  /** Called immediately (not per tick) on Escape / P / gamepad Start. */
  onPause: (() => void) | null;
  /** Called when the last used device changes (e.g. to show/hide touch controls or key hints). */
  onDeviceChange: ((d: InputDevice) => void) | null;
  readonly lastDevice: InputDevice;
  /** While disabled, sample() returns no input and key presses are not latched. */
  setEnabled(on: boolean): void;
  /** Drop held keys and pending edges (call on pause/resume or level start). */
  reset(): void;
  dispose(): void;
}

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const KEY_BUTTONS: Record<string, ButtonName> = {
  KeyQ: 'swap', Tab: 'swap',
  KeyE: 'interact', Enter: 'interact', NumpadEnter: 'interact',
  Space: 'meow',
};
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/** Radial dead zone of the touch joystick (fraction of its radius). Small so it reacts at once. */
export const STICK_DEAD_ZONE = 0.18;
/** Radial dead zone of gamepad sticks (a little larger: physical sticks drift). */
export const PAD_DEAD_ZONE = 0.25;

/** Stick vector -> 8-way digital direction with a radial dead zone. */
export function stickToAxes(x: number, y: number, dead = STICK_DEAD_ZONE): [Axis, Axis] {
  const len = Math.hypot(x, y);
  if (!(len > dead)) return [0, 0];
  // tan(22.5 deg) ~ 0.414: inside that sector only the dominant axis counts.
  const ax = Math.abs(x), ay = Math.abs(y);
  const dx: Axis = ax > 0.414 * ay ? (x > 0 ? 1 : -1) : 0;
  const dy: Axis = ay > 0.414 * ax ? (y > 0 ? 1 : -1) : 0;
  return [dx, dy];
}

function sign(n: number): Axis {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function codeOf(e: Event): string {
  const k = e as KeyboardEvent;
  if (k.code) return k.code;
  // Fallback for synthetic events / old browsers that only set `key`.
  switch (k.key) {
    case ' ': return 'Space';
    case 'Esc': return 'Escape';
    default: return k.key && k.key.length === 1 ? `Key${k.key.toUpperCase()}` : k.key ?? '';
  }
}

function isTypingTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || typeof t.tagName !== 'string') return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true;
}

export function createInput(opts: InputOptions = {}): InputController {
  const target: EventTarget | undefined = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
  const held = new Set<string>();
  /** Direction keys pressed since the last sample (a tap shorter than a tick still moves once). */
  const tapped = new Set<string>();
  const pending = new Set<ButtonName>();
  let stickX = 0, stickY = 0;
  let padDx: Axis = 0, padDy: Axis = 0;
  let enabled = true;
  let device: InputDevice = 'keyboard';
  let prevPad: boolean[] = [];
  let raf = 0;

  const api: InputController = {
    onPause: null,
    onDeviceChange: null,
    get lastDevice() {
      return device;
    },
    sample,
    peekDir,
    press(b) {
      if (!enabled) return;
      pending.add(b);
      setDevice('touch');
    },
    setStick(x, y) {
      stickX = Number.isFinite(x) ? x : 0;
      stickY = Number.isFinite(y) ? y : 0;
      if (x !== 0 || y !== 0) setDevice('touch');
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        pending.clear();
        tapped.clear();
      }
    },
    reset() {
      held.clear();
      tapped.clear();
      pending.clear();
      stickX = stickY = 0;
    },
    dispose() {
      if (target) {
        target.removeEventListener('keydown', onKeyDown);
        target.removeEventListener('keyup', onKeyUp);
        target.removeEventListener('blur', onBlur);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('gamepadconnected', onPadConnected);
      }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };

  function setDevice(d: InputDevice) {
    if (d !== device) {
      device = d;
      api.onDeviceChange?.(d);
    }
  }

  function onKeyDown(e: Event) {
    if (isTypingTarget(e)) return;
    const code = codeOf(e);
    const ke = e as KeyboardEvent;
    if (PAUSE_KEYS.has(code)) {
      if (!ke.repeat) api.onPause?.();
      return;
    }
    const isDir = code in KEY_DIRS;
    const btn = KEY_BUTTONS[code];
    if (!isDir && !btn) return;
    setDevice('keyboard');
    if (!enabled) return;
    // Tab/Space/arrows would scroll or move focus; the game owns them while enabled.
    if (typeof ke.preventDefault === 'function' && !ke.ctrlKey && !ke.metaKey && !ke.altKey) ke.preventDefault();
    if (isDir) {
      held.add(code);
      if (!ke.repeat) tapped.add(code);
    }
    if (btn && !ke.repeat && !held.has(code)) {
      pending.add(btn);
      held.add(code);
    }
  }

  function onKeyUp(e: Event) {
    held.delete(codeOf(e));
  }

  function onBlur() {
    held.clear();
    tapped.clear();
  }

  function keyDir(): [number, number] {
    let x = 0, y = 0;
    const add = (code: string) => {
      const d = KEY_DIRS[code];
      if (d) {
        x += d[0];
        y += d[1];
      }
    };
    for (const code of held) add(code);
    // Taps already released before this sample (held ones were counted above).
    for (const code of tapped) if (!held.has(code)) add(code);
    return [sign(x), sign(y)];
  }

  function peekDir(): { dx: Axis; dy: Axis } {
    let [dx, dy] = keyDir() as [Axis, Axis];
    if (dx === 0 && dy === 0) [dx, dy] = stickToAxes(stickX, stickY);
    if (dx === 0 && dy === 0) {
      dx = padDx;
      dy = padDy;
    }
    if (opts.mapDir && (dx !== 0 || dy !== 0)) [dx, dy] = opts.mapDir(dx, dy);
    return { dx, dy };
  }

  function sample(): Input {
    if (typeof window !== 'undefined' && !raf) pollPads();
    if (!enabled) {
      pending.clear();
      tapped.clear();
      return { dx: 0, dy: 0, swap: false, interact: false, meow: false };
    }
    const { dx, dy } = peekDir();
    const out: Input = { dx, dy, swap: pending.has('swap'), interact: pending.has('interact'), meow: pending.has('meow') };
    pending.clear();
    tapped.clear();
    return out;
  }

  // ---- gamepad ---------------------------------------------------------------------------------
  const PAD_BUTTONS: Record<number, ButtonName> = { 0: 'interact', 1: 'meow', 2: 'meow', 3: 'swap', 4: 'swap', 5: 'swap' };

  /** Read the first connected pad. Returns false when there is none. */
  function pollPads(): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
    let pads: ArrayLike<Gamepad | null>;
    try {
      pads = navigator.getGamepads();
    } catch {
      return false;
    }
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) {
      padDx = padDy = 0;
      return false;
    }
    // Edge detection against last poll's buttons, reusing one array (this runs every frame).
    const buttons = pad.buttons;
    if (prevPad.length !== buttons.length) prevPad = new Array<boolean>(buttons.length).fill(false);
    let active = false;
    for (let i = 0; i < buttons.length; i++) {
      const pressed = buttons[i].pressed || buttons[i].value > 0.5;
      if (pressed && !prevPad[i]) {
        active = true;
        if (i === 9 || i === 8) api.onPause?.();
        const b = PAD_BUTTONS[i];
        if (b && enabled) pending.add(b);
      }
      prevPad[i] = pressed;
    }
    let [dx, dy] = stickToAxes(pad.axes[0] ?? 0, pad.axes[1] ?? 0, PAD_DEAD_ZONE);
    if (prevPad[12]) dy = -1;
    if (prevPad[13]) dy = 1;
    if (prevPad[14]) dx = -1;
    if (prevPad[15]) dx = 1;
    if (dx !== 0 || dy !== 0) active = true;
    padDx = dx;
    padDy = dy;
    if (active) setDevice('gamepad');
    return true;
  }

  function padLoop() {
    // Every pad unplugged: stop polling until the next gamepadconnected.
    if (!pollPads()) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(padLoop);
  }

  function onPadConnected() {
    if (!raf && opts.gamepad !== false && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(padLoop);
  }

  if (target) {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
  }
  if (typeof window !== 'undefined' && opts.gamepad !== false) {
    window.addEventListener('gamepadconnected', onPadConnected);
    try {
      if (Array.from(navigator.getGamepads?.() ?? []).some((p) => p)) onPadConnected();
    } catch {
      /* no gamepad API */
    }
  }
  return api;
}
