/**
 * The signed-in player's Token Tails cats as the game's `roster.cats[]` (POC.md §11.1): `{id, name, type, tier,
 * isStarter, starterBreed?, origin?}`. The game renders them as chromas, frames and Companion Kittens; they are
 * render-only and never part of a replay. Owned cats carry no breed field, so `starterBreed` is sent only when the
 * cat object has a valid one; the game falls back to a stable hash of the id (§11.1).
 *
 * Only known enum values and clean short strings cross. Owned cats show in app builds too (GDD §9.8: they are
 * not Pawlegends purchases).
 */
import type { ICat } from "@/models/cats";
import { CatAbilityType, Tier } from "@/models/cats";
import { CAT_ORIGINS, STARTER_BREEDS } from "@/shared-contracts/enums";
import type { PawlegendsRosterCat } from "./bridge";

/** Most cats sent (the game shows two Companion Kittens; the rest pick chromas). */
export const PAWLEGENDS_ROSTER_MAX = 24;
export const PAWLEGENDS_CAT_NAME_MAX = 32;

const ABILITY_TYPES = new Set<string>(Object.values(CatAbilityType));
const TIERS = new Set<string>(Object.values(Tier));
const ORIGINS = new Set<string>(CAT_ORIGINS);
const BREEDS = new Set<string>(STARTER_BREEDS);

/** A clean single-line name, cut to `PAWLEGENDS_CAT_NAME_MAX`; null when nothing is left. */
export function rosterNameOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, PAWLEGENDS_CAT_NAME_MAX) : null;
}

export function rosterCatOf(cat: Partial<ICat> & { starterBreed?: unknown }): PawlegendsRosterCat | null {
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
  return out;
}

/** The roster: valid cats only, de-duplicated by id, starters first, at most `PAWLEGENDS_ROSTER_MAX`. */
export function rosterOf(cats: readonly unknown[] | null | undefined): PawlegendsRosterCat[] {
  if (!Array.isArray(cats)) return [];
  const seen = new Set<string>();
  const out: PawlegendsRosterCat[] = [];
  for (const raw of cats) {
    if (!raw || typeof raw !== "object") continue;
    const cat = rosterCatOf(raw as ICat);
    if (!cat || seen.has(cat.id)) continue;
    seen.add(cat.id);
    out.push(cat);
  }
  out.sort((a, b) => Number(b.isStarter) - Number(a.isStarter));
  return out.slice(0, PAWLEGENDS_ROSTER_MAX);
}
