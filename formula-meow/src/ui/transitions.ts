/**
 * Screen transitions (audio-ui lane): a paw-print iris opens over every menu screen as it appears (0.35 s), so moving
 * between menus feels like one game rather than swapped pages. Under reduced motion it is a short cross-fade instead.
 * Driven by the app bus `screen` event; the overlay never takes input (pointer-events: none), so it can never block
 * a tap or a test.
 */
import { appBus } from '../core/app/app-bus';
import type { ScreenId } from '../core/app/screens';
import { reducedMotion } from './a11y';
import { qa } from './qa';

/** Screens that get the iris when they come up (the in-race layers pause and results do not). */
export const WIPE_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'title',
  'menu',
  'select',
  'class',
  'cup',
  'standings',
  'podium',
  'tt',
  'battle',
  'garage',
  'achievements',
  'stats',
  'settings',
  'howto',
  'rewards',
  'yourcat',
  'pinkpaw',
]);

/** Pure: does moving from `prev` to `top` get the iris? */
export function wantsWipe(top: ScreenId | null, prev: ScreenId | null): boolean {
  return !!top && top !== prev && WIPE_SCREENS.has(top);
}

const PAW = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs><mask id="fm-wipe-mask" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">
    <rect x="-50" y="-50" width="200" height="200" fill="#fff"/>
    <g class="fm-wipe-paw" fill="#000">
      <ellipse cx="50" cy="58" rx="13" ry="11"/>
      <circle cx="35.5" cy="43" r="5.6"/><circle cx="44.5" cy="35.5" r="5.8"/>
      <circle cx="55.5" cy="35.5" r="5.8"/><circle cx="64.5" cy="43" r="5.6"/>
    </g>
  </mask></defs>
  <rect x="-50" y="-50" width="200" height="200" fill="#1a1238" mask="url(#fm-wipe-mask)"/>
</svg>`;

let el: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Play the iris now (the new screen is already mounted underneath). */
export function playWipe(): void {
  if (typeof document === 'undefined') return;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'fm-wipe';
    el.innerHTML = PAW;
    document.body.appendChild(el);
  }
  qa.wipes++;
  el.classList.remove('on', 'fade');
  void el.offsetWidth;
  el.classList.add('on', reducedMotion() ? 'fade' : 'iris');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => el?.classList.remove('on', 'fade', 'iris'), 420);
}

export function installTransitions(): () => void {
  return appBus.on('screen', ({ id, prev }) => {
    if (wantsWipe(id, prev)) playWipe();
  });
}
