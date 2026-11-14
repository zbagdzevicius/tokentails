/**
 * The PLAY screen's mode tiles. Sim v19 (MAP-5V5.md §8.1): 3v3 on Purrhaven Crossing or 5v5 Classic on Hearthwood
 * Divide. Sim v22 (WR-BS-PLAN.md §5): three tiles with their minutes, Blitz (3v3, ~3 min, the 'blitz' mutator on
 * Crossing), Skirmish (3v3, ~7 min; "3v3 Quick" before v22) and Classic (5v5, ~13 min). Tiles show minutes, never
 * "Quick". Remembered per viewer in localStorage (a convenience only: a blocked store falls back to Skirmish; the old
 * stored 'quick' reads as Skirmish). The first match is always the guided 3v3; after it the tiles show with the last
 * choice. `?mode=blitz|skirmish|classic` selects a tile (clips, portal links, creators).
 */
import type { MapId, Mutator } from '../../sim/api';

export type MatchMode = 'blitz' | 'skirmish' | 'classic';
export const MATCH_MODE_LIST: readonly MatchMode[] = Object.freeze(['blitz', 'skirmish', 'classic'] as MatchMode[]);
const KEY = 'pawlegends.matchMode';

export const MODE_MAP: Readonly<Record<MatchMode, MapId>> = Object.freeze({ blitz: 'crossing', skirmish: 'crossing', classic: 'hearthwood' });
/** Sim v22: the mutator a mode plays ('none' for Skirmish and Classic). */
export const MODE_MUTATOR: Readonly<Record<MatchMode, Mutator>> = Object.freeze({ blitz: 'blitz', skirmish: 'none', classic: 'none' });
export const MODE_NAME: Readonly<Record<MatchMode, string>> = Object.freeze({ blitz: 'Blitz', skirmish: 'Skirmish', classic: 'Classic' });
export const MODE_SIZE: Readonly<Record<MatchMode, string>> = Object.freeze({ blitz: '3v3', skirmish: '3v3', classic: '5v5' });
/** The tile's minutes (the probe medians: Blitz 2:48, Skirmish 7:24, Classic 13:06). */
export const MODE_MINUTES: Readonly<Record<MatchMode, number>> = Object.freeze({ blitz: 3, skirmish: 7, classic: 13 });
/** "3v3 Skirmish · ~7 min" (the plan's rename of "3v3 Quick"). */
export const MODE_LABEL: Readonly<Record<MatchMode, string>> = Object.freeze({
  blitz: `${MODE_SIZE.blitz} ${MODE_NAME.blitz} · ~${MODE_MINUTES.blitz} min`,
  skirmish: `${MODE_SIZE.skirmish} ${MODE_NAME.skirmish} · ~${MODE_MINUTES.skirmish} min`,
  classic: `${MODE_SIZE.classic} ${MODE_NAME.classic} · ~${MODE_MINUTES.classic} min`,
});
const ICON: Readonly<Record<MatchMode, string>> = Object.freeze({ blitz: '⚡', skirmish: '🐾', classic: '🏰' });

/** Sim v27 (V27.md): the Mode Select tile (analytics `mode`) a match of each mutator came from. */
export const MUTATOR_MODE: Readonly<Record<Mutator, string>> = Object.freeze({
  none: 'skirmish',
  blitz: 'blitz',
  cannon: 'cannon',
  practice: 'practice',
  toybox: 'twist',
  rapid: 'twist',
  bounty: 'twist',
  onelane: 'onelane',
  duel: 'duel',
  boss: 'boss',
});
/** Sim v27: the loading line of a mutator match. */
export const MUTATOR_VEIL: Readonly<Record<Mutator, string>> = Object.freeze({
  none: 'Into the Crossing...',
  blitz: 'Blitz! Into the Crossing...',
  cannon: 'Cannon Chaos! Into the Crossing...',
  practice: 'Into the Practice ground...',
  toybox: 'Weekly Twist: Toy Box...',
  rapid: 'Weekly Twist: Rapid Paws...',
  bounty: 'Weekly Twist: Bounty Hunt...',
  onelane: 'One Lane Brawl! Onto Sunny Lane...',
  duel: 'Duel! Onto Sunny Lane...',
  boss: 'Boss Weekend! Mega Brutus waits on the bridge...',
});

export const modeOfMap = (map: MapId | undefined, mutator?: Mutator): MatchMode =>
  map === 'hearthwood' ? 'classic' : mutator === 'blitz' ? 'blitz' : 'skirmish';

/** A stored or linked mode name ('quick' is the pre-v22 name of Skirmish); anything else is null. */
export function parseMatchMode(v: unknown): MatchMode | null {
  if (v === 'quick') return 'skirmish';
  return typeof v === 'string' && (MATCH_MODE_LIST as readonly string[]).includes(v) ? (v as MatchMode) : null;
}

/**
 * `?mode=` of a link. `known` false: the link names a mode this build does not know (a newer client's), so the
 * lobby says "Update to play …" and falls back to Skirmish. No `mode` parameter: null.
 */
export function modeFromUrl(search: string): { mode: MatchMode; known: boolean; asked: string } | null {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('mode');
  } catch {
    return null;
  }
  if (raw === null || raw === '') return null;
  const asked = raw.slice(0, 24);
  const mode = parseMatchMode(asked.toLowerCase());
  return mode ? { mode, known: true, asked } : { mode: 'skirmish', known: false, asked };
}

export function loadMatchMode(): MatchMode {
  try {
    return parseMatchMode(globalThis.localStorage?.getItem(KEY)) ?? 'skirmish';
  } catch {
    return 'skirmish';
  }
}

export function saveMatchMode(m: MatchMode): void {
  try {
    globalThis.localStorage?.setItem(KEY, m);
  } catch {
    /* a blocked store: the tiles still work for this visit */
  }
}

/** The tiles' markup: a three-button radio group (`data-a="map"`, `data-v` the mode). Pure. */
export function matchModeHtml(mode: MatchMode): string {
  const btn = (v: MatchMode): string =>
    `<button type="button" role="radio" class="${mode === v ? 'on' : ''}" aria-checked="${mode === v}" tabindex="${mode === v ? 0 : -1}" data-a="map" data-v="${v}" data-testid="map-${v}" aria-label="${MODE_LABEL[v]}" title="${MODE_LABEL[v]}"><span class="lb-mi" aria-hidden="true">${ICON[v]}</span><b>${MODE_NAME[v]}</b><span class="lb-mw"> ${MODE_SIZE[v]} ·</span><small> ~${MODE_MINUTES[v]} min</small></button>`;
  return `<div class="lb-map" role="radiogroup" aria-label="Mode" data-testid="match-mode">${MATCH_MODE_LIST.map(btn).join('')}</div>`;
}
