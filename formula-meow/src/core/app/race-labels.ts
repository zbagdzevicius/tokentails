/** Small pure rules the shell's results and pause screens share (unit-tested in race-labels.test.ts). */
import { Modifier, type RaceClass } from '../../types';
import { CLASSES } from '../../tuning';
import { t } from '../../ui/i18n';

/**
 * Wild Card mutators (ITERATION-4.md F11). Four change the item boxes (the sim honours their bits in
 * `items-ai/items/registry.ts` and the ghost header carries them, so a dare on a mutator replays exactly); Night is
 * render only (the feel lane's after-dark theme). Order is the Wild Card row's order. `minCls`: the lowest sim class
 * the mutator is offered at in Single race (the 72-race harness, `modes/mutators.test.ts`).
 */
export interface MutatorDef {
  id: 'catnip-rain' | 'zoomies' | 'box-party' | 'cucumbers' | 'night';
  bit: number;
  icon: string;
  /** `t()` keys */
  name: string;
  blurb: string;
  renderOnly?: boolean;
  minCls: RaceClass;
}

/**
 * The labels' templates. Keys of the modes lane's string table (`ui/strings/modes.en.ts`): referenced through this
 * table, not as literal keys in calls, because the core strings check reads literals in this file against CORE_EN.
 */
export const LABEL_KEYS = {
  wild: '🃏 Wild Card: {m}',
  unlockNext: 'Next up: {c} unlocked → race it',
} as const;

export const MUTATORS: readonly MutatorDef[] = [
  { id: 'catnip-rain', bit: Modifier.CatnipRain, icon: '🌿', name: 'Catnip Rain', blurb: 'Catnip boosts in far more boxes', minCls: 0 },
  { id: 'zoomies', bit: Modifier.ZoomiesPlus, icon: '⚡', name: 'Zoomies+', blurb: 'Zoomies turn up far more often', minCls: 0 },
  { id: 'box-party', bit: Modifier.BoxParty, icon: '📦', name: 'Box Party', blurb: 'Far more Boxes to hide in', minCls: 0 },
  { id: 'cucumbers', bit: Modifier.CucumbersOnly, icon: '🥒', name: 'Cucumbers Only', blurb: 'Every item box is a Cucumber', minCls: 0 },
  { id: 'night', bit: Modifier.Night, icon: '🌙', name: 'Night', blurb: 'The same track after dark', renderOnly: true, minCls: 0 },
];

/** Every mutator bit (the Mirror bit is a class pick, not a mutator). */
export const MUTATOR_BITS = MUTATORS.reduce((m, x) => m | x.bit, 0);

/** The mutators a modifier set has on, in row order. */
export function mutatorsOf(modifiers: number): MutatorDef[] {
  return MUTATORS.filter((m) => (modifiers & m.bit) !== 0);
}

/** "Box Party", "Night · Catnip Rain", or '' with no mutator. */
export function mutatorLabel(modifiers: number): string {
  return mutatorsOf(modifiers)
    .map((m) => t(m.name))
    .join(' · ');
}

/** The results header's class: a mirrored 150cc race is "Mirror" (as the pickers call it), other mirrors say so too; a mutator follows ("Alley Cat 100cc · Box Party"). */
export function raceClassLabel(cls: RaceClass, modifiers: number): string {
  const base = `${CLASSES[cls].name} ${CLASSES[cls].cc}`;
  const mut = mutatorLabel(modifiers);
  const head = (modifiers & Modifier.Mirror) === 0 ? base : cls === 2 ? t('Mirror') : `${base} · ${t('Mirror')}`;
  return mut ? `${head} · ${mut}` : head;
}

/** "Daily Cup #9 · Box Party" (the HUD tag and the grid banner). */
export function dailyLabel(day: number, modifiers: number): string {
  const mut = mutatorLabel(modifiers);
  const base = t('Daily Cup #{n}', { n: day });
  return mut ? `${base} · ${mut}` : base;
}

/** The HUD tag under the lap counter: the Daily Cup with its mutator, or a Wild Card race's mutator. */
export function raceTag(mode: string, day: number | undefined, modifiers: number): string | undefined {
  if (mode === 'daily' && day) return dailyLabel(day, modifiers);
  if (mode === 'race') {
    const m = mutatorsOf(modifiers);
    if (m.length) return `${m.map((x) => x.icon).join('')} ${mutatorLabel(modifiers)}`;
  }
  return undefined;
}

/** The grid banner a race opens with (null = none): "🏆 Daily Cup #9 · Box Party", "🃏 Wild Card: 📦 Box Party". */
export function gridBanner(mode: string, day: number | undefined, modifiers: number): string | null {
  if (mode === 'daily' && day) return `🏆 ${dailyLabel(day, modifiers)}`;
  if (mode === 'race') {
    const m = mutatorsOf(modifiers);
    if (m.length) return t(LABEL_KEYS.wild, { m: m.map((x) => `${x.icon} ${t(x.name)}`).join(' + ') });
  }
  return null;
}

/** The class unlock on a race's results (F13: says what is next, so it never reads as a prize beside an 8th place). */
export function classUnlockLabel(cls: RaceClass): string {
  return t(LABEL_KEYS.unlockNext, { c: `${CLASSES[cls].name} ${CLASSES[cls].cc}` });
}

/** The results' Next keeps the mirror of a Mirror single race (as Again does); no other modifier carries over. */
export function nextRaceModifiers(modifiers: number): number {
  return modifiers & Modifier.Mirror;
}

/** The touch controls line for the drift method that is on (pause screen, Settings > Controls). */
export function touchHelp(oneThumb: boolean): string {
  return oneThumb
    ? t('Left thumb steers. Full stick into a bend drifts. Right thumb: tap to hop, swipe up or down for items.')
    : t('Left thumb steers. Hold the right thumb to drift. Swipe up or down for items.');
}

/** Seconds of unpaused race time between the player's finish and the results panel. */
export const RESULTS_DELAY = 2.5;

/**
 * The finish → results wait, one frame: -1 until the player finishes, then unpaused seconds since. A pause in those
 * 2.5 s used to be lifted by the results (wall-clock timer, and showResults unpaused the race).
 */
export function finishWaitStep(wait: number, finished: boolean, paused: boolean, dt: number): number {
  if (wait < 0) return finished ? 0 : -1;
  return paused ? wait : wait + dt;
}

/** The results come up after the wait (or when the whole field is done), never over the pause screen. */
export function resultsDue(wait: number, paused: boolean, done: boolean): boolean {
  return !paused && (wait > RESULTS_DELAY || done);
}
