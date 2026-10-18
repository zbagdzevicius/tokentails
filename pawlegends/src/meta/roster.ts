/**
 * Host roster → cosmetics (POC.md §11.1, GDD "your cats in the game"). The host sends the signed-in player's Token
 * Tails cats as `roster{cats[]}`: `{id, name, type, tier, isStarter, starterBreed?, origin?, art?, catalogId?}`.
 * Render only, never in a replay or the hash. In app builds the host sends only starter and redeemed cats; the game
 * filters the same way again (`setAppBuild`), so a stray paid cat never shows there.
 *
 * - every cat of element X → the X chroma, usable on every hero
 * - tier → frames, for cats not from a pack only (decision #19: no frame depends on pack luck): RARE → Rare frame,
 *   EPIC → Epic frame, LEGENDARY → Legendary frame
 * - collection frames, deterministic: 1, 3 and 5 distinct named cats (not starter, not pack) → Buddy, Crew and
 *   Clowder frames. The best frame owned is worn.
 * - a starter cat with a `starterBreed` → that breed's free coat on every cat hero
 * - two cats walk with the player's waves as Companion Kittens and nap at the fountain: first the `prefer` ids (the
 *   cat just adopted, then the squad the player chose on the pick screen; meta/squad.ts), then starters, then
 *   roster order. The coat comes from `starterBreed`, else a stable hash of the cat id into 8 preset coats
 *
 * Tier sets frames and effect intensity only; nothing here changes a number in the match.
 */
import { cleanArt, cleanCatalogId } from '../embed/bridge';

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
  /** Card art (allowlisted CDN only, embed/bridge.ts `cleanArt`). */
  art?: string;
  /** The catalog cat this one was adopted from (24 hex). */
  catalogId?: string;
}

/** Origins an app build may show (Apple 3.1.3(b): nothing bought on the web). */
export const APP_ORIGINS: readonly string[] = Object.freeze(['starter', 'redeem']);

let appBuild = false;
/** The host said this is an app build: `parseRoster` keeps starter and redeemed cats only from now on. */
export function setAppBuild(isApp: boolean): void {
  appBuild = isApp;
}
export const isAppBuild = (): boolean => appBuild;

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

