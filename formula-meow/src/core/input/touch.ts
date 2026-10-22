/**
 * Touch (GDD 2.1, portrait first). The control area is the bottom 60 % of the screen in portrait, 85 % in landscape:
 * - left half: floating steer stick from wherever the thumb lands (dead zone 4 px, full lock 70 px, curve x^1.15,
 *   the base follows when the thumb drifts more than 110 px, and never sits so close to an edge that full lock is
 *   out of reach). Several fingers on the left: the newest steers; lifting it hands back to the one before.
 * - right half: press = hop (after 80 ms, so a swipe never hops); in two-thumb mode (one-thumb off) hold = drift.
 *   Swipe up/down (> 60 px in < 200 ms) = item forward/backward, at any time, also from a finger that is drifting.
 * - item button: a 96 px circle at the right edge above the drift zone (tap = use).
 * Gas is automatic on touch after GO (the mux). During the countdown only a fresh tap on the right half or the top of
 * the screen is the start press; a resting steer thumb never is (B23). Pointer events, so dev-tools mice work too.
 */
import { mergeSteer, type InputSource, type RawInput } from './raw';
import { t } from '../../ui/i18n';
import { STICK, stickSteer } from './smart-steer';

const FULL = STICK.full;
const FOLLOW = 110;
/** a right-half press hops once it is this old without having moved like a swipe (B25) */
const HOP_DELAY = 80;
const SWIPE_SLOP = 15;
const SWIPE_DIST = 60;
const SWIPE_TIME = 200;

interface Ptr {
  id: number;
  kind: 'steer' | 'drift';
  x0: number;
  y0: number;
  t0: number;
  x: number;
  y: number;
  /** drift finger: hop / hold active (after HOP_DELAY) */
  live: boolean;
  /** swipe reference point (re-anchored every SWIPE_TIME) */
  sy: number;
  st: number;
  /** order of arrival (newest steer finger steers) */
  seq: number;
}

export interface TouchCopy {
  steer: string;
  drift: string;
  pad: string;
}

