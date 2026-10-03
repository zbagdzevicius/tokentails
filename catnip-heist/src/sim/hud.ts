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
    if ((h.untilObjective !== undefined || h.fromObjective !== undefined) && (level.meta.objectives?.length ?? 0) > 0) {
      const st = { keyTaken: false, rescued: false, ...s } as SimState;
      const oi = objectiveIndex({ key: null, ...level } as LevelDef, st);
      if (h.untilObjective !== undefined && oi > h.untilObjective) continue;
      if (h.fromObjective !== undefined && oi < h.fromObjective) continue;
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

type PromptLevel = Pick<LevelDef, 'meta' | 'plates' | 'doors' | 'crate'> & Partial<Pick<LevelDef, 'key'>>;
type PromptState = HintState & Partial<Pick<SimState, 'doorsOpen'>>;

/** Chebyshev distance between two tiles. */
function cheb(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Prompts the HUD shows from the situation rather than from authored hint zones:
 * - next to the crate: "Press E to free Mochi"; two tiles off: "Step right next to the crate";
 * - standing on a plate that holds a door open while the partner waits elsewhere: the swap prompt
 *   (shown once the plate is really pressed, so it doubles as the "plate held" confirmation).
 * Returns { text, kind } or null. Kind 'act' outranks authored hints, 'plate' only fills a gap.
 */
export function contextPrompt(level: PromptLevel, s: PromptState, touch = false): { text: string; kind: 'act' | 'plate' } | null {
  const me = s.cats[s.activeIndex];
  if (!me) return null;
  const t = tileOf(me.pos);
  if (!s.rescued && level.crate) {
    const d = cheb(t, level.crate.tile);
    const name = level.crate.catName || 'the shelter cat';
    if (d <= 1) return { text: fillHint(`Press {act} to free ${name}!`, touch), kind: 'act' };
    if (d === 2) return { text: `Step right next to the crate to free ${name}.`, kind: 'act' };
  }
  const plates = level.plates ?? [];
  const pi = plates.findIndex((p) => p.tile.x === t.x && p.tile.y === t.y);
  if (pi >= 0 && s.platesDown?.[pi]) {
    const other = s.cats[s.activeIndex === 0 ? 1 : 0];
    const ot = other ? tileOf(other.pos) : null;
    const onPlate = ot ? plates.some((p) => p.tile.x === ot.x && p.tile.y === ot.y) : false;
    if (!onPlate) return { text: fillHint('Plate held, door open. Press {swap} to move your other cat through.', touch), kind: 'plate' };
  }
  return null;
}

/** The HUD hint line: a crate prompt, else the authored hint zone, else a plate prompt. */
export function hudHint(level: PromptLevel, s: PromptState, touch = false): string | null {
  const p = contextPrompt(level, s, touch);
  if (p && p.kind === 'act') return p.text;
  const z = activeHint(level, s, touch);
  if (z) return z;
  return p ? p.text : null;
}
