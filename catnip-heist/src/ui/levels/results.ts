/**
 * Campaign strip for the Results screen: stars earned for this level (new ones pop), what unlocked,
 * and a "Next level" button. Added into the existing Results dialog after `ui.showResults()` has
 * rendered it (the dialog is rebuilt on every showResults, so nothing needs removing).
 */
import { h } from '../dom';
import { icon } from '../icons';
import { STAR_RULES, starCount } from './progress';
import { ensureLevelStyles } from './styles';

export interface ResultsExtras {
  /** Stars held for the level after this run (bitmask). */
  stars: number;
  /** Stars this run added (bitmask). */
  newStars: number;
  /** Name of the next level when it is unlocked, else null. */
  nextName: string | null;
  /** The next level unlocked with this run. */
  unlockedNow: boolean;
  /** A watched replay: it earns nothing, so say so instead of "win to earn". */
  replay?: boolean;
  onNext?(): void;
  onLevels?(): void;
  onClick?(): void;
}

/** Decorate the Results dialog inside `uiRoot`. Returns the inserted strip (or null if no dialog). */
export function decorateResults(uiRoot: HTMLElement, x: ResultsExtras): HTMLElement | null {
  ensureLevelStyles();
  const results = uiRoot.querySelector<HTMLElement>('.ch-results');
  if (!results) return null;
  results.querySelector('.ch-lv-res')?.remove();
  const stars = h('span.ch-lv-stars', { 'aria-label': `${starCount(x.stars)} of 3 stars` });
  for (const r of STAR_RULES) {
    const s = icon('star');
    s.title = `${r.label}: ${r.detail}`;
    if (x.stars & r.bit) s.classList.add('ch-on');
    if (x.newStars & r.bit) s.classList.add('ch-lv-new');
    stars.appendChild(s);
  }
  const got = STAR_RULES.filter((r) => x.stars & r.bit).map((r) => r.label);
  const strip = h(
    'div.ch-lv-res',
    null,
    stars,
    h('small', null, got.length ? got.join(' · ') : x.replay ? 'Replays do not earn stars' : 'Win the heist to earn stars'),
    x.unlockedNow && x.nextName ? h('small', null, `Unlocked: ${x.nextName}`) : null,
  );
  const row = results.querySelector<HTMLElement>('.ch-row');
  if (row) row.parentElement!.insertBefore(strip, row);
  else (results.querySelector('.ch-dialog') ?? results).appendChild(strip);

  // Own button row under the strip (the dialog's Retry / Menu row stays untouched).
  const buttons = h('div.ch-lv-resrow');
  // Inline layout so the dialog's own button rules (full-width, stacked) cannot override it.
  buttons.style.cssText = 'display:flex;flex-direction:row;justify-content:center;gap:10px;width:100%;';
  if (x.nextName && x.onNext) {
    const next = h('button.ch-btn.ch-primary', { type: 'button', 'aria-label': 'Next level' }, h('span', null, 'Next level'), icon('play'));
    next.addEventListener('click', () => {
      x.onClick?.();
      x.onNext?.();
    });
    buttons.appendChild(next);
  }
  if (x.onLevels) {
    const lv = h('button.ch-btn', { type: 'button' }, icon('star'), h('span', null, 'Heists'));
    lv.addEventListener('click', () => {
      x.onClick?.();
      x.onLevels?.();
    });
    buttons.appendChild(lv);
  }
  for (const b of Array.from(buttons.children) as HTMLElement[]) b.style.cssText = 'flex:1 1 0;width:auto;min-width:0;';
  if (buttons.childElementCount) {
    strip.appendChild(buttons);
    (buttons.firstElementChild as HTMLElement).focus({ preventScroll: true });
  }
  return strip;
}
