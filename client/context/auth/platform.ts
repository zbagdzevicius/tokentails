/**
 * Environment checks for the AuthSheet (plan G9). Pure functions of a user agent and a platform
 * name, so they are tested without a browser.
 */

interface EnvLike {
  userAgent?: string;
  /** Capacitor platform: `ios`, `android` or `web`. */
  platform?: string;
  /** `navigator.maxTouchPoints`, to tell an iPad in desktop mode from a Mac. */
  maxTouchPoints?: number;
}

/**
 * Social-app and wallet web views where Google blocks OAuth (`disallowed_useragent`) and Apple
 * popups fail. Wallets: MetaMask (`MetaMaskMobile`), Trust Wallet (`Trust/`, `TrustWallet`),
 * Phantom, Coinbase Wallet (`CoinbaseWallet`, `CoinbaseBrowser`), OKX (`OKApp`, `OKEx`) and
 * Binance (`BNC/`, `Binance`).
 */
const IN_APP_BROWSER =
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Pinterest|Twitter for|MicroMessenger|MetaMaskMobile|TrustWallet|\bTrust\/|Phantom|CoinbaseWallet|CoinbaseBrowser|OKApp|OKEx|\bBNC\/|Binance/i;

/** True inside a social app's browser. Never true in the Capacitor app (it is a web view too). */
export function isInAppBrowser(env: EnvLike): boolean {
  if (env.platform === "ios" || env.platform === "android") return false;
  return IN_APP_BROWSER.test(env.userAgent || "");
}

/**
 * The link the in-app browser notice copies: the current page with `signin=1`, so pasted into
 * Safari or Chrome it opens the sign-in sheet again (`/game` reads it; the landing ignores it).
 * `/game` removes the param from the address bar once the sheet opened, so it is put back here.
 */
export function signInLink(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set("signin", "1");
    return url.toString();
  } catch {
    return href;
  }
}

/**
 * "Open in Chrome" from an Android in-app browser: an intent URL leaves the wallet's web view
 * (a plain `target=_blank` link opens another tab inside it). Falls back to the plain link when
 * Chrome is missing. Null on iOS and elsewhere: no web link leaves an iOS in-app browser, so the
 * notice offers only "Copy link" there.
 */
export function externalBrowserLink(href: string, userAgent: string | undefined): string | null {
  if (!/Android/i.test(userAgent || "")) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
  } catch {
    return null;
  }
}

/** Apple first on iOS (app or browser) and in Safari on Apple devices; Google first elsewhere. */
export function isAppleFirst(env: EnvLike): boolean {
  if (env.platform === "ios") return true;
  if (env.platform === "android") return false;
  const ua = env.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  const isMacLike = /Macintosh|Mac OS X/i.test(ua);
  // Safari, not Chrome, Edge, Firefox or Opera on the Mac (they all include "Safari" too).
  const isSafari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS|FxiOS|Edg\/|OPR\//.test(ua);
  if (isMacLike && (env.maxTouchPoints ?? 0) > 1) return true; // iPad in desktop mode
  return isMacLike && isSafari;
}

/** The current browser's environment. SSR-safe. */
export function currentEnv(): EnvLike {
  if (typeof navigator === "undefined") return {};
  let platform: string | undefined;
  try {
    platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  } catch {
    platform = undefined;
  }
  return { userAgent: navigator.userAgent, platform, maxTouchPoints: navigator.maxTouchPoints };
}
