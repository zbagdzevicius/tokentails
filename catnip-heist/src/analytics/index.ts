/**
 * Catnip Heist product analytics (plan F9): the Heist's mirror of `client/analytics`, from the same
 * catalog (`shared/analytics-core.ts`).
 *
 * - Sends only when the player accepted analytics on tokentails.com: the same-origin
 *   `tt-analytics-consent` key must read `granted` at the moment of each send. "Unset" sends nothing.
 * - Sends only the Heist's own events (`HEIST_SENDABLE_EVENTS`): `heist_open` (standalone loads; the
 *   `/heist` host page sends its own with `from`), `heist_run_complete`, and the G10 first-run
 *   funnel with `mode: 'heist'` (`HEIST_RUN_EVENTS`: brief shown, run start, route and rewind hints,
 *   detections, fail, finish, first clear). Crash reports go through `src/app/crash.ts`.
 * - No personal data: no user id, account, cat name or replay log. A random per-tab id is the only
 *   identifier, and person profiles are off.
 * - Never bundled into replay and verify builds: main.ts imports this module behind the same
 *   build-time flag as the crash fallback, so the import is dead code there.
 */
import {
  CONSENT_STORAGE_KEY,
  HEIST_APP_EVENTS,
  POSTHOG_EU_HOST,
  consentGrantedIn,
  isAnalyticsEventName,
  scrubContext,
  type AnalyticsEventName,
  type ScrubbedValue,
} from '../shared-contracts/analytics-core';

export { CONSENT_STORAGE_KEY };

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** The mode name every Heist run event carries (plan G10: one funnel per mode). */
export const HEIST_MODE = 'heist';

/** Shared by the run events (mirrors `FtueModeProperties` in client/analytics/events.ts). */
export interface HeistFtueProperties {
  mode: typeof HEIST_MODE;
  level: string;
}

/** Which first-run hint: the brief gate, the ghost-paw route, or the rewind offer. */
export interface HeistHintProperties extends HeistFtueProperties {
  hint: 'route' | 'rewind';
  /** What brought it up: 20 s without progress, two detections, the objective chip, a detection. */
  trigger: 'idle' | 'fails' | 'tap' | 'spotted';
}

/** `game_finish` / `game_fail` (mirrors `GameEndProperties`). */
export interface HeistGameEndProperties extends HeistFtueProperties {
  outcome: 'win' | 'fail';
  /** Sim time of the run in seconds (pauses and the brief excluded). */
  duration_s: number;
  score: number;
  /** Catnip coins picked up. */
  catnip: number;
  spotted: number;
  rewinds: number;
  stars?: number;
  /** Why an unwon run ended: retry, quit to menu, level select, leaving the page. */
  reason?: 'retry' | 'menu' | 'levels' | 'exit';
}

/** Properties of the events the Heist sends. Flat primitives only, scrubbed before sending. */
export interface HeistEventProperties {
  heist_open: { from: string };
  heist_run_complete: { level: string; outcome: 'win' | 'fail'; stars?: number };
  app_error: Record<string, ScrubbedValue>;
  ftue_gate_shown: HeistFtueProperties & { gate: 'brief' };
  game_start: HeistFtueProperties & { is_restart: boolean };
  ftue_hint_shown: HeistHintProperties;
  ftue_hint_done: HeistHintProperties;
  life_lost: HeistFtueProperties & { spotted: number; rewind_offered: boolean };
  game_fail: HeistGameEndProperties;
  game_finish: HeistGameEndProperties;
  /** First win of a level on this device or account; `elapsed_s` is since the page loaded. */
  ftue_first_clear: HeistFtueProperties & { duration_s: number; elapsed_s: number; spotted: number; rewinds: number; route_shown: boolean };
}

export type HeistEventName = keyof HeistEventProperties;

export interface HeistAnalyticsOptions {
  apiKey?: string;
  host?: string;
  /** localStorage: where the consent choice lives (same origin as the core app). */
  localStorage: StorageLike | null;
  /** sessionStorage: the per-tab anonymous id. */
  sessionStorage: StorageLike | null;
  /** Posts one JSON body; returns false when it could not be queued. */
  transport?: (url: string, body: string) => boolean;
  /** Registered on every event, e.g. `{ embed: true }`. */
  superProperties?: Record<string, ScrubbedValue>;
}

