/**
 * Desktop keys (GDD 5.2): WASD / arrows move, Shift toggles sneak, Space jump, J swat, K grab,
 * Esc pause, R restart (practice only; the app decides). Buttons are latched until sample() reads them.
 */
import { BTN_GRAB, BTN_JUMP, BTN_SWAT, type Dir8, type Speed } from '../../types';
import { keysToDir } from './quantise';

export interface KeyboardHandlers {
  onPause?(): void;
  onRestart?(): void;
}

export interface KeyboardInput {
  /** Direction + speed from held keys (dir 0 when no movement key is held). */
  read(): { dir: Dir8; speed: Speed };
  /** Latched button bits since the last take(). */
  take(): number;
  readonly sneak: boolean;
  setHandlers(h: KeyboardHandlers): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const GAME_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, 'Space', 'KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight']);

export function createKeyboard(target: Window | null = typeof window !== 'undefined' ? window : null): KeyboardInput {
  const held = new Set<string>();
  /** Movement keys pressed since the last read: a tap shorter than a tick still turns or steps the cat once. */
  const tapped = new Set<string>();
  let latched = 0;
  let sneak = false;
  let enabled = true;
  let handlers: KeyboardHandlers = {};

  const isTyping = (e: KeyboardEvent): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  const down = (e: KeyboardEvent): void => {
    if (isTyping(e)) return;
    if (e.code === 'Escape') {
      handlers.onPause?.();
      return;
    }
    if (!enabled) {
      // round 3: remember physically held movement keys while disabled (intro, pause), so a key held before GO
      // moves the cat at GO instead of being dropped until it is released and pressed again
      if (!e.repeat) held.add(e.code);
      return;
    }
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    tapped.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sneak = !sneak;
    else if (e.code === 'Space') latched |= BTN_JUMP;
    else if (e.code === 'KeyJ') latched |= BTN_SWAT;
    else if (e.code === 'KeyK') latched |= BTN_GRAB;
    else if (e.code === 'KeyR') handlers.onRestart?.();
  };
  const up = (e: KeyboardEvent): void => {
    held.delete(e.code);
  };
  const blur = (): void => {
    held.clear();
    tapped.clear();
  };

  target?.addEventListener('keydown', down);
  target?.addEventListener('keyup', up);
  target?.addEventListener('blur', blur);

  const any = (s: Set<string>): boolean => {
    for (const k of s) if (held.has(k) || tapped.has(k)) return true;
    return false;
  };

  return {
    read() {
      if (!enabled) return { dir: 0, speed: 0 };
      const dir = keysToDir(any(UP), any(RIGHT), any(DOWN), any(LEFT));
      tapped.clear();
      return { dir, speed: dir === 0 ? 0 : sneak ? 1 : 2 };
    },
    take() {
      const b = latched;
      latched = 0;
      return b;
    },
    get sneak() {
      return sneak;
    },
    setHandlers(h) {
      handlers = h;
    },
    setEnabled(on) {
      enabled = on;
      // Held keys survive (keyup and blur still clear them); taps and latched buttons do not.
      tapped.clear();
      latched = 0;
    },
    dispose() {
      target?.removeEventListener('keydown', down);
      target?.removeEventListener('keyup', up);
      target?.removeEventListener('blur', blur);
    },
  };
}
