/**
 * Keeps a failed motion chunk from holding the landing's hydration hostage.
 *
 * LandingMotion is a server-rendered `next/dynamic` component, so its scripts are `<script defer>` tags in the page
 * HTML and the pages router waits for them before it hydrates. When one of those tags fails (a content blocker, a
 * flaky network, a deploy that removed the file), webpack's `import()` finds the existing tag, waits for an `error`
 * event that has already fired and only gives up after 120 s: no hydration, no analytics, and the hero stays hidden
 * until the 5 s CSS fallback. `CHUNK_ERROR_WATCH` (inlined in the head by `_document.js` on the landing) records those
 * failures; `guardMotionChunk` rejects as soon as one is seen, or after MOTION_CHUNK_WAIT_MS, so the page hydrates
 * without motion and `MotionFailed` shows the finished hero at once.
 * Not covered: a request that hangs without ever failing. Deferred scripts run in document order, so it holds Next's
 * own scripts too and nothing in JS runs at all; the CSS fallback still shows the hero at 5 s.
 */

/** Set by CHUNK_ERROR_WATCH: how many `/_next/static/chunks/` scripts failed to load. */
export const CHUNK_ERROR_COUNT = "__pllChunkErrors";
/** Dispatched on `window` by CHUNK_ERROR_WATCH for every failed chunk script. */
export const CHUNK_ERROR_EVENT = "pawlegends:chunk-error";
/** The longest hydration waits for the motion chunk (the CSS fallback shows the hero at 5 s). */
export const MOTION_CHUNK_WAIT_MS = 6000;

/** Inline head script: `error` on a script element does not bubble, so it listens in the capture phase. */
export const CHUNK_ERROR_WATCH = `(function(){window.${CHUNK_ERROR_COUNT}=0;window.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT'&&/\\/_next\\/static\\/chunks\\//.test(t.src||'')){window.${CHUNK_ERROR_COUNT}++;try{window.dispatchEvent(new Event('${CHUNK_ERROR_EVENT}'))}catch(x){}}},true)})();`;

type WatchedWindow = Window & { [CHUNK_ERROR_COUNT]?: number };

/** `load`, or a rejection when a chunk script failed (before or after this call) or MOTION_CHUNK_WAIT_MS passed. */
export function guardMotionChunk<T>(load: Promise<T>, win: WatchedWindow | undefined = typeof window === "undefined" ? undefined : window): Promise<T> {
  // The server resolves the module synchronously; there is nothing to guard.
  if (!win) return load;
  let cleanup = () => {};
  const failed = new Promise<never>((_, reject) => {
    const fail = (why: string) => () => reject(new Error(`Pawlegends motion chunk: ${why}`));
    if (win[CHUNK_ERROR_COUNT]) {
      fail("a chunk script failed to load")();
      return;
    }
    const onError = fail("a chunk script failed to load");
    const timer = win.setTimeout(fail(`not loaded after ${MOTION_CHUNK_WAIT_MS} ms`), MOTION_CHUNK_WAIT_MS);
    win.addEventListener(CHUNK_ERROR_EVENT, onError, { once: true });
    cleanup = () => {
      win.clearTimeout(timer);
      win.removeEventListener(CHUNK_ERROR_EVENT, onError);
    };
  });
  return Promise.race([load, failed]).finally(() => cleanup());
}
