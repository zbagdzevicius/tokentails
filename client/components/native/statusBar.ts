/**
 * Native chrome (plan G6 "Native chrome", task 3d): the iOS and Android status bar sits on the
 * night page with light text, matching `theme-color` and the night splash.
 *
 * Kept free of React so it can be tested without a renderer. The status-bar plugin is imported
 * lazily and only on a native platform, so the web bundle never calls into it.
 */
import { THEME_COLOR } from "@/design/tokens";

export interface NativeChromeDeps {
  isNative: () => boolean;
  platform: () => string;
  loadStatusBar: () => Promise<{
    StatusBar: {
      setStyle(options: { style: string }): Promise<void>;
      setBackgroundColor(options: { color: string }): Promise<void>;
    };
    Style: { Dark: string };
  }>;
  report?: (error: unknown) => void;
}

/**
 * Applies the night status bar. `Style.Dark` means light text for a dark background. The
 * background colour is Android only (iOS draws the web view under a transparent bar), and only
 * takes effect below API 35: from Android 15 (our targetSdk 36) the platform ignores status-bar
 * colours under enforced edge-to-edge, and the night `windowBackground` shows through instead.
 * Today MainActivity also runs immersive (bars hidden), so both calls only matter when the bars
 * are revealed; immersive vs `adjustMarginsForEdgeToEdge: "auto"` is a native-train decision
 * (docs/plans/alignment-log/3d.md). Every failure is reported and swallowed: chrome must never
 * break the app.
 */
export async function applyNativeChrome(deps: NativeChromeDeps): Promise<boolean> {
  if (!deps.isNative()) return false;
  try {
    const { StatusBar, Style } = await deps.loadStatusBar();
    await StatusBar.setStyle({ style: Style.Dark });
    if (deps.platform() === "android") {
      await StatusBar.setBackgroundColor({ color: THEME_COLOR });
    }
    return true;
  } catch (error) {
    deps.report?.(error);
    return false;
  }
}
