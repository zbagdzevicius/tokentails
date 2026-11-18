import { createAnalytics, type AnalyticsClient, type AnalyticsConsent } from "./client";
import { asksForConsent, pawlegendsWebOnly, readConsentChoice, type ConsentChoice } from "./gtm";
import { createErrorReporter, type AppErrorContext } from "./errors";
import { createGameRunTracker } from "./game-run";
import { getDeviceTier, getPlatform } from "./platform";

export * from "./events";
export { getPlatform, getDeviceTier } from "./platform";
export { accountDistinctId, createAnalytics, posthogHost, POSTHOG_US_HOST } from "./client";
export { createGameRunTracker } from "./game-run";
export {
  createErrorReporter,
  buildAppErrorProperties,
  APP_ERROR_MAX_PER_SESSION,
  setErrorRoute,
} from "./errors";
export type { AppErrorContext, ErrorReporter } from "./errors";
export { scrubText, scrubStack, scrubContext, scrubRoute } from "./scrub";
export type { GameRunTracker } from "./game-run";
export type { Analytics, AnalyticsClient, AnalyticsConsent, AnalyticsOptions } from "./client";

/**
 * posthog-js is imported lazily and only in the browser, so it never runs
 * during SSR or static export.
 */
const loadPostHog = async (
  apiKey: string,
  host: string,
): Promise<AnalyticsClient> => {
  if (typeof window === "undefined") {
    throw new Error("Analytics is browser only");
  }
  const { default: posthog } = await import("posthog-js");
  posthog.init(apiKey, {
    api_host: host,
    persistence: "localStorage",
    // a person profile only for a signed-in account (identify with the hashed uid, never an email)
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_performance: false,
    capture_exceptions: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    save_referrer: false,
    mask_personal_data_properties: true,
  });
  return posthog as unknown as AnalyticsClient;
};

/** This page's consent choice (the bar's Allow or No thanks), kept here too so it holds when storage is blocked. */
let pageChoice: ConsentChoice | null = null;

/**
 * PostHog follows the Paw Legends consent bar exactly like GTM (analytics/gtm.ts): never in a native WebView; a stored
 * or this-page choice wins; with none, the visitors the bar asks (European or unknown time zone) are held (nothing
 * leaves the device, posthog-js is not even loaded) and everyone else is granted.
 */
export function pawlegendsAnalyticsConsent(
  choice: ConsentChoice | null = pageChoice ?? readConsentChoice(),
  asks: () => boolean = asksForConsent,
  web: () => boolean = pawlegendsWebOnly,
): AnalyticsConsent {
  if (!web()) return "denied";
  if (choice) return choice;
  return asks() ? "held" : "granted";
}

export const analytics = createAnalytics({
  // the one Token Tails PostHog project (US Cloud): the same two names as client/ and the game build
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  consent: () => pawlegendsAnalyticsConsent(),
  load: loadPostHog,
  superProperties: () => ({
    app: "core",
    platform: getPlatform(),
    device_tier: getDeviceTier(),
  }),
});

/** Per-mode start / loaded / finish / fail / quit events for GameContext. */
export const gameRun = createGameRunTracker(analytics.track, getPlatform);

const errorReporter = createErrorReporter({
  track: analytics.track,
  isEnabled: () => analytics.enabled,
});

/**
 * Reports a crash as a scrubbed `app_error` (F9): at most 5
 * per session and one per code. Safe to call anywhere; it never throws.
 */
export function reportAppError(
  code: string,
  error: unknown,
  context?: AppErrorContext,
): boolean {
  return errorReporter.report(code, error, context);
}

/** The consent bar's choice: PostHog sends what waited (Allow) or drops it (No thanks). */
export function setAnalyticsConsent(choice: ConsentChoice): void {
  pageChoice = choice;
  analytics.consentChanged();
}
