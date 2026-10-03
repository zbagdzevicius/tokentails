/**
 * Loading the playable cat's sheet under its id key (plan F10, G3; decision #39).
 *
 * `player-cat-${_id}-${shortHash(spriteImg)}`: a new skin is a new key, so the old sheet is
 * never shown for the new skin. The previous player texture (with its animations) is kept
 * until the new sheet has loaded: the caller swaps sprites, then calls `retirePrevious()`
 * (`textures.remove` on re-skin). A failed load leaves the previous texture, so the old cat
 * can stay on screen. Two cats with the same name never share a texture.
 *
 * No Phaser runtime import (Jest).
 */
import {
  loadSpritesheets,
  removeTexture,
  type LoaderSceneLike,
} from "@/components/Phaser/look/loadTextures";
import {
  isLoadableSpriteUrl,
  playerCatTextureKey,
  type KeyedCat,
} from "@/components/Phaser/look/textureKeys";
import { PLAYER_ANIMATION_NAMES } from "./playerAnimation";

export const CAT_FRAME_SIZE = 48;
export const BLESSING_FRAME_SIZE = 64;

export interface PlayerCatLike extends KeyedCat {
  type?: string;
  blessing?: unknown;
}

export interface PlayerCatTextures {
  /** The player texture key; exists only when `loaded`. */
  key: string;
  loaded: boolean;
  /** `blessing-${type}` when requested and loaded. */
  blessingKey: string | null;
  /**
   * Removes the previous player texture and its animations. Call it once no sprite uses that
   * texture any more (after the new player sprite exists). A no-op after a failed load, when
   * the key did not change, or when a newer load has already taken over.
   */
  retirePrevious: () => void;
}

/** The player key in use per texture manager, so a re-skin can drop the previous one. */
const currentPlayerKey = new WeakMap<object, string>();

export function blessingTextureKey(type: string): string {
  return `blessing-${type}`;
}

/**
 * Loads the player sheet (and optionally the blessing sheet) in one race-free pass. Nothing is
 * removed before the new sheet is in; see `retirePrevious`.
 */
export async function loadPlayerCatTextures(
  scene: LoaderSceneLike,
  cat: PlayerCatLike,
  options: { blessing?: boolean; blessingUrl?: string } = {},
): Promise<PlayerCatTextures> {
  const key = playerCatTextureKey(cat);
  const wantsBlessing = !!options.blessing && typeof cat.type === "string" && !!options.blessingUrl;
  const blessingKey = wantsBlessing ? blessingTextureKey(cat.type as string) : null;

  const requests = [];
  if (isLoadableSpriteUrl(cat.spriteImg)) {
    requests.push({ key, url: cat.spriteImg, frameWidth: CAT_FRAME_SIZE, frameHeight: CAT_FRAME_SIZE });
  }
  if (blessingKey && options.blessingUrl) {
    requests.push({
      key: blessingKey,
      url: options.blessingUrl,
      frameWidth: BLESSING_FRAME_SIZE,
      frameHeight: BLESSING_FRAME_SIZE,
    });
  }

  const result = await loadSpritesheets(scene, requests, { animations: PLAYER_ANIMATION_NAMES });
  const loaded = result.loaded.includes(key);

  let retirePrevious = () => {};
  if (loaded) {
    const previous = currentPlayerKey.get(scene.textures);
    currentPlayerKey.set(scene.textures, key);
    if (previous && previous !== key) {
      let retired = false;
      retirePrevious = () => {
        if (retired) return;
        retired = true;
        // A later pick may have switched back to that skin in the meantime.
        if (currentPlayerKey.get(scene.textures) === previous) return;
        removeTexture(scene, previous, PLAYER_ANIMATION_NAMES);
      };
    }
  }

  return {
    key,
    loaded,
    blessingKey: blessingKey && result.loaded.includes(blessingKey) ? blessingKey : null,
    retirePrevious,
  };
}

/** Same cat and same skin: nothing to reload. */
export function isSamePlayerCat(a: KeyedCat | null | undefined, b: KeyedCat | null | undefined): boolean {
  if (!a || !b) return false;
  return playerCatTextureKey(a) === playerCatTextureKey(b);
}