export interface HeistAnalytics {
  /** False when no PostHog key is built in (then nothing is ever sent). */
  readonly enabled: boolean;
  /** Returns true when the event was handed to the transport. */
  track<K extends HeistEventName>(name: K, properties: HeistEventProperties[K]): boolean;
  /** Sends `name` at most once per page view (dedupe for `heist_open`). */
  trackOnce<K extends HeistEventName>(name: K, properties: HeistEventProperties[K]): boolean;
}

const ANON_KEY = 'tt-heist-anon';

/** Anonymous per-tab id: never tied to the account, reset with the tab. */
export function sessionDistinctId(storage: StorageLike | null): string {
  try {
    const existing = storage?.getItem(ANON_KEY);
    if (existing) return existing;
    const id = `heist-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    storage?.setItem(ANON_KEY, id);
    return id;
  } catch {
    return 'heist-anon';
  }
}

/** PostHog's capture endpoint for `host`. */
export function captureUrl(host?: string): string {
  return `${(host?.trim() || POSTHOG_EU_HOST).replace(/\/+$/, '')}/i/v0/e/`;
}

/** The G10 run funnel the Heist sends itself (all in the F9 catalog's `runs` area). */
export const HEIST_RUN_EVENTS: readonly AnalyticsEventName[] = Object.freeze([
  'ftue_gate_shown',
  'game_start',
  'ftue_hint_shown',
  'ftue_hint_done',
  'life_lost',
  'game_fail',
  'game_finish',
  'ftue_first_clear',
] as AnalyticsEventName[]);

/**
 * Everything the Heist build may send: the shared contract's `HEIST_APP_EVENTS` plus the run
 * funnel. Filtered through the catalog, so a name that ever leaves the catalog stops being sent.
 */
export const HEIST_SENDABLE_EVENTS: readonly AnalyticsEventName[] = Object.freeze([...HEIST_APP_EVENTS, ...HEIST_RUN_EVENTS].filter((n) => isAnalyticsEventName(n)));

const isHeistEvent = (name: string): name is HeistEventName => HEIST_SENDABLE_EVENTS.indexOf(name as AnalyticsEventName) !== -1;

export function createHeistAnalytics(opts: HeistAnalyticsOptions): HeistAnalytics {
  const apiKey = opts.apiKey?.trim() ?? '';
  const url = captureUrl(opts.host);
  const enabled = apiKey.length > 0 && !!opts.transport;
  const sent = new Set<string>();

  const track = <K extends HeistEventName>(name: K, properties: HeistEventProperties[K]): boolean => {
    try {
      if (!enabled || !isHeistEvent(name)) return false;
      // Read the choice at send time: revoking consent on tokentails.com stops the next event.
      if (!consentGrantedIn(opts.localStorage)) return false;
      const body = JSON.stringify({
        api_key: apiKey,
        event: name,
        distinct_id: sessionDistinctId(opts.sessionStorage),
        properties: {
          ...scrubContext(properties),
          ...(opts.superProperties ? scrubContext(opts.superProperties) : {}),
          app: 'heist',
          $process_person_profile: false,
        },
      });
      return opts.transport!(url, body);
    } catch {
      // Analytics must never break the heist.
      return false;
    }
  };

  return {
    enabled,
    track,
    trackOnce(name, properties) {
      if (sent.has(name)) return false;
      const ok = track(name, properties);
      if (ok) sent.add(name);
      return ok;
    },
  };
}

/**
 * The browser transport: a beacon with a text/plain body (CORS-safelisted, no preflight; PostHog
 * parses the JSON either way), falling back to a keepalive fetch.
 */
export function beaconTransport(nav: Pick<Navigator, 'sendBeacon'> | null, fetcher?: typeof fetch): (url: string, body: string) => boolean {
  return (url, body) => {
    try {
      if (nav?.sendBeacon && nav.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return true;
    } catch {
      // Fall through to fetch.
    }
    if (!fetcher) return false;
    try {
      void fetcher(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  };
}
