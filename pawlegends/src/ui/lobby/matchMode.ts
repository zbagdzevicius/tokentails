/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §8.1): the PLAY screen's mode toggle, 3v3 Quick (Purrhaven Crossing) or 5v5
 * Classic (Hearthwood Divide). Remembered per viewer in localStorage (a convenience only: a blocked store falls back
 * to 3v3 Quick). The first match is always 3v3; after it the toggle shows with the last choice.
 */
import type { MapId } from '../../sim/api';

export type MatchMode = 'quick' | 'classic';
const KEY = 'pawlegends.matchMode';

export const MODE_MAP: Readonly<Record<MatchMode, MapId>> = Object.freeze({ quick: 'crossing', classic: 'hearthwood' });
export const MODE_LABEL: Readonly<Record<MatchMode, string>> = Object.freeze({ quick: '3v3 Quick', classic: '5v5 Classic' });
export const MODE_SIZE: Readonly<Record<MatchMode, string>> = Object.freeze({ quick: '3v3', classic: '5v5' });
export const modeOfMap = (map: MapId | undefined): MatchMode => (map === 'hearthwood' ? 'classic' : 'quick');

export function loadMatchMode(): MatchMode {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'classic' ? 'classic' : 'quick';
  } catch {
    return 'quick';
  }
}

export function saveMatchMode(m: MatchMode): void {
  try {
    globalThis.localStorage?.setItem(KEY, m);
  } catch {
    /* a blocked store: the toggle still works for this visit */
  }
}

/** The toggle's markup: a two-button radio group (`data-a="map"`, `data-v` the mode). Pure. */
export function matchModeHtml(mode: MatchMode): string {
  const btn = (v: MatchMode): string =>
    `<button type="button" role="radio" class="${mode === v ? 'on' : ''}" aria-checked="${mode === v}" tabindex="${mode === v ? 0 : -1}" data-a="map" data-v="${v}" data-testid="map-${v}" aria-label="${MODE_LABEL[v]}"><b>${MODE_SIZE[v]}</b><span class="lb-mw"> ${v === 'quick' ? 'Quick' : 'Classic'}</span></button>`;
  return `<div class="lb-map" role="radiogroup" aria-label="Mode" data-testid="match-mode">${btn('quick')}${btn('classic')}</div>`;
}
