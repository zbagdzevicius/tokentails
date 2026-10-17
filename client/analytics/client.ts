import type { AnalyticsEvent, AnalyticsSuperProperties } from "./events";
import { POSTHOG_EU_HOST } from "@/shared-contracts/analytics-core";

export { POSTHOG_EU_HOST };

/** The part of the PostHog client this module uses. */
export interface AnalyticsClient {
  capture(name: string, properties?: Record<string, unknown>): unknown;
  register(properties: Record<string, unknown>): unknown;
  /** Optional: only used to undo an opt-out left by the old consent card. */
  has_opted_out_capturing?(): boolean;
  opt_in_capturing?(options?: { captureEventName?: string | null | false }): void;
}

export interface AnalyticsOptions {
  /** PostHog project key. Empty or missing turns analytics into a no-op. */
  apiKey?: string;
  host?: string;
  /** Loads and initialises the client. Called at most once. */
  load: (apiKey: string, host: string) => Promise<AnalyticsClient>;
  superProperties: () => AnalyticsSuperProperties;
}

export interface Analytics {
  readonly enabled: boolean;
  /** Loads the client now (browser only). Safe to call more than once. */
  init(): void;
  /** Sent whenever a key is set. A no-op without a key. */
  track(event: AnalyticsEvent): void;
}

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const apiKey = options.apiKey?.trim() || "";
  const host = options.host || POSTHOG_EU_HOST;
  const enabled = apiKey.length > 0;

  let clientPromise: Promise<AnalyticsClient | null> | null = null;

  const getClient = (): Promise<AnalyticsClient | null> => {
    if (!clientPromise) {
      clientPromise = options
        .load(apiKey, host)
        .then((client) => {
          // Players who pressed "No thanks" on the old consent card may still
          // carry PostHog's own opt-out flag. Analytics now runs for everyone.
          try {
            if (client.has_opted_out_capturing?.()) {
              client.opt_in_capturing?.({ captureEventName: null });
            }
          } catch {
            // Never let this block analytics.
          }
          client.register({ ...options.superProperties() });
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

  const init = () => {
    if (!enabled) return;
    void getClient();
  };

  const track = (event: AnalyticsEvent) => {
    if (!enabled) return;
    void getClient().then((client) => {
      if (!client) return;
      client.capture(event.name, { ...event.properties });
    });
  };

  return { enabled, init, track };
}
