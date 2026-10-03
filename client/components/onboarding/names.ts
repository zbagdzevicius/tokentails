import {
  CAT_NAME_MAX_LENGTH,
  CAT_NAME_MESSAGES,
  normalizeCatName,
  type CatNameErrorCode,
} from "@/shared-contracts/name";

/**
 * Name step helpers (plan G3 "Names"). Validation is the shared `normalizeCatName` contract, the
 * same code the backend runs on `POST /user/starter`, so an inline "ok" means the server accepts
 * it too (the reserved featured names are passed in once they are fetched).
 */

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; code: CatNameErrorCode; message: string };

export function checkName(raw: string, reserved: ReadonlyArray<string> = []): NameCheck {
  const result = normalizeCatName(raw, { reserved });
  if (result.ok) return { ok: true, name: result.name };
  return { ok: false, code: result.code, message: nameMessage(result.code) };
}

export function nameMessage(code: CatNameErrorCode): string {
  return CAT_NAME_MESSAGES[code] || CAT_NAME_MESSAGES.NAME_CHARS;
}

export { CAT_NAME_MAX_LENGTH };

/**
 * "Surprise me" names. Short, kind, Latin only (decision #23), none of them a staff, brand or
 * real-cat name. Every one is re-checked against the contract before it is offered, so a later
 * change to the reserved or blocked lists can only shrink this pool, never break the button.
 */
export const SURPRISE_NAMES: ReadonlyArray<string> = [
  "Nimbus",
  "Biscuit",
  "Pebble",
  "Maple",
  "Juniper",
  "Clover",
  "Waffles",
  "Comet",
  "Pumpkin",
  "Noodle",
  "Willow",
  "Sprout",
  "Toffee",
  "Basil",
  "Marble",
  "Ziggy",
  "Pixel",
  "Mochi",
  "Saffron",
  "Bramble",
  "Acorn",
  "Hazel",
  "Domino",
  "Tinsel",
  "Rusty",
  "Olive",
  "Echo",
  "Fable",
  "Mittens",
  "Meadow",
];

/**
 * A random valid name that differs from `current`. `random` is injectable for tests; Playwright's
 * seeded `Math.random` makes it repeatable in e2e.
 */
export function surpriseName(
  current: string,
  reserved: ReadonlyArray<string> = [],
  random: () => number = Math.random,
): string {
  const pool = SURPRISE_NAMES.filter(
    (name) => name.toLowerCase() !== current.trim().toLowerCase() && checkName(name, reserved).ok,
  );
  if (pool.length === 0) return current;
  return pool[Math.floor(random() * pool.length) % pool.length];
}
