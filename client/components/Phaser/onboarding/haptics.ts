/**
 * Haptic feedback for runs (plan G10, decision #70). Native apps only: on the web it does nothing.
 * `@capacitor/haptics` is imported on first use, so the web bundle never loads it and a missing
 * native plugin (an app build from before the native train syncs it) fails silently.
 *
 * The one module in this folder that is not pure; it never throws.
 */
import { Capacitor } from "@capacitor/core";

export type HapticKind = "soft-death" | "hard-death" | "clear";

type HapticsModule = typeof import("@capacitor/haptics");
let loading: Promise<HapticsModule | null> | null = null;

const load = (): Promise<HapticsModule | null> => {
  if (!loading) {
    loading = import("@capacitor/haptics").catch(() => null);
  }
  return loading;
};

export function isHapticsAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics");
  } catch {
    return false;
  }
}

export function haptic(kind: HapticKind): void {
  if (!isHapticsAvailable()) return;
  void load()
    .then((mod) => {
      if (!mod) return;
      const { Haptics, ImpactStyle, NotificationType } = mod;
      if (kind === "soft-death") return Haptics.impact({ style: ImpactStyle.Light });
      if (kind === "hard-death") return Haptics.notification({ type: NotificationType.Error });
      return Haptics.notification({ type: NotificationType.Success });
    })
    .catch(() => {});
}
