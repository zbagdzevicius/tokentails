/** Small pure rules the shell's results and pause screens share (unit-tested in race-labels.test.ts). */
import { Modifier, type RaceClass } from '../../types';
import { CLASSES } from '../../tuning';
import { t } from '../../ui/i18n';

/** The results header's class: a mirrored 150cc race is "Mirror" (as the pickers call it), other mirrors say so too. */
export function raceClassLabel(cls: RaceClass, modifiers: number): string {
  const base = `${CLASSES[cls].name} ${CLASSES[cls].cc}`;
  if ((modifiers & Modifier.Mirror) === 0) return base;
  return cls === 2 ? t('Mirror') : `${base} · ${t('Mirror')}`;
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
