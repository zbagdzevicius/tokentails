import { reportAppError } from "@/analytics";
import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import { applyNativeChrome } from "./statusBar";

/**
 * Mounted once from `_app.tsx` (client only, through next/dynamic). On iOS and Android it sets the
 * night status bar; on the web it does nothing and renders nothing.
 */
export default function NativeChrome() {
  useEffect(() => {
    void applyNativeChrome({
      isNative: () => Capacitor.isNativePlatform(),
      platform: () => Capacitor.getPlatform(),
      loadStatusBar: () => import("@capacitor/status-bar"),
      report: (error) => reportAppError("native_chrome_error", error),
    });
  }, []);
  return null;
}
