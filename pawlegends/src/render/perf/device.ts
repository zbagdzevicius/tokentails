/**
 * PERF-IOS P1-2: is this a phone (or a small tablet)? Phones get their own render profile (render/quality.ts
 * `tierSettings(tier, { phone: true })`) instead of desktop Medium, because a phone has a fraction of a desktop GPU,
 * no fan, and throttles once hot (docs/plans/moba/PERF-IOS.md §2).
 *
 * A phone is: the iOS app shell (`shellPlatform() === 'ios'`, the WKWebView of `pawlegends-app/`), or an iPhone,
 * iPod, iPad or Android user agent with a coarse pointer, or any coarse-pointer device whose short screen side is at
 * most PHONE_SHORT_SIDE CSS px. The Mac app (Mac Catalyst) is never a phone. iPadOS Safari reports a Mac user agent:
 * a "Macintosh" with touch points is an iPad. Pure (inputs injected) so it is unit-tested; never throws.
 */
import { shellPlatform } from '../../app/platform';

export const PHONE_SHORT_SIDE = 500;

export interface DeviceInput {
  shell: 'ios' | 'mac' | null;
  ua: string;
  coarse: boolean;
  maxTouchPoints: number;
  /** Short side of the screen, CSS px. */
  shortSide: number;
}

export function isPhoneDevice(d: DeviceInput): boolean {
  if (d.shell === 'mac') return false;
  if (d.shell === 'ios') return true;
  const ua = d.ua || '';
  if (/iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ Safari says "Macintosh"; only a real iPad has touch points there
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && d.maxTouchPoints > 1);
  if (ipad) return true;
  if (/Android/.test(ua) && d.coarse) return true;
  return d.coarse && d.shortSide > 0 && d.shortSide <= PHONE_SHORT_SIDE;
}

/** iOS / iPadOS WebKit (the app shell, Safari, any iOS browser): rAF is held at 60 Hz there, 30 in Low Power Mode. */
export function isIosWebKit(d: Pick<DeviceInput, 'shell' | 'ua' | 'maxTouchPoints'>): boolean {
  if (d.shell === 'ios') return true;
  const ua = d.ua || '';
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && d.maxTouchPoints > 1);
}

/** The live inputs (browser globals; neutral defaults outside a browser). */
export function deviceInput(): DeviceInput {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  let coarse = false;
  try {
    coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    /* no media queries */
  }
  let shortSide = 0;
  try {
    if (typeof screen !== 'undefined') shortSide = Math.min(screen.width || 0, screen.height || 0);
  } catch {
    /* no screen */
  }
  return { shell: shellPlatform(), ua: nav?.userAgent ?? '', coarse, maxTouchPoints: nav?.maxTouchPoints ?? 0, shortSide };
}

let cached: boolean | null = null;
/** This device is a phone (computed once). `?phone=1|0` forces it (perf harness, desktop testing). */
export function isPhone(): boolean {
  if (cached !== null) return cached;
  try {
    const f = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('phone') : null;
    if (f === '1' || f === '0') return (cached = f === '1');
  } catch {
    /* no location */
  }
  return (cached = isPhoneDevice(deviceInput()));
}

/** Tests only. */
export function resetPhoneCache(): void {
  cached = null;
}
