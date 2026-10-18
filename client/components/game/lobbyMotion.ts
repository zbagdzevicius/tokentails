import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * One pause for the lobby's looping motion (WCAG 2.2.2 Pause, Stop, Hide). The impact board's
 * pause control sets it. While the lobby is on screen and paused:
 *   - <html> carries `data-motion-paused`, and styles/globals.scss stops every CSS animation inside
 *     the layers marked `data-lobby-motion` (the lobby scene, the corner HUD, the petals: the RESCUE
 *     heart, the PLAY/PACKS/EVENTS shine, the PROGRESS ping). Dialogs and their scrims are portalled
 *     outside those layers, so a modal opened while paused still fades in;
 *   - the cat GIFs (the hero on the altar, ABOUT ME) show a still frame (`useStillFrame`).
 * The choice lasts the session (module state, no storage) and only applies while the lobby is
 * mounted, so a run never starts frozen. Reduced motion never starts those loops (`motion-safe:`)
 * and stills the cats; the pause does the same for anyone who asks.
 */

export const MOTION_PAUSED_ATTR = "data-motion-paused";

let paused = false;
let lobbyMounted = 0;
const listeners = new Set<() => void>();

function emit() {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (paused && lobbyMounted > 0) root.setAttribute(MOTION_PAUSED_ATTR, "");
    else root.removeAttribute(MOTION_PAUSED_ATTR);
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while the lobby is shown and its motion is paused. */
function snapshot(): boolean {
  return paused && lobbyMounted > 0;
}

export function setLobbyMotionPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  emit();
}

/** Test seam. */
export function resetLobbyMotion(): void {
  paused = false;
  lobbyMounted = 0;
  emit();
}

/** The lobby's pause, for anything on screen with it (false on the server and outside the lobby). */
export function useLobbyMotionPaused(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Marks the lobby as mounted: the pause applies only while it is (LobbyScene calls it). */
export function useLobbyMotionScope(): void {
  useEffect(() => {
    lobbyMounted += 1;
    emit();
    return () => {
      lobbyMounted = Math.max(0, lobbyMounted - 1);
      emit();
    };
  }, []);
}

/**
 * A still frame for an animated image while `frozen`: `still` when the cat has one, else the
 * first frame drawn to a canvas. A cross-origin image without CORS cannot be read; then the GIF
 * keeps playing (null), which the caller treats as "no still".
 */
export function useStillFrame(src: string | null | undefined, frozen: boolean, still?: string | null): string | null {
  const [frame, setFrame] = useState<{ src: string; url: string } | null>(null);
  const need = frozen && !still && !!src;
  useEffect(() => {
    if (!need || !src || frame?.src === src) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height) return;
        ctx.drawImage(img, 0, 0);
        setFrame({ src, url: canvas.toDataURL("image/png") });
      } catch {
        // Tainted canvas: no still frame for this image.
      }
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [need, src, frame?.src]);
  if (!frozen || !src) return null;
  if (still) return still;
  return frame && frame.src === src ? frame.url : null;
}
