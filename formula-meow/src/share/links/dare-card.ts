/**
 * The dare card and the live gap pill (iteration 4, F9). A dare link opens on a full-screen challenge card over the
 * grid ("Zyg dares you", the track, the ghost's recomputed time, the sender's cat colours, TAP TO RACE) instead of a
 * banner; a lap race ghost gets a "Race the pack" switch (off: a 1v1 against the ghost only). During the duel a pill
 * shows the live gap to the ghost ("+0.42" red, behind; "−0.18" green, ahead).
 *
 * Copy is honest: the time on the card is the ghost's time recomputed on this device (never a number from the link),
 * and it shows "…" until that run is done.
 */
import { EYE_COLORS, rgb888, type CatSpec } from '../../types';
import { t } from '../../ui/i18n';
import { focusNav } from '../../ui/kit';
import { fmtRaceTime } from '../cards/card-text';
import { gapText } from './duel';

export interface DareCardIn {
  name: string;
  trackName: string;
  className: string;
  /** a time-trial ghost (no pack to race) */
  tt: boolean;
  cat: CatSpec | null;
  /** the ghost's recomputed time (seconds), resolved later; null = it never finished */
  time: Promise<number | null> | null;
  /** an older version's ghost: no duel, the notice instead */
  notice?: string | null;
  /** start with "Race the pack" on */
  pack?: boolean;
  /** QA (`?bot=1`): tap TAP TO RACE by itself after this many ms (0 = wait for the player) */
  auto?: number;
}

export interface DareCardOut {
  pack: boolean;
}

const css = (c: number): string => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Show the card on `host`; resolves when the player taps TAP TO RACE (or presses a key). */
export function showDareCard(host: HTMLElement, d: DareCardIn): Promise<DareCardOut> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fm-dare-card';
    wrap.setAttribute('data-ui-layer', '');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t('{name} dares you', { name: d.name }));
    const coat = d.cat ? [css(rgb888(d.cat.base)), css(rgb888(d.cat.secondary)), css(EYE_COLORS[d.cat.eyes] ?? 0x7cc36a)] : ['#9a9aa2', '#5b5b66', '#f2c14e'];
    const pack = !!d.pack && !d.tt && !d.notice;
    wrap.innerHTML = `
      <div class="fm-dare-card-in fm-sticker">
        <div class="fm-dare-cat" aria-hidden="true" style="--c1:${coat[0]};--c2:${coat[1]};--c3:${coat[2]}"><i></i><b></b><b></b></div>
        <p class="fm-dare-kicker">${esc(t('⚔️ Dare'))}</p>
        <h2 data-raw>${esc(t('{name} dares you', { name: d.name }))}</h2>
        <p class="fm-dare-track"><span data-raw>${esc(d.trackName)}</span> · <span data-raw>${esc(d.className)}</span></p>
        <p class="fm-dare-time" data-raw>${d.notice ? '' : '👻 <b>…</b>'}</p>
        ${d.notice ? `<p class="fm-line fm-dare-notice" data-raw>${esc(d.notice)}</p>` : ''}
        ${
          d.tt || d.notice
            ? `<p class="fm-dare-mode">${esc(d.tt ? t('Time trial: you and the ghost') : t('Race the same track'))}</p>`
            : `<label class="fm-dare-pack"><input type="checkbox" data-act="pack"${pack ? ' checked' : ''}> <span>${esc(t('Race the pack'))}</span></label>
               <p class="fm-dare-mode" data-mode>${esc(pack ? t('You, the ghost and 7 cats') : t('1v1: you and the ghost'))}</p>`
        }
        <button class="fm-btn primary big fm-dare-go" data-act="dare-go">${esc(t('TAP TO RACE'))}</button>
      </div>`;
    host.appendChild(wrap);
    const timeEl = wrap.querySelector<HTMLElement>('.fm-dare-time b');
    void d.time?.then((s) => {
      if (timeEl) timeEl.textContent = s == null ? t('did not finish') : fmtRaceTime(s);
    });
    const box = wrap.querySelector<HTMLInputElement>('[data-act="pack"]');
    const modeLine = wrap.querySelector<HTMLElement>('[data-mode]');
    box?.addEventListener('change', () => {
      if (modeLine) modeLine.textContent = box.checked ? t('You, the ghost and 7 cats') : t('1v1: you and the ghost');
    });
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      stopNav();
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.add('off');
      setTimeout(() => wrap.remove(), 260);
      resolve({ pack: !!box?.checked });
    };
    // Enter / Space start (the race's own keys never reach the race behind the card)
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key === ' ') return;
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const stopNav = focusNav(wrap, { back: () => undefined, modal: true });
    wrap.querySelector('[data-act="dare-go"]')!.addEventListener('click', go);
    // stray taps on the card never steer or arm the race behind it
    for (const ev of ['pointerdown', 'touchstart'] as const) wrap.addEventListener(ev, (e) => e.stopPropagation());
    setTimeout(() => wrap.querySelector<HTMLElement>('[data-act="dare-go"]')?.focus({ preventScroll: true }), 60);
    if (d.auto) setTimeout(go, d.auto);
  });
}

/** The live gap pill (duel). Smoothed over ~0.3 s, redrawn at most ~12 times a second. */
export class GapPill {
  private el: HTMLDivElement | null = null;
  private shown = 0;
  private acc = 0;
  private smooth: number | null = null;

  constructor(private readonly host: HTMLElement) {}

  show(name: string): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'fm-gap-pill';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<span class="n">👻 ${esc(name)}</span><b>${esc(t('GO!'))}</b>`;
    this.host.appendChild(el);
    this.el = el;
    this.smooth = null;
    this.acc = 1;
  }

  /** `gap` + = behind the ghost (s), null = no reading (before GO, after the ghost's run ended) */
  update(gap: number | null, dt: number): void {
    const el = this.el;
    if (!el || gap == null || !isFinite(gap)) return;
    const k = Math.min(1, dt / 0.3);
    this.smooth = this.smooth == null ? gap : this.smooth + (gap - this.smooth) * k;
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;
    const g = gapText(this.smooth);
    const b = el.querySelector('b')!;
    if (b.textContent !== g.text) b.textContent = g.text;
    el.classList.toggle('ahead', g.ahead);
    el.classList.toggle('behind', !g.ahead);
    this.shown++;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }

  get visible(): boolean {
    return !!this.el;
  }
}
