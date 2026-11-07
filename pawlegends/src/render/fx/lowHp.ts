/**
 * LoL pass (lane C): the persistent low-health vignette (render / UI only). Below 30% HP a red edge vignette fades in,
 * its opacity rising linearly from 0.18 at 30% to 0.5 at 8%; below 15% it beats like a heart (1.1 Hz, ±0.08). Off while
 * dead or at full health. An edge mask only (a radial gradient with a clear centre of 55%), so it never covers the hero.
 * Under reduce motion the pulse is off. It replaced the one-shot red rim flash at 25% (the rim flash stays for others).
 */
import './inworld.css';
import { holdScreen } from './screenLayer';

export const LOW_HP = Object.freeze({ from: 0.3, to: 0.08, min: 0.18, max: 0.5, beatBelow: 0.15, beatHz: 1.1, beat: 0.08 });

/** Vignette opacity (0..1) at HP share `frac` (no pulse). 0 at or above 30% HP, dead or not. Pure. */
export function lowHpOpacity(frac: number, dead: boolean): number {
  const L = LOW_HP;
  if (dead || !(frac < L.from) || frac <= 0) return 0;
  const k = Math.min(1, (L.from - frac) / (L.from - L.to));
  return L.min + (L.max - L.min) * k;
}

/** The heartbeat offset (±0.08) at `t` s for HP share `frac`; 0 above 15% HP or under reduce motion. Pure. */
export function lowHpBeat(frac: number, t: number, reduced: boolean): number {
  if (reduced || !(frac < LOW_HP.beatBelow) || frac <= 0) return 0;
  return LOW_HP.beat * Math.sin(t * Math.PI * 2 * LOW_HP.beatHz);
}

export class LowHp {
  readonly el: HTMLDivElement | null;
  private shown = -1;
  private readonly reduced: boolean;
  /** The last opacity written (e2e and tests). */
  opacity = 0;
  /** e2e only: an HP share that replaces the real one (null = the real HP). */
  force: number | null = null;

  constructor(parent: HTMLElement | null) {
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!parent || typeof document === 'undefined') {
      this.el = null;
      return;
    }
    const el = document.createElement('div');
    el.className = 'pl-lowhp';
    el.setAttribute('aria-hidden', 'true');
    parent.appendChild(el);
    this.el = el;
  }

  /** Per frame: the player's HP share and whether they are down. */
  update(frac: number, dead: boolean): void {
    if (this.force !== null) frac = this.force;
    const base = lowHpOpacity(frac, dead);
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const o = base > 0 ? Math.max(0, Math.min(1, base + lowHpBeat(frac, t, this.reduced))) : 0;
    this.opacity = o;
    // GFX-10: while the vignette is on it is the one full-screen layer
    holdScreen(base > 0);
    const q = Math.round(o * 200) / 200;
    if (q === this.shown || !this.el) return;
    this.shown = q;
    this.el.style.opacity = String(q);
    this.el.dataset.on = q > 0 ? '1' : '';
  }

  dispose(): void {
    this.el?.remove();
    holdScreen(false);
  }
}
