import { isAppBuild } from "@/components/claims/build";

/*
 * On the web, "/" is the static Play-to-Save landing in public/home (next.config.js beforeFiles rewrite,
 * docs/CLIENT.md "Home page (/)"). The server never renders pages/index.tsx there, but Next's client router
 * still would after a <Link href="/"> or router.push("/") from another page. _app.tsx asks servesStaticHome()
 * and, when it says yes, renders nothing and reloads the same URL so the server answers with the static page.
 * App builds keep pages/index.tsx as their start page.
 *
 * One-shot guard: the reload is safe only while the rewrite serves "/". If it ever stops (a hosting change,
 * a custom server), the reload would land on pages/index.tsx again and reload forever. So loadStaticHome
 * stamps sessionStorage before reloading; when "/" renders here again with a fresh stamp, the reload did not
 * reach the static page, and _app.tsx renders pages/index.tsx instead. Any other Next page clears the stamp
 * (clearStaticHomeStamp), so the next navigation to "/" reloads again. Without sessionStorage it never
 * reloads (fail safe: pages/index.tsx).
 */

export const STATIC_HOME_STAMP = "tt_static_home_reload";
/** A stamp older than this is stale (the static page loaded and the visitor came back much later). */
export const STATIC_HOME_STAMP_TTL_MS = 60_000;

type Win = Pick<Window, "location" | "sessionStorage">;

/** True when the page about to render is pages/index.tsx in a web build. */
export function servesStaticHome(route: string, app: boolean = isAppBuild()): boolean {
  return !app && route === "/";
}

/**
 * Full reload of the current URL (query and hash kept; history keeps one entry). Returns false, without
 * reloading, when a reload already happened moments ago (the rewrite is not serving "/") or sessionStorage
 * is unavailable; the caller then renders pages/index.tsx.
 */
export function loadStaticHome(win: Win = window, now: number = Date.now()): boolean {
  try {
    const store = win.sessionStorage;
    const last = Number(store.getItem(STATIC_HOME_STAMP));
    if (last && now - last >= 0 && now - last < STATIC_HOME_STAMP_TTL_MS) {
      store.removeItem(STATIC_HOME_STAMP);
      return false;
    }
    store.setItem(STATIC_HOME_STAMP, String(now));
  } catch {
    return false;
  }
  win.location.replace(win.location.href);
  return true;
}

/** Called on every other Next page: the last reload (if any) reached the static page. */
export function clearStaticHomeStamp(win: Pick<Window, "sessionStorage"> = window): void {
  try {
    win.sessionStorage.removeItem(STATIC_HOME_STAMP);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
