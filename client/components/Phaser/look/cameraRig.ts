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
 *   controls  on touch layouts the on-screen controls ([data-mobile-controls]) cover the bottom of
 *             the view; the rig measures them, lets the camera scroll that far below the map and
 *             frames the target in the clear area above them, so the cat is never hidden
 *
 * The look-ahead (x) and the controls lift (y) are added on top of any follow offset the scene
 * sets itself (Cupid's gate offset): the rig only ever removes what it added.
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
/** How often (ms) the on-screen controls are re-measured. */
export const CONTROLS_MEASURE_MS = 400;

/**
 * Height in CSS px that the on-screen touch controls cover at the bottom of the viewport: from the
 * highest visible control to the viewport bottom. 0 when there are none (desktop, hidden, no DOM).
 */
export function controlsInsetCss(doc: Document | undefined = typeof document === "undefined" ? undefined : document): number {
  const root = doc?.querySelector<HTMLElement>("[data-mobile-controls]");
  if (!root || !doc?.defaultView) return 0;
  const vh = doc.defaultView.innerHeight;
  let top = Infinity;
  for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue; // hidden (display:none, lg:hidden) or empty
    if (r.bottom <= 0 || r.top >= vh) continue;
    top = Math.min(top, r.top);
  }
  return Number.isFinite(top) ? Math.max(0, Math.round(vh - top)) : 0;
}

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
  /** World units the touch controls cover at the bottom of the view (0 without controls). */
  let insetWorld = 0;
  let insetMeasuredAt = -Infinity;
  /** The y offset the rig last wrote and how much of it was the controls lift. */
  let writtenY: number | null = null;
  let appliedY = 0;

  const applyBounds = () => {
    if (!options.world) return;
    bounds = cameraBounds(options.world, view(), { skyMargin: SKY_TILES * TILE_SIZE });
    // Room below the map for the controls, so the camera can lift the ground above them.
    if (insetWorld > 0) bounds = { ...bounds, height: bounds.height + Math.ceil(insetWorld) };
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  };

  const measureControls = (now: number) => {
    if (now - insetMeasuredAt < CONTROLS_MEASURE_MS) return;
    insetMeasuredAt = now;
    const css = controlsInsetCss();
    // CSS px -> world units: the camera maps world to backing pixels (zoom), backing = css * dpr.
    const next = css > 0 ? (css * getCanvasPixelRatio(scene)) / camera.zoom : 0;
    if (Math.abs(next - insetWorld) < 1) return;
    insetWorld = Math.min(next, view().height * 0.45);
    applyBounds();
  };

  const liftAboveControls = () => {
    if (!target) return;
    // Centre the target in the clear area above the controls: the camera centre sits half the
    // inset below the target. followOffset is subtracted from the target, so the lift is negative.
    const want = -Math.round(insetWorld / 2);
    const current = camera.followOffset.y;
    const base = writtenY !== null && current === writtenY ? current - appliedY : current;
    camera.followOffset.y = base + want;
    writtenY = base + want;
    appliedY = want;
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
    measureControls(scene.time?.now ?? Date.now());
    liftAboveControls();
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
      writtenY = null;
      appliedY = 0;
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
