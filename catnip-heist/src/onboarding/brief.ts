/**
 * The brief card's content for a level (plan G10 "Heist": a brief card per first visit per level).
 * Pure: built from the level's own meta (name, intro, objectives), so a new level gets a brief with
 * no extra copy. The DOM lives in `ui/ftue.ts`.
 */
import type { LevelDef } from '../types';
import { LEVEL_IDS } from '../levels';
import { canRewind } from './rewind';

export interface BriefContent {
  levelId: string;
  /** "Heist 1 of 8". */
  kicker: string;
  title: string;
  intro: string;
  /** The plan, in order (the objective lines with the shelter cat's name filled in). */
  steps: string[];
  /** Show the controls row (the first two levels). */
  controls: boolean;
  /** Footer tips: the route hint everywhere, the rewind on the levels that have it. */
  tips: string[];
}

/** Most plan steps on the card; a longer list is trimmed to its first lines plus the exit. */
const MAX_STEPS = 5;

export function briefFor(level: LevelDef): BriefContent {
  const index = LEVEL_IDS.indexOf(level.id);
  const name = level.crate?.catName || 'the shelter cat';
  const title = level.meta.name ?? level.meta.title.replace(/^Heist\s+\d+:\s*/i, '');
  const raw = (level.meta.objectives ?? []).map((o) => o.replace(/\{cat\}/g, name).trim()).filter(Boolean);
  const steps = raw.length > MAX_STEPS ? [...raw.slice(0, MAX_STEPS - 1), raw[raw.length - 1]] : raw;
  if (!steps.length) steps.push(level.key ? 'Find the vault key' : `Free ${name} from the crate`, 'Both cats to the exit');
  const tips = ['Stuck? Tap the objective for a route.'];
  // The star rules, so the catnip has a reason (playtest: players skipped it, not knowing it counts).
  const coins = level.coins.length;
  if (coins > 0) tips.push(`Stars: win, grab all ${coins} catnip, and finish unseen under par.`);
  if (canRewind(level.id)) tips.push('Seen by a dog? Rewind 5 s and try again.');
  return {
    levelId: level.id,
    kicker: index >= 0 ? `Heist ${index + 1} of ${LEVEL_IDS.length}` : 'Heist',
    title,
    intro: level.meta.intro ?? `Sneak in, free ${name} and get both cats out.`,
    steps,
    controls: index >= 0 && index < 2,
    tips,
  };
}
