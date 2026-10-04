/**
 * Campaign strip for the Results screen: stars earned for this level (new ones pop), what unlocked,
 * and a "Next level" button. Added into the existing Results dialog after `ui.showResults()` has
 * rendered it (the dialog is rebuilt on every showResults, so nothing needs removing).
 */
import { h } from '../dom';
import { icon } from '../icons';
// Star rules come from the sim (src/sim/score.ts), the copy the backend's replay verification uses.
import { STAR_RULES, starCount } from '../../sim/score';
import { ensureLevelStyles } from './styles';
import { RESCUE_SHELTER_LINE, rescueStatusLabel, type RescueCat } from './rescue-cats';
import { displayName, rescuePhoto } from './rescue-view';
import { needsBodyFont } from '../pink-paw';

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
  /** The real shelter cat behind this heist's crate (its photo joins the rescue line). */
  rescue?: RescueCat | null;
  /** Asset base for the cat's local photo copy. */
  base?: string;
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
  if (x.rescue) addRealCat(results, x.rescue, x.base);
  const row = results.querySelector<HTMLElement>('.ch-row');
  // The actions stay in view: one footer pinned to the bottom of the scrolling panel holds this
  // strip's buttons and the dialog's own Retry / Menu row (moved, listeners intact). Content
  // scrolls under its fade, so a taller rescue box never pushes the next step below the fold.
  const scroller = row?.closest<HTMLElement>('.ch-scroll') ?? null;
  let foot = row?.closest<HTMLElement>('.ch-lv-resfoot') ?? null;
  if (row && scroller && !foot) {
    foot = h('div.ch-lv-resfoot', { 'data-testid': 'results-actions' });
    scroller.classList.add('ch-lv-hasfoot');
    row.parentElement!.insertBefore(foot, row);
    foot.appendChild(row);
    // Sign-in and anything else after the row stay in the scroll, above the footer.
    let after = foot.nextElementSibling;
    while (after) {
      const n = after.nextElementSibling;
      scroller.insertBefore(after, foot);
      after = n;
    }
  }
  foot?.querySelector('.ch-lv-resrow')?.remove();
  const anchor = foot ?? row;
  if (anchor) anchor.parentElement!.insertBefore(strip, anchor);
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
    if (foot) foot.prepend(buttons);
    else strip.appendChild(buttons);
    (buttons.firstElementChild as HTMLElement).focus({ preventScroll: true });
  }
  return strip;
}

/**
 * The real cat in the Results rescue box: the shelter's photo is the hero (the reward), with the
 * pixel cat as a badge on its corner, and one line that keeps fiction and fact apart (the in-game
 * rescue is a game; the cat and its status are real).
 */
function addRealCat(results: HTMLElement, cat: RescueCat, base?: string): void {
  const box = results.querySelector<HTMLElement>('.ch-rescue');
  if (!box) return;
  const oldPics = box.querySelector<HTMLElement>('.ch-lv-res-pics');
  if (oldPics) {
    // A re-decorate: put the sprite back where ui.ts had it before rebuilding.
    const c = oldPics.querySelector('canvas');
    if (c) box.prepend(c);
    oldPics.remove();
  }
  box.querySelector('.ch-lv-res-photo')?.remove();
  box.querySelector('.ch-lv-res-real')?.remove();
  box.classList.add('ch-lv-res-hero');
  const photo = rescuePhoto(cat, { base, className: 'ch-lv-res-photo', eager: true });
  photo.dataset.testid = 'rescue-photo';
  const pics = h('span.ch-lv-res-pics', null, photo);
  const sprite = box.querySelector('canvas');
  if (sprite) {
    sprite.classList.add('ch-lv-res-badge');
    pics.appendChild(sprite);
  }
  box.prepend(pics);
  setHeadlineName(box.querySelector('p'), cat.name);
  // A local copy says "as of <date>": it cannot know about an adoption since.
  const status = rescueStatusLabel(cat);
  const line = h(
    'small.ch-lv-res-real',
    { 'data-testid': 'rescue-real' },
    `${RESCUE_SHELTER_LINE}${status ? `, ${status}` : ''}. `,
    cat.profileUrl ? h('a', { href: cat.profileUrl, target: '_blank', rel: 'noopener' }, `Meet ${cat.name} ›`) : null,
  );
  const p = box.querySelector('p');
  if (!p) return;
  // Right under the headline ("You rescued <name>!"), before the rail line and buttons.
  const first = p.querySelector(':scope > small, :scope > a, :scope > button, :scope > span:not(.ch-lv-headline)');
  if (first) p.insertBefore(line, first);
  else p.appendChild(line);
}

/** "You rescued Gabė!": the name in the display face too (its text stays the same). */
function setHeadlineName(p: HTMLElement | null, name: string): void {
  const t = p?.firstChild;
  if (!p || !t || t.nodeType !== 3 || !needsBodyFont(name)) return;
  const text = t.textContent ?? '';
  const at = text.indexOf(name);
  if (at < 0) return;
  p.replaceChild(h('span.ch-lv-headline', null, text.slice(0, at), displayName(name), text.slice(at + name.length)), t);
}
