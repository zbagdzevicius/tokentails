// The Wardrobe look: one catalogue index per slot. Pure (node-importable). WARDROBE lane owns this file, but the
// exports below are CONTRACT (ITERATION2.md): the SHARE lane puts look codes in challenge links and ghosts, and the
// save stores the equipped code. Keep the codec stable: 6 base-36 chars, slot order as in LOOK_SLOTS, catalogue
// indices append-only (a code made today must decode to the same items forever).

export const LOOK_SLOTS = ['fur', 'pattern', 'eyes', 'hat', 'scarf', 'fx'] as const;
export type LookSlot = (typeof LOOK_SLOTS)[number];
/** catalogue index per slot (src/wardrobe/catalog.ts); 0 = Mochi's classic look */
export type Look = Record<LookSlot, number>;

export const DEFAULT_LOOK: Readonly<Look> = Object.freeze({ fur: 0, pattern: 0, eyes: 0, hat: 0, scarf: 0, fx: 0 });
/** one base-36 digit per slot */
export const LOOK_MAX_INDEX = 35;

const clampIdx = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(LOOK_MAX_INDEX, Math.floor(n))) : 0);

/** 6 chars, e.g. '000000' (classic) or '3a0210'. */
export function encodeLook(l: Partial<Look>): string {
  let s = '';
  for (const k of LOOK_SLOTS) s += clampIdx(l[k]).toString(36);
  return s;
}

/** Anything -> a Look (bad input = the classic look). Indices past the local catalogue are fixed by normalizeLook. */
export function decodeLook(code: unknown): Look {
  const out: Look = { ...DEFAULT_LOOK };
  if (typeof code !== 'string' || !/^[0-9a-z]{6}$/.test(code)) return out;
  LOOK_SLOTS.forEach((k, i) => (out[k] = parseInt(code[i], 36)));
  return out;
}