/** Untrusted `roster.cats` → valid cats, de-duplicated, at most ROSTER_MAX (app builds: starter and redeem only). */
export function parseRoster(v: unknown, opts: { isApp?: boolean } = {}): RosterCat[] {
  const isApp = opts.isApp ?? appBuild;
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
    if (isApp && !(cat.origin && APP_ORIGINS.includes(cat.origin)) && !(cat.isStarter && cat.origin === undefined)) continue;
    const art = cleanArt(c.art);
    if (art) cat.art = art;
    const catalogId = cleanCatalogId(c.catalogId);
    if (catalogId) cat.catalogId = catalogId;
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

export type TierFrame = 'frame.rare' | 'frame.epic' | 'frame.legendary' | CollectionFrame;
export type CollectionFrame = 'frame.buddy' | 'frame.crew' | 'frame.clowder';
/** Collection frames by distinct named cats owned. */
export const COLLECTION_FRAMES: readonly (readonly [number, CollectionFrame])[] = Object.freeze([
  [1, 'frame.buddy'],
  [3, 'frame.crew'],
  [5, 'frame.clowder'],
] as const);
/** Every roster frame, worst first (bestFrame wears the last one owned). */
export const FRAME_ORDER: readonly TierFrame[] = Object.freeze(['frame.buddy', 'frame.rare', 'frame.crew', 'frame.epic', 'frame.clowder', 'frame.legendary']);

export interface Companion {
  id: string;
  name: string;
  element: Element;
  tier: CatTier;
  /** A breed coat, or a preset index 0..KITTEN_COATS-1. */
  coat: StarterBreed | number;
  /** Card art (UI only; the 3D kitten uses `coat`). */
  art?: string;
  /** From a pack: it walks and gives its chroma, but no tier frame (decision #19; round 1 says so on its chip). */
  fromPack?: boolean;
}

export interface RosterCosmetics {
  /** Element chromas owned, in ELEMENTS order. */
  chromas: Element[];
  /** Tier frames owned, best last. */
  frames: TierFrame[];
  /** Breed coats for the cat heroes (from starter cats). */
  breedCoats: StarterBreed[];
  companions: Companion[];
  /** Every owned cat as a squad candidate (pick screen swap), companions first. */
  cats: Companion[];
  /** Number of cats (offer input). */
  count: number;
  /** Distinct named cats (not starter, not pack): the collection frame count. */
  named: number;
  /** Catalog ids owned (the Meet card never offers one of these). */
  catalogIds: string[];
}

/** A named cat: adopted by name (not a starter, not from a pack). Counted once per catalog cat. */
export const isNamedCat = (c: RosterCat): boolean => !c.isStarter && c.origin !== 'starter' && c.origin !== 'pack';

const TIER_FRAME: Partial<Record<CatTier, TierFrame>> = { RARE: 'frame.rare', EPIC: 'frame.epic', LEGENDARY: 'frame.legendary' };

const asCompanion = (c: RosterCat): Companion => ({ id: c.id, name: c.name, element: c.type, tier: c.tier, coat: c.starterBreed ?? stableIndex(c.id, KITTEN_COATS), ...(c.art ? { art: c.art } : {}), ...(c.origin === 'pack' ? { fromPack: true } : {}) });

/** `prefer`: cat ids or catalog ids that walk first, in order (meta/squad.ts squadPrefs). */
export function rosterCosmetics(cats: readonly RosterCat[], prefer: readonly string[] = []): RosterCosmetics {
  const els = new Set<Element>();
  const tiers = new Set<CatTier>();
  const breeds = new Set<StarterBreed>();
  const named = new Set<string>();
  const catalog = new Set<string>();
  for (const c of cats) {
    els.add(c.type);
    // decision #19: a frame never depends on pack luck
    if (c.origin !== 'pack') tiers.add(c.tier);
    if (c.starterBreed && (c.isStarter || c.origin === 'starter')) breeds.add(c.starterBreed);
    if (isNamedCat(c)) named.add(c.catalogId ?? c.id);
    if (c.catalogId) catalog.add(c.catalogId);
  }
  const frames = new Set<TierFrame>(TIERS.filter((t) => tiers.has(t) && TIER_FRAME[t]).map((t) => TIER_FRAME[t] as TierFrame));
  for (const [n, f] of COLLECTION_FRAMES) if (named.size >= n) frames.add(f);
  // Preferred cats first (the newest adoption, then the chosen squad), then starters, then roster order. A cat bought
  // after the first two never walked before (round 0 blocker: "Luna walks with your waves" was not true).
  // Round 1 ("my Legendary and Epic sat on the bench behind two Commons"): with no saved choice the highest tier walks
  // first, then starters, then roster order.
  const rank = (c: RosterCat): number => {
    const k = prefer.findIndex((id) => id === c.id || (!!c.catalogId && id === c.catalogId));
    if (k >= 0) return k;
    // round 2: at the same tier a cat adopted by name walks before a pack cat (it carries the frame)
    return prefer.length + (TIERS.length - 1 - TIERS.indexOf(c.tier)) * 4 + (c.origin === 'pack' ? 2 : 0) + (c.isStarter ? 0 : 1);
  };
  let ordered = cats.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  // Round 2 ("adopting Luna pushed my Legendary Queenie out of the squad"): a new adoption on top of a full chosen
  // squad replaces the lower-tier of the two (ties: the second), not always the second one.
  if (prefer.length > COMPANION_MAX && ordered.length > COMPANION_MAX) {
    const tierOf = (c: RosterCat): number => TIERS.indexOf(c.tier) * 2 + (c.origin === 'pack' ? 0 : 1);
    const rest = ordered.slice(1, prefer.length);
    const keep = rest
      .map((c, i) => ({ c, i }))
      .sort((a, b) => tierOf(b.c) - tierOf(a.c) || a.i - b.i)
      .slice(0, COMPANION_MAX - 1)
      .map((x) => x.c);
    ordered = [ordered[0], ...keep, ...ordered.filter((c, i) => i > 0 && !keep.includes(c))];
  }
  return {
    chromas: ELEMENTS.filter((e) => els.has(e)),
    frames: FRAME_ORDER.filter((f) => frames.has(f)),
    breedCoats: STARTER_BREEDS.filter((b) => breeds.has(b)),
    companions: ordered.slice(0, COMPANION_MAX).map(asCompanion),
    cats: ordered.map(asCompanion),
    count: cats.length,
    named: named.size,
    catalogIds: [...catalog],
  };
}

export const EMPTY_ROSTER: RosterCosmetics = Object.freeze({ chromas: [], frames: [], breedCoats: [], companions: [], cats: [], count: 0, named: 0, catalogIds: [] }) as RosterCosmetics;
