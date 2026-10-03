/**
 * Game registry keys set by makeGameConfig (plan F10). Kept apart so every look module can read
 * them without import cycles.
 */

/** Backing-store pixels per CSS pixel, the capped device pixel ratio. */
export const CANVAS_PIXEL_RATIO = "canvasPixelRatio";
/** The render tier (`LOW`, `MID`, `HIGH`). */
export const RENDER_TIER = "renderTier";

export interface RegistryLike {
  get(key: string): unknown;
}

/** The ratio a game was booted with, 1 when unknown. */
export function readCanvasPixelRatio(registry: RegistryLike | null | undefined): number {
  const value = registry?.get(CANVAS_PIXEL_RATIO);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

interface SceneLike {
  registry?: RegistryLike | null;
  game?: { registry?: RegistryLike | null } | null;
}

/** A scene's backing-store ratio (`canvasPixelRatio`), 1 when unset. */
export function getCanvasPixelRatio(scene: SceneLike | null | undefined): number {
  return readCanvasPixelRatio(scene?.registry ?? scene?.game?.registry ?? null);
}

interface SizedSceneLike extends SceneLike {
  scale?: { width: number; height: number } | null;
}

/**
 * The canvas size in CSS pixels. Since F10, `scene.scale.width/height` are backing-store pixels
 * (CSS x ratio), so a layout or phone/desktop breakpoint must read this instead.
 */
export function cssViewSize(scene: SizedSceneLike | null | undefined): { width: number; height: number } {
  const ratio = getCanvasPixelRatio(scene);
  return { width: (scene?.scale?.width ?? 0) / ratio, height: (scene?.scale?.height ?? 0) / ratio };
}
