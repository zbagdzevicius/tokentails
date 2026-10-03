/**
 * Low-effects mode (plan F3.3, G14). Sets `class="lowfx"` on `<html>` on Android and on devices
 * reporting 4 or fewer logical cores, where backdrop blur and large animated layers drop frames.
 * Style with the Tailwind `lowfx:` variant, e.g. `backdrop-blur-[4px] lowfx:backdrop-filter-none`.
 *
 * SSR-safe and idempotent. GameModal applies it on mount; `_app` may call it at boot as well.
 */
export const LOWFX_CLASS = "lowfx";

interface EnvLike {
  userAgent?: string;
  hardwareConcurrency?: number;
  /** Set by Capacitor on native builds. */
  platform?: string;
}

export function isLowFxDevice(env: EnvLike): boolean {
  if (env.platform === "android") return true;
  if (env.userAgent && /Android/i.test(env.userAgent)) return true;
  const cores = env.hardwareConcurrency;
  return typeof cores === "number" && cores > 0 && cores <= 4;
}

let applied = false;

/** Adds the class once per page load. Returns whether low-effects mode is on. */
export function applyLowFx(): boolean {
  if (typeof document === "undefined" || typeof navigator === "undefined") return false;
  const root = document.documentElement;
  if (applied) return root.classList.contains(LOWFX_CLASS);
  applied = true;
  const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  let platform: string | undefined;
  try {
    platform = capacitor?.getPlatform?.();
  } catch {
    platform = undefined;
  }
  const low = isLowFxDevice({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    platform,
  });
  root.classList.toggle(LOWFX_CLASS, low);
  return low;
}

/** Test-only reset. */
export function __resetLowFxForTests(): void {
  applied = false;
}
