/**
 * Player-facing look settings (plan G7 "Render tiers" and "Look presets"; decisions #51, #84).
 *
 *   Graphics      Auto / High / Low (`tt-render-tier`). Decides the render tier, which caps the
 *                 canvas pixel ratio (tier.ts) and scales fireflies, lights and the player Glow.
 *   Reduced motion  System / On / Off (`tt-reduced-motion`). Separate from the tier: On freezes
 *                 parallax, fireflies, flicker and camera look-ahead, whatever the tier.
 *   Look version  v0 / v1 override (`tt-look-version`). Normally unset: the look manifest
 *                 (`public/look/manifest.json`) decides, so a rollback to v0 needs no rebuild.
 *
 * All three work with storage blocked (look/storage.ts keeps them in memory for the page) and
 * take effect on the next game mount. A change dispatches `LOOK_SETTINGS_EVENT` on window so
 * open settings UI can re-read.
 *
 * Pure module: no Phaser import (Jest, SSR). Imported by GameOptionsModal (task 6c).
 */
import { isRenderSetting, RENDER_SETTING_KEY, type RenderSetting } from "./tier";
import { readSetting, writeSetting, type StorageLike } from "./storage";

export type { RenderSetting };
export type ReducedMotionOverride = "system" | "on" | "off";
export type LookVersion = "v0" | "v1";

export const REDUCED_MOTION_KEY = "tt-reduced-motion";
export const LOOK_VERSION_KEY = "tt-look-version";
/** The spelling the look manifest's rollback note uses (task 6d); read as an alias. */
export const LOOK_VERSION_ALIAS_KEY = "tt.lookVersion";
/** Window event fired after any look setting changed. */
/** The `lookVersion` of the last manifest this device read (rollback survives a failed fetch). */
export const LAST_LOOK_VERSION_KEY = "tt-look-version-last";
export const LOOK_SETTINGS_EVENT = "tt-look-settings";

export const REDUCED_MOTION_OVERRIDES: readonly ReducedMotionOverride[] = ["system", "on", "off"];
export const LOOK_VERSIONS: readonly LookVersion[] = ["v0", "v1"];

export const isLookVersion = (value: unknown): value is LookVersion =>
  value === "v0" || value === "v1";

const isReducedMotionOverride = (value: unknown): value is ReducedMotionOverride =>
  typeof value === "string" && (REDUCED_MOTION_OVERRIDES as readonly string[]).includes(value);

function announce() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LOOK_SETTINGS_EVENT));
  } catch {
    // Cosmetic only.
  }
}

/** Auto / High / Low; `auto` when unset or unreadable. */
export function getRenderTierSetting(storage?: StorageLike | null): RenderSetting {
  const value = readSetting(RENDER_SETTING_KEY, storage);
  return isRenderSetting(value) ? value : "auto";
}

/** Saves the graphics setting (`auto` clears it). True when storage kept it, false when only memory did. */
export function setRenderTierSetting(setting: RenderSetting, storage?: StorageLike | null): boolean {
  const next = isRenderSetting(setting) ? setting : "auto";
  const stored = writeSetting(RENDER_SETTING_KEY, next === "auto" ? null : next, storage);
  announce();
  return stored;
}

/** System / On / Off; `system` when unset or unreadable. */
export function getReducedMotionOverride(storage?: StorageLike | null): ReducedMotionOverride {
  const value = readSetting(REDUCED_MOTION_KEY, storage);
  return isReducedMotionOverride(value) ? value : "system";
}

export function setReducedMotionOverride(value: ReducedMotionOverride, storage?: StorageLike | null): boolean {
  const next = isReducedMotionOverride(value) ? value : "system";
  const stored = writeSetting(REDUCED_MOTION_KEY, next === "system" ? null : next, storage);
  announce();
  return stored;
}

type MatchMediaWindow = Pick<Window, "matchMedia">;

/** The OS / browser preference (`prefers-reduced-motion: reduce`). */
export function systemPrefersReducedMotion(win?: MatchMediaWindow | null): boolean {
  try {
    const target = win !== undefined ? win : typeof window === "undefined" ? null : window;
    return !!target?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

/** True when parallax, particles, flicker and look-ahead must hold still. */
export function isReducedMotion(win?: MatchMediaWindow | null, storage?: StorageLike | null): boolean {
  const override = getReducedMotionOverride(storage);
  if (override === "on") return true;
  if (override === "off") return false;
  return systemPrefersReducedMotion(win);
}

/** The per-device look override, or null when the manifest decides. */
export function getLookVersionOverride(storage?: StorageLike | null): LookVersion | null {
  const value = readSetting(LOOK_VERSION_KEY, storage);
  if (isLookVersion(value)) return value;
  const alias = readSetting(LOOK_VERSION_ALIAS_KEY, storage);
  return isLookVersion(alias) ? alias : null;
}

/** Pins this device to a look (`null` hands the choice back to the manifest). */
export function setLookVersionOverride(value: LookVersion | null, storage?: StorageLike | null): boolean {
  const stored = writeSetting(LOOK_VERSION_KEY, isLookVersion(value) ? value : null, storage);
  if (!isLookVersion(value)) writeSetting(LOOK_VERSION_ALIAS_KEY, null, storage);
  announce();
  return stored;
}

/** The `lookVersion` of the last manifest read on this device, or null. */
export function getLastLookVersion(storage?: StorageLike | null): LookVersion | null {
  const value = readSetting(LAST_LOOK_VERSION_KEY, storage);
  return isLookVersion(value) ? value : null;
}

/**
 * Remembers a manifest's `lookVersion` (no event: it is not a setting the player changed). A
 * rolled-back fleet stays on v0 when a later fetch fails (task 6e review, #51).
 */
export function rememberLookVersion(value: LookVersion, storage?: StorageLike | null): boolean {
  if (!isLookVersion(value)) return false;
  if (readSetting(LAST_LOOK_VERSION_KEY, storage) === value) return true;
  return writeSetting(LAST_LOOK_VERSION_KEY, value, storage);
}
