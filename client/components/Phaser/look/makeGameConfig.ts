/**
 * The one Phaser game config builder (plan F10, G7; decision #18 and #84).
 *
 * Every mode used to create its canvas at `innerWidth x innerHeight` backing pixels, so on a
 * 3x phone the browser stretched a 1x image and pixel art and text came out soft. Now:
 *
 *   backing store  round(innerWidth x dpr) by round(innerHeight x dpr), dpr capped by tier
 *   scale          mode NONE, zoom 1 / dpr, so the canvas still fills innerWidth x innerHeight CSS px
 *   registry       `canvasPixelRatio` = dpr, `renderTier` = tier
 *
 * Scenes multiply their camera zoom by `canvasPixelRatio` (see camera.ts), which keeps the
 * visible world identical at every viewport while every art pixel gets dpr device pixels.
 * Arcade world bounds stay at the CSS size they always had (NPCs collide with them).
 *
 * A debounced resize, orientationchange, visualViewport and DPR-change handler keeps the backing
 * store equal to CSS size x capped dpr, rescales every camera when the ratio itself changes, and
 * emits `LOOK_RESIZE` on `game.events`. Before F10 the canvas never followed a resize.
 */
import type { Types } from "phaser";
import { CANVAS_PIXEL_RATIO, RENDER_TIER } from "./registry";
import { installTextCrispness, refreshTextCrispness } from "./text";
import { capDpr, resolveRenderProfile, type RenderProfile } from "./tier";
import { registerCaptureGame } from "./capture";

export { CANVAS_PIXEL_RATIO, RENDER_TIER };
export { readCanvasPixelRatio } from "./registry";
/** Emitted on `game.events` with a `LookResizeEvent` after the canvas changed size or ratio. */
export const LOOK_RESIZE = "look-resize";
export const RESIZE_DEBOUNCE_MS = 150;

/** `Phaser.Scale.NONE`, inlined so this module has no Phaser runtime import (Jest, SSR). */
const SCALE_MODE_NONE = 0;

export interface CssSize {
  width: number;
  height: number;
}

export interface LookResizeEvent {
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  previousDpr: number;
  previousWidth: number;
  previousHeight: number;
  /** Backing-store pixels. */
  backingWidth: number;
  backingHeight: number;
}

/** Backing-store size for a CSS size and ratio; whole pixels, at least 1. */
export function backingSize(width: number, height: number, dpr: number): CssSize {
  return {
    width: Math.max(1, Math.round(width * dpr)),
    height: Math.max(1, Math.round(height * dpr)),
  };
}

type ViewportWindow = Pick<Window, "innerWidth" | "innerHeight">;

/** The CSS size the canvas fills: the layout viewport, as the configs always used. */
export function viewportCssSize(win: ViewportWindow | null | undefined): CssSize {
  const width = win && win.innerWidth > 0 ? win.innerWidth : 1;
  const height = win && win.innerHeight > 0 ? win.innerHeight : 1;
  return { width, height };
}

export interface MakeGameConfigOptions {
  /** Defaults to the tier and ratio of this device. */
  profile?: RenderProfile;
  /** Defaults to `innerWidth x innerHeight`. */
  size?: CssSize;
  /** Defaults to `window`. */
  win?: Window;
  /** Skip the resize handler (tests). */
  resize?: boolean;
}

interface RegistryLike {
  set(key: string, value: unknown): unknown;
  get(key: string): unknown;
}

/** The parts of Phaser.Game the look layer touches. A real game satisfies it. */
export interface LookGame {
  registry: RegistryLike;
  canvas?: HTMLCanvasElement | null;
  scale: {
    resize(width: number, height: number): unknown;
    setZoom(zoom: number): unknown;
    width: number;
    height: number;
  };
  events: {
    emit(event: string, ...args: unknown[]): unknown;
    once(event: string, fn: () => void): unknown;
  };
  scene?: {
    getScenes?: (isActive?: boolean) => Array<{
      cameras?: { cameras?: Array<{ zoomX: number; zoomY: number; setZoom(x: number, y?: number): unknown }> };
    }>;
  } | null;
}

/**
 * Returns `base` with the F10 size, scale and boot hooks. Keeps every other key, including the
 * caller's own `callbacks`, which still run.
 */
export function makeGameConfig(
  base: Types.Core.GameConfig,
  options: MakeGameConfigOptions = {},
): Types.Core.GameConfig {
  const win = options.win ?? (typeof window === "undefined" ? undefined : window);
  const profile = options.profile ?? resolveRenderProfile({ win: win ?? null });
  const css = options.size ?? viewportCssSize(win);
  const backing = backingSize(css.width, css.height, profile.dpr);

  const physics = base.physics?.arcade
    ? {
        ...base.physics,
        arcade: {
          // Bounds default to the game size, which is now in backing pixels; keep the CSS size.
          width: css.width,
          height: css.height,
          ...base.physics.arcade,
        },
      }
    : base.physics;

  const callbacks = base.callbacks ?? {};

  return {
    ...base,
    width: backing.width,
    height: backing.height,
    physics,
    scale: {
      ...base.scale,
      mode: SCALE_MODE_NONE,
      zoom: 1 / profile.dpr,
    },
    callbacks: {
      ...callbacks,
      preBoot: (game) => {
        game.registry.set(CANVAS_PIXEL_RATIO, profile.dpr);
        game.registry.set(RENDER_TIER, profile.tier);
        callbacks.preBoot?.(game);
      },
      postBoot: (game) => {
        const look = game as unknown as LookGame;
        setCanvasCssSize(look, css);
        game.scene.scenes.forEach((scene) =>
          installTextCrispness(scene as unknown as Parameters<typeof installTextCrispness>[0]),
        );
        if (options.resize !== false && win) installLookResize(look, profile, css, win);
        exposeForE2E(game, win);
        registerCaptureGame(game);
        callbacks.postBoot?.(game);
      },
    },
  };
}

