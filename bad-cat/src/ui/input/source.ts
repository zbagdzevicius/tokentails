/** InputSource = touch stick + buttons + keyboard + gamepad, quantised once per sim tick (GDD 5.3). */
import type { EnvInfo, InputSource, TickInput } from '../../types';
import { createGamepad, type GamepadInput } from './gamepad';
import { createKeyboard, type KeyboardHandlers } from './keyboard';
import { quantiseStick, STICK_REST, type StickState } from './quantise';
import { createTouch } from './touch';

/** What the SWAT button reads: SWAT, GRAB (a grabbable in reach, or drop while carrying) or PULL (cloth / cable). */
export type SwatHint = 'swat' | 'grab' | 'pull';

/**
 * Button label for this tick (pure; tested). The FTUE "tap SWAT" lesson always reads SWAT unless the cat carries
 * something; a pull (v5 cloth or cable) reads PULL. The press is the same SWAT/GRAB bit either way.
 */
export function swatHintFor(target: { grab: boolean; pull?: 'cloth' | 'cable' } | null, carrying: boolean, swatLesson = false): SwatHint {
  if (carrying) return 'grab';
  if (swatLesson || !target) return 'swat';
  if (target.grab) return 'grab';
  return target.pull ? 'pull' : 'swat';
}

export interface GameInput extends InputSource {
  setHandlers(h: KeyboardHandlers): void;
  /** v5: the SWAT button's label/icon (PULL next to a tablecloth or lamp cable). Grab keeps setGrabHint's bit. */
  setSwatHint?(hint: SwatHint): void;
  /** Forget the stick hysteresis state (new run). */
  reset(): void;
}

export function createInput(stage: HTMLElement, env: EnvInfo, pad: GamepadInput = createGamepad()): GameInput {
  const touch = createTouch(stage, env.isTouch);
  const keys = createKeyboard();
  let stick: StickState = STICK_REST;
  let enabled = true;

  return {
    sample(): TickInput {
      // The pad is polled every tick (its buttons latch on the rising edge), even when the keys or the stick move.
      const p = pad.read();
      const buttons = touch.take() | keys.take() | pad.take();
      if (!enabled) return { dir: 0, speed: 0, buttons: 0 };
      const k = keys.read();
      if (k.dir !== 0) {
        stick = STICK_REST;
        return { dir: k.dir, speed: k.speed, buttons };
      }
      const raw = touch.readRaw();
      stick = raw.active ? quantiseStick(stick, raw.dx, raw.dy, raw.radius) : STICK_REST;
      if (!raw.active && p.dir !== 0) return { dir: p.dir, speed: p.speed, buttons };
      return { dir: stick.dir, speed: stick.speed, buttons };
    },
    setGrabHint(on) {
      touch.setGrabHint(on);
    },
    setSwatHint(hint) {
      touch.setSwatHint(hint);
    },
    setEnabled(on) {
      enabled = on;
      touch.setEnabled(on);
      keys.setEnabled(on);
      pad.setEnabled(on);
      if (!on) stick = STICK_REST;
    },
    setHandlers(h) {
      keys.setHandlers(h);
      pad.onPause(h.onPause ?? null);
    },
    reset() {
      stick = STICK_REST;
      touch.take();
      keys.take();
      pad.take();
    },
    dispose() {
      touch.dispose();
      keys.dispose();
      pad.dispose();
    },
  };
}
