/**
 * Analytics (POC.md §13), consent-gated (pattern: bad-cat/src/platform/posthog.ts and analytics.ts). `track`
 * queues events in memory; events leave the device only when ALL of these hold: a project key is set
 * (VITE_PAWLEGENDS_POSTHOG_KEY) AND the player granted consent (the `tt-analytics-consent` key; the game asks from the
 * second session, `askConsent`). Events queued before the answer go out when the player says yes. A denial drops the
 * queue. One fetch POST of a batch to PostHog EU `/capture/`, no SDK, no cookies, `keepalive`.
 *
 * Embedded on tokentails.com (launch finding PUB-02) the game has no PostHog of its own: every event is relayed over the
 * bridge (`analytics{event, props}`) and the host sends it with its own `analytics.track`, so it follows the site's
 * policy (analytics for everyone since the consent card was removed 2026-10-16) and the host's anonymous id. The game
 * shows no prompt there; the Settings stats row still turns it off (a stored 'denied' stops the relay). Events before
 * the host's first `hello` wait in the queue.
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
  // match moments (MATCH-MOMENTS.md): history, the replay viewer, the Legend Moment card
  | 'history_open'
  | 'replay_open'
  | 'replay_error'
  | 'replay_seek'
  | 'replay_again'
  | 'replay_death_jump'
  // live spectating (SPECTATE.md §6): opened (friend or featured), refused or lost, watched to the end
  | 'spectate_open'
  | 'spectate_error'
  | 'spectate_end'
  | 'share_card_open'
  | 'share_card'
  | 'clip_start'
  | 'clip_moment'
  | 'clip_made'
  | 'clip_share'
  | 'push_prompt'
  | 'push_optin'
  | 'push_prefs'
  | 'rematch_click'
  | 'mode_link'
  // the one play path (HOME-MODES.md §5): PLAY opened Mode Select (`from`), and a mode and variant went on
  | 'play_open'
  | 'play_start'
  | 'talent_pick'
  | 'tip_done'
  | 'dare_open'
  | 'store_open'
  | 'offer_shown'
  | 'offer_click'
  | 'checkout_start'
  /** STORE-PASS.md: a store or pass purchase arrived (`sku`), the Pass screen opened, a pass reward claimed. */
  | 'store_item_granted'
  | 'pass_open'
  | 'pass_claim'
  /** CHAMPION-STORE.md §12: a locked champion viewed, an unlock asked (`via` yarn or pick), a Practice match. */
  | 'champ_locked_view'
  | 'champ_unlock'
  | 'practice_try'
  /** Home's champion browser SELECT made `hero` the Home hero. */
  | 'home_hero_select'
  | 'item_seen_in_match'
  | 'notify_signup'
  | 'quality_tier'
  | 'perf_sample'
  /**
   * A crash (launch finding R1, app/crash.ts): `source` (window, rejection, worker, boot), `msg` (`crashCode`: lower-case
   * `[a-z0-9_ ]`, at most 80 characters), `screen`, `tier`, `sim`. Same name as the host's scrubbed `app_error`, so one
   * PostHog filter sees both; sent from here only when the game is not embedded (embedded, the host reports it).
   */
  | 'app_error'
  /** Party play (docs/plans/moba/MULTIPLAYER.md §10): never a party code or room id in any prop. */
  | MpEvent;

/**
 * Party play events (MULTIPLAYER.md §10, lane M8): the names are pinned by MP_EVENTS in src/app/mpTypes.ts (not here:
 * this file is first-load). Props are flat; no prop ever carries a party code, a room id, a member id or a name.
 */
export type MpEvent =
  | 'party_create'
  | 'party_join'
  | 'party_share'
  | 'party_leave'
  | 'party_kick'
  | 'party_start'
  | 'party_pick'
  | 'mp_match_start'
  | 'mp_net'
  | 'mp_disconnect'
  | 'mp_rejoin'
  | 'mp_takeover'
  | 'mp_reclaim'
  | 'mp_desync'
  | 'mp_referee_divergence'
  | 'mp_vote'
  | 'mp_social'
  | 'mp_match_end'
  | 'mp_rematch'
  // Quick Play co-op (docs/plans/moba/M1A-IMPL.md §7.1)
  | 'mm_join'
  | 'mm_cancel'
  | 'mm_found'
  | 'mm_backfill_offer'
  | 'mm_backfill_join'
  | 'mm_penalty'
  // casual PvP (docs/plans/moba/V16.md §5, §6)
  | 'mm_keep_waiting'
  | 'mp_void';
export const isMpEvent = (e: string): e is MpEvent => /^(mp|party|mm)_[a-z_]{2,24}$/.test(e);

