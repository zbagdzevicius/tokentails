/**
 * Owned cosmetics earned in play (GDD 8): season-track claims and streak milestones. Shop, charity and Club
 * items come from entitlements (money lane), not from here. Stored under `cosmetics` as "slot:id" strings
 * because ids are only unique per slot (types.ts COSMETICS).
 *
 * `ownedCosmetics()` returns numeric keys: slotIndex * 256 + id (collar 0, hat 1, trail 2, caption 3,
 * stamp 4), so a collar's key equals its CatSpec.collar id. `cosmeticFromKey` decodes one.
 */
import { COSMETICS, cosmetic, type CatSpec, type CosmeticDef, type CosmeticSlot, type Store } from '../types';
import { KEY_PREVIEW_STREAK, KEY_STREAK, readStreak } from './streak';

export const KEY_COSMETICS = 'cosmetics';
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ['collar', 'hat', 'trail', 'caption', 'stamp'];
/** Streak milestones that grant the Streak star collar (GDD 8: 7 / 30 / 100 days). */
export const STREAK_COLLAR_DAYS: readonly number[] = [7, 30, 100];
export const STREAK_COLLAR_ID = 7;

export const cosmeticKey = (c: Pick<CosmeticDef, 'slot' | 'id'>): number => COSMETIC_SLOTS.indexOf(c.slot) * 256 + c.id;
export function cosmeticFromKey(key: number): CosmeticDef | undefined {
  if (!Number.isInteger(key) || key < 0) return undefined;
  const slot = COSMETIC_SLOTS[Math.floor(key / 256)];
  return slot ? cosmetic(slot, key % 256) : undefined;
}

const tag = (c: Pick<CosmeticDef, 'slot' | 'id'>) => `${c.slot}:${c.id}`;

/**
 * Sources this file may hold: items earned in play. Shop, charity and Club items are entitlements (money lane):
 * a save code or an edited store that lists them unlocks nothing.
 */
export const EARNABLE_SOURCES: readonly CosmeticDef['source'][] = ['free_track', 'club_track', 'streak'];
export const isEarnable = (c: Pick<CosmeticDef, 'source'>): boolean => EARNABLE_SOURCES.includes(c.source);

/** Earned cosmetics as "slot:id" tags (only earnable ones: paid ids are dropped, never trusted from storage). */
export function readOwned(store: Store): string[] {
  try {
    const raw = store.get<{ owned?: unknown } | null>(KEY_COSMETICS, null);
    const list = raw && Array.isArray(raw.owned) ? raw.owned : [];
    const valid = new Set(COSMETICS.filter(isEarnable).map(tag));
    return [...new Set(list.filter((t): t is string => typeof t === 'string' && valid.has(t)))];
  } catch {
    return [];
  }
}

/** Add one earned cosmetic; returns true when it is new. */
export function grantCosmetic(store: Store, c: Pick<CosmeticDef, 'slot' | 'id'>): boolean {
  try {
    const owned = readOwned(store);
    const t = tag(c);
    const def = cosmetic(c.slot, c.id);
    if (owned.includes(t) || !def || !isEarnable(def)) return false;
    owned.push(t);
    store.set(KEY_COSMETICS, { owned });
    return true;
  } catch {
    return false;
  }
}

function bestStreak(store: Store): number {
  try {
    return Math.max(readStreak(store, 1, KEY_STREAK).best, readStreak(store, 1, KEY_PREVIEW_STREAK).best);
  } catch {
    return 0;
  }
}

/** Earned cosmetics as defs (season claims + streak star collar). */
export function ownedCosmeticDefs(store: Store): CosmeticDef[] {
  const out: CosmeticDef[] = [];
  for (const t of readOwned(store)) {
    const [slot, id] = t.split(':');
    const c = cosmetic(slot as CosmeticSlot, Number(id));
    if (c) out.push(c);
  }
  if (bestStreak(store) >= STREAK_COLLAR_DAYS[0] && !out.some((c) => c.slot === 'collar' && c.id === STREAK_COLLAR_ID)) {
    const star = cosmetic('collar', STREAK_COLLAR_ID);
    if (star) out.push(star);
  }
  return out;
}

export function ownedCosmetics(store: Store): number[] {
  return ownedCosmeticDefs(store).map(cosmeticKey).sort((a, b) => a - b);
}

/**
 * A collar or hat the player does not own comes off (a cat from someone's link, a clip handoff): the chips only
 * limit new picks, so an unowned id already in the spec would otherwise be worn for free. `owned` undefined = no
 * ownership info (tests, studio): the spec is kept as it is.
 */
export function wearOwned(s: CatSpec, owned: { collars: readonly number[]; hats: readonly number[] } | undefined): CatSpec {
  if (!owned) return { ...s };
  return {
    ...s,
    collar: s.collar && owned.collars.includes(s.collar) ? s.collar : 0,
    hat: s.hat && owned.hats.includes(s.hat) ? s.hat : 0,
  };
}
