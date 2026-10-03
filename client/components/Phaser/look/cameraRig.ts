/**
 * The world camera (plan G7 "Camera", F10 integer zoom).
 *
 *   zoom      integer `k` from pickZoom (hub 12 x 8 tiles, platformer 14 x 9; portrait swaps,
 *             decision #55), re-picked after every LOOK_RESIZE
 *   bounds    the map's tile extents (computeWorldBounds; Tiled infinite maps), plus sky room
 *             above, grown to the view where the world is smaller: no void at the view edges
 *   follow    lerp 0.12 with a deadzone and a horizontal look-ahead in the run direction,
 *             rounded to whole world pixels; look-ahead is off under reduced motion
 *   tweens    `zoomBy(steps)` and `zoomHome()` go to whole zoom levels only; the step is kept
 *             (`step`), so a resize while a scene is zoomed in (the Cupid tutorial tour) re-picks
 *             `k` and keeps `k + step` instead of snapping back
 *
 * The look-ahead is added on top of any follow offset the scene sets itself (Cupid's gate
 * offset): the rig only ever removes what it added.
 *
 * Only type imports from Phaser.
 */
import { LOOK_RESIZE } from "./makeGameConfig";
import { pickZoom, TILE_SIZE, type ZoomPreset } from "./pickZoom";
import { cssViewSize, getCanvasPixelRatio } from "./registry";
import { cameraBounds, type Bounds } from "./worldBounds";

export const FOLLOW_LERP = 0.12;
/** Deadzone as a share of the view (world units). */
export const DEADZONE = { x: 0.12, y: 0.22 };
/** Look-ahead as a share of the view width, and how fast it eases (per frame). */
export const LOOK_AHEAD = { share: 0.12, ease: 0.05, minSpeed: 20 };
/** Sky room above the top tile, in tiles. */
export const SKY_TILES = 8;

export interface CameraRigOptions {
  preset: ZoomPreset;
  /** World extents (computeWorldBounds); null leaves the camera unbounded. */
  world: Bounds | null;
  reducedMotion: boolean;
}

export interface CameraRig {
  /** The picked integer zoom `k` (the camera shows `k + step`). */
  readonly zoom: number;
  /** Whole levels a zoomBy() stepped in from `k`; 0 at home. */
  readonly step: number;
  readonly bounds: Bounds | null;
  follow(target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject): void;
  /** Re-applies zoom, bounds and deadzone (after a resize, or a zoom tween ended). */
  refresh(): void;
  /** Tween to `zoom + steps` (whole levels); `done` runs once at the end. */
  zoomBy(steps: number, duration: number, done?: () => void): void;
  /** Tween back to the picked zoom. */
  zoomHome(duration: number, done?: () => void): void;
  destroy(): void;
}

/**
 * Whether stepping `steps` levels in from `k` still shows at least `minTiles` tiles across.
 * The Cupid tutorial's tour zoom uses it: on a phone one whole level is a large jump (k = 2 to 3
 * is +50 %, the old tour was x1.1) and would push the highlighted coins or portal off-screen.
 */
export function canStepZoom(viewWidth: number, k: number, steps: number, minTiles = 10, tileSize = TILE_SIZE): boolean {
  const next = Math.max(1, Math.round(k + steps));
  if (steps <= 0) return true;
  return viewWidth / next / tileSize >= minTiles;
}

export function pickSceneZoom(scene: Phaser.Scene, preset: ZoomPreset): number {
  const css = cssViewSize(scene);
  return pickZoom({ width: css.width, height: css.height, dpr: getCanvasPixelRatio(scene), preset, tileSize: TILE_SIZE }).zoom;
}

export function installCameraRig(scene: Phaser.Scene, options: CameraRigOptions): CameraRig {
  const camera = scene.cameras.main;
  let zoom = pickSceneZoom(scene, options.preset);
  let bounds: Bounds | null = null;
  let target: (Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject) | null = null;
  let ahead = 0;
  let applied = 0;
  /** The offset the rig last wrote; anything else means the scene set its own. */
  let written: number | null = null;
  let tweening = false;
  let destroyed = false;
  /** Whole levels zoomBy() stepped in; refresh() keeps `zoom + step` across a resize. */
  let step = 0;
  const shown = () => Math.max(1, zoom + step);

  const view = () => ({ width: camera.width / camera.zoom, height: camera.height / camera.zoom });

  const applyBounds = () => {
    if (!options.world) return;
    bounds = cameraBounds(options.world, view(), { skyMargin: SKY_TILES * TILE_SIZE });
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  };

  const applyDeadzone = () => {
    if (!target) return;
    const v = view();
    camera.setDeadzone(Math.round(v.width * DEADZONE.x), Math.round(v.height * DEADZONE.y));
  };

  const refresh = () => {
    if (destroyed) return;
    zoom = pickSceneZoom(scene, options.preset);
    if (!tweening) camera.setZoom(shown());
    applyBounds();
    applyDeadzone();
  };

  camera.setRoundPixels(true);
  camera.setZoom(zoom);
  applyBounds();

  const lookAhead = () => {
    const following = (camera as unknown as { _follow?: unknown })._follow;
    if (!target || options.reducedMotion || following !== target) return;
    const body = (target as unknown as { body?: { velocity?: { x: number } } }).body;
    const vx = body?.velocity?.x ?? 0;
    const want = Math.abs(vx) < LOOK_AHEAD.minSpeed ? 0 : Math.sign(vx) * view().width * LOOK_AHEAD.share;
    ahead += (want - ahead) * LOOK_AHEAD.ease;
    const rounded = Math.round(ahead);
    // followOffset is subtracted from the target: a negative x looks ahead to the right.
    const current = camera.followOffset.x;
    // startFollow and setFollowOffset reset the offset: then the scene's value is the base.
    const base = written !== null && current === written ? current + applied : current;
    camera.followOffset.x = base - rounded;
    written = base - rounded;
    applied = rounded;
  };
  scene.events.on("update", lookAhead);

  const onResize = () => refresh();
  scene.game.events.on(LOOK_RESIZE, onResize);

  const zoomTo = (nextStep: number, duration: number, done?: () => void) => {
    step = Math.round(nextStep);
    const goal = shown();
    if (duration <= 0 || options.reducedMotion || goal === camera.zoom) {
      camera.setZoom(goal);
      applyBounds();
      applyDeadzone();
      scene.time.delayedCall(0, () => done?.());
      return;
    }
    tweening = true;
    let finished = false;
    camera.zoomTo(goal, duration, "Power2", true, (_cam: unknown, progress: number) => {
      if (finished || progress < 1) return;
      finished = true;
      tweening = false;
      // A resize during the tween re-picked `k`: land on the current `k + step`.
      camera.setZoom(shown());
      applyBounds();
      applyDeadzone();
      done?.();
    });
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off("update", lookAhead);
    scene.game.events.off(LOOK_RESIZE, onResize);
  };
  scene.events.once("shutdown", destroy);
  scene.events.once("destroy", destroy);

  return {
    get zoom() {
      return zoom;
    },
    get step() {
      return step;
    },
    get bounds() {
      return bounds;
    },
    follow(next) {
      target = next;
      ahead = 0;
      applied = 0;
      written = null;
      camera.startFollow(next, true, FOLLOW_LERP, FOLLOW_LERP);
      applyDeadzone();
    },
    refresh,
    zoomBy(steps, duration, done) {
      zoomTo(steps, duration, done);
    },
    zoomHome(duration, done) {
      zoomTo(0, duration, done);
    },
    destroy,
  };
}
