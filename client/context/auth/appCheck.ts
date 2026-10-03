import type { FirebaseApp } from "firebase/app";

/**
 * Firebase App Check for `POST /user/guest/session` (plan F5.5, sent in the lowercase
 * `x-firebase-appcheck` header). Off until the console setup is done (a deferred manual step):
 * set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` (reCAPTCHA Enterprise) on the web build. Native
 * builds need the Play Integrity / App Attest plugin and send no token yet; the backend only
 * enforces the header once `APP_CHECK_ENFORCE=true`.
 */
type AppCheckModule = typeof import("firebase/app-check");

let appCheck: Promise<{ mod: AppCheckModule; instance: ReturnType<AppCheckModule["initializeAppCheck"]> } | null> | null =
  null;

function siteKey(): string {
  return (process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY || "").trim();
}

function isNative(): boolean {
  try {
    const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    return platform === "ios" || platform === "android";
  } catch {
    return false;
  }
}

/** An App Check token, or null when App Check is not configured or fails. Never throws. */
export async function getAppCheckToken(app: FirebaseApp): Promise<string | null> {
  if (typeof window === "undefined" || !siteKey() || isNative()) return null;
  if (!appCheck) {
    appCheck = import("firebase/app-check")
      .then((mod) => ({
        mod,
        instance: mod.initializeAppCheck(app, {
          provider: new mod.ReCaptchaEnterpriseProvider(siteKey()),
          isTokenAutoRefreshEnabled: true,
        }),
      }))
      .catch(() => null);
  }
  try {
    const ready = await appCheck;
    if (!ready) return null;
    const result = await ready.mod.getToken(ready.instance, false);
    return result?.token || null;
  } catch {
    return null;
  }
}
