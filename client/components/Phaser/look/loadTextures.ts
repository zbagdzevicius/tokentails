/**
 * Race-free spritesheet loading on a scene's shared loader (plan G13 step 6, F10).
 *
 * The scenes used to queue a sheet and wait for the loader's next `complete`. Several spawns in
 * a row (one NPC_SPAWN per cat, plus the player cat) shared one loader, so a callback could run
 * on a `complete` that did not include its file, and a 404 still ran the callback, which then
 * built a sprite on `__MISSING`.
 *
 * `loadSpritesheets` instead:
 *   - waits until the loader is idle (files added while it is post-processing are dropped by
 *     Phaser's `loadComplete`), adds its files, and starts one pass;
 *   - settles each key on its own `filecomplete` or `loaderror`, whoever started the pass;
 *   - reports a key as loaded only when the texture really exists afterwards;
 *   - treats a texture that is already there (same URL) as loaded without a request, and
 *     replaces one whose URL changed (re-skin under the same key) unless `isInUse` says a
 *     live sprite still draws from it;
 *   - gives up on a key after `timeoutMs` and stops quietly when the scene shuts down.
 *
 * No Phaser runtime import; the structural types are what a real Scene satisfies.
 */

export interface SheetRequest {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

export interface LoadResult {
  loaded: string[];
  failed: string[];
}

interface LoaderFileLike {
  key?: string;
}

interface LoaderLike {
  isLoading(): boolean;
  start(): unknown;
  spritesheet(key: string, url: string, config: { frameWidth: number; frameHeight: number }): unknown;
  on(event: string, fn: (...args: never[]) => void): unknown;
  off(event: string, fn: (...args: never[]) => void): unknown;
  once(event: string, fn: () => void): unknown;
}

interface TexturesLike {
  exists(key: string): boolean;
  remove(key: string): unknown;
}

interface AnimsLike {
  exists(key: string): boolean;
  remove(key: string): unknown;
}

export interface LoaderSceneLike {
  load: LoaderLike;
  textures: TexturesLike;
  anims?: AnimsLike;
  sys?: { events?: { once(event: string, fn: () => void): unknown; off?(event: string, fn: () => void): unknown } | null } | null;
}

export const DEFAULT_LOAD_TIMEOUT_MS = 20_000;

/** The URL each texture key was loaded from, per texture manager (textures are game-wide). */
const sources = new WeakMap<object, Map<string, string>>();

const sourceMap = (textures: TexturesLike) => {
  let map = sources.get(textures);
  if (!map) {
    map = new Map();
    sources.set(textures, map);
  }
  return map;
};

/** Records where a key came from (also for textures loaded outside this helper). */
export function rememberTextureSource(scene: LoaderSceneLike, key: string, url: string): void {
  sourceMap(scene.textures).set(key, url);
}

/**
 * Removes a texture and the animations built from it (`${key}_${ANIM}`). Call it after the
 * sprites that use it are destroyed. Used on re-skin and for keys whose URL changed.
 */
export function removeTexture(
  scene: LoaderSceneLike,
  key: string,
  animations: readonly string[] = [],
): void {
  animations.forEach((animation) => {
    const animKey = `${key}_${animation}`;
    if (scene.anims?.exists(animKey)) scene.anims.remove(animKey);
  });
  if (scene.textures.exists(key)) scene.textures.remove(key);
  sourceMap(scene.textures).delete(key);
}

/** Runs `fn` once the loader is not loading or post-processing. */
function whenIdle(load: LoaderLike, fn: () => void, isCancelled: () => boolean) {
  if (isCancelled()) return;
  if (!load.isLoading()) {
    fn();
    return;
  }
  load.once("complete", () => whenIdle(load, fn, isCancelled));
}

export interface LoadOptions {
  timeoutMs?: number;
  /** Animation names to drop when a key is replaced because its URL changed. */
  animations?: readonly string[];
  /**
   * True when a live game object still draws from `key`. Such a texture is never removed to
   * make room for a different URL under the same key (that froze the render loop, 2e review):
   * the request is reported as failed and the old texture stays.
   */
  isInUse?: (key: string) => boolean;
}

export function loadSpritesheets(
  scene: LoaderSceneLike,
  requests: readonly SheetRequest[],
  options: LoadOptions = {},
): Promise<LoadResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  return new Promise<LoadResult>((resolve) => {
    const loaded: string[] = [];
    const failed: string[] = [];
    const pending = new Map<string, SheetRequest>();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // One request per key; a later duplicate is ignored.
    const unique: SheetRequest[] = [];
    const seen = new Set<string>();
    requests.forEach((request) => {
      if (!request || seen.has(request.key)) return;
      seen.add(request.key);
      unique.push(request);
    });

    const sourcesByKey = sourceMap(scene.textures);

    const detach = () => {
      scene.load.off("filecomplete", onComplete);
      scene.load.off("loaderror", onError);
      if (timer !== null) clearTimeout(timer);
      timer = null;
      scene.sys?.events?.off?.("shutdown", onShutdown);
      scene.sys?.events?.off?.("destroy", onShutdown);
    };

    const finishIfDone = () => {
      if (pending.size > 0 || cancelled) return;
      cancelled = true;
      detach();
      resolve({ loaded, failed });
    };

    const settle = (key: string, ok: boolean) => {
      const request = pending.get(key);
      if (!request) return;
      pending.delete(key);
      if (ok && scene.textures.exists(key)) {
        sourcesByKey.set(key, request.url);
        loaded.push(key);
      } else {
        failed.push(key);
      }
      finishIfDone();
    };

    function onComplete(key: string) {
      settle(key, true);
    }
    function onError(file: LoaderFileLike) {
      if (file?.key) settle(file.key, false);
    }
    function onShutdown() {
      if (cancelled) return;
      cancelled = true;
      detach();
      pending.forEach((_request, key) => failed.push(key));
      pending.clear();
      resolve({ loaded, failed });
    }

    unique.forEach((request) => {
      const known = sourcesByKey.get(request.key);
      if (scene.textures.exists(request.key)) {
        if (known === undefined || known === request.url) {
          loaded.push(request.key);
          return;
        }
        if (options.isInUse?.(request.key)) {
          failed.push(request.key);
          return;
        }
        removeTexture(scene, request.key, options.animations);
      }
      pending.set(request.key, request);
    });

    if (pending.size === 0) {
      resolve({ loaded, failed });
      return;
    }

    scene.load.on("filecomplete", onComplete);
    scene.load.on("loaderror", onError);
    scene.sys?.events?.once("shutdown", onShutdown);
    scene.sys?.events?.once("destroy", onShutdown);
    timer = setTimeout(() => {
      timer = null;
      Array.from(pending.keys()).forEach((key) => settle(key, false));
    }, timeoutMs);

    whenIdle(
      scene.load,
      () => {
        // A key that became a texture while we waited (another pass loaded it) would be
        // skipped by Phaser's keyExists and never get an event of its own.
        Array.from(pending.keys()).forEach((key) => {
          if (scene.textures.exists(key)) settle(key, true);
        });
        if (cancelled) return;
        pending.forEach((request) => {
          scene.load.spritesheet(request.key, request.url, {
            frameWidth: request.frameWidth,
            frameHeight: request.frameHeight,
          });
        });
        scene.load.start();
      },
      () => cancelled,
    );
  });
}
