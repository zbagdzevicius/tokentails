/**
 * The game's `featured {cats[]}` (at most 2): unowned direct-purchase cats from the public `GET /cat/sale`
 * storefront, the guest companion card of the pick and results screens and the only cats a `meet` offer may name.
 *
 * Rules: a cat counts only when the server would sell it on its own (`isCatForSale`) and the player holds no copy
 * (`ownsCopy`). Elements the player's roster lacks come first, and the two picks differ in element when they can,
 * so a new cat always brings a new trail colour. Ties rotate once a day (a stable hash of the id and the UTC day),
 * so the card is fresh on the next visit but never flickers within one. Never packs, never random, never in app
 * builds (the host sends `[]` there).
 *
 * No React: the storefront, the owned cats and the clock come in, so the rules are unit-tested.
 */
import type { ICat } from "@/models/cats";
import { CatAbilityType } from "@/models/cats";
import { isCatForSale, ownsCopy } from "@/components/shelter/catSale";
import { artUrlOf, catNameOf, PAWLEGENDS_FEATURED_LIMIT, spriteUrlOf, type PawlegendsFeaturedCat, type PawlegendsRosterCat } from "./bridge";

const ABILITY_TYPES = new Set<string>(Object.values(CatAbilityType));
const DAY_MS = 24 * 60 * 60 * 1000;

/** FNV-1a, 32 bit, with the murmur3 finaliser (ids that differ in one character spread out): a stable order for ties. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Every cat of a storefront (`{ shelterKey: ICat[] }`, `_meta` ignored), first copy of each id only. */
export function storefrontCats(storefront: Record<string, unknown> | null | undefined): ICat[] {
  if (!storefront || typeof storefront !== "object") return [];
  const seen = new Set<string>();
  const out: ICat[] = [];
  for (const [key, list] of Object.entries(storefront)) {
    if (key.startsWith("_") || !Array.isArray(list)) continue;
    for (const cat of list as ICat[]) {
      if (!cat || typeof cat !== "object" || typeof cat._id !== "string" || seen.has(cat._id)) continue;
      seen.add(cat._id);
      out.push(cat);
    }
  }
  return out;
}

export interface FeaturedPick {
  cats: PawlegendsFeaturedCat[];
  /** The storefront cats behind `cats`, by catalog id (the purchase sheet renders them). */
  byId: Map<string, ICat>;
}

export function pickFeatured(
  forSale: readonly ICat[],
  owned: ICat[] | undefined,
  roster: readonly Pick<PawlegendsRosterCat, "type">[],
  now: number = Date.now(),
  limit: number = PAWLEGENDS_FEATURED_LIMIT,
  /** Catalog ids never featured: the shelter champions' cards reach the offer engine only as a champion offer. */
  exclude: ReadonlySet<string> = new Set()
): FeaturedPick {
  const day = Math.floor(now / DAY_MS);
  const have = new Set(roster.map((c) => c.type));
  const candidates = forSale
    .filter(
      (cat) =>
        isCatForSale(cat) &&
        !exclude.has(String(cat._id).toLowerCase()) &&
        !ownsCopy(owned, cat) &&
        ABILITY_TYPES.has(String(cat.type)) &&
        !!catNameOf(cat.name) &&
        // Pawlegends playtest round 1: never offer a cat the player cannot see (the Meet card showed a paw placeholder)
        !!artUrlOf(cat.catImg)
    )
    .map((cat) => ({ cat, missing: !have.has(String(cat.type)), order: hash(`${day}:${cat._id}`) }))
    .sort((a, b) => Number(b.missing) - Number(a.missing) || a.order - b.order);

  const picked: ICat[] = [];
  const types = new Set<string>();
  // First pass: one cat per element; second pass fills what is left.
  for (const { cat } of candidates) {
    if (picked.length >= limit) break;
    if (types.has(String(cat.type))) continue;
    types.add(String(cat.type));
    picked.push(cat);
  }
  for (const { cat } of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(cat)) picked.push(cat);
  }

  const byId = new Map<string, ICat>();
  const cats: PawlegendsFeaturedCat[] = [];
  for (const cat of picked) {
    const catalogId = String(cat._id).toLowerCase();
    const featured: PawlegendsFeaturedCat = { catalogId, name: catNameOf(cat.name)!, type: String(cat.type) };
    const art = artUrlOf(cat.catImg);
    if (art) featured.art = art;
    // card skins: a locked preview tile and showcase bots read the sprite; the tier caps their look at Rare
    const sprite = spriteUrlOf(cat.spriteImg);
    if (sprite) featured.sprite = sprite;
    if (typeof cat.tier === "string") featured.tier = String(cat.tier);
    cats.push(featured);
    byId.set(catalogId, cat);
  }
  return { cats, byId };
}
