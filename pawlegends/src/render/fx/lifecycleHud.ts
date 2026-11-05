/**
 * Match lifecycle overlays (render-side DOM, no sim): the dead-state veil, the respawn iris (it hides the camera cut to
 * the fountain) and the end-of-match wipe into the results. CSS layers only (no full-screen filter or post pass), so
 * phones pay nothing while they are hidden. Every setter is idempotent and cheap to call each frame.
 *
 * LoL pass (lane A): the gate countdown is the top rail's resting `gate` line ("Gates open in 3"), and the nine-lives
 * row is folded into the respawn resting line ("Back in 7 · 8 of 9 lives", set by the match session from
 * `livesText`), so neither draws in the middle of the screen any more.
 */
import './lifecycle.css';
import { notifyFor, type NotifyLike } from '../../ui/notify';

/** Pips in the lives row. */
export const LIVES = 9;

/** The lives label for `deaths` so far (cats count lives, dogs count bones). */
export function livesLabel(deaths: number, dog: boolean): string {
  const left = LIVES - deaths;
  if (left <= 0) return dog ? 'Out of bones. Still a good dog!' : 'Bonus lives! Cats always land on their feet';
  if (dog) return left === 1 ? '1 bone left' : `${left} of ${LIVES} bones left`;
  return left === 1 ? 'Last life! (just kidding)' : `${left} of ${LIVES} lives left`;
}

/** The short lives words for the rail's respawn line ("8 of 9 lives", "1 bone", "bonus lives"). */
export function livesShort(deaths: number, dog: boolean): string {
  const left = LIVES - deaths;
  if (left <= 0) return dog ? 'out of bones' : 'bonus lives';
  if (dog) return left === 1 ? '1 bone left' : `${left} of ${LIVES} bones`;
  return left === 1 ? 'last life' : `${left} of ${LIVES} lives`;
}

const PAW_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.5" rx="5.2" ry="4.3"/><ellipse cx="5.6" cy="10" rx="2.1" ry="2.6"/><ellipse cx="9.6" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="14.4" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="10" rx="2.1" ry="2.6"/></svg>';

export class LifeHud {
  private readonly root: HTMLElement | null;
  private readonly deadEl: HTMLElement | null = null;
  private readonly irisEl: HTMLElement | null = null;
  private readonly wipeEl: HTMLElement | null = null;
  private gateShown = -1;
  private deadOn = false;
  private irisKey = '';
  private livesKey = '';
  private wipeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Text said (e2e and tests). */
  readonly said: string[] = [];
  /** The short lives words for the respawn line (empty while alive). */
  livesText = '';
  /** The top rail (looked up on the match root; tests may set it). */
  notify: NotifyLike | null = null;

  constructor(root: HTMLElement | null) {
    this.root = root && typeof document !== 'undefined' ? root : null;
    if (!this.root) return;
    this.notify = notifyFor(this.root);
    const el = (cls: string, html = ''): HTMLElement => {
      const d = document.createElement('div');
      d.className = cls;
      if (html) d.innerHTML = html;
      return d;
    };
    this.deadEl = el('pl-lc-dead', '<div class="veil"></div>');
    this.irisEl = el('pl-lc-iris', `<span class="paw">${PAW_SVG}</span>`);
    this.wipeEl = el('pl-lc-wipe', `<span class="paw">${PAW_SVG}</span>`);
    this.root.append(this.deadEl, this.irisEl, this.wipeEl);
  }

  /** Gate countdown: `secs` whole seconds left (0 clears it) on the rail's resting line. `_frac` is kept for the API. */
  gate(secs: number, _frac: number): void {
    if (secs === this.gateShown) return;
    this.gateShown = secs;
    this.notify ??= notifyFor(this.root);
    this.notify?.rest('gate', secs > 0 ? `Gates open in ${secs}` : null, 'gold');
    if (secs > 0) this.said.push(`gate ${secs}`);
  }

  /** The dead veil; `deaths` counts this death (the lives words go to the respawn line). */
  dead(on: boolean, deaths: number, dog: boolean): void {
    const d = this.deadEl;
    if (on !== this.deadOn) {
      this.deadOn = on;
      d?.classList.toggle('on', on);
      if (!on) this.livesText = '';
    }
    if (!on) return;
    const key = `${deaths}:${dog}`;
    if (key === this.livesKey) return;
    this.livesKey = key;
    this.livesText = livesShort(deaths, dog);
    const lbl = livesLabel(deaths, dog);
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
    this.notify?.rest('gate', null);
    for (const e of [this.deadEl, this.irisEl, this.wipeEl]) e?.remove();
  }
}