export class TouchInput implements InputSource {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  readonly itemBtn: HTMLButtonElement;
  private readonly driftPad: HTMLDivElement;
  private readonly thumbs: HTMLDivElement;
  private ptrs = new Map<number, Ptr>();
  private seq = 0;
  private pending = { item: false, itemBack: false, any: false, drift: false, gas: false };
  /** true once a touch happened (switches the HUD to touch mode) */
  active = false;
  /** set by the shell before GO: only fresh taps on the right half / top of the screen are the Pounce Start press */
  countdown = false;
  private oneThumbOn = true;
  /** the stick's dead zone (px) and response curve; iteration 4 softened them (x^1.4 → x^1.15, 6 → 4 px) */
  dead = STICK.dead;
  curve = STICK.curve;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fm-touch';
    this.root.innerHTML = `
      <div class="fm-stick-base"><div class="fm-stick-knob"></div></div>
      <div class="fm-drift-pad"><span></span></div>
      <button class="fm-item-btn"><span class="fm-item-icon"></span></button>
      <div class="fm-thumbs"><div><div class="stick"></div><span class="a"></span></div><div><div class="stick"></div><span class="b"></span></div></div>`;
    parent.appendChild(this.root);
    // phones see ghosted controls from boot (where the thumbs go), not only after the first touch
    if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) this.root.classList.add('ghost', 'grid');
    this.base = this.root.querySelector('.fm-stick-base')!;
    this.knob = this.root.querySelector('.fm-stick-knob')!;
    this.itemBtn = this.root.querySelector('.fm-item-btn')!;
    this.itemBtn.setAttribute('aria-label', t('Use item'));
    this.driftPad = this.root.querySelector('.fm-drift-pad')!;
    this.thumbs = this.root.querySelector('.fm-thumbs')!;
    this.root.addEventListener('pointerdown', this.onDown, { passive: false });
    // a touch anywhere (the menu taps that started this race) is a touch player: auto-gas from GO, before any touch on
    // the race area (a Grand Prix starts without a tap, and the kart used to sit at 0 km/h)
    window.addEventListener('pointerdown', this.onAnyDown, { capture: true, passive: true });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.itemBtn.addEventListener('pointerdown', this.onItem, { passive: false });
    this.oneThumb = true;
  }

  /** One-thumb drift (full stick into the bend) vs two-thumb (hold the right thumb): the overlay follows (B28). */
  get oneThumb(): boolean {
    return this.oneThumbOn;
  }

  set oneThumb(on: boolean) {
    this.oneThumbOn = on;
    const c = TouchInput.copy(on);
    this.thumbs.querySelector('.a')!.innerHTML = c.steer;
    this.thumbs.querySelector('.b')!.innerHTML = c.drift;
    this.driftPad.querySelector('span')!.innerHTML = c.pad;
  }

  /** The words on the thumb overlay for a drift setting (also used by hints). */
  static copy(oneThumb: boolean): TouchCopy {
    return oneThumb
      ? { steer: `${t('STEER')}<br>${t('full stick = drift')}`, drift: `${t('TAP = HOP')}<br>${t('swipe = item')}`, pad: t('HOP') }
      : { steer: `${t('STEER')}<br>${t('left thumb')}`, drift: `${t('HOLD = DRIFT')}<br>${t('right thumb')}`, pad: `${t('HOLD')}<br>${t('DRIFT')}` };
  }

  private readonly onItem = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.pending.item = true;
    this.pending.any = true;
    this.markTouch(e);
  };

  private readonly onAnyDown = (e: PointerEvent) => this.markTouch(e);

  private markTouch(e: PointerEvent): void {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.active = true;
      this.root.classList.add('on');
    }
  }

  /** Top of the screen that is not a control area: 40 % in portrait, 15 % in landscape (B29). */
  private deadTop(): number {
    const h = window.innerHeight;
    const w = window.innerWidth;
    return h * (w > h ? 0.15 : 0.4);
  }

  private readonly onDown = (e: PointerEvent) => {
    if (e.target === this.itemBtn || this.itemBtn.contains(e.target as Node)) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (e.clientY < this.deadTop()) {
      if (!this.countdown) return;
      // countdown: the top of the screen (where "3-2-1" sits) is a start press too
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
    const now = performance.now();
    const p: Ptr = { id: e.pointerId, kind, x0: e.clientX, y0: e.clientY, t0: now, x: e.clientX, y: e.clientY, live: false, sy: e.clientY, st: now, seq: ++this.seq };
    this.ptrs.set(e.pointerId, p);
    if (kind === 'steer') {
      // B26: keep the base far enough from the edges that full lock is reachable both ways
      const m = FULL + 6;
      p.x0 = Math.max(m, Math.min(w / 2 - 8, p.x0));
      p.y0 = Math.max(m, Math.min(h - m, p.y0));
      this.showBase(p);
    } else {
      // the start press is the tap itself (timing matters); in the race the hop waits HOP_DELAY (B25)
      if (this.countdown) this.pending.gas = true;
      this.driftPad.classList.add('on');
    }
  };

  private showBase(p: Ptr): void {
    this.base.style.transform = `translate(${p.x0}px, ${p.y0}px)`;
    this.knob.style.transform = `translate(${Math.max(-FULL, Math.min(FULL, p.x - p.x0))}px, 0px)`;
    this.base.classList.add('on');
  }

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
      }
      if (this.activeSteer() === p) this.showBase(p);
    } else {
      // swipe: > 60 px vertical within 200 ms of the reference point, from any right-half finger (drifting or not)
      const now = performance.now();
      if (now - p.st > SWIPE_TIME) {
        p.sy = p.y;
        p.st = now;
      }
      const dy = p.y - p.sy;
      if (Math.abs(dy) > SWIPE_DIST) {
        this.pending.item = true;
        this.pending.itemBack = dy > 0;
        p.sy = p.y;
        p.st = now + 1e9; // one swipe per gesture until it settles
      }
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'steer') {
      const next = this.activeSteer();
      if (next) this.showBase(next);
      else this.base.classList.remove('on');
    } else {
      // a quick tap (released before the hop delay, not a swipe) still hops
      if (!p.live && !this.countdown && Math.abs(p.y - p.y0) < SWIPE_SLOP) this.pending.drift = true;
      if (![...this.ptrs.values()].some((q) => q.kind === 'drift')) this.driftPad.classList.remove('on');
    }
  };

  /** The steering finger: the newest one on the left half (B27). */
  private activeSteer(): Ptr | null {
    let best: Ptr | null = null;
    for (const p of this.ptrs.values()) if (p.kind === 'steer' && (!best || p.seq > best.seq)) best = p;
    return best;
  }

  /** Analog steer from the stick, −1..1 with the x^1.15 response curve. */
  steerValue(): number {
    const p = this.activeSteer();
    if (!p) return 0;
    return stickSteer(p.x - p.x0, this.dead, this.curve);
  }

  get touching(): boolean {
    return this.ptrs.size > 0;
  }

  /** Right-half fingers: arm the hop once a press is HOP_DELAY old and has not moved like a swipe. */
  private holdingDrift(): boolean {
    const now = performance.now();
    let holding = false;
    for (const p of this.ptrs.values()) {
      if (p.kind !== 'drift') continue;
      if (!p.live && !this.countdown && now - p.t0 >= HOP_DELAY && Math.abs(p.y - p.y0) < SWIPE_SLOP) {
        p.live = true;
        this.pending.drift = true; // the hop
      }
      if (p.live) holding = true;
    }
    // one-thumb mode: the right thumb hops and fires items only; drifting is the full stick (B28)
    return holding && !this.oneThumbOn;
  }

  poll(out: RawInput): void {
    if (!this.active && this.ptrs.size === 0 && !this.pending.any) return;
    out.touch ||= this.active;
    mergeSteer(out, this.steerValue(), false, true);
    const hold = this.holdingDrift();
    out.drift ||= hold || this.pending.drift;
    out.item ||= this.pending.item;
    out.itemBack ||= this.pending.itemBack;
    out.any ||= this.pending.any;
    // B23: during the countdown only a fresh right-half or top tap is the start press, never a resting thumb
    out.gas ||= this.pending.gas;
    this.pending = { item: false, itemBack: false, any: false, drift: false, gas: false };
  }

  /** Drift charge on the stick ring (playtest round 2): tier 0 = none, 1–3 = the tier colour; null = not drifting. */
  setDrift(tier: number | null, color = ''): void {
    const v = tier == null ? '' : color;
    if (this.base.style.getPropertyValue('--tier') !== v) {
      if (v) this.base.style.setProperty('--tier', v);
      else this.base.style.removeProperty('--tier');
      this.base.classList.toggle('drift', tier != null);
      this.base.dataset.tier = tier == null ? '' : String(tier);
    }
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
    window.removeEventListener('pointerdown', this.onAnyDown, { capture: true });
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.root.remove();
  }
}
