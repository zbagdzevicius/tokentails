/**
 * Feel pass B5 (docs/plans/moba/FEEL-PASS.md): a distinct, short (~120 ms) sound for each kind of hard crowd control
 * an enemy hero winds up at the player, so a stun, a charm, a fear, a root or a sleep can be told apart by ear and
 * reacted to. Read from the hero data (client only; the sim is untouched).
 */
import { HEROES } from '../data/heroes';
import type { HeroId } from '../sim/api';

export type CcKind = 'stun' | 'charm' | 'fear' | 'root' | 'sleep';
const ORDER: readonly CcKind[] = ['stun', 'charm', 'fear', 'sleep', 'root'];
const SLOT_KEY = ['q', 'w', 'e', 'r'] as const;

/** The hard CC an ability of `hero` in `slot` (0..3) carries, or null. Pure. */
export function ccKindOf(hero: HeroId | undefined | null, slot: number): CcKind | null {
  if (!hero || slot < 0 || slot > 3) return null;
  const a = (HEROES[hero]?.abilities as Record<string, Record<string, unknown> | undefined> | undefined)?.[SLOT_KEY[slot]];
  if (!a) return null;
  for (const k of ORDER) if (typeof a[k] === 'number' && (a[k] as number) > 0) return k;
  return null;
}

/** The cue per CC kind: a sound and a playback rate (each one distinct), about 120 ms long. */
export const CC_CUE: Readonly<Record<CcKind, { name: 'blip' | 'squeak' | 'hyenaLaugh' | 'shieldChime'; rate: number; vol: number }>> = Object.freeze({
  stun: { name: 'blip', rate: 0.55, vol: 0.9 },
  root: { name: 'blip', rate: 1.45, vol: 0.8 },
  charm: { name: 'squeak', rate: 1.25, vol: 0.8 },
  fear: { name: 'hyenaLaugh', rate: 1.7, vol: 0.7 },
  sleep: { name: 'shieldChime', rate: 0.75, vol: 0.7 },
});
