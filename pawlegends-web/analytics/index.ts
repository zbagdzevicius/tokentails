import { accountDistinctId, createAnalytics, type AnalyticsClient, type AnalyticsConsent } from "./client";
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

/** This page's consent choice (the bar's Allow or No thanks), kept here too so it holds when storage is blocked. */
let pageChoice: ConsentChoice | null = null;

/**
 * Session replay, heatmaps and surveys run only for a visitor who pressed Allow (a stored or this-page `granted`), in a
 * web browser: never on the default "granted" of a visitor the bar does not ask, never in a native WebView.
 */
export function richAnalyticsAllowed(choice: ConsentChoice | null = pageChoice ?? readConsentChoice(), web: () => boolean = pawlegendsWebOnly): boolean {
  return choice === "granted" && web();
}

/** URL props whose query and hash are dropped before an event leaves (party codes, dare seeds, email links). */
const URL_PROPS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$pathname"] as const;

/** `https://pawlegends.app/play?party=ABC#x` → `https://pawlegends.app/play`. Pure. */
export function stripUrlQuery(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const cut = value.search(/[?#]/);
  return cut < 0 ? value : value.slice(0, cut);
}

type CaptureLike = { event?: string; properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | null;

/**
 * posthog-js `before_send`: no query strings or hashes in URL props, and no GeoIP lookup (`$geoip_disable`,
 * docs/plans/moba/POSTHOG-PRIVACY.md rule 3). Replay snapshots pass through untouched. Pure apart from `cr`.
 */
export function scrubCapture<T extends CaptureLike>(cr: T): T {
  if (!cr || cr.event === "$snapshot") return cr;
  if (cr.properties && typeof cr.properties === "object") cr.properties.$geoip_disable = true;
  for (const bag of [cr.properties, cr.$set, cr.$set_once, cr.properties?.$set as Record<string, unknown> | undefined, cr.properties?.$set_once as Record<string, unknown> | undefined]) {
    if (!bag || typeof bag !== "object") continue;
    for (const k of URL_PROPS) if (k in bag) bag[k] = stripUrlQuery(bag[k]);
  }
  return cr;
}

/**
 * Session replay settings (pawlegends.app pages): every input masked, the game frame, canvases and videos blocked (the
 * game's own menus and the WebGL scene are never recorded: they would cost frames and show nothing useful as DOM),
 * `.ph-no-capture` / `[data-ph-mask]` for anything personal on a page (the account page's email), no console logs, no
 * network bodies or headers, no canvas capture.
 */
export const SESSION_RECORDING = Object.freeze({
  maskAllInputs: true,
  maskTextSelector: "[data-ph-mask]",
  blockClass: "ph-no-capture",
  blockSelector: "iframe, canvas, video, [data-ph-block]",
  recordCrossOriginIframes: false,
  recordHeaders: false,
  recordBody: false,
});

/**
 * posthog-js is imported lazily and only in the browser, so it never runs during SSR or static export, and only once
 * consent allows (analytics/client.ts). Replay, heatmaps and surveys: their posthog-js extensions are bundled (our own
 * origin, no external script host) and loaded only for a visitor who pressed Allow (`richAnalyticsAllowed`); replay
 * then starts when the PostHog project has recordings on (its remote config, fetched from the project's assets host).
 */
const loadPostHog = async (apiKey: string, host: string): Promise<AnalyticsClient> => {
  if (typeof window === "undefined") {
    throw new Error("Analytics is browser only");
  }
  const rich = richAnalyticsAllowed();
  const [{ default: posthog }] = await Promise.all([
    import("posthog-js"),
    ...(rich ? [import("posthog-js/dist/posthog-recorder"), import("posthog-js/dist/surveys")] : []),
  ]);
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
    capture_heatmaps: rich,
    rageclick: false,
    disable_session_recording: !rich,
    session_recording: { ...SESSION_RECORDING },
    enable_recording_console_log: false,
    disable_surveys: !rich,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    // the remote config (replay on or off, survey list) loads; feature flags stay off
    advanced_disable_flags: false,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    save_referrer: false,
    mask_personal_data_properties: true,
    before_send: (cr) => scrubCapture(cr),
  });
  return posthog as unknown as AnalyticsClient;
};

/** Allow pressed after posthog-js loaded without replay (a visitor the bar did not ask, on the privacy page). */
async function startRichAnalytics(): Promise<void> {
  if (typeof window === "undefined" || !analytics.enabled || !richAnalyticsAllowed()) return;
  try {
    const [{ default: posthog }] = await Promise.all([import("posthog-js"), import("posthog-js/dist/posthog-recorder"), import("posthog-js/dist/surveys")]);
    if (!posthog.__loaded) return;
    posthog.set_config({ disable_session_recording: false, capture_heatmaps: true, disable_surveys: false });
  } catch {
    // replay is a nice-to-have: never let it break the page
  }
}

/**
 * No thanks after Allow: replay, heatmaps and surveys stop at once; analytics/client.ts already sends nothing more
 * (the client stays loaded, so a later Allow resumes without a reload).
 */
async function stopRichAnalytics(): Promise<void> {
  if (typeof window === "undefined" || !analytics.enabled) return;
  try {
    const { default: posthog } = await import("posthog-js");
    if (!posthog.__loaded) return;
    posthog.stopSessionRecording();
    posthog.set_config({ disable_session_recording: true, capture_heatmaps: false, disable_surveys: true });
  } catch {
    // nothing to stop
  }
}

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

/**
 * The consent bar's choice: PostHog sends what waited (Allow) or drops it (No thanks). Allow also starts replay,
 * heatmaps and surveys; No thanks (a withdrawal from the privacy page) stops them. A signed-in account's choice also
 * goes to the server (`syncServerConsent`).
 */
export function setAnalyticsConsent(choice: ConsentChoice): void {
  const before = pageChoice ?? readConsentChoice();
  pageChoice = choice;
  analytics.consentChanged();
  if (choice === "granted" && before !== "granted") void startRichAnalytics();
  if (choice === "denied") void stopRichAnalytics();
  if (accountUid) void syncServerConsent(accountUid);
}

/** The signed-in account (FirebaseAuthContext), for the server sync; null for a guest or nobody. */
let accountUid: string | null = null;
/** `localStorage`: the last choice the server took (`pl_…:granted|denied`), so it is sent once per account and answer. */
export const SERVER_CONSENT_KEY = "pawlegends.analytics-consent-sync.v1";

/**
 * The server's own events (match results, Yarn, purchases: backend pawlegends/analytics) follow the visitor's explicit
 * choice on the bar: a signed-in account's `granted` or `denied` goes to `POST /pawlegends/analytics/consent` once per
 * account and answer (a default "granted" outside Europe is not a choice and is never sent). Never throws.
 */
export async function syncServerConsent(uid: string, choice: ConsentChoice | null = pageChoice ?? readConsentChoice()): Promise<void> {
  if (typeof window === "undefined" || !choice || !pawlegendsWebOnly()) return;
  try {
    const id = await accountDistinctId(uid);
    const mark = `${id}:${choice}`;
    if (window.localStorage.getItem(SERVER_CONSENT_KEY) === mark) return;
    const { USER_API } = await import("@/api/user-api");
    if (await USER_API.analyticsConsent(choice === "granted", id)) window.localStorage.setItem(SERVER_CONSENT_KEY, mark);
  } catch {
    // blocked storage or no network: the next sign-in or choice tries again
  }
}

/** FirebaseAuthContext: the signed-in account (identify) or none (sign-out, a guest). */
export function setAnalyticsAccount(uid: string | null): void {
  accountUid = uid;
  if (uid) {
    analytics.identify(uid);
    void syncServerConsent(uid);
  }
}
