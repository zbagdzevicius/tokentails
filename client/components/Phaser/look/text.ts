/**
 * Crisp text on the F10 backing store (plan F4 text resolution, F10).
 *
 * No Phaser runtime import.
 */
import { getCanvasPixelRatio, type RegistryLike } from "./registry";

interface SceneLike {
  registry?: RegistryLike | null;
  game?: { registry?: RegistryLike | null } | null;
}

/** Highest text resolution (F4: `camera.zoom x canvasPixelRatio`, capped at 3). */
export const MAX_TEXT_RESOLUTION = 3;

/** Resolution for text drawn through a camera at `cameraZoom` backing pixels per world unit. */
export function textResolutionFor(cameraZoom: number, dpr: number): number {
  const wanted = Math.max(dpr, Number.isFinite(cameraZoom) ? cameraZoom : 1, 1);
  return Math.min(MAX_TEXT_RESOLUTION, Math.round(wanted * 100) / 100);
}

interface TextLike {
  type?: string;
  style?: { resolution?: number };
  setResolution?(value: number): unknown;
  texture?: { setFilter?(mode: number): unknown };
  /** Set while the object lives; Phaser clears it on destroy. */
  scene?: unknown;
  once?(event: string, fn: () => void): unknown;
}

interface EventedSceneLike extends SceneLike {
  cameras?: { main?: { zoom: number } | null } | null;
  sys?: {
    events?: {
      on(event: string, fn: (object: TextLike) => void): unknown;
      off(event: string, fn: (object: TextLike) => void): unknown;
      once(event: string, fn: () => void): unknown;
    } | null;
  } | null;
}

/** `Phaser.Textures.FilterMode.LINEAR`. */
const FILTER_LINEAR = 0;

/** Per scene: re-applies the resolution to the texts this helper manages. */
const refreshers = new WeakMap<object, () => void>();

/**
 * Text objects rasterise at resolution 1 by default; with the camera now zoomed by the ratio
 * that would be a 1x bitmap blown up. Every Text added to the scene without an explicit
 * resolution gets `textResolutionFor(camera zoom, dpr)` and a LINEAR filter (glyph edges are
 * not pixel art). Display size is unchanged. The G12 `ttText` factory supersedes this when it
 * lands; texts that set their own resolution are left alone.
 *
 * The resolution is re-applied after the scene's `create()` (texts added before the scene's
 * `setCssZoom` saw the unzoomed camera) and on `refreshTextCrispness` (makeGameConfig calls it
 * after every LOOK_RESIZE, so a ratio change is followed).
 */
export function installTextCrispness(scene: EventedSceneLike): () => void {
  const events = scene.sys?.events;
  if (!events) return () => {};
  const managed = new Set<TextLike>();

  const wanted = () =>
    textResolutionFor(scene.cameras?.main?.zoom ?? 1, getCanvasPixelRatio(scene));

  const apply = (object: TextLike, resolution: number) => {
    const current = object.style?.resolution ?? 1;
    if (resolution !== current && (resolution > 1 || current > 1)) {
      object.setResolution?.(Math.max(1, resolution));
    }
  };

  const onAdded = (object: TextLike) => {
    try {
      if (object?.type !== "Text" || typeof object.setResolution !== "function") return;
      const current = object.style?.resolution ?? 1;
      if (current > 1) return;
      managed.add(object);
      object.once?.("destroy", () => managed.delete(object));
      apply(object, wanted());
      object.texture?.setFilter?.(FILTER_LINEAR);
    } catch {
      // Cosmetic only.
    }
  };

  const refresh = () => {
    try {
      const resolution = wanted();
      managed.forEach((object) => {
        if (object.scene === undefined || object.scene === null) {
          if ("scene" in object) managed.delete(object);
          return;
        }
        apply(object, resolution);
      });
    } catch {
      // Cosmetic only.
    }
  };
  const clear = () => managed.clear();

  events.on("addedtoscene", onAdded);
  events.on("create", refresh);
  events.on("shutdown", clear);
  refreshers.set(scene, refresh);
  const dispose = () => {
    events.off("addedtoscene", onAdded);
    events.off("create", refresh);
    events.off("shutdown", clear);
    refreshers.delete(scene);
    managed.clear();
  };
  events.once("destroy", dispose);
  return dispose;
}

/** Re-applies text resolution in a scene set up by `installTextCrispness` (no-op otherwise). */
export function refreshTextCrispness(scene: object | null | undefined): void {
  if (scene) refreshers.get(scene)?.();
}
