/**
 * `ttWorldText(scene, x, y, text, role, cssSize, opts)`: a `ttText` placed in a zoomed world
 * (plan G12 call-site migration for Purrsuit, Cupid Cat and their enemies).
 *
 * Role sizes and minimums are CSS pixels, but a platformer's world is drawn at a camera zoom (the
 * old `ZOOM_PIXEL`, 1.45-1.6 CSS px per world px). Creating "8px" world text there gave a 12 px
 * burst made of a fallback face; creating it at a role size in world units would come out 1.5x
 * too big. This helper rasterises the text at its CSS size and scales it down by the camera's CSS
 * zoom, so it reads at exactly `cssSize` on screen, honours the role minimum and stays crisp.
 *
 * Tweens that change `scale` must multiply by `text.ttBaseScale` (see `scaleTo`).
 */
import type { Scene } from "phaser";
import { getCanvasPixelRatio } from "@/components/Phaser/look/registry";
import { ttText, type TTText, type TTTextOptions } from "./ttText";
import type { TypeRole } from "@/components/typography/roles";

export interface TTWorldText extends TTText {
  /** The scale that makes the text read at its CSS size under the camera zoom. */
  ttBaseScale: number;
}

type SceneLike = Parameters<typeof ttText>[0] & Pick<Scene, "cameras">;

/** CSS pixels per world pixel for the scene's main camera (camera zoom over the canvas ratio). */
export function cameraCssZoom(scene: SceneLike): number {
  const zoom = scene.cameras?.main?.zoom ?? 1;
  const ratio = getCanvasPixelRatio(scene);
  const css = zoom / (ratio || 1);
  return css > 0 && Number.isFinite(css) ? css : 1;
}

export function ttWorldText(
  scene: SceneLike,
  x: number,
  y: number,
  text: string,
  role: TypeRole,
  cssSize: number,
  opts: TTTextOptions = {},
): TTWorldText {
  const object = ttText(scene, x, y, text, role, { ...opts, size: cssSize }) as TTWorldText;
  object.ttBaseScale = 1 / cameraCssZoom(scene);
  object.setScale(object.ttBaseScale);
  return object;
}

/** A tween target scale relative to the world text's base scale. */
export function scaleTo(text: { ttBaseScale?: number }, factor: number): number {
  return (text.ttBaseScale ?? 1) * factor;
}
