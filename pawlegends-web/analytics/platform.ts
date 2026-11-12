import { Capacitor } from "@capacitor/core";
import type { AnalyticsPlatform, DeviceTier } from "./events";

/** `web`, `ios` or `android`. Anything unexpected counts as `web`. */
export function getPlatform(): AnalyticsPlatform {
  try {
    const platform = Capacitor.getPlatform();
    return platform === "ios" || platform === "android" ? platform : "web";
  } catch {
    return "web";
  }
}

/** Matches the Heist rule: 4 GB of device memory or less is the low tier. */
export function getDeviceTier(): DeviceTier {
  if (typeof navigator === "undefined") return "unknown";
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (typeof memory !== "number") return "unknown";
  return memory <= 4 ? "low" : "high";
}
