/**
 * Match lifecycle overlays (render-side DOM, no sim): the start gate countdown pill, the dead-state veil with the
 * "nine lives" pips (the seconds are counted by the HUD's "Back in N" chip and its face-down respawn card), the respawn iris (it hides the camera cut to the fountain) and the
 * end-of-match wipe into the results. CSS layers only (no full-screen filter or post pass), so phones pay nothing
 * while they are hidden. Every setter is idempotent and cheap to call each frame.
 */
import './lifecycle.css';

/** Pips in the lives row. */
export const LIVES = 9;

/** The lives label for `deaths` so far (cats count lives, dogs count bones). */
export function livesLabel(deaths: number, dog: boolean): string {
  const left = LIVES - deaths;
  if (left <= 0) return dog ? 'Out of bones. Still a good dog!' : 'Bonus lives! Cats always land on their feet';
  if (dog) return left === 1 ? '1 bone left' : `${left} of ${LIVES} bones left`;
  return left === 1 ? 'Last life! (just kidding)' : `${left} of ${LIVES} lives left`;
}

const PAW_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.5" rx="5.2" ry="4.3"/><ellipse cx="5.6" cy="10" rx="2.1" ry="2.6"/><ellipse cx="9.6" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="14.4" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="10" rx="2.1" ry="2.6"/></svg>';
const BONE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9.5h10a3 3 0 1 1 2.4 4.6A3 3 0 1 1 17 14.5H7a3 3 0 1 1-2.4-.4A3 3 0 1 1 7 9.5z"/></svg>';
const LOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="3"/></svg>';

export class LifeHud {
  private readonly root: HTMLElement | null;
  private readonly gateEl: HTMLElement | null = null;
  private readonly gateNum: HTMLElement | null = null;
  private readonly gateBar: HTMLElement | null = null;
  private readonly deadEl: HTMLElement | null = null;
  private readonly livesEl: HTMLElement | null = null;
  private readonly livesLbl: HTMLElement | null = null;
  private readonly irisEl: HTMLElement | null = null;
  private readonly wipeEl: HTMLElement | null = null;
  private gateShown = -1;
  private gateFrac = -1;
  private deadOn = false;
  private irisKey = '';
  private livesKey = '';
  private wipeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Text said (e2e and tests). */
  readonly said: string[] = [];

  constructor(root: HTMLElement | null) {
    this.root = root && typeof document !== 'undefined' ? root : null;
    if (!this.root) return;
    const el = (cls: string, html = ''): HTMLElement => {
      const d = document.createElement('div');
      d.className = cls;
      if (html) d.innerHTML = html;
      return d;
    };
    this.gateEl = el('pl-lc-gate', `<span class="ic">${LOCK_SVG}</span><span class="tx">Gates open in</span><b class="n">3</b><span class="bar"><i></i></span>`);
    this.gateEl.setAttribute('aria-live', 'polite');
    this.gateNum = this.gateEl.querySelector('.n');
    this.gateBar = this.gateEl.querySelector('.bar i');
    this.deadEl = el('pl-lc-dead', '<div class="veil"></div><div class="lives"><div class="pips"></div><div class="lbl"></div></div>');
    this.livesEl = this.deadEl.querySelector('.pips');
    this.livesLbl = this.deadEl.querySelector('.lbl');
    this.irisEl = el('pl-lc-iris', `<span class="paw">${PAW_SVG}</span>`);
    this.wipeEl = el('pl-lc-wipe', `<span class="paw">${PAW_SVG}</span>`);
    this.root.append(this.deadEl, this.gateEl, this.irisEl, this.wipeEl);
  }

  /** Gate countdown: `secs` whole seconds left (0 hides it), `frac` 1 → 0 of the wait. */
  gate(secs: number, frac: number): void {
    const g = this.gateEl;
    if (!g) return;
    if (secs !== this.gateShown) {
      this.gateShown = secs;
      g.classList.toggle('on', secs > 0);
      if (secs > 0 && this.gateNum) {
        this.gateNum.textContent = String(secs);
        // re-trigger the number pop
        this.gateNum.classList.remove('pop');
        void this.gateNum.offsetWidth;
        this.gateNum.classList.add('pop');
        this.said.push(`gate ${secs}`);
      }
    }
    const f = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;
    if (f !== this.gateFrac && this.gateBar) {
      this.gateFrac = f;
      this.gateBar.style.transform = `scaleX(${f})`;
    }
  }

  /** The dead veil and lives row (`deaths` counts this death). */
  dead(on: boolean, deaths: number, dog: boolean): void {
    const d = this.deadEl;
    if (!d) return;
    if (on !== this.deadOn) {
      this.deadOn = on;
      d.classList.toggle('on', on);
    }
    if (!on) return;
    const key = `${deaths}:${dog}`;
    if (key === this.livesKey || !this.livesEl || !this.livesLbl) return;
    this.livesKey = key;
    const icon = dog ? BONE_SVG : PAW_SVG;
    let html = '';
    for (let i = 0; i < LIVES; i++) {
      const lost = i >= LIVES - deaths;
      // the life lost just now pops off
      const now = i === LIVES - deaths;
      html += `<i class="${lost ? 'lost' : ''}${now ? ' now' : ''}">${icon}</i>`;
    }
    this.livesEl.innerHTML = html;
    const lbl = livesLabel(deaths, dog);
    this.livesLbl.textContent = lbl;
    this.said.push(lbl);
  }

  /**
   * Iris `k` 0 (off) .. 1 (shut); `opening` once the camera has cut. Class changes only, never a per-frame style:
   * the close is a CSS clip-path circle over the field (as the end wipe), the open a plain opacity fade (perf QA: the
   * old per-frame mask-image repainted the whole screen on iOS). Under the HUD (z-index), so the score bar, minimap and
   * kill feed stay whole. Reduced motion: a plain fade both ways (CSS).
   */
  iris(k: number, opening = false): void {
    const el = this.irisEl;
    if (!el) return;
    const on = k > 0;
    const shut = on && !opening && k >= 0.98;
    const key = on ? `${opening ? 'o' : 'c'}${shut ? 's' : ''}` : '';
    if (key === this.irisKey) return;
    this.irisKey = key;
    el.classList.toggle('on', on);
    el.classList.toggle('open', on && opening);
    el.classList.toggle('shut', shut || (on && opening));
  }

  /** The end wipe: a paw iris closing over the field `inMs` from now, just before the results replace the match. */
  endWipe(won: boolean, inMs: number): void {
    const el = this.wipeEl;
    if (!el) return;
    if (this.wipeTimer) clearTimeout(this.wipeTimer);
    this.wipeTimer = setTimeout(() => {
      this.wipeTimer = null;
      el.classList.add('on', won ? 'won' : 'lost');
    }, Math.max(0, inMs));
  }

  dispose(): void {
    if (this.wipeTimer) clearTimeout(this.wipeTimer);
    this.wipeTimer = null;
    for (const e of [this.gateEl, this.deadEl, this.irisEl, this.wipeEl]) e?.remove();
  }
}
