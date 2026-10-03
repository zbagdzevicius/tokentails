import type { ConsentState } from "./consent";
import {
  buildEvent,
  type AnalyticsEvent,
  type AppErrorLevel,
  type AppErrorProperties,
  type AppErrorSource,
} from "./events";
import {
  createSessionBudget,
  normaliseCode,
  storageBudgetStore,
  type SessionBudgetState,
  type SessionBudgetStore,
} from "@/shared-contracts/analytics-core";
import { scrubContext, scrubRoute, scrubStack, scrubText } from "./scrub";

export { normaliseCode };

/**
 * Crash telemetry (F9). Sends `app_error` through the normal consent-gated
 * `analytics.track`, never `posthog.captureException` (which would ship raw
 * messages, stacks and URLs).
 *
 * Caps: at most `maxPerSession` reports per browser tab session and one per
 * code, so a crash loop or a noisy listener cannot flood the project. The
 * counts live in sessionStorage so RELOAD does not reset them.
 */

export const APP_ERROR_MAX_PER_SESSION = 5;
export const APP_ERROR_SESSION_KEY = "tt-app-error-session";

/**
 * The current route as a Next page pattern (`/cats/[cat]`), never the real
 * path, so slugs and ids in the URL are not sent. Set by _app on every
 * render; until then reports carry no route.
 */
let errorRoute = "";

export function setErrorRoute(route: unknown): void {
  errorRoute = typeof route === "string" ? route : "";
}

export function getErrorRoute(): string {
  return errorRoute;
}

export interface AppErrorContext {
  source?: AppErrorSource;
  level?: AppErrorLevel;
  /** Extra flat fields: boundary name, mode, event name. Scrubbed. */
  [key: string]: unknown;
}

type SessionStore = SessionBudgetStore;
export type { SessionBudgetState };

export interface ErrorReporterOptions {
  track: (event: AnalyticsEvent) => void;
  getConsent: () => ConsentState;
  /** False when analytics has no key: nothing is counted or sent. */
  isEnabled?: () => boolean;
  maxPerSession?: number;
  getRoute?: () => string;
  getOrigin?: () => string | undefined;
  store?: SessionStore;
}

/** The budget in sessionStorage (shared core), in memory when storage is blocked. */
function sessionStorageStore(): SessionStore {
  return storageBudgetStore(APP_ERROR_SESSION_KEY, () =>
    typeof window === "undefined" ? null : window.sessionStorage,
  );
}

function describe(error: unknown): { name: string; message: string; stack: unknown } {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { name: "string", message: error, stack: null };
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return { name: "object", message: typeof message === "string" ? message : "", stack: null };
  }
  return { name: typeof error, message: "", stack: null };
}

export function buildAppErrorProperties(
  code: string,
  error: unknown,
  context: AppErrorContext = {},
  meta: { route?: string; origin?: string; sessionIndex?: number } = {},
): AppErrorProperties {
  const { source, level, ...rest } = context;
  const { name, message, stack } = describe(error);
  return {
    code: normaliseCode(code),
    source: source ?? "manual",
    level: level ?? "none",
    error_name: scrubText(name, 40) || "Error",
    message: scrubText(message),
    stack: scrubStack(stack, meta.origin),
    route: meta.route ? scrubRoute(meta.route) : "",
    session_index: meta.sessionIndex ?? 0,
    context: scrubContext(rest),
  };
}

export interface ErrorReporter {
  /** Returns true when an event was handed to analytics. */
  report(code: string, error: unknown, context?: AppErrorContext): boolean;
}

/**
 * The page's scheme and host. `location.origin` is the string "null" under
 * the Capacitor iOS scheme (`capacitor://localhost`), which would strip
 * every "null" out of a stack instead of the origin.
 */
export function pageOrigin(loc: Pick<Location, "protocol" | "host">): string | undefined {
  return loc.host ? `${loc.protocol}//${loc.host}` : undefined;
}

export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  const max = options.maxPerSession ?? APP_ERROR_MAX_PER_SESSION;
  const store = options.store ?? sessionStorageStore();
  const isEnabled = options.isEnabled ?? (() => true);
  const getRoute = options.getRoute ?? getErrorRoute;
  const getOrigin =
    options.getOrigin ??
    (() => (typeof window === "undefined" ? undefined : pageOrigin(window.location)));

  const budget = createSessionBudget(max, store);

  const report = (code: string, error: unknown, context?: AppErrorContext) => {
    try {
      // Nothing is counted before consent, so a later opt-in still gets
      // the full budget.
      if (!isEnabled() || options.getConsent() !== "granted") return false;
      const key = normaliseCode(code);
      const index = budget.take(key);
      if (!index) return false;
      options.track(
        buildEvent(
          "app_error",
          buildAppErrorProperties(key, error, context, {
            route: getRoute(),
            origin: getOrigin(),
            sessionIndex: index,
          }),
        ),
      );
      return true;
    } catch {
      // Telemetry must never become the next crash.
      return false;
    }
  };

  return { report };
}
