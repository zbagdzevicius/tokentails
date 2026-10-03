import { createAnalytics, type AnalyticsClient } from "./client";
import { createErrorReporter, type AppErrorContext } from "./errors";
import { createGameRunTracker } from "./game-run";
import { getDeviceTier, getPlatform } from "./platform";

export * from "./events";
export * from "./consent";
export { getPlatform, getDeviceTier } from "./platform";
export { createAnalytics, POSTHOG_EU_HOST } from "./client";
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
export type { Analytics, AnalyticsClient, AnalyticsOptions } from "./client";

/**
 * posthog-js is imported only after the player accepts analytics, and only in
 * the browser, so it never runs during SSR or static export.
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
    person_profiles: "never",
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

export const analytics = createAnalytics({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
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
  getConsent: analytics.getConsent,
  isEnabled: () => analytics.enabled,
});

/**
 * Reports a crash as a scrubbed `app_error` (F9): consent-gated, at most 5
 * per session and one per code. Safe to call anywhere; it never throws.
 */
export function reportAppError(
  code: string,
  error: unknown,
  context?: AppErrorContext,
): boolean {
  return errorReporter.report(code, error, context);
}
