/**
 * The VS intro (Token Tails card art): when the match is ready, both teams' champions as cards, your team on top and
 * the other below, a big "VS" between them. The cards lie face down (the Token Tails card back) and flip up one by
 * one at a 120 ms stagger, your own card with a golden burst behind it; then the whole screen fades into the match.
 * It never takes input (pointer-events: none) and is gone after VS_MS. Its own lazy chunk; it preloads the six
 * element backgrounds when it mounts. Reduced motion: no flips or spin, a 200 ms fade in and out.
 */
import type { HeroId } from '../../sim/api';
import type { CatTier } from '../../meta/roster';
import { HERO_TEXT } from '../heroText';
import { backUrl, elBg, fxUrl, heroElement, preloadCardArt } from './art';
import { flipCard, heroCard } from './hero';
import './vs.css';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const reduced = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Timings (ms): the first flip, the stagger, when it starts fading, and when it is removed. */
export const VS_MS = Object.freeze({ first: 220, stagger: 120, fadeAt: 1750, gone: 2200, reducedFadeAt: 1500, reducedGone: 1750 });

export interface VsIntroOpts {
  picks: readonly HeroId[];
  mySlot: number;
  /** Slot labels (ui/heroText.ts slotNames). */
  names: readonly string[];
  /** The cat each slot wears ('' none): shown as a second line. */
  cats?: readonly string[];
  /** The player's own portrait in their look, and their card skin's rung. */
  myPortrait?: string | null;
  myTier?: CatTier | null;
  /** The team names ("Purrhaven cats", "Woof pack"). */
  teamNames?: readonly [string, string];
}

/** Mount the VS intro into `parent`; returns a dispose function (safe to call twice). */
export function showVsIntro(parent: HTMLElement, o: VsIntroOpts): () => void {
  const calm = reduced();
  const myTeam = o.mySlot < 3 ? 0 : 1;
  preloadCardArt([backUrl(), fxUrl('golden-burst'), fxUrl('sparkle'), ...o.picks.map((h) => elBg(heroElement(h)))]);
  const row = (team: 0 | 1, startIdx: number): string => {
    const cards = [0, 1, 2]
      .map((k) => {
        const slot = team * 3 + k;
        const hero = o.picks[slot];
        if (!hero) return '';
        const me = slot === o.mySlot;
        const name = me ? 'You' : (o.names[slot] ?? HERO_TEXT[hero].title);
        const sub = o.cats?.[slot] ? o.cats[slot] : HERO_TEXT[hero].role;
        const front = heroCard(hero, {
          portrait: me ? o.myPortrait : undefined,
          tier: me ? (o.myTier ?? null) : null,
          name,
          sub,
          sparkles: me,
          foil: me ? 'sweep' : 'none',
          foot: true,
        });
        const delay = VS_MS.first + (startIdx + k) * VS_MS.stagger;
        return `<div class="tt-vs-slot${me ? ' me' : ''}" style="--d:${delay}ms">${me ? `<i class="tt-vs-burst" style="background-image:url(${fxUrl('golden-burst')})"></i>` : ''}${flipCard(front)}</div>`;
      })
      .join('');
    const label = o.teamNames?.[team] ?? (team === myTeam ? 'Your team' : 'Rivals');
    return `<div class="tt-vs-row ${team === myTeam ? 'mine' : 'theirs'}"><span class="tt-vs-team">${esc(team === myTeam ? `${label} (you)` : label)}</span><div class="tt-vs-cards">${cards}</div></div>`;
  };
  const el = document.createElement('div');
  el.className = `tt-vs${calm ? ' calm' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  const first: 0 | 1 = myTeam as 0 | 1;
  const second: 0 | 1 = (1 - myTeam) as 0 | 1;
  el.innerHTML = `${row(first, 0)}<div class="tt-vs-mid"><b>VS</b></div>${row(second, 3)}`;
  // before the countdown (the CSS hides that count while the VS screen is up: `.tt-vs.shown:not(.out) ~ .pl-count`)
  parent.insertBefore(el, parent.querySelector(':scope > .pl-count'));
  const timers: ReturnType<typeof setTimeout>[] = [];
  let gone = false;
  const dispose = (): void => {
    if (gone) return;
    gone = true;
    for (const t of timers) clearTimeout(t);
    el.remove();
  };
  // the count under it hides only once the VS screen has really drawn (`.shown`, CSS): on a device that stalls at match
  // start the screen never faded in, yet it hid "3, 2" (correctness QA)
  el.addEventListener('transitionend', (ev) => {
    if (ev.target === el && ev.propertyName === 'opacity' && el.classList.contains('in') && !el.classList.contains('out')) el.classList.add('shown');
  });
  requestAnimationFrame(() => {
    if (gone) return;
    el.classList.add('in');
    if (calm) {
      for (const f of el.querySelectorAll('.tt-flip')) f.classList.add('up');
    } else {
      el.querySelectorAll<HTMLElement>('.tt-vs-slot').forEach((s) => {
        const d = parseInt(s.style.getPropertyValue('--d'), 10) || 0;
        timers.push(
          setTimeout(() => {
            s.querySelector('.tt-flip')?.classList.add('up');
            s.classList.add('up');
          }, d),
        );
      });
    }
    timers.push(setTimeout(() => el.classList.add('out'), calm ? VS_MS.reducedFadeAt : VS_MS.fadeAt));
    timers.push(setTimeout(dispose, calm ? VS_MS.reducedGone : VS_MS.gone));
  });
  return dispose;
}
