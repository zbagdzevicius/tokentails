import { readConsent, writeConsent, type ConsentState } from "./consent";
import type { AnalyticsEvent, AnalyticsSuperProperties } from "./events";
import { POSTHOG_EU_HOST } from "@/shared-contracts/analytics-core";

export { POSTHOG_EU_HOST };

/** The part of the PostHog client this module uses. */
export interface AnalyticsClient {
  capture(name: string, properties?: Record<string, unknown>): unknown;
  register(properties: Record<string, unknown>): unknown;
  opt_in_capturing(options?: { captureEventName?: string | null | false }): void;
  opt_out_capturing(): void;
  has_opted_out_capturing(): boolean;
  reset(): void;
}

export interface AnalyticsOptions {
  /** PostHog project key. Empty or missing turns analytics into a no-op. */
  apiKey?: string;
  host?: string;
  /** Loads and initialises the client. Called at most once, after consent. */
  load: (apiKey: string, host: string) => Promise<AnalyticsClient>;
  superProperties: () => AnalyticsSuperProperties;
  readConsent?: () => ConsentState;
  writeConsent?: (state: Exclude<ConsentState, "unset">) => void;
}

export interface Analytics {
  readonly enabled: boolean;
  getConsent(): ConsentState;
  setConsent(state: Exclude<ConsentState, "unset">): Promise<void>;
  /** Dropped (not queued) unless consent is granted and a key is set. */
  track(event: AnalyticsEvent): void;
}

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const apiKey = options.apiKey?.trim() || "";
  const host = options.host || POSTHOG_EU_HOST;
  const read = options.readConsent ?? readConsent;
  const write = options.writeConsent ?? writeConsent;
  const enabled = apiKey.length > 0;

  let consent: ConsentState | null = null;
  let clientPromise: Promise<AnalyticsClient | null> | null = null;

  const getConsent = (): ConsentState => {
    if (consent === null) consent = read();
    return consent;
  };

  const getClient = (): Promise<AnalyticsClient | null> => {
    if (!clientPromise) {
      clientPromise = options
        .load(apiKey, host)
        .then((client) => {
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

  const setConsent = async (state: Exclude<ConsentState, "unset">) => {
    consent = state;
    write(state);
    if (!enabled) return;

    if (state === "granted") {
      const client = await getClient();
      if (client?.has_opted_out_capturing()) {
        client.opt_in_capturing({ captureEventName: null });
      }
      return;
    }

    // Revoked: only touch the client if it was already loaded this session.
    const client = clientPromise ? await clientPromise : null;
    if (client) {
      client.reset();
      client.opt_out_capturing();
    }
  };

  const track = (event: AnalyticsEvent) => {
    if (!enabled || getConsent() !== "granted") return;
    void getClient().then((client) => {
      // Consent may have been revoked while the client was loading.
      if (!client || getConsent() !== "granted") return;
      client.capture(event.name, { ...event.properties });
    });
  };

  return { enabled, getConsent, setConsent, track };
}
