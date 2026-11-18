import type { AnalyticsEvent, AnalyticsSuperProperties } from "./events";

/**
 * PostHog US Cloud ingestion: the one Token Tails project (client/, pawlegends-web and the Paw Legends game share its
 * public, ingest-only token). `NEXT_PUBLIC_POSTHOG_HOST` may name another https host.
 */
export const POSTHOG_US_HOST = "https://us.i.posthog.com";

/** An https host without a trailing slash; anything else (empty, http, junk) is POSTHOG_US_HOST. Pure. */
export function posthogHost(host?: string | null): string {
  try {
    const u = new URL((host ?? "").trim());
    if (u.protocol === "https:" && u.hostname) return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    // not a URL
  }
  return POSTHOG_US_HOST;
}

/** The part of the PostHog client this module uses. */
export interface AnalyticsClient {
  capture(name: string, properties?: Record<string, unknown>): unknown;
  register(properties: Record<string, unknown>): unknown;
  identify?(distinctId: string): unknown;
  reset?(): unknown;
  get_distinct_id?(): string;
  /** Optional: only used to undo an opt-out left by the old consent card. */
  has_opted_out_capturing?(): boolean;
  opt_in_capturing?(options?: { captureEventName?: string | null | false }): void;
}

/**
 * Where the visitor stands on analytics (the Paw Legends consent bar, analytics/gtm.ts): `granted` sends, `held` keeps
 * events in memory (the bar asks and has no answer yet: nothing leaves the device, the client is not even loaded),
 * `denied` drops them.
 */
export type AnalyticsConsent = "granted" | "held" | "denied";

/** Most events kept in memory while consent is held; older ones are dropped. */
export const HELD_EVENT_LIMIT = 50;

export interface AnalyticsOptions {
  /** PostHog project token (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`). Empty or missing turns analytics into a no-op. */
  apiKey?: string;
  /** `NEXT_PUBLIC_POSTHOG_HOST`; empty or invalid is POSTHOG_US_HOST. */
  host?: string;
  /** Loads and initialises the client. Called at most once, and only once consent is granted. */
  load: (apiKey: string, host: string) => Promise<AnalyticsClient>;
  superProperties: () => AnalyticsSuperProperties;
  /** The consent state, read at every call. Default: always granted (tests, pages without a bar). */
  consent?: () => AnalyticsConsent;
  /** SHA-256 hex of a string (the browser's crypto.subtle by default). */
  hash?: (text: string) => Promise<string>;
}

export interface Analytics {
  readonly enabled: boolean;
  /** The PostHog host events go to. */
  readonly host: string;
  /** Loads the client now if consent allows (browser only). Safe to call more than once. */
  init(): void;
  /** Sent once consent allows; held in memory before; dropped after a denial. A no-op without a key. */
  track(event: AnalyticsEvent): void;
  /**
   * A signed-in account: links this browser's anonymous id to `pl_<sha256 first 32 hex>` of the uid (never an email or
   * the raw uid). Applied once consent allows.
   */
  identify(uid: string): void;
  /** Sign-out: a fresh anonymous id, so the next player on this browser is not merged into the last account. */
  reset(): void;
  /** The consent changed (the bar's Allow or No thanks): send what waited, or drop it. */
  consentChanged(): void;
  /** The anonymous (or identified) id events carry, once the client runs; null before consent. */
  distinctId(): string | null;
}

/** The stable, non-personal analytics id of an account uid. */
export async function accountDistinctId(uid: string, hash: (text: string) => Promise<string> = sha256Hex): Promise<string> {
  return `pl_${(await hash(`pawlegends:${uid}`)).slice(0, 32)}`;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const apiKey = options.apiKey?.trim() || "";
  const host = posthogHost(options.host);
  const enabled = apiKey.length > 0;
  const consent = options.consent ?? (() => "granted" as const);
  const hash = options.hash ?? sha256Hex;

  let clientPromise: Promise<AnalyticsClient | null> | null = null;
  let loaded: AnalyticsClient | null = null;
  let held: AnalyticsEvent[] = [];
  /** The account to identify once the client runs (set by `identify`, cleared by `reset`). */
  let pendingUid: string | null = null;
  let identifiedUid: string | null = null;

  const state = (): AnalyticsConsent => {
    try {
      return consent();
    } catch {
      return "held";
    }
  };

  const applyIdentity = (client: AnalyticsClient) => {
    const uid = pendingUid;
    if (!uid || uid === identifiedUid) return;
    identifiedUid = uid;
    void accountDistinctId(uid, hash)
      .then((id) => {
        if (pendingUid === uid) client.identify?.(id);
      })
      .catch(() => {
        identifiedUid = null;
      });
  };

  const getClient = (): Promise<AnalyticsClient | null> => {
    if (!clientPromise) {
      clientPromise = options
        .load(apiKey, host)
        .then((client) => {
          // Players who pressed "No thanks" on the old consent card may still
          // carry PostHog's own opt-out flag. Consent is now the bar's (analytics/gtm.ts).
          try {
            if (client.has_opted_out_capturing?.()) {
              client.opt_in_capturing?.({ captureEventName: null });
            }
          } catch {
            // Never let this block analytics.
          }
          client.register({ ...options.superProperties() });
          loaded = client;
          applyIdentity(client);
          return client;
        })
        .catch((error) => {
          console.warn("Analytics failed to load", error);
          clientPromise = null;
          return null;
        });
    }
    return clientPromise;
  };

  const send = (event: AnalyticsEvent) => {
    void getClient().then((client) => {
      if (!client) return;
      client.capture(event.name, { ...event.properties });
    });
  };

  const consentChanged = () => {
    if (!enabled) return;
    const now = state();
    if (now === "denied") {
      held = [];
      return;
    }
    if (now !== "granted") return;
    void getClient();
    const queued = held;
    held = [];
    for (const event of queued) send(event);
  };

  const track = (event: AnalyticsEvent) => {
    if (!enabled) return;
    const now = state();
    if (now === "denied") return;
    if (now === "held") {
      held = [...held, event].slice(-HELD_EVENT_LIMIT);
      return;
    }
    send(event);
  };

  const identify = (uid: string) => {
    if (!enabled || !uid) return;
    pendingUid = uid;
    if (loaded) applyIdentity(loaded);
  };

  const reset = () => {
    if (!enabled) return;
    const wasIdentified = pendingUid !== null || identifiedUid !== null;
    pendingUid = null;
    identifiedUid = null;
    if (wasIdentified && loaded) loaded.reset?.();
  };

  const distinctId = () => {
    try {
      return loaded?.get_distinct_id?.() ?? null;
    } catch {
      return null;
    }
  };

  return { enabled, host, init: consentChanged, track, identify, reset, consentChanged, distinctId };
}
