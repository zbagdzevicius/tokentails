import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Night-900 from design/tokens.ts (THEME_COLOR). Kept as a literal because the Capacitor CLI loads
 * this file on its own; __test__/palette-native-chrome.test.ts fails if it drifts from the token.
 */
export const NATIVE_BACKGROUND = "#0b0820";

const config: CapacitorConfig = {
  appId: "com.tokentails.app",
  appName: "Token Tails",
  webDir: "out",
  // Painted behind the web view until the first web paint, so no white frame shows between the
  // night splash and the page (plan G6).
  backgroundColor: NATIVE_BACKGROUND,
  server: {
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    backgroundColor: NATIVE_BACKGROUND,
    // targetSdk 36 forces edge-to-edge: Capacitor 7.2 (pinned ~7.2.0) adds the system-bar
    // margins itself when the app draws behind them.
    adjustMarginsForEdgeToEdge: "auto",
  },
  ios: {
    backgroundColor: NATIVE_BACKGROUND,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com", "apple.com"],
    },
    // Light status-bar text on the night page; NativeChrome.tsx applies the same at runtime.
    // overlaysWebView keeps its default, so the safe-area layout does not change.
    StatusBar: {
      style: "DARK",
      backgroundColor: NATIVE_BACKGROUND,
    },
    // Meet your cat (plan G3): the keyboard resizes the body, so the nameplate panel moves up with
    // it instead of hiding under the keyboard. Takes effect on the next native release.
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
