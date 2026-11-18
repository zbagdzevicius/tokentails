import { createAnalytics, type AnalyticsClient } from "./client";
import { createErrorReporter, type AppErrorContext } from "./errors";
import { createGameRunTracker } from "./game-run";
import { getDeviceTier, getPlatform } from "./platform";

export * from "./events";
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
 * Custom product events use the singleton initialized by instrumentation-client.ts.
 * The dynamic browser-only import preserves SSR/static-export safety without creating
 * a competing PostHog client or changing its default capture settings.
 */
const loadPostHog = async (): Promise<AnalyticsClient> => {
  if (typeof window === "undefined") {
    throw new Error("Analytics is browser only");
  }
  const { default: posthog } = await import("posthog-js");
  return posthog as unknown as AnalyticsClient;
};

export const analytics = createAnalytics({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
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
