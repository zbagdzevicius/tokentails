/**
 * The signed-in player's Token Tails cats as the game's `roster.cats[]` (POC.md §11.1): `{id, name, type, tier,
 * isStarter, starterBreed?, origin?, art?, catalogId?, sprite?}`. `sprite` is the sprite sheet (`spriteImg`, a
 * Token Tails CDN `.png`): the game's card skins read each cat's palette from it. `art` is the card art (`catImg`, Token Tails CDN only) and
 * `catalogId` the catalog cat it is a copy of (`sourceCat`, else the blessing's cat), so the game can show the
 * card and the host knows which cat `open-cat` names. The game renders them as chromas, frames and Companion Kittens; they are
 * render-only and never part of a replay. Owned cats carry no breed field, so `starterBreed` is sent only when the
 * cat object has a valid one; the game falls back to a stable hash of the id (§11.1).
 *
 * Only known enum values and clean short strings cross. App builds send only `starter` and `redeem` cats (Apple
 * 3.1.3(b): no cat bought on the web is unlocked inside the app).
 */
import type { ICat } from "@/models/cats";
import { CatAbilityType, Tier } from "@/models/cats";
import { CAT_ORIGINS, STARTER_BREEDS } from "@/shared-contracts/enums";
import { artUrlOf, catNameOf, isCatalogId, PAWLEGENDS_CAT_NAME_MAX, spriteUrlOf, type PawlegendsRosterCat } from "./bridge";

/** Most cats sent (the game shows two Companion Kittens; the rest pick chromas). */
export const PAWLEGENDS_ROSTER_MAX = 24;
export { PAWLEGENDS_CAT_NAME_MAX };
/** The only origins an app build may show (a starter, or a cat redeemed with a code). */
export const APP_ROSTER_ORIGINS: readonly string[] = ["starter", "redeem"];

const ABILITY_TYPES = new Set<string>(Object.values(CatAbilityType));
const TIERS = new Set<string>(Object.values(Tier));
const ORIGINS = new Set<string>(CAT_ORIGINS);
const BREEDS = new Set<string>(STARTER_BREEDS);

/** A clean single-line name, cut to `PAWLEGENDS_CAT_NAME_MAX`; null when nothing is left. */
export const rosterNameOf = catNameOf;

const idOf = (value: unknown): string | null => {
  const raw = typeof value === "string" ? value : value && typeof value === "object" ? (value as { _id?: unknown })._id : null;
  const id = typeof raw === "string" ? raw.toLowerCase() : null;
  return isCatalogId(id) ? id : null;
};

/** The catalog cat an owned cat is a copy of: `sourceCat`, else the blessing's cat. */
export function catalogIdOf(cat: { sourceCat?: unknown; blessing?: unknown }): string | null {
  const blessing = cat.blessing && typeof cat.blessing === "object" ? (cat.blessing as { cat?: unknown }).cat : null;
  return idOf(cat.sourceCat) ?? idOf(blessing);
}

export function rosterCatOf(cat: Partial<ICat> & { starterBreed?: unknown; sourceCat?: unknown }): PawlegendsRosterCat | null {
  const id = typeof cat._id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(cat._id) ? cat._id : null;
  const name = rosterNameOf(cat.name);
  if (!id || !name || !ABILITY_TYPES.has(String(cat.type)) || !TIERS.has(String(cat.tier))) return null;
  const out: PawlegendsRosterCat = {
    id,
    name,
    type: String(cat.type),
    tier: String(cat.tier),
    isStarter: cat.isStarter === true || cat.isGuestStarter === true,
  };
  if (typeof cat.starterBreed === "string" && BREEDS.has(cat.starterBreed)) out.starterBreed = cat.starterBreed;
  if (typeof cat.origin === "string" && ORIGINS.has(cat.origin)) out.origin = cat.origin;
  const art = artUrlOf(cat.catImg);
  if (art) out.art = art;
  // the sprite sheet (`.png` only): the game reads the cat's palette and pattern from it for its card skins
  const sprite = spriteUrlOf(cat.spriteImg);
  if (sprite) out.sprite = sprite;
  const catalogId = catalogIdOf(cat);
  if (catalogId) out.catalogId = catalogId;
  return out;
}

/**
 * The roster: valid cats only, de-duplicated by id, starters first, at most `PAWLEGENDS_ROSTER_MAX`. With `isApp`
 * only starter and redeemed cats are kept.
 */
export function rosterOf(cats: readonly unknown[] | null | undefined, isApp = false): PawlegendsRosterCat[] {
  if (!Array.isArray(cats)) return [];
  const seen = new Set<string>();
  const out: PawlegendsRosterCat[] = [];
  for (const raw of cats) {
    if (!raw || typeof raw !== "object") continue;
    const cat = rosterCatOf(raw as ICat);
    if (!cat || seen.has(cat.id)) continue;
    if (isApp && !cat.isStarter && !APP_ROSTER_ORIGINS.includes(cat.origin ?? "")) continue;
    seen.add(cat.id);
    out.push(cat);
  }
  out.sort((a, b) => Number(b.isStarter) - Number(a.isStarter));
  return out.slice(0, PAWLEGENDS_ROSTER_MAX);
}
