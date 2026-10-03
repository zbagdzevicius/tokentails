/**
 * Scene-side helpers for the F10 backing store (see makeGameConfig.ts).
 *
 * Camera zoom is in backing-store pixels, so a scene that used `setZoom(ZOOM)` now calls
 * `setCssZoom(camera, scene, ZOOM)`, which applies `ZOOM x canvasPixelRatio`: the same world is
 * visible as before and each art pixel gets `canvasPixelRatio` device pixels.
 *
 * No Phaser runtime import (the structural types below are what a real Scene satisfies).
 */
import { CANVAS_PIXEL_RATIO, getCanvasPixelRatio, type RegistryLike } from "./registry";

export { CANVAS_PIXEL_RATIO, getCanvasPixelRatio };

interface SceneLike {
  registry?: RegistryLike | null;
  game?: { registry?: RegistryLike | null } | null;
}

interface CameraLike {
  width: number;
  height: number;
  zoom: number;
  setZoom(x: number, y?: number): unknown;
  setScroll(x: number, y?: number): unknown;
  setOrigin(x: number, y?: number): unknown;
  centerOn?(x: number, y: number): unknown;
}

/** Camera zoom in backing pixels for a zoom written in CSS terms (the old ZOOM constants). */
export function cssZoom(scene: SceneLike, zoom: number): number {
  return zoom * getCanvasPixelRatio(scene);
}

export function setCssZoom(camera: CameraLike, scene: SceneLike, zoom: number): void {
  camera.setZoom(cssZoom(scene, zoom));
}

/**
 * `camera.setScroll(x, y)` as it behaved when the camera was `innerWidth` wide: scroll positions
 * the camera's top-left before zoom, and the camera is now `dpr` times wider, so the same scroll
 * would move the view. This keeps the old view centre (`x + cssWidth / 2`).
 */
export function setCssScroll(camera: CameraLike, scene: SceneLike, x: number, y: number): void {
  const dpr = getCanvasPixelRatio(scene);
  const cssWidth = camera.width / dpr;
  const cssHeight = camera.height / dpr;
  camera.setScroll(x + (cssWidth - camera.width) / 2, y + (cssHeight - camera.height) / 2);
}

export interface CssViewport {
  /** Layout size in CSS pixels that the scene's layout code works in. */
  width: number;
  height: number;
}

/**
 * For scenes laid out in screen pixels (Paw Match): world units are CSS pixels, the camera maps
 * them to the backing store. `layout` is the CSS size the layout was built for; when the canvas
 * is resized later, the layout is scaled to fit and centred (letterboxed) instead of cut off.
 */
export function fitCssCamera(
  camera: CameraLike,
  scene: SceneLike,
  layout: CssViewport,
  viewport: CssViewport = layout,
): void {
  const dpr = getCanvasPixelRatio(scene);
  const fit = Math.min(viewport.width / layout.width, viewport.height / layout.height);
  const scale = Number.isFinite(fit) && fit > 0 ? fit : 1;
  camera.setOrigin(0, 0);
  camera.setZoom(scale * dpr);
  // Centre: the visible world is viewport / scale wide; the layout sits in its middle.
  // `+ 0` turns -0 into 0 when there is no letterbox.
  camera.setScroll(
    (layout.width - viewport.width / scale) / 2 + 0,
    (layout.height - viewport.height / scale) / 2 + 0,
  );
}
