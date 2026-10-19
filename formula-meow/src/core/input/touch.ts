/**
 * Touch (GDD 2.1, portrait first). Bottom 60 % of the screen is the control area:
 * - left half: floating steer stick from wherever the thumb lands (dead zone 6 px, full lock 70 px, curve x^1.4,
 *   the base follows when the thumb drifts more than 110 px);
 * - right half: press = hop, hold = drift; swipe up/down (> 60 px in < 200 ms) = item forward/backward;
 * - item button: a 96 px circle at the right edge above the drift zone (tap = use).
 * Gas is automatic on touch (the mux handles it). Uses pointer events so it also works with a mouse in dev tools.
 */
import { mergeSteer, type InputSource, type RawInput } from './raw';

const DEAD = 6;
const FULL = 70;
const FOLLOW = 110;

interface Ptr {
  id: number;
  kind: 'steer' | 'drift' | 'item';
  x0: number;
  y0: number;
  t0: number;
  x: number;
  y: number;
}

export class TouchInput implements InputSource {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  readonly itemBtn: HTMLButtonElement;
  private readonly driftPad: HTMLDivElement;
  private ptrs = new Map<number, Ptr>();
  private pending = { item: false, itemBack: false, any: false, drift: false, gas: false };
  /** true once a touch happened (switches the HUD to touch mode) */
  active = false;
  /** set by the shell before GO: a tap anywhere (also on the countdown text) is the Pounce Start press */
  countdown = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fm-touch';
    this.root.innerHTML = `
      <div class="fm-stick-base"><div class="fm-stick-knob"></div></div>
      <div class="fm-drift-pad"><span>HOLD<br>DRIFT</span></div>
      <button class="fm-item-btn" aria-label="Use item"><span class="fm-item-icon"></span></button>
      <div class="fm-thumbs"><div><div class="stick"></div>STEER<br>left thumb</div><div><div class="stick"></div>HOLD = DRIFT<br>right thumb</div></div>`;
    parent.appendChild(this.root);
    // phones see ghosted controls from boot (where the thumbs go), not only after the first touch
    if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) this.root.classList.add('ghost', 'grid');
    this.base = this.root.querySelector('.fm-stick-base')!;
    this.knob = this.root.querySelector('.fm-stick-knob')!;
    this.itemBtn = this.root.querySelector('.fm-item-btn')!;
    this.driftPad = this.root.querySelector('.fm-drift-pad')!;
    this.root.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.itemBtn.addEventListener('pointerdown', this.onItem, { passive: false });
  }

  private readonly onItem = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.pending.item = true;
    this.pending.any = true;
    this.markTouch(e);
  };

  private markTouch(e: PointerEvent): void {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.active = true;
      this.root.classList.add('on');
    }
  }

  private readonly onDown = (e: PointerEvent) => {
    if (e.target === this.itemBtn || this.itemBtn.contains(e.target as Node)) return;
    const h = window.innerHeight;
    const w = window.innerWidth;
    if (e.clientY < h * 0.4) {
      if (!this.countdown) return;
      // countdown: the top of the screen (where "3-2-1" sits) is a gas tap too
      e.preventDefault();
      this.markTouch(e);
      this.pending.any = true;
      this.pending.gas = true;
      return;
    }
    e.preventDefault();
    this.markTouch(e);
    this.pending.any = true;
    const kind = e.clientX < w / 2 ? 'steer' : 'drift';
    if (kind === 'steer' && [...this.ptrs.values()].some((p) => p.kind === 'steer')) return;
    const p: Ptr = { id: e.pointerId, kind, x0: e.clientX, y0: e.clientY, t0: performance.now(), x: e.clientX, y: e.clientY };
    this.ptrs.set(e.pointerId, p);
    if (kind === 'steer') {
      this.base.style.transform = `translate(${p.x0}px, ${p.y0}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.base.classList.add('on');
    } else {
      this.pending.drift = true;
      this.driftPad.classList.add('on');
    }
  };

  private readonly onMove = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX;
    p.y = e.clientY;
    if (p.kind === 'steer') {
      let dx = p.x - p.x0;
      if (Math.abs(dx) > FOLLOW) {
        p.x0 += dx - Math.sign(dx) * FOLLOW;
        dx = p.x - p.x0;
        this.base.style.transform = `translate(${p.x0}px, ${p.y0}px)`;
      }
      this.knob.style.transform = `translate(${Math.max(-FULL, Math.min(FULL, dx))}px, 0px)`;
    } else {
      // swipe: > 60 px vertical in < 200 ms
      const dy = p.y - p.y0;
      if (Math.abs(dy) > 60 && performance.now() - p.t0 < 200) {
        this.pending.item = true;
        this.pending.itemBack = dy > 0;
        p.t0 = -1e9; // one swipe per press
      }
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'steer') this.base.classList.remove('on');
    else if (![...this.ptrs.values()].some((q) => q.kind === 'drift')) this.driftPad.classList.remove('on');
  };

  /** Analog steer from the stick, −1..1 with the x^1.4 response curve. */
  steerValue(): number {
    for (const p of this.ptrs.values()) {
      if (p.kind !== 'steer') continue;
      const dx = p.x - p.x0;
      const a = Math.abs(dx);
      if (a < DEAD) return 0;
      const u = Math.min(1, (a - DEAD) / (FULL - DEAD));
      return Math.sign(dx) * Math.pow(u, 1.4);
    }
    return 0;
  }

  get touching(): boolean {
    return this.ptrs.size > 0;
  }

  poll(out: RawInput): void {
    if (!this.active && this.ptrs.size === 0 && !this.pending.any) return;
    out.touch ||= this.active;
    mergeSteer(out, this.steerValue(), false);
    const holdingDrift = [...this.ptrs.values()].some((p) => p.kind === 'drift');
    out.drift ||= holdingDrift || this.pending.drift;
    out.item ||= this.pending.item;
    out.itemBack ||= this.pending.itemBack;
    out.any ||= this.pending.any;
    // during the countdown a finger down is the "gas" press for the Pounce Start
    out.gas ||= this.ptrs.size > 0 || this.pending.gas;
    this.pending = { item: false, itemBack: false, any: false, drift: false, gas: false };
  }

  setItem(label: string, ready: boolean): void {
    const icon = this.itemBtn.querySelector('.fm-item-icon')!;
    if (icon.textContent !== label) icon.textContent = label;
    this.itemBtn.classList.toggle('ready', ready);
    // no item: no button (a blank disc in prime thumb space reads as broken)
    this.itemBtn.classList.toggle('has', !!label);
  }

  /** Grid overlay ("thumb here") while waiting for the first tap and during the countdown. */
  setGrid(on: boolean): void {
    this.root.classList.toggle('grid', on && this.root.classList.contains('ghost'));
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.root.remove();
  }
}