/** A party event's props, scrubbed: id-like keys dropped, and any string that looks like a party code or a random id. */
export function cleanMpProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props))
    if (!/^(code|room|roomId|member|memberId|party|partyId|name|token|ticket)$/.test(k) && !(typeof v === 'string' && /^[2-9A-HJ-NP-Z]{6}$|^[\w-]{16,}$/.test(v))) out[k] = v;
  return out;
}

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

/**
 * Should the game show its own consent prompt now? Standalone only, with a key, no answer yet and from the second
 * session. Never embedded: there the events go to the host, which follows the site's policy (PUB-02). Pure.
 */
export function askConsent(o: { configured: boolean; consent: ConsentState; embedded: boolean; sessionNo: number }): boolean {
  return o.configured && o.consent === 'unset' && !o.embedded && o.sessionNo >= 2;
}

/**
 * Hands one event to the host (embedded, PUB-02): false while it cannot be posted yet (no `hello`), so it stays queued.
 * `app_error` is never relayed (crashes go as `client-error`, app/crash.ts).
 */
export type AnalyticsRelay = (event: AnalyticsEvent, props: AnalyticsProps) => boolean;

/** Longest string prop; `msg` (a crash code, app/crash.ts CRASH_CODE_MAX) may be 80. */
export const PROP_TEXT_MAX = 64;
const MSG_TEXT_MAX = 80;

/** Only these props pass (numbers, booleans, short strings); anything else is dropped. */
export function cleanProps(p: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!p) return out;
  for (const k of Object.keys(p)) {
    if (k.length > 40 || !/^[a-z0-9_]+$/.test(k)) continue;
    const v = p[k];
    if (typeof v === 'string') out[k] = v.slice(0, k === 'msg' ? MSG_TEXT_MAX : PROP_TEXT_MAX);
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
  /** Embedded: send through the host instead of PostHog (PUB-02). */
  relay?: AnalyticsRelay | null;
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
  private readonly relay: AnalyticsRelay | null;
  /** Bodies posted (tests). */
  sent = 0;

  constructor(o: AnalyticsOptions = {}) {
    this.key = o.key && o.key.trim() ? o.key.trim() : null;
    this.kv = o.kv === undefined ? store() : o.kv;
    this.now = o.now ?? (() => Date.now());
    this.fetcher = o.fetch === undefined ? ((globalThis as { fetch?: Fetch }).fetch?.bind(globalThis) ?? null) : o.fetch;
    this.common = o.common ?? (() => ({}));
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.relay = o.relay ?? null;
    this.consent = readConsent(this.kv);
  }

  get consentState(): ConsentState {
    return this.consent;
  }

  /** A project key and a fetch exist, or the host relays (the settings row and consent prompt show only then). */
  get configured(): boolean {
    return !!this.relay || (!!this.key && !!this.fetcher);
  }

  /** Embedded: events go to the host (PUB-02). */
  get relayed(): boolean {
    return !!this.relay;
  }

  /**
   * Is anything sent? Standalone: a key and consent. Embedded: unless the player turned stats off in Settings (the
   * host's own policy and key decide the rest).
   */
  get live(): boolean {
    if (this.relay) return this.consent !== 'denied';
    return this.consent === 'granted' && !!this.key && !!this.fetcher;
  }

  /** Store the choice and apply it (embedded, 'denied' stops the relay). Denying drops the queue. */
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
      const own = isMpEvent(event) ? cleanMpProps(props ?? {}) : props;
      this.queue.push({ event, props: { ...cleanProps(this.common()), ...cleanProps(own) }, at: this.now() });
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
    // a postMessage is cheap and a closed page loses the queue: relayed events go at once
    if (this.relay) return this.flush();
    if (this.queue.length >= FLUSH_AT) return this.flush();
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  flush(): void {
    if (this.relay) return this.flushRelay(this.relay);
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

  /** Embedded: post each queued event to the host; stop at the first one it cannot take yet (kept for the next flush). */
  private flushRelay(relay: AnalyticsRelay): void {
    if (!this.live) return;
    let i = 0;
    try {
      for (; i < this.queue.length; i++) {
        const e = this.queue[i]!;
        if (e.event === 'app_error') continue;
        if (!relay(e.event, e.props)) break;
        this.sent++;
      }
    } catch {
      /* a throwing relay drops nothing further */
    }
    this.queue = this.queue.slice(i);
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

/** The page's analytics (the key comes from the build env; embedded, `relay` sends through the host instead). */
export function createAnalytics(common: () => AnalyticsProps, relay?: AnalyticsRelay | null): Analytics {
  const key = (import.meta.env.VITE_PAWLEGENDS_POSTHOG_KEY as string | undefined) ?? null;
  return new Analytics({ key, common, relay: relay ?? null });
}
