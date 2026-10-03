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

/** Social-app web views where Google blocks OAuth (`disallowed_useragent`) and Apple popups fail. */
const IN_APP_BROWSER =
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Pinterest|Twitter for|MicroMessenger/i;

/** True inside a social app's browser. Never true in the Capacitor app (it is a web view too). */
export function isInAppBrowser(env: EnvLike): boolean {
  if (env.platform === "ios" || env.platform === "android") return false;
  return IN_APP_BROWSER.test(env.userAgent || "");
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
