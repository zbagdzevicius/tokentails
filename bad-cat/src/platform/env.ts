/**
 * Environment probes (GDD 7, 8, 13): in-app browser detection, iOS (incl. iPadOS posing as a Mac),
 * WebCodecs / AudioEncoder / file-share support, and the build-time env flags (FULL-PLAN 2: every flag
 * defaults off / null). Never throws.
 */
import type { EnvInfo, InAppBrowser } from '../types';

export const SHORT_URL = 'tokentails.com/badcat';

/** Everything detectEnv reads; tests inject their own. */
export interface EnvSource {
  ua: string;
  platform: string;
  maxTouchPoints: number;
  touchEvent: boolean;
  dev: boolean;
  qa: boolean;
  presaleRaw: string | undefined;
  webcodecs: boolean;
  audioEncoder: boolean;
  canShareFiles: boolean;
  // ----- FULL build (all optional; unset = off) -----
  /** VITE_BADCAT_API_URL */
  apiRaw?: string;
  /** VITE_BADCAT_CLUB */
  clubRaw?: string | boolean;
  /** VITE_BADCAT_POSTHOG_KEY */
  posthogRaw?: string;
  /** VITE_BADCAT_STUDIO */
  studioRaw?: string | boolean;
  /** VITE_BADCAT_SHORT_URL */
  shortUrlRaw?: string;
}

export function detectInApp(ua: string): InAppBrowser {
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return 'tiktok';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook';
  return 'none';
}

export function detectIOS(ua: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports a desktop Mac UA; a Mac with touch points is an iPad.
  return (/Macintosh/i.test(ua) || platform === 'MacIntel') && maxTouchPoints > 1;
}

/** Pre-sale Payment Link: https only, otherwise null (GDD 9, LANES L8). */
export function sanitizePresaleUrl(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || !u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const truthy = (v: unknown): boolean => v === true || v === '1' || v === 'true';

/**
 * Backend origin (VITE_BADCAT_API_URL): https only; `http://localhost`/`127.0.0.1` only in dev builds.
 * Returns the bare origin (no path, no trailing slash) or null.
 */
export function sanitizeApiUrl(raw: string | undefined | null, dev = false): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (!u.hostname || u.username || u.password) return null;
    const local = u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.protocol === 'https:') return u.origin;
    if (u.protocol === 'http:' && dev && local) return u.origin;
    return null;
  } catch {
    return null;
  }
}

/** PostHog project keys are `phc_` + url-safe chars; anything else is ignored (no analytics network). */
export function sanitizePosthogKey(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return /^phc_[A-Za-z0-9_-]{8,80}$/.test(v) ? v : null;
}

/** Short URL for the clip line: host + optional path, no scheme, no query. Falls back to SHORT_URL. */
export function sanitizeShortUrl(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return SHORT_URL;
  const v = raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/[A-Za-z0-9._~-]+)*$/i.test(v) && v.length <= 40 ? v : SHORT_URL;
}

/** Chrome on Android (not an in-app webview, not Samsung/Edge/Opera/Firefox): `intent://` and beforeinstallprompt work. */
export function detectAndroidChrome(ua: string): boolean {
  if (!/Android/i.test(ua) || !/Chrome\/\d+/.test(ua)) return false;
  if (/; wv\)|Version\/\d+\.\d+ Chrome|SamsungBrowser|EdgA|OPR\/|Firefox|YaBrowser|UCBrowser|DuckDuckGo/i.test(ua)) return false;
  return detectInApp(ua) === 'none' && !/Instagram|FBAN|FBAV|BytedanceWebview|musical_ly/i.test(ua);
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function viteEnv(): Record<string, string | boolean | undefined> {
  return safe(() => (import.meta.env ?? {}) as Record<string, string | boolean | undefined>, {});
}

/** Reads the live browser (or Node) environment. */
export function readEnvSource(): EnvSource {
  const g = globalThis as Record<string, unknown>;
  const nav = safe(() => (g.navigator as Navigator | undefined) ?? undefined, undefined);
  const env = viteEnv();
  const ua = safe(() => nav?.userAgent ?? '', '');
  const canShareFiles = safe(() => {
    if (!nav || typeof nav.canShare !== 'function' || typeof File === 'undefined') return false;
    const f = new File([new Uint8Array(1)], 'probe.mp4', { type: 'video/mp4' });
    return nav.canShare({ files: [f] });
  }, false);
  const qaRaw = env.VITE_BADCAT_QA;
  return {
    ua,
    platform: safe(() => nav?.platform ?? '', ''),
    maxTouchPoints: safe(() => nav?.maxTouchPoints ?? 0, 0),
    touchEvent: safe(() => 'ontouchstart' in g, false),
    dev: env.DEV === true,
    qa: qaRaw === '1' || qaRaw === 'true' || qaRaw === true,
    presaleRaw: typeof env.VITE_BADCAT_PRESALE_URL === 'string' ? env.VITE_BADCAT_PRESALE_URL : undefined,
    webcodecs: safe(() => typeof g.VideoEncoder === 'function', false),
    audioEncoder: safe(() => typeof g.AudioEncoder === 'function', false),
    canShareFiles,
    apiRaw: typeof env.VITE_BADCAT_API_URL === 'string' ? env.VITE_BADCAT_API_URL : undefined,
    clubRaw: env.VITE_BADCAT_CLUB,
    posthogRaw: typeof env.VITE_BADCAT_POSTHOG_KEY === 'string' ? env.VITE_BADCAT_POSTHOG_KEY : undefined,
    studioRaw: env.VITE_BADCAT_STUDIO,
    shortUrlRaw: typeof env.VITE_BADCAT_SHORT_URL === 'string' ? env.VITE_BADCAT_SHORT_URL : undefined,
  };
}

export function detectEnv(src: EnvSource = readEnvSource()): EnvInfo {
  const isIOS = detectIOS(src.ua, src.platform, src.maxTouchPoints);
  return {
    isIOS,
    isAndroid: /Android/i.test(src.ua),
    isTouch: src.maxTouchPoints > 0 || src.touchEvent,
    inApp: detectInApp(src.ua),
    dev: src.dev,
    qa: src.qa,
    presaleUrl: sanitizePresaleUrl(src.presaleRaw),
    shortUrl: sanitizeShortUrl(src.shortUrlRaw),
    canShareFiles: src.canShareFiles,
    webcodecs: src.webcodecs,
    audioEncoder: src.audioEncoder,
    apiUrl: sanitizeApiUrl(src.apiRaw, src.dev),
    clubUi: truthy(src.clubRaw),
    posthogKey: sanitizePosthogKey(src.posthogRaw),
    studioAllowed: src.dev || truthy(src.studioRaw),
    isAndroidChrome: detectAndroidChrome(src.ua),
  };
}

/**
 * Analytics `platform`: ios / android from the UA, else a touch device with a phone- or tablet-sized screen is
 * 'mobile' (round 2: a touch phone whose UA names no OS was recorded as 'desktop'), else 'desktop'.
 */
export function platformOf(env: Pick<EnvInfo, 'isIOS' | 'isAndroid' | 'isTouch'>, screenMin?: number): 'ios' | 'android' | 'mobile' | 'desktop' {
  if (env.isIOS) return 'ios';
  if (env.isAndroid) return 'android';
  let small = screenMin;
  if (small === undefined) {
    try {
      const sc = (globalThis as { screen?: { width: number; height: number } }).screen;
      small = sc ? Math.min(sc.width, sc.height) : Infinity;
    } catch {
      small = Infinity;
    }
  }
  return env.isTouch && small <= 1024 ? 'mobile' : 'desktop';
}
