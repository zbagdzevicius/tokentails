/**
 * Lazy chunk retry (gaps5 polish 1): a dynamic `import()` that fails (a network blip, a deploy swapping files) is tried
 * once more before the crash card ("Oops… Reload") shows. The build wraps every `import('…')` in the game's own code
 * as `__plRetry(() => import('…'))` (vite.config.ts `chunkRetryPlugin`), so no call site has to remember it.
 *
 * Chrome and Firefox keep a failed module in the page's module map, so asking for the same URL again fails at once.
 * When the error names the chunk's URL the retry asks for it with a query added (`?retry=<page token>`): a fresh fetch.
 * The token is one per page load, so a second retry of the same chunk reuses the module the first retry loaded (one
 * instance per chunk). Safari's message names no URL; it does not keep failures, so the retry calls the loader again.
 */

/** Wait before the retry (ms): a deploy's file swap or a dropped request usually clears within a second. */
export const CHUNK_RETRY_MS = 900;

/** One cache-busting token per page load (the same retry URL for every later retry of a chunk). */
const TOKEN = Date.now().toString(36);

/** The chunk URL a failed dynamic import names (Chrome, Firefox, Vite's preload error), or null. Pure. */
export function failedChunkUrl(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const m = /(https?:\/\/[^\s'"]+?\.(?:m?js|css))(?:[?#][^\s'"]*)?(?=$|[\s'"])/.exec(msg);
  return m ? m[1] : null;
}

/** A load failure worth retrying (not an error thrown while the chunk's own code ran). Pure. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to fetch|error loading dynamically|Load failed|ChunkLoadError/i.test(msg);
}

/** The retry URL of a failed chunk: the same file with the page's retry token. Pure. */
export function retryUrl(url: string, token = TOKEN): string {
  return `${url}${url.includes('?') ? '&' : '?'}retry=${token}`;
}

export interface ChunkRetryEnv {
  wait(ms: number): Promise<void>;
  /** Import a URL (the cache-busted retry). */
  importUrl(url: string): Promise<unknown>;
  /** Analytics: one retry happened (`ok`: it loaded). */
  onRetry?(ok: boolean): void;
}

const defaultEnv: ChunkRetryEnv = {
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  importUrl: (url) => import(/* @vite-ignore */ url),
};

let env: ChunkRetryEnv = defaultEnv;

/** Tests (and the app's analytics hook): swap the environment. Returns the previous one. */
export function setChunkRetryEnv(next: Partial<ChunkRetryEnv>): ChunkRetryEnv {
  const prev = env;
  env = { ...env, ...next };
  return prev;
}

/** Run `load`; on a chunk load failure wait CHUNK_RETRY_MS and try once more (cache-busted when the URL is known). */
export function retryImport<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(async (err: unknown) => {
    if (!isChunkLoadError(err)) throw err;
    const e = env;
    await e.wait(CHUNK_RETRY_MS);
    const url = failedChunkUrl(err);
    try {
      // a CSS preload failure names the stylesheet: the loader itself retries (it adds the link again)
      const out = (url && !url.endsWith('.css') ? await e.importUrl(retryUrl(url)) : await load()) as T;
      e.onRetry?.(true);
      return out;
    } catch (again) {
      e.onRetry?.(false);
      throw again;
    }
  });
}
