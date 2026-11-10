/**
 * PERF-IOS P1-2: is this a phone (or a small tablet)? Phones get their own render profile (render/quality.ts
 * `tierSettings(tier, { phone: true })`) instead of desktop Medium, because a phone has a fraction of a desktop GPU,
 * no fan, and throttles once hot (docs/plans/moba/PERF-IOS.md §2).
 *
 * A phone is: the iOS or Android app shell (`shellPlatform()` 'ios' or 'android', the WebView of `pawlegends-app/`), or an iPhone,
 * iPod, iPad or Android user agent with a coarse pointer, or any coarse-pointer device whose short screen side is at
 * most PHONE_SHORT_SIDE CSS px. The Mac app (Mac Catalyst) is never a phone. iPadOS Safari reports a Mac user agent:
 * a "Macintosh" with touch points is an iPad. Pure (inputs injected) so it is unit-tested; never throws.
 */
import { shellPlatform, type ShellPlatform } from '../../app/platform';

export const PHONE_SHORT_SIDE = 500;

export interface DeviceInput {
  shell: ShellPlatform | null;
  ua: string;
  coarse: boolean;
  maxTouchPoints: number;
  /** Short side of the screen, CSS px. */
  shortSide: number;
}

export function isPhoneDevice(d: DeviceInput): boolean {
  if (d.shell === 'mac') return false;
  if (d.shell === 'ios' || d.shell === 'android') return true;
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
  if (d.shell === 'android') return false;
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

/** What the Android shell tells the page about the device (pawlegends-app/android ShellPlugin.java `__PL_DEVICE__`). */
export interface LowEndInput {
  /** ActivityManager.isLowRamDevice(). */
  lowRam?: boolean;
  /** Total RAM in MB (0 or missing: unknown). */
  ramMb?: number;
  /** navigator.deviceMemory (GB, rounded down to a power of two; Chromium only). */
  deviceMemory?: number;
}

/** RAM below this (MB) starts on Low: 3 GB phones report about 2.7 to 2.9 GB, 4 GB phones about 3.6 to 3.8 GB. */
export const LOW_END_RAM_MB = 4500;

/**
 * A budget device that should start a fresh install on Low instead of phone Medium (the first-match probe would get
 * there after 8 to 12 s of stutter, and a low-RAM WebView renderer can be killed for memory before that). Only an
 * Android shell or a Chromium page that reports its memory is ever judged; unknown means not low end. Pure.
 */
export function isLowEndDevice(d: LowEndInput): boolean {
  if (d.lowRam === true) return true;
  if (typeof d.ramMb === 'number' && d.ramMb > 0 && d.ramMb < LOW_END_RAM_MB) return true;
  return typeof d.deviceMemory === 'number' && d.deviceMemory > 0 && d.deviceMemory <= 2;
}

/** The live low-end inputs (the Android shell's `__PL_DEVICE__`, navigator.deviceMemory). Never throws. */
export function lowEndInput(w: unknown = typeof window !== 'undefined' ? window : undefined): LowEndInput {
  try {
    const win = w as { __PL_DEVICE__?: { lowRam?: unknown; ramMb?: unknown }; navigator?: { deviceMemory?: unknown } } | undefined;
    const dev = win?.__PL_DEVICE__;
    const mem = win?.navigator?.deviceMemory;
    return {
      lowRam: dev?.lowRam === true,
      ramMb: typeof dev?.ramMb === 'number' ? dev.ramMb : undefined,
      deviceMemory: typeof mem === 'number' ? mem : undefined,
    };
  } catch {
    return {};
  }
}
