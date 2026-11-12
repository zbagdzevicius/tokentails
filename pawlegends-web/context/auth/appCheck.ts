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

function ensureAppCheck(app: FirebaseApp) {
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
  return appCheck;
}

/** An App Check token, or null when App Check is not configured or fails. Never throws. */
export async function getAppCheckToken(app: FirebaseApp): Promise<string | null> {
  if (typeof window === "undefined" || !siteKey() || isNative()) return null;
  try {
    const ready = await ensureAppCheck(app);
    if (!ready) return null;
    const result = await ready.mod.getToken(ready.instance, false);
    return result?.token || null;
  } catch {
    return null;
  }
}

/**
 * A limited-use App Check token (bet #3, yourcat-v2.md section 3.1), for the paid AI routes
 * (`POST /yourcat`, `POST /image/portrait`, regenerate). The backend verifies it with replay
 * protection, so each token works once: fetch a new one per request. Null when App Check is not
 * configured (no `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`), on native builds, or on failure; the
 * caller then sends no header and gets the "unverified" caps. Never throws.
 */
export async function getLimitedUseAppCheckToken(app: FirebaseApp): Promise<string | null> {
  if (typeof window === "undefined" || !siteKey() || isNative()) return null;
  try {
    const ready = await ensureAppCheck(app);
    if (!ready) return null;
    const result = await ready.mod.getLimitedUseToken(ready.instance);
    return result?.token || null;
  } catch {
    return null;
  }
}
