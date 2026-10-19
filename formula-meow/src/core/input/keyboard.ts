/** Keyboard (GDD 2.2): arrows/WASD, Space hop/drift, Shift/E item (with ↓ held: backwards), Q look back, R restart, Esc pause. */
import { mergeSteer, type InputSource, type RawInput } from './raw';

export class KeyboardInput implements InputSource {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private steer = 0;
  private readonly onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const c = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
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
    out.pause ||= this.pressed.has('Escape') || this.pressed.has('KeyP');
    out.restart ||= this.pressed.has('KeyR');
    out.any ||= this.pressed.size > 0;
    this.pressed.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
