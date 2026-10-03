/**
 * Render tiers and the canvas pixel-ratio cap (plan F10, G7 "Render tiers", decision #84).
 *
 * The tier is detected once from what the browser tells us (device memory, CPU cores, Save-Data)
 * and can be overridden by the player with an Auto / High / Low setting kept in localStorage.
 * The tier decides how many device pixels the Phaser backing store gets per CSS pixel:
 *
 *   LOW   2, or 1.5 when `navigator.deviceMemory <= 4` (low-memory Android, decision #84)
 *   MID   2
 *   HIGH  2
 *
 * A player who explicitly picks Low always gets 1.5, whatever the device reports (2e decision:
 * otherwise Low would equal High on iOS and on any Chromium device over 4 GB).
 *
 * A ratio of 3 is never used by default. The plan leaves "3 on flagship iOS" to a founder decision;
 * `ALLOW_DPR_3` is the single switch for it and stays off (recommendation of decision #84).
 *
 * Pure module: no Phaser import, safe in SSR and Jest. Every storage access is wrapped in
 * try/catch because it can throw in private windows, previews and thumbnails.
 */
import { defaultStorage, readSetting, type StorageLike } from "./storage";

export type RenderTier = "LOW" | "MID" | "HIGH";
export type RenderSetting = "auto" | "high" | "low";

export const RENDER_SETTINGS: readonly RenderSetting[] = ["auto", "high", "low"];

/** localStorage key of the player's Auto / High / Low choice. */
export const RENDER_SETTING_KEY = "tt-render-tier";

/** Founder decision #84: a ratio of 3 is not allowed. Flip only with a recorded decision. */
export const ALLOW_DPR_3 = false;

export const DPR_CAP: Record<RenderTier, number> = { LOW: 2, MID: 2, HIGH: 2 };
/** LOW-tier cap when the device reports 4 GB of memory or less. */
export const LOW_MEMORY_DPR_CAP = 1.5;
export const LOW_MEMORY_GB = 4;
/** Cap when the player explicitly chose Low (not auto-detected LOW). */
export const EXPLICIT_LOW_DPR_CAP = 1.5;

/** What tier detection reads. All optional: Safari reports neither memory nor Save-Data. */
export interface DeviceSignals {
  /** `navigator.deviceMemory` in GB (Chromium only, rounded, capped at 8). */
  deviceMemory?: number;
  /** `navigator.hardwareConcurrency`. */
  hardwareConcurrency?: number;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
}

export interface RenderProfile {
  tier: RenderTier;
  /** The detected tier before the player's setting was applied. */
  detectedTier: RenderTier;
  setting: RenderSetting;
  /** `window.devicePixelRatio` as reported. */
  rawDpr: number;
  /** The ratio the backing store uses: `min(rawDpr, cap)`, never below 1. */
  dpr: number;
  deviceMemory?: number;
}

const isPositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * LOW: 4 GB or less, 2 cores or fewer, or Save-Data on.
 * HIGH: 8 GB (the most Chromium reports) and 8 cores or more; on browsers that do not report
 * memory (Safari), 8 cores or more.
 * MID: everything else.
 */
export function detectTier(signals: DeviceSignals = {}): RenderTier {
  const { deviceMemory, hardwareConcurrency, saveData } = signals;
  if (saveData) return "LOW";
  if (isPositive(deviceMemory) && deviceMemory <= LOW_MEMORY_GB) return "LOW";
  if (isPositive(hardwareConcurrency) && hardwareConcurrency <= 2) return "LOW";
  const manyCores = isPositive(hardwareConcurrency) && hardwareConcurrency >= 8;
  const enoughMemory = !isPositive(deviceMemory) || deviceMemory >= 8;
  if (manyCores && enoughMemory) return "HIGH";
  return "MID";
}

/** The tier after the player's setting: `high` and `low` force it, `auto` keeps the detected one. */
export function applySetting(detected: RenderTier, setting: RenderSetting): RenderTier {
  if (setting === "high") return "HIGH";
  if (setting === "low") return "LOW";
  return detected;
}

/** The highest backing-store ratio a tier may use on this device. */
export function dprCap(tier: RenderTier, deviceMemory?: number, setting: RenderSetting = "auto"): number {
  if (setting === "low") return EXPLICIT_LOW_DPR_CAP;
  if (tier === "LOW" && isPositive(deviceMemory) && deviceMemory <= LOW_MEMORY_GB) {
    return LOW_MEMORY_DPR_CAP;
  }
  // The only way to 3 is the founder switch, and only on HIGH.
  return tier === "HIGH" && ALLOW_DPR_3 ? 3 : DPR_CAP[tier];
}

/** `min(rawDpr, cap)`, at least 1 (a zoomed-out desktop reports less than 1). */
export function capDpr(
  rawDpr: number,
  tier: RenderTier,
  deviceMemory?: number,
  setting: RenderSetting = "auto",
): number {
  const raw = isPositive(rawDpr) ? rawDpr : 1;
  return Math.max(1, Math.min(raw, dprCap(tier, deviceMemory, setting)));
}

export function isRenderSetting(value: unknown): value is RenderSetting {
  return typeof value === "string" && (RENDER_SETTINGS as readonly string[]).includes(value);
}


/** The player's setting; `auto` when unset, invalid or storage is unavailable. */
export function readRenderSetting(storage: StorageLike | null = defaultStorage()): RenderSetting {
  try {
    const value = storage?.getItem(RENDER_SETTING_KEY);
    return isRenderSetting(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Saves the setting (`auto` clears it). Returns false when storage refused. Takes effect on the next game mount. */
export function writeRenderSetting(
  setting: RenderSetting,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    if (setting === "auto") storage.removeItem(RENDER_SETTING_KEY);
    else storage.setItem(RENDER_SETTING_KEY, setting);
    return true;
  } catch {
    return false;
  }
}

interface NavigatorLike {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

/** Reads the signals from a window (or nothing on the server). */
export function readDeviceSignals(win?: Pick<Window, "navigator"> | null): DeviceSignals {
  try {
    const nav = (win?.navigator ?? undefined) as NavigatorLike | undefined;
    if (!nav) return {};
    return {
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: nav.hardwareConcurrency,
      saveData: !!nav.connection?.saveData,
    };
  } catch {
    return {};
  }
}

export interface ResolveOptions {
  win?: (Pick<Window, "navigator" | "devicePixelRatio"> & Partial<Pick<Window, "localStorage">>) | null;
  storage?: StorageLike | null;
  /** Overrides the device's ratio (tests, deterministic capture). */
  rawDpr?: number;
}

/** Tier, setting and capped ratio for this device right now. */
export function resolveRenderProfile(options: ResolveOptions = {}): RenderProfile {
  const win = options.win !== undefined ? options.win : typeof window === "undefined" ? null : window;
  const signals = readDeviceSignals(win);
  const detectedTier = detectTier(signals);
  // No storage given: the page's own storage, with the in-memory fallback of look/settings.ts
  // (a setting picked while storage is blocked still applies to the next mount, plan G7).
  const setting =
    options.storage !== undefined
      ? readRenderSetting(options.storage)
      : (() => {
          const value = readSetting(RENDER_SETTING_KEY);
          return isRenderSetting(value) ? value : "auto";
        })();
  const tier = applySetting(detectedTier, setting);
  const rawDpr = options.rawDpr ?? (isPositive(win?.devicePixelRatio) ? win!.devicePixelRatio : 1);
  return {
    tier,
    detectedTier,
    setting,
    rawDpr,
    dpr: capDpr(rawDpr, tier, signals.deviceMemory, setting),
    deviceMemory: signals.deviceMemory,
  };
}
