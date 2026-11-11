/**
 * Paw Legends events in the GTM dataLayer (analytics/gtm.ts), next to PostHog: the host's own events
 * (analytics/pawlegends-events.ts, `pawlegends_*`) keep their names, and the game's events relayed over the bridge
 * (`match_start`, `match_end`, `checkout_start`, ...) get the `pawlegends_` prefix, so a GTM trigger reads
 * `pawlegends_match_start`. Only flat strings, numbers and booleans pass, and never a key that could hold personal data
 * (email, name, user or account id, token, phone, network address); the event catalogs carry none today, this keeps it
 * so.
 */
import { gtm } from "./gtm";

export const PAWLEGENDS_DATALAYER_PREFIX = "pawlegends_";
const PERSONAL_KEY = /email|password|token|phone|^(name|user_?id|uid|account_?id|ip|address)$/i;
const MAX_STRING = 64;

export interface ForwardableEvent {
  name: string;
  properties?: object;
}

/** The dataLayer entry for an event, or null when the name is not a plain token. */
export function pawlegendsDataLayerEntry(event: ForwardableEvent): Record<string, unknown> | null {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(event.name)) return null;
  const name = event.name.startsWith(PAWLEGENDS_DATALAYER_PREFIX) ? event.name : `${PAWLEGENDS_DATALAYER_PREFIX}${event.name}`;
  const entry: Record<string, unknown> = { event: name };
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (key === "event" || PERSONAL_KEY.test(key)) continue;
    if (typeof value === "number" ? Number.isFinite(value) : typeof value === "boolean") entry[key] = value;
    else if (typeof value === "string" && value.length <= MAX_STRING) entry[key] = value;
  }
  return entry;
}

/** Pushes the event to the dataLayer (a no-op where GTM does not run). Never throws. */
export function forwardPawlegendsEvent(event: ForwardableEvent, push: (data: Record<string, unknown>) => unknown = (d) => gtm.push(d)): void {
  try {
    const entry = pawlegendsDataLayerEntry(event);
    if (entry) push(entry);
  } catch {
    // Analytics never breaks the game.
  }
}
