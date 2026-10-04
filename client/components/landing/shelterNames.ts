import type { PublicShelter } from "@/api/impact-api";
import {
  PINK_PAW_LOCAL_NAME,
  PINK_PAW_NAME,
  PINK_PAW_SLUG,
} from "@/components/shelter-payouts/pinkPaw";

/**
 * The landing's "Cats in the game come from" list (globe section). Pink Paw is Rožinė pėdutė:
 * one shelter, shown once as "Pink Paw (Rožinė pėdutė)". The snapshot names it by its Lithuanian
 * name under the `rozine-pedute` slug; a second row for the same shelter (the English name, or
 * another slug) folds into that one entry. Other shelters keep their own name and order, and only
 * a repeated slug is dropped.
 */

/** "Rožinė Pėdutė" -> "rozine pedute": letter case and diacritics never split one shelter. */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

const PINK_PAW_KEYS = new Set([
  fold(PINK_PAW_NAME),
  fold(PINK_PAW_LOCAL_NAME),
  fold(PINK_PAW_SLUG),
  fold(`${PINK_PAW_NAME} ${PINK_PAW_LOCAL_NAME}`),
]);

/** The one display name for Pink Paw: English first, the shelter's own name in brackets. */
export const PINK_PAW_LANDING_NAME = `${PINK_PAW_NAME} (${PINK_PAW_LOCAL_NAME})`;

/** True when a snapshot row is Pink Paw, by slug or by either of its names. */
export function isPinkPawShelter(s: Pick<PublicShelter, "slug" | "name">): boolean {
  return s.slug === PINK_PAW_SLUG || PINK_PAW_KEYS.has(fold(s.name || ""));
}

export interface LandingShelterEntry {
  key: string;
  name: string;
  pinkPaw: boolean;
}

/** One entry per shelter, in snapshot order; Pink Paw once, under its combined name. */
export function landingShelterEntries(
  shelters: Pick<PublicShelter, "slug" | "name">[]
): LandingShelterEntry[] {
  const seen = new Set<string>();
  const out: LandingShelterEntry[] = [];
  for (const s of shelters) {
    if (!s.name) continue;
    const pinkPaw = isPinkPawShelter(s);
    // Other shelters de-duplicate by slug only: two "Happy Paws" in different countries stay two.
    const id = pinkPaw ? "pink-paw" : `slug:${s.slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      key: pinkPaw ? PINK_PAW_SLUG : s.slug,
      name: pinkPaw ? PINK_PAW_LANDING_NAME : s.name,
      pinkPaw,
    });
  }
  return out;
}
