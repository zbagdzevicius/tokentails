/**
 * Id-keyed Phaser texture and animation keys (plan F10, G3, G13; decision #39).
 *
 * Cats used to be keyed by name, so two cats called "Luna" shared one texture (the second
 * showed the first one's sprite), a cat renamed to "coin" or "tilemap" could clobber a scene
 * asset, and a re-skin kept the old sheet. Keys are now:
 *
 *   player-cat-${_id}-${shortHash(spriteImg)}   the playable cat; a new skin is a new key
 *   npc-${_id}-${shortHash(spriteImg)}           NPC cats (Shelter storefront, Home roster)
 *
 * NPC keys carry the sprite hash too (2e review): with a bare `npc-${_id}` a re-sent cat with
 * a new sprite URL had to replace the texture under the same key, which deleted it while the
 * on-screen NPC still drew from it and froze the Home render loop. A new skin is now a new
 * key, loaded beside the old one; the scene retires the old key after swapping sprites.
 *
 * Animations are prefixed by their texture key, so they are just as unique.
 *
 * Pure module: no Phaser import (Jest, SSR).
 */
import { hashString } from "./rng";

export interface KeyedCat {
  _id?: string | null;
  name?: string | null;
  spriteImg?: string | null;
}

/** Up to seven base-36 characters of 32-bit FNV-1a, zero-padded to seven; stable across devices. */
export function shortHash(value: string): string {
  return hashString(value).toString(36).padStart(7, "0");
}

/** Only characters that are safe in a key and a cache path. */
const safeId = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);

/**
 * The id part of a key. Every storefront and owned cat has an `_id`; the fallback (a hash of
 * name and sprite) only covers hand-built fixtures and the landing preview.
 */
export function catKeyId(cat: KeyedCat): string {
  const id = typeof cat._id === "string" ? cat._id.trim() : "";
  if (id) return safeId(id);
  return `anon${shortHash(`${cat.name ?? ""}|${cat.spriteImg ?? ""}`)}`;
}

export function playerCatTextureKey(cat: KeyedCat): string {
  return `player-cat-${catKeyId(cat)}-${shortHash(cat.spriteImg ?? "")}`;
}

export function npcTextureKey(cat: KeyedCat): string {
  return `npc-${catKeyId(cat)}-${shortHash(cat.spriteImg ?? "")}`;
}

export const PLAYER_CAT_PREFIX = "player-cat-";
export const NPC_PREFIX = "npc-";

export function isPlayerCatTextureKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(PLAYER_CAT_PREFIX);
}

/** A sprite URL worth handing to the loader: http(s), blob, capacitor, data:image, or a relative path. */
export function isLoadableSpriteUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (!scheme) return true;
  const name = scheme[1].toLowerCase();
  if (name === "data") return /^data:image\//i.test(trimmed);
  return name === "http" || name === "https" || name === "blob" || name === "capacitor";
}

/** Animation key for a cat texture: `${textureKey}_${ANIMATION}`. */
export function catAnimationKey<A extends string>(textureKey: string, animation: A): `${string}_${A}` {
  return `${textureKey}_${animation}`;
}

/** Every animation key a cat texture owns, for removal on re-skin. */
export function catAnimationKeys(textureKey: string, animations: readonly string[]): string[] {
  return animations.map((animation) => catAnimationKey(textureKey, animation));
}

/** Escapes text for the speech bubble's HTML (cat names are user-chosen). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