/** Window flag an e2e init script sets to ask for the booted games (never set by the app). */
export const E2E_FLAG = "__TT_E2E__";
/** Where the booted games are listed while `E2E_FLAG` is set. */
export const E2E_GAMES = "__ttGames";

/**
 * Test hook for client/e2e/render-foundation.spec.ts: lists booted games on `window` so the
 * spec can read scenes, textures and cameras. Needs both a dev or E2E build and the flag set by
 * the test before boot; `process.env.NODE_ENV` is inlined, so production drops the branch.
 */
function exposeForE2E(game: unknown, win: Window | undefined) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_E2E !== "1") return;
  const target = win as unknown as Record<string, unknown> | undefined;
  if (!target || target[E2E_FLAG] !== true) return;
  const games = Array.isArray(target[E2E_GAMES]) ? (target[E2E_GAMES] as unknown[]) : [];
  games.push(game);
  target[E2E_GAMES] = games;
}

/** Phaser's NONE mode skips the style write when the zoomed size equals the game size; always set it. */
function setCanvasCssSize(game: LookGame, css: CssSize) {
  const style = game.canvas?.style;
  if (!style) return;
  style.width = `${css.width}px`;
  style.height = `${css.height}px`;
}

/**
 * Follows the viewport. Returns the cleanup, which also runs when the game is destroyed.
 * Exported for tests; `makeGameConfig` installs it from `postBoot`.
 */
export function installLookResize(
  game: LookGame,
  profile: RenderProfile,
  initial: CssSize,
  win: Window,
  debounceMs: number = RESIZE_DEBOUNCE_MS,
): () => void {
  let css = { ...initial };
  let dpr = profile.dpr;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let mediaQuery: MediaQueryList | null = null;

  const apply = () => {
    timer = null;
    if (disposed) return;
    const next = viewportCssSize(win);
    const nextDpr = capDpr(win.devicePixelRatio, profile.tier, profile.deviceMemory, profile.setting);
    if (next.width === css.width && next.height === css.height && nextDpr === dpr) return;

    const previous = { ...css };
    const previousDpr = dpr;
    try {
      if (nextDpr !== dpr) game.scale.setZoom(1 / nextDpr);
      const backing = backingSize(next.width, next.height, nextDpr);
      game.scale.resize(backing.width, backing.height);
      setCanvasCssSize(game, next);
      game.registry.set(CANVAS_PIXEL_RATIO, nextDpr);

      if (nextDpr !== previousDpr) {
        // Cameras hold zoom in backing pixels: rescale so the visible world stays the same.
        const ratio = nextDpr / previousDpr;
        game.scene?.getScenes?.(false).forEach((scene) => {
          scene.cameras?.cameras?.forEach((camera) => {
            camera.setZoom(camera.zoomX * ratio, camera.zoomY * ratio);
          });
        });
      }

      css = next;
      dpr = nextDpr;
      const event: LookResizeEvent = {
        width: next.width,
        height: next.height,
        dpr: nextDpr,
        previousDpr,
        previousWidth: previous.width,
        previousHeight: previous.height,
        backingWidth: backing.width,
        backingHeight: backing.height,
      };
      game.events.emit(LOOK_RESIZE, event);
      // After the scenes reacted (camera zoom may have changed): re-rasterise managed text.
      game.scene?.getScenes?.(false).forEach((scene) => refreshTextCrispness(scene));
    } catch (error) {
      // A resize must never take the scene down; the next resize tries again.
      if (process.env.NODE_ENV !== "production") console.error("LOOK_RESIZE failed", error);
    }
    watchRatio();
  };

  const schedule = () => {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(apply, debounceMs);
  };

  // A DPR change (window dragged to another monitor, browser zoom) fires no resize on some
  // browsers; a resolution media query does. It matches one value, so it is renewed each time.
  const watchRatio = () => {
    mediaQuery?.removeEventListener?.("change", schedule);
    mediaQuery = null;
    try {
      if (typeof win.matchMedia !== "function") return;
      mediaQuery = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
      mediaQuery.addEventListener?.("change", schedule);
    } catch {
      mediaQuery = null;
    }
  };

  const viewport = win.visualViewport ?? null;
  win.addEventListener("resize", schedule);
  win.addEventListener("orientationchange", schedule);
  viewport?.addEventListener("resize", schedule);
  watchRatio();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    win.removeEventListener("resize", schedule);
    win.removeEventListener("orientationchange", schedule);
    viewport?.removeEventListener("resize", schedule);
    mediaQuery?.removeEventListener?.("change", schedule);
    mediaQuery = null;
  };

  game.events.once("destroy", dispose);
  return dispose;
}
