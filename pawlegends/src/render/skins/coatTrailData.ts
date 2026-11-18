/**
 * Coat trails, data only (gaps5 skins v2; render/skins/coatTrail.ts draws them): which coats have one, the Mythic
 * parade's evolving stages and the Heroes browser's Evolve preview switch. No three.js, so the menus can read it.
 */
import { isMythicCoat } from '../../money/catalog';

/**
 * 'parade' (the Mythic paper dragon's body), the ground trails 'stripes', 'drips' and 'ketchup', and gaps6's two evolving
 * forms drawn round the hero: 'board' (Chairman of the Board: the stock-chart arrow, then the gold office-chair mech)
 * and 'tower' (Mega Meal: the slider ring, the double, then the five-patty tower on a golden tray).
 */
export type TrailKind = 'parade' | 'stripes' | 'drips' | 'ketchup' | 'board' | 'tower';
/** The trails drawn on the ground (effects: the Skin effects setting decides). */
export const GROUND_TRAILS: readonly TrailKind[] = Object.freeze(['stripes', 'drips', 'ketchup']);
/** The evolving forms (the coat itself: always drawn, like the parade body). */
export const FORM_TRAILS: readonly TrailKind[] = Object.freeze(['board', 'tower']);

/** The coats with a trail. */
export const COAT_TRAILS: Readonly<Record<string, TrailKind>> = Object.freeze({
  'coat.frankie.store_paper_parade': 'parade',
  'coat.nugget.store_robo_vac': 'stripes',
  'coat.marshmallow.store_soft_serve': 'drips',
  // gaps6 coat drop
  'coat.meatball.store_double_stack': 'ketchup',
  'coat.brutus.store_chairman': 'board',
  'coat.meatball.store_mega_meal': 'tower',
});

export const trailOf = (coatId: string | null | undefined): TrailKind | null => (coatId ? (COAT_TRAILS[coatId] ?? null) : null);

/** Parade segments per evolving stage (1..4), and while the ultimate stretches him. */
export const PARADE_SEGMENTS: readonly number[] = Object.freeze([0, 0, 3, 6, 10]);
export const PARADE_ULT_SEGMENTS = 12;
/** Low quality draws at most this many parade segments. */
export const PARADE_LOW_MAX = 6;
/** Seconds the ultimate keeps the full twelve-segment parade. */
export const PARADE_ULT_S = 5;
/** Hero levels (1..10) and takedowns that reach stages 2, 3 and 4 (whichever comes first). */
export const PARADE_LEVELS: readonly number[] = Object.freeze([4, 7, 10]);
export const PARADE_TAKEDOWNS: readonly number[] = Object.freeze([2, 4, 6]);

/** The evolving stage (1..4) of the Mythic parade at a hero level and takedown count. */
export function paradeStage(level: number, takedowns: number): number {
  let s = 1;
  for (let i = 0; i < 3; i++) if (level >= PARADE_LEVELS[i] || takedowns >= PARADE_TAKEDOWNS[i]) s = i + 2;
  return s;
}

/** Words for the store and the Heroes browser (looks only). */
export const PARADE_STAGE_WORDS = 'Starts as a lantern head. The parade body grows at levels 4, 7 and 10 (or 2, 4 and 6 takedowns) and stretches to 12 lanterns during his ultimate.';
/** gaps6: the Chairman's and the Mega Meal's evolving forms, in words (the same stages as the parade). */
export const BOARD_STAGE_WORDS = 'Starts as the new hire. A stock-chart arrow rises at level 4, the gold office chair rolls in at 7, and the full Chairman mech arrives at 10 (or 2, 4 and 6 takedowns).';
export const TOWER_STAGE_WORDS = 'Starts as a slider. It becomes a Double at level 4, a 3-patty tower at 7 and the 5-patty Mega Meal on a golden tray at 10 (or 2, 4 and 6 takedowns).';

/** The evolving forms' trail kinds (the parade body and gaps6's two). */
const EVOLVING_KINDS: readonly TrailKind[] = ['parade', 'board', 'tower'];

/** Is this a coat whose form evolves in a match? */
export const isEvolving = (coatId: string | null | undefined): boolean => isMythicCoat(coatId) && EVOLVING_KINDS.includes(trailOf(coatId) as TrailKind);

/** The evolving form's words for a coat ('' when it does not evolve). */
export function evolveWords(coatId: string | null | undefined): string {
  if (!isEvolving(coatId)) return '';
  const k = trailOf(coatId);
  return k === 'board' ? BOARD_STAGE_WORDS : k === 'tower' ? TOWER_STAGE_WORDS : PARADE_STAGE_WORDS;
}

/**
 * The Heroes browser's Evolve clip: while on, every parade cycles through its four stages (a stage every
 * PREVIEW_STAGE_S seconds, each with its firework) and the ultimate does not stretch it.
 */
let previewCycle = false;
export const trailPreview = (): boolean => previewCycle;
export const PREVIEW_STAGE_S = 2.4;
export function setTrailPreview(on: boolean): void {
  previewCycle = on;
}
