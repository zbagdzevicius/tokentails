/**
 * Host roster → cosmetics (POC.md §11.1, GDD "your cats in the game"). The host sends the signed-in player's Token
 * Tails cats as `roster{cats[]}`: `{id, name, type, tier, isStarter, starterBreed?, origin?}`. Render only, never in
 * a replay or the hash, and owned cats show in app builds too (they are not Pawlegends purchases).
 *
 * - every cat of element X → the X chroma, usable on every hero
 * - tier → frames: RARE → Rare frame, EPIC → Epic frame, LEGENDARY → Legendary frame (the best one is worn)
 * - a starter cat with a `starterBreed` → that breed's free coat on every cat hero
 * - the first two cats walk with the player's waves as Companion Kittens and nap at the fountain; the coat comes
 *   from `starterBreed`, else a stable hash of the cat id into 8 preset coats (owned cats carry no breed)
 *
 * Tier sets frames and effect intensity only; nothing here changes a number in the match.
 */

export const ELEMENTS = Object.freeze(['ICE', 'ELECTRIC', 'FIRE', 'WIND', 'DARK', 'WATER', 'GRASS', 'SAND', 'FAIRY', 'STELLAR'] as const);
export type Element = (typeof ELEMENTS)[number];
export const TIERS = Object.freeze(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const);
export type CatTier = (typeof TIERS)[number];
export const STARTER_BREEDS = Object.freeze(['SCOUT', 'PINKIE', 'SHADOW', 'MISTY', 'SUNNY'] as const);
export type StarterBreed = (typeof STARTER_BREEDS)[number];
export const CAT_ORIGINS = Object.freeze(['starter', 'pack', 'redeem', 'adopt', 'portrait'] as const);

/** Display names for elements (the STELLAR element is labelled "Star", POC.md §15 item 24). */
export const ELEMENT_NAME: Readonly<Record<Element, string>> = Object.freeze({
  ICE: 'Ice',
  ELECTRIC: 'Spark',
  FIRE: 'Fire',
  WIND: 'Wind',
  DARK: 'Shadow',
  WATER: 'Water',
  GRASS: 'Grass',
  SAND: 'Sand',
  FAIRY: 'Fairy',
  STELLAR: 'Star',
});

export interface RosterCat {
  id: string;
  name: string;
  type: Element;
  tier: CatTier;
  isStarter: boolean;
  starterBreed?: StarterBreed;
  origin?: string;
}

export const ROSTER_MAX = 24;
export const COMPANION_MAX = 2;
/** Preset kitten coats for cats without a breed (index = stable hash of the id). */
export const KITTEN_COATS = 8;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A clean single-line display name, or null. Never rendered as HTML by callers (textContent / canvas only). */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 24) : null;
}

/** Untrusted `roster.cats` → valid cats, de-duplicated, at most ROSTER_MAX. */
export function parseRoster(v: unknown): RosterCat[] {
  if (!Array.isArray(v)) return [];
  const out: RosterCat[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (out.length >= ROSTER_MAX) break;
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const id = typeof c.id === 'string' && ID.test(c.id) ? c.id : null;
    const name = cleanName(c.name);
    if (!id || !name || seen.has(id)) continue;
    if (!(ELEMENTS as readonly unknown[]).includes(c.type) || !(TIERS as readonly unknown[]).includes(c.tier)) continue;
    seen.add(id);
    const cat: RosterCat = { id, name, type: c.type as Element, tier: c.tier as CatTier, isStarter: c.isStarter === true };
    if ((STARTER_BREEDS as readonly unknown[]).includes(c.starterBreed)) cat.starterBreed = c.starterBreed as StarterBreed;
    if ((CAT_ORIGINS as readonly unknown[]).includes(c.origin)) cat.origin = c.origin as string;
    out.push(cat);
  }
  return out;
}

/** FNV-1a of a string → 0..n-1. Stable across sessions and browsers. */
export function stableIndex(id: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % n;
}

export type TierFrame = 'frame.rare' | 'frame.epic' | 'frame.legendary';

export interface Companion {
  id: string;
  name: string;
  element: Element;
  tier: CatTier;
  /** A breed coat, or a preset index 0..KITTEN_COATS-1. */
  coat: StarterBreed | number;
}

export interface RosterCosmetics {
  /** Element chromas owned, in ELEMENTS order. */
  chromas: Element[];
  /** Tier frames owned, best last. */
  frames: TierFrame[];
  /** Breed coats for the cat heroes (from starter cats). */
  breedCoats: StarterBreed[];
  companions: Companion[];
  /** Number of cats (offer input). */
  count: number;
}

const TIER_FRAME: Partial<Record<CatTier, TierFrame>> = { RARE: 'frame.rare', EPIC: 'frame.epic', LEGENDARY: 'frame.legendary' };

export function rosterCosmetics(cats: readonly RosterCat[]): RosterCosmetics {
  const els = new Set<Element>();
  const tiers = new Set<CatTier>();
  const breeds = new Set<StarterBreed>();
  for (const c of cats) {
    els.add(c.type);
    tiers.add(c.tier);
    if (c.starterBreed && (c.isStarter || c.origin === 'starter')) breeds.add(c.starterBreed);
  }
  // Starters first (the host sorts them first too), then roster order.
  const ordered = [...cats].sort((a, b) => Number(b.isStarter) - Number(a.isStarter));
  return {
    chromas: ELEMENTS.filter((e) => els.has(e)),
    frames: TIERS.filter((t) => tiers.has(t) && TIER_FRAME[t]).map((t) => TIER_FRAME[t] as TierFrame),
    breedCoats: STARTER_BREEDS.filter((b) => breeds.has(b)),
    companions: ordered.slice(0, COMPANION_MAX).map((c) => ({ id: c.id, name: c.name, element: c.type, tier: c.tier, coat: c.starterBreed ?? stableIndex(c.id, KITTEN_COATS) })),
    count: cats.length,
  };
}

export const EMPTY_ROSTER: RosterCosmetics = Object.freeze({ chromas: [], frames: [], breedCoats: [], companions: [], count: 0 }) as RosterCosmetics;
