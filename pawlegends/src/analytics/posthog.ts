/**
 * Analytics (POC.md §13), consent-gated (pattern: bad-cat/src/platform/posthog.ts and analytics.ts). `track`
 * queues events in memory; events leave the device only when ALL of these hold: a project key is set
 * (VITE_PAWLEGENDS_POSTHOG_KEY) AND the player granted consent (the shared `tt-analytics-consent` key, the same one
 * tokentails.com writes, so a choice made on the site counts in the embed). A denial drops the queue. One fetch POST
 * of a batch to PostHog EU `/capture/`, no SDK, no cookies, `keepalive`.
 *
 * No personal data: events carry hero, difficulty, counts and lengths only, and an anonymous random id made after
 * consent. Every event carries `human` (analytics/human.ts) so gate metrics can filter bot and headless sessions.
 * Never throws.
 */

export type AnalyticsEvent =
  | 'title_view'
  | 'match_start'
  | 'match_end'
  | 'second_match'
  | 'rematch_click'
  | 'talent_pick'
  | 'tip_done'
  | 'dare_open'
  | 'store_open'
  | 'offer_shown'
  | 'offer_click'
  | 'checkout_start'
  | 'item_seen_in_match'
  | 'notify_signup'
  | 'quality_tier'
  | 'perf_sample';

export type AnalyticsProps = Record<string, string | number | boolean>;

export interface TrackedEvent {
  event: AnalyticsEvent;
  props: AnalyticsProps;
  at: number;
}

export const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/capture/';
export const POSTHOG_MAX_BODY = 56_000;
export const CONSENT_KEY = 'tt-analytics-consent';
export const ANON_KEY = 'tt.pawlegends.anon.v1';
export const BUFFER_MAX = 200;
export const FLUSH_DELAY_MS = 1500;
export const FLUSH_AT = 20;

export type ConsentState = 'granted' | 'denied' | 'unset';

