/**
 * The native app shell (docs/plans/moba/APP-STORE.md "Game changes for the app build"). The App Store and Google
 * Play builds of Pawlegends (`pawlegends-app/`, Capacitor, served from `capacitor://localhost` on iOS and
 * `https://localhost` on Android) are built with
 * `VITE_PAWLEGENDS_APP=1`; a bundle loaded by the shell also sees `window.Capacitor.isNativePlatform()`. Either one
 * makes this an app build: no web purchase links (Apple 3.1.1 / 3.1.3(b), Google Play payments policy), and share links that point at the public web game instead of the app's own address.
 *
 * On the web build `VITE_PAWLEGENDS_APP` is unset, Vite folds `APP_ENV` to false, and nothing here changes anything.
 */

/** Built for the app shell (`pawlegends-app/scripts/build-web.mjs` sets it). A build-time constant. */
export const APP_ENV: boolean = import.meta.env?.VITE_PAWLEGENDS_APP === '1';

/**
 * The public web game: dare and share links open here (and in the app, via Universal Links). Paw Legends' own domain
 * (NO-TOKENTAILS.md): `/?dare=` and `/?party=` go on to `/play` there (client/next.config.js).
 */
export const PUBLIC_GAME_URL = 'https://pawlegends.app/';

/** The production pages that embed the game: their share links use PUBLIC_GAME_URL. */
const PUBLIC_HOSTS: readonly string[] = Object.freeze(['pawlegends.app', 'www.pawlegends.app', 'tokentails.com', 'www.tokentails.com']);

interface CapacitorLike {
  isNativePlatform?: () => boolean;
}

/** True inside the native app (build flag, or a Capacitor native bridge on the page). Never throws. */
export function inAppShell(env: boolean = APP_ENV, w: unknown = typeof window !== 'undefined' ? window : undefined): boolean {
  if (env) return true;
  try {
    const cap = (w as { Capacitor?: CapacitorLike } | undefined)?.Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/** The native shells: the Mac App Store app, the iPhone app and the Android app. */
export type ShellPlatform = 'mac' | 'ios' | 'android';

/**
 * Which native shell runs the page: `mac` in the Mac App Store app (Mac Catalyst), `ios` on iPhone, `android` in the
 * Google Play app, null on the web. The shells set `window.__PL_PLATFORM__` before any page script
 * (GameViewController.swift, pawlegends-app/android ShellPlugin.java); Capacitor's own platform name covers an Android
 * WebView too old for document-start scripts, and an older iPhone binary that predates the key is still `ios`.
 * Never throws.
 */
export function shellPlatform(env: boolean = APP_ENV, w: unknown = typeof window !== 'undefined' ? window : undefined): ShellPlatform | null {
  if (!inAppShell(env, w)) return null;
  try {
    const win = w as { __PL_PLATFORM__?: unknown; Capacitor?: { getPlatform?: () => unknown } } | undefined;
    const p = win?.__PL_PLATFORM__;
    if (p === 'mac' || p === 'android') return p;
    if (p === undefined && typeof win?.Capacitor?.getPlatform === 'function' && win.Capacitor.getPlatform() === 'android') return 'android';
    return 'ios';
  } catch {
    return 'ios';
  }
}

/**
 * Touch controls from the start of a match: a coarse pointer, except in the Mac app, which always plays with keyboard
 * and mouse and the desktop HUD (a first real touch still turns touch controls on, as on the web).
 */
export function coarsePointer(platform: ShellPlatform | null = shellPlatform(), mm: ((q: string) => { matches: boolean }) | undefined = typeof matchMedia === 'function' ? matchMedia : undefined): boolean {
  if (platform === 'mac') return false;
  return !!mm && mm('(pointer: coarse)').matches;
}

/**
 * The base URL a dare link is built on: the public game in the app (its own address is `capacitor://localhost`,
 * which no friend can open) and on a production host page, a preview host page's `/pawlegends` when embedded, else
 * this page.
 */
export function shareBase(o: { appShell: boolean; embedded: boolean; referrer: string; href: string }): string {
  if (o.appShell) return PUBLIC_GAME_URL;
  if (o.embedded && o.referrer) {
    try {
      const u = new URL(o.referrer);
      if (PUBLIC_HOSTS.includes(u.hostname)) return PUBLIC_GAME_URL;
      return `${u.origin}/pawlegends`;
    } catch {
      /* a malformed referrer: fall through to this page */
    }
  }
  return o.href;
}
