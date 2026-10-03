/**
 * Window signals between a game scene and its React container (plan G12): `tt:announce` feeds the
 * container's `aria-live` region, and `tt:scene-ready` lets the container fade the canvas in once
 * the first frame is laid out. Phaser-free, so the container and Jest import it.
 *
 * The names are generic (`detail.game` says which game), so the other modes can adopt them; for
 * now Paw Match is the only sender (task 5c).
 */

export const TT_ANNOUNCE = "tt:announce";
export const TT_SCENE_READY = "tt:scene-ready";

export type AnnouncePoliteness = "polite" | "assertive";

export interface TTAnnounceDetail {
  game: string;
  message: string;
  politeness?: AnnouncePoliteness;
}

export interface TTSceneReadyDetail {
  game: string;
}

export const MATCH3_GAME_ID = "match3";

function dispatch<T>(type: string, detail: T) {
  if (typeof window === "undefined" || typeof CustomEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent<T>(type, { detail }));
  } catch {
    // A listener threw; the scene must keep running.
  }
}

export function announce(game: string, message: string, politeness: AnnouncePoliteness = "polite") {
  if (!message) return;
  dispatch<TTAnnounceDetail>(TT_ANNOUNCE, { game, message, politeness });
}

export function signalSceneReady(game: string) {
  dispatch<TTSceneReadyDetail>(TT_SCENE_READY, { game });
}