type Fetch = (url: string, init: RequestInit) => Promise<unknown>;

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): KV | null {
  try {
    return (globalThis as { localStorage?: KV }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The shared consent choice. Blocked storage reads as 'unset' (nothing is sent). */
export function readConsent(kv: KV | null = store()): ConsentState {
  try {
    const v = kv?.getItem(CONSENT_KEY);
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'unset';
  } catch {
    return 'unset';
  }
}

/** Only these props pass (numbers, booleans, short strings); anything else is dropped. */
export function cleanProps(p: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!p) return out;
  for (const k of Object.keys(p)) {
    if (k.length > 40 || !/^[a-z0-9_]+$/.test(k)) continue;
    const v = p[k];
    if (typeof v === 'string') out[k] = v.slice(0, 64);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** The JSON bodies for a batch, each under POSTHOG_MAX_BODY. Pure. */
export function posthogBodies(key: string, distinctId: string, batch: readonly TrackedEvent[]): string[] {
  const head = `{"api_key":${JSON.stringify(key)},"batch":[`;
  const out: string[] = [];
  let cur: string[] = [];
  let size = head.length + 2;
  for (const e of batch) {
    const row = JSON.stringify({
      event: e.event,
      timestamp: new Date(e.at).toISOString(),
      properties: { ...e.props, distinct_id: distinctId, $lib: 'pawlegends', $process_person_profile: false },
    });
    if (row.length + head.length + 4 > POSTHOG_MAX_BODY) continue;
    if (cur.length && size + row.length + 1 > POSTHOG_MAX_BODY) {
      out.push(`${head}${cur.join(',')}]}`);
      cur = [];
      size = head.length + 2;
    }
    cur.push(row);
    size += row.length + 1;
  }
  if (cur.length) out.push(`${head}${cur.join(',')}]}`);
  return out;
}

export interface AnalyticsOptions {
  key?: string | null;
  fetch?: Fetch | null;
  kv?: KV | null;
  now?: () => number;
  /** Common props added to every event (`human`, `embed`, `session`). */
  common?: () => AnalyticsProps;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

export class Analytics {
  private queue: TrackedEvent[] = [];
  private consent: ConsentState;
  private timer: unknown = null;
  private readonly key: string | null;
  private readonly kv: KV | null;
  private readonly now: () => number;
  private readonly fetcher: Fetch | null;
  private readonly common: () => AnalyticsProps;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  /** Bodies posted (tests). */
  sent = 0;

  constructor(o: AnalyticsOptions = {}) {
    this.key = o.key && o.key.trim() ? o.key.trim() : null;
    this.kv = o.kv === undefined ? store() : o.kv;
    this.now = o.now ?? (() => Date.now());
    this.fetcher = o.fetch === undefined ? ((globalThis as { fetch?: Fetch }).fetch?.bind(globalThis) ?? null) : o.fetch;
    this.common = o.common ?? (() => ({}));
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.consent = readConsent(this.kv);
  }

  get consentState(): ConsentState {
    return this.consent;
  }

  /** A project key and a fetch exist (the settings row and consent prompt show only then). */
  get configured(): boolean {
    return !!this.key && !!this.fetcher;
  }

  /** Is anything ever sent from this page? (a key and consent). */
  get live(): boolean {
    return this.consent === 'granted' && !!this.key && !!this.fetcher;
  }

  /** Store the choice (shared with tokentails.com) and apply it. Denying drops the queue. */
  setConsent(granted: boolean): void {
    this.consent = granted ? 'granted' : 'denied';
    try {
      this.kv?.setItem(CONSENT_KEY, this.consent);
    } catch {
      /* blocked: applies to this page only */
    }
    if (granted) this.flush();
    else this.queue = [];
  }

  /** Re-read the shared key (the site banner may have changed it). */
  refreshConsent(): void {
    const c = readConsent(this.kv);
    if (c !== this.consent) {
      this.consent = c;
      if (c === 'granted') this.flush();
      if (c === 'denied') this.queue = [];
    }
  }

  track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
    try {
      if (this.consent === 'denied') return;
      this.queue.push({ event, props: { ...cleanProps(this.common()), ...cleanProps(props) }, at: this.now() });
      if (this.queue.length > BUFFER_MAX) this.queue.splice(0, this.queue.length - BUFFER_MAX);
      this.schedule();
    } catch {
      /* never throws */
    }
  }

  /** Queued, unsent events (tests and QA). */
  pending(): readonly TrackedEvent[] {
    return this.queue;
  }

  private schedule(): void {
    if (!this.live) return;
    if (this.queue.length >= FLUSH_AT) return this.flush();
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  flush(): void {
    if (!this.live || !this.key || !this.fetcher || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      for (const body of posthogBodies(this.key, this.anonId(), batch)) {
        this.sent++;
        void Promise.resolve(this.fetcher(POSTHOG_CAPTURE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit', mode: 'cors' })).catch(() => undefined);
      }
    } catch {
      /* dropped */
    }
  }

  private anon: string | null = null;
  /** A random anonymous id, made and kept only after consent. */
  private anonId(): string {
    if (this.anon) return this.anon;
    let id: string | null = null;
    try {
      id = this.kv?.getItem(ANON_KEY) ?? null;
    } catch {
      id = null;
    }
    if (!id || !/^[a-z0-9]{12,40}$/.test(id)) {
      const bytes = new Uint8Array(12);
      try {
        crypto.getRandomValues(bytes);
      } catch {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      try {
        this.kv?.setItem(ANON_KEY, id);
      } catch {
        /* this page only */
      }
    }
    this.anon = id;
    return id;
  }
}

/** The page's analytics (the key comes from the build env). */
export function createAnalytics(common: () => AnalyticsProps): Analytics {
  const key = (import.meta.env.VITE_PAWLEGENDS_POSTHOG_KEY as string | undefined) ?? null;
  return new Analytics({ key, common });
}
