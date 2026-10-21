/** Keyboard (GDD 2.2): arrows/WASD, Space hop/drift, Shift/E item (with ↓ held: backwards), Q look back, R restart, Esc pause. */
import { mergeSteer, type InputSource, type RawInput } from './raw';

/** Where menu buttons live: a focused button in one of these owns the keys (the corner ☰ button does not). */
const UI_LAYERS = '[data-ui-layer], .fm-overlay.on, .fm-ugc-sheet.on, .fm-maker, .fm-ed, .fm-dare-name';

/** A menu control has the keyboard focus: a text field anywhere, or a button / link inside an open menu layer. */
export function uiFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body || a === document.documentElement) return false;
  const tag = a.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || a.isContentEditable) return true;
  return (tag === 'BUTTON' || tag === 'A' || a.tabIndex >= 0) && !!a.closest(UI_LAYERS);
}

/** A text field has the focus (a P typed into a track name is a letter, not a pause). */
function typing(): boolean {
  const a = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

/** The pause screen is the top layer (its Resume button has the focus, so the race keys are off, but P still resumes). */
function pauseOnTop(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[data-screen="pause"]:not([hidden])');
}

function layerOpen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[data-ui-layer]:not([hidden])');
}

export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private steer = 0;
  private readonly onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const c = e.code;
    // B30: the race keeps arrows / Space from scrolling, but a focused button, field or select keeps its keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c) && !uiFocused()) e.preventDefault();
    // Esc belongs to the screen stack while a menu layer is open (it goes back), judged when the key goes down
    if (c === 'Escape' && layerOpen()) return;
    this.down.add(c);
    this.pressed.add(c);
  };
  private readonly onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private readonly onBlur = () => this.down.clear();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  private is(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c) || this.pressed.has(c));
  }

  poll(out: RawInput, dt: number): void {
    // a focused menu control owns the keys (Space presses it, arrows move focus): the race sees nothing
    if (uiFocused()) {
      // P always toggles pause: the pause screen focuses Resume, which used to swallow the key that should unpause
      if (this.pressed.has('KeyP') && pauseOnTop() && !typing()) out.pause = true;
      this.pressed.clear();
      return;
    }
    const left = this.is('ArrowLeft', 'KeyA');
    const right = this.is('ArrowRight', 'KeyD');
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    // digital keys ramp to full lock in 0.10 s so they never feel twitchy
    const rate = dt / 0.1;
    if (want === 0) this.steer = 0;
    else this.steer = Math.max(-1, Math.min(1, (Math.sign(this.steer) === -Math.sign(want) ? 0 : this.steer) + want * rate));
    mergeSteer(out, this.steer, true);
    out.gas ||= this.is('ArrowUp', 'KeyW');
    const back = this.is('ArrowDown', 'KeyS');
    out.brake ||= back;
    out.drift ||= this.is('Space');
    const item = this.is('ShiftLeft', 'ShiftRight', 'KeyE');
    out.item ||= item;
    out.itemBack ||= item && back;
    out.lookBack ||= this.is('KeyQ');
    // Esc belongs to the screen stack while a menu layer is open (it goes back); P always toggles pause
    out.pause ||= this.pressed.has('Escape') || this.pressed.has('KeyP');
    // R is held, not tapped: the shell restarts after a 0.6 s hold (it sits next to E and W)
    out.restart ||= this.is('KeyR');
    out.any ||= this.pressed.size > 0;
    this.pressed.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
