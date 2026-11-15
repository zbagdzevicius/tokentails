/**
 * Coat trails, data only (gaps5 skins v2; render/skins/coatTrail.ts draws them): which coats have one, the Mythic
 * parade's evolving stages and the Heroes browser's Evolve preview switch. No three.js, so the menus can read it.
 */
import { isMythicCoat } from '../../money/catalog';

export type TrailKind = 'parade' | 'stripes' | 'drips';

/** The coats with a trail. */
export const COAT_TRAILS: Readonly<Record<string, TrailKind>> = Object.freeze({
  'coat.frankie.store_paper_parade': 'parade',
  'coat.nugget.store_robo_vac': 'stripes',
  'coat.marshmallow.store_soft_serve': 'drips',
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
export const PARADE_STAGE_WORDS = 'Starts as a lantern head; the parade body grows at levels 4, 7 and 10 (or 2, 4 and 6 takedowns) and stretches to twelve lanterns during his ultimate.';

/** Is this a coat whose form evolves in a match? */
export const isEvolving = (coatId: string | null | undefined): boolean => isMythicCoat(coatId) && trailOf(coatId) === 'parade';

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
