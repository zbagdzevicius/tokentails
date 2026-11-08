/**
 * The native app shell (docs/plans/moba/APP-STORE.md "Game changes for the app build"). The App Store build of
 * Pawlegends (`pawlegends-app/`, Capacitor, served from `capacitor://localhost`) is built with
 * `VITE_PAWLEGENDS_APP=1`; a bundle loaded by the shell also sees `window.Capacitor.isNativePlatform()`. Either one
 * makes this an app build: no Token Tails purchase links, starter and redeemed cats only (Apple 3.1.1 / 3.1.3(b)),
 * and share links that point at the public web game instead of the app's own `capacitor://` address.
 *
 * On the web build `VITE_PAWLEGENDS_APP` is unset, Vite folds `APP_ENV` to false, and nothing here changes anything.
 */

/** Built for the app shell (`pawlegends-app/scripts/build-web.mjs` sets it). A build-time constant. */
export const APP_ENV: boolean = import.meta.env?.VITE_PAWLEGENDS_APP === '1';

/** The public web game: dare and share links from the app open here (and in the app, via Universal Links). */
export const PUBLIC_GAME_URL = 'https://tokentails.com/pawlegends';

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

/**
 * Which native shell runs the page: `mac` in the Mac App Store app (Mac Catalyst), `ios` on iPhone, null on the web.
 * The shell sets `window.__PL_PLATFORM__` before any page script (GameViewController.swift); an older iPhone binary
 * that predates it is still `ios`. Never throws.
 */
export function shellPlatform(env: boolean = APP_ENV, w: unknown = typeof window !== 'undefined' ? window : undefined): 'mac' | 'ios' | null {
  if (!inAppShell(env, w)) return null;
  try {
    return (w as { __PL_PLATFORM__?: unknown } | undefined)?.__PL_PLATFORM__ === 'mac' ? 'mac' : 'ios';
  } catch {
    return 'ios';
  }
}

/**
 * Touch controls from the start of a match: a coarse pointer, except in the Mac app, which always plays with keyboard
 * and mouse and the desktop HUD (a first real touch still turns touch controls on, as on the web).
 */
export function coarsePointer(platform: 'mac' | 'ios' | null = shellPlatform(), mm: ((q: string) => { matches: boolean }) | undefined = typeof matchMedia === 'function' ? matchMedia : undefined): boolean {
  if (platform === 'mac') return false;
  return !!mm && mm('(pointer: coarse)').matches;
}

/**
 * The base URL a dare link is built on: the public game in the app (its own address is `capacitor://localhost`,
 * which no friend can open), the host page's `/pawlegends` when embedded, else this page.
 */
export function shareBase(o: { appShell: boolean; embedded: boolean; referrer: string; href: string }): string {
  if (o.appShell) return PUBLIC_GAME_URL;
  if (o.embedded && o.referrer) {
    try {
      return `${new URL(o.referrer).origin}/pawlegends`;
    } catch {
      /* a malformed referrer: fall through to this page */
    }
  }
  return o.href;
}
