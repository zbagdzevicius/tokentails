/** Pure HUD helpers derived from the sim state (objective line and tutorial hint). */
import type { HintZone, LevelDef, SimState } from '../types';
import { tileOf } from './grid';

function inTutorial(level: LevelDef, s: SimState, i: 0 | 1): boolean {
  const r = level.meta.tutorial;
  if (!r) return false;
  const t = tileOf(s.cats[i].pos);
  return t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1;
}

/**
 * Index into level.meta.objectives for the current progress. Objectives are read as: tutorial
 * door, both cats out of the tutorial, key, rescue, exit (a level with fewer lines gets the
 * matching subset from the end: key / rescue / exit).
 */
export function objectiveIndex(level: LevelDef, s: SimState): number {
  const n = level.meta.objectives?.length ?? 0;
  if (n === 0) return -1;
  let stage: number;
  const t0 = inTutorial(level, s, 0);
  const t1 = inTutorial(level, s, 1);
  if (t0 && t1) stage = 0;
  else if (t0 || t1) stage = 1;
  else if (!s.keyTaken && level.key) stage = 2;
  else if (!s.rescued) stage = 3;
  else stage = 4;
  const idx = stage - (5 - n);
  return idx < 0 ? 0 : idx >= n ? n - 1 : idx;
}

export function objectiveText(level: LevelDef, s: SimState): string {
  const i = objectiveIndex(level, s);
  return i >= 0 ? level.meta.objectives![i] : '';
}

/** Control names substituted into hint text tokens, per input device. */
export const HINT_TOKENS = {
  keyboard: { move: 'WASD / arrows', swap: 'Q / Tab', meow: 'Space', act: 'E' },
  touch: { move: 'the joystick', swap: 'SWAP', meow: 'MEOW', act: 'ACT' },
} as const;

/** Replace {move} {swap} {meow} {act} with the control names for the device. */
export function fillHint(text: string, touch = false): string {
  const t = touch ? HINT_TOKENS.touch : HINT_TOKENS.keyboard;
  return text.replace(/\{(move|swap|meow|act)\}/g, (_, k: keyof typeof t) => t[k]);
}

type HintState = Pick<SimState, 'cats' | 'activeIndex'> & Partial<Pick<SimState, 'platesDown' | 'keyTaken' | 'rescued'>>;
type HintLevel = Pick<LevelDef, 'meta' | 'plates'> & Partial<Pick<LevelDef, 'key'>>;

/** First hint zone that contains the active cat and whose conditions hold, or null. */
export function activeHintZone(level: HintLevel, s: HintState): HintZone | null {
  const c = s.cats[s.activeIndex];
  if (!c) return null;
  const t = tileOf(c.pos);
  for (const h of level.meta.hints ?? []) {
    if (t.x < h.x0 || t.x > h.x1 || t.y < h.y0 || t.y > h.y1) continue;
    if (h.untilObjective !== undefined && (level.meta.objectives?.length ?? 0) > 0) {
      const st = { keyTaken: false, rescued: false, ...s } as SimState;
      if (objectiveIndex({ key: null, ...level } as LevelDef, st) > h.untilObjective) continue;
    }
    if (h.whileOtherHolds) {
      const pi = (level.plates ?? []).findIndex((p) => p.id === h.whileOtherHolds);
      if (pi < 0 || !s.platesDown?.[pi]) continue;
      const p = level.plates[pi].tile;
      if (p.x === t.x && p.y === t.y) continue;
    }
    return h;
  }
  return null;
}

/** Text of the first matching hint zone for the active cat (tokens filled), or null. */
export function activeHint(level: HintLevel, s: HintState, touch = false): string | null {
  const z = activeHintZone(level, s);
  return z ? fillHint(z.text, touch) : null;
}
