/**
 * Analytics (POC.md §13), consent-gated (pattern: bad-cat/src/platform/posthog.ts and analytics.ts). `track`
 * queues events; events leave the device only when ALL of these hold: a project key is set
 * (NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, the one Token Tails PostHog project, US Cloud; the host from
 * NEXT_PUBLIC_POSTHOG_HOST, default POSTHOG_US_HOST) AND the player granted consent (the `tt-analytics-consent` key; the
 * game asks in the first session once the first match is over, or from the second session, `askConsent`) AND, in the
 * iOS/Android/Mac app, the native binary declares analytics in its store privacy labels (`gate`, APP_ANALYTICS_MIN_NATIVE).
 * Events queued before the answer are kept in sessionStorage (at most PENDING_MAX, this tab only) and go out when the
 * player says yes; a denial drops them, the anonymous id and the account link. One fetch POST of a batch to
 * `${host}/capture/`, no SDK, no cookies, `keepalive`.
 *
 * Identity (person profiles for identified players only): anonymous events carry `$process_person_profile: false`;
 * `identify(pl_<hash>)` (a signed-in account, the host's `session.aid`) sends one `$identify` that links the anonymous
 * id to the account code, and later events carry it; `reset()` (sign-out) starts a new anonymous id.
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
  // gaps5 polish 1: a lazy chunk failed once and was retried (app/chunkRetry.ts)
  | 'chunk_retry'
  | 'match_start'
  | 'match_end'
  | 'second_match'
  // match moments (MATCH-MOMENTS.md): history, the replay viewer, the Legend Moment card
  | 'history_open'
  // MATCH-HISTORY.md: a match opened (friend, local), a filter chip, the privacy choice
  | 'history_match'
  | 'history_filter'
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
  // HIGHLIGHTS.md: the scan (ms, count, ok), a highlight opened (type, from results|viewer), clipped, the montage,
  // Highlights only toggled
  | 'hl_scan'
  | 'hl_open'
  | 'hl_clip'
  | 'hl_montage'
  | 'hl_only'
  | 'push_prompt'
  | 'push_optin'
  | 'push_prefs'
  | 'rematch_click'
  | 'mode_link'
  // the one play path (HOME-MODES.md §5): PLAY opened Mode Select (`from`), and a mode and variant went on
  | 'play_open'
  | 'play_start'
  | 'mode_unlock'
  | 'mode_locked_tap'
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
  /** The in-match chat drawer opened (once a match; `party`: a party match, else the bot chatter). */
  | 'chat_open'
  /** A Settings choice changed: `setting` (sound, quality, tips, skin_fx, fps, saver, stats, flag) and its `value`. */
  | 'settings_change'
  /** The leaderboards opened in one tap (`source`: home, the chip under the promo). */
  | 'leaderboard_open'
  /**
   * What's New (meta/showcase.ts, founder Nov 19): the comic pages opened (`pages`, `first`, `first_type`), a page shown
   * (`id`, `type`, `page`), its button (`id`, `type`, `target`), closed without it (`how`: close, esc, outside, done).
   * Item ids and types only, never a player field.
   */
  | 'showcase_open'
  | 'showcase_page'
  | 'showcase_cta'
  | 'showcase_dismiss'
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
  event: AnalyticsEvent | '$identify';
  props: AnalyticsProps;
  at: number;
  /** The account code (`pl_…`) the event belongs to; absent: the anonymous id. */
  who?: string;
}

/** PostHog US Cloud ingestion (the Token Tails project); NEXT_PUBLIC_POSTHOG_HOST may name another https host. */
export const POSTHOG_US_HOST = 'https://us.i.posthog.com';

/** `${host}/capture/` for an https PostHog host; anything else (empty, http, junk) is the US host. Pure. */
export function posthogCaptureUrl(host?: string | null): string {
  let base = POSTHOG_US_HOST;
  try {
    const u = new URL((host ?? '').trim());
    if (u.protocol === 'https:' && u.hostname) base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    /* not a URL: the US host */
  }
  return `${base}/capture/`;
}

/** The capture URL of the default (US) host. */
export const POSTHOG_CAPTURE_URL = posthogCaptureUrl(POSTHOG_US_HOST);
export const POSTHOG_MAX_BODY = 56_000;
export const CONSENT_KEY = 'tt-analytics-consent';
export const ANON_KEY = 'tt.pawlegends.anon.v1';
export const BUFFER_MAX = 200;
export const FLUSH_DELAY_MS = 1500;
export const FLUSH_AT = 20;
/** sessionStorage: the events kept before the player answered (this tab only), at most PENDING_MAX. */
export const PENDING_KEY = 'tt.pawlegends.pending.v1';
export const PENDING_MAX = 100;
/** The account code the anonymous id was last linked to (`$identify` sent), kept only after consent. */
export const AID_KEY = 'tt.pawlegends.aid.v1';
/** A signed-in account's analytics code: `pl_` + 32 hex of SHA-256 (pawlegends-web analytics/client.ts accountDistinctId). */
export const ACCOUNT_ID_RE = /^pl_[0-9a-f]{32}$/;
/**
 * The first native app version whose store privacy labels and PrivacyInfo.xcprivacy declare analytics
 * (APP-STORE-ANSWERS.md, PLAY-STORE.md). An older binary taking this bundle over the air sends nothing (the project's
 * rule: analytics in the app arrives with a native release, never by OTA alone).
 */
export const APP_ANALYTICS_MIN_NATIVE = '1.2.0';

export type ConsentState = 'granted' | 'denied' | 'unset';

type Fetch = (url: string, init: RequestInit) => Promise<unknown>;

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(name: 'localStorage' | 'sessionStorage' = 'localStorage'): KV | null {
  try {
    return (globalThis as unknown as Record<string, KV | undefined>)[name] ?? null;
  } catch {
    return null;
  }
}

function put(kv: KV | null, k: string, v: string): void {
  try {
    kv?.setItem(k, v);
  } catch {
    /* blocked or full: this page only */
  }
}

function get(kv: KV | null, k: string): string | null {
  try {
    return kv?.getItem(k) ?? null;
  } catch {
    return null;
  }
}

/** `a >= b` for dotted versions (`1.10.0` > `1.9.2`); junk is never at least anything. Pure. */
export function versionAtLeast(a: string | null | undefined, b: string): boolean {
  const pa = /^\d+(\.\d+)*$/.test(a ?? '') ? a!.split('.').map(Number) : null;
  if (!pa) return false;
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

/**
 * May this page send at all? The web: yes. The native app: only a binary at APP_ANALYTICS_MIN_NATIVE or later; null
 * while the shell has not published its version yet (events wait, nothing is asked). Pure.
 */
export function appGate(platform: string | null, native: string | null | undefined): boolean | null {
  if (!platform) return true;
  if (!native) return null;
  return versionAtLeast(native, APP_ANALYTICS_MIN_NATIVE);
}

/**
 * The PostHog system props of this page (never personal): the platform, and in the app the OS, the native version and
 * build, and the OTA bundle. Pure.
 */
export function systemProps(platform: string | null, app: { native?: string; nativeBuild?: string; ota?: string } | null, build?: string): Record<string, string> {
  const s = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 40) : null);
  const out: Record<string, string> = { platform: platform ?? 'web' };
  const os = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : platform === 'mac' ? 'Mac OS X' : null;
  if (os) out.$os = os;
  if (platform === 'ios' || platform === 'android') out.$device_type = 'Mobile';
  const v = s(app?.native);
  const b = s(app?.nativeBuild);
  const o = s(app?.ota);
  const l = s(build);
  if (v) out.$app_version = v;
  if (b) out.$app_build = b;
  if (o) out.ota_bundle = o;
  if (l) out.$lib_version = l;
  return out;
}

/** The shared consent choice. Blocked storage reads as 'unset' (nothing is sent). */
export function readConsent(kv: KV | null = store()): ConsentState {
  const v = get(kv, CONSENT_KEY);
  return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'unset';
}

/**
 * Should the game show its own consent prompt now? Not framed (there the events go to the host, which follows the
 * site's consent bar, PUB-02), with a key, no answer yet, and never before the first match is over: the guided first
 * match is never interrupted, so the card comes on Home after it (first session), or on any Home from the second
 * session. The native app asks here too (its in-page host has no bar). Pure.
 */
export function askConsent(o: { configured: boolean; consent: ConsentState; embedded: boolean; sessionNo: number; matches?: number }): boolean {
  return o.configured && o.consent === 'unset' && !o.embedded && (o.sessionNo >= 2 || (o.matches ?? 0) >= 1);
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

/**
 * The JSON bodies for a batch, each under POSTHOG_MAX_BODY. `distinctId` is the anonymous id; an event with `who` goes
 * under that account code with a person profile, and `$identify` links the anonymous id to it. Pure.
 */
export function posthogBodies(key: string, distinctId: string, batch: readonly TrackedEvent[], system: Record<string, string> = {}): string[] {
  const head = `{"api_key":${JSON.stringify(key)},"batch":[`;
  const out: string[] = [];
  let cur: string[] = [];
  let size = head.length + 2;
  for (const e of batch) {
    const who = e.who && ACCOUNT_ID_RE.test(e.who) ? e.who : null;
    const row = JSON.stringify({
      event: e.event,
      timestamp: new Date(e.at).toISOString(),
      properties: {
        ...system,
        ...e.props,
        distinct_id: who ?? distinctId,
        ...(e.event === '$identify' ? { $anon_distinct_id: distinctId } : {}),
        $lib: 'pawlegends',
        $process_person_profile: !!who,
        // no location from the network address (docs/plans/moba/POSTHOG-PRIVACY.md rule 3)
        $geoip_disable: true,
      },
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
  /** PostHog host (`NEXT_PUBLIC_POSTHOG_HOST`); empty or invalid = POSTHOG_US_HOST. */
  host?: string | null;
  fetch?: Fetch | null;
  kv?: KV | null;
  now?: () => number;
  /** Common props added to every event (`human`, `embed`, `session`). */
  common?: () => AnalyticsProps;
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Embedded: send through the host instead of PostHog (PUB-02). */
  relay?: AnalyticsRelay | null;
  /** Where events wait for the answer (sessionStorage by default). */
  session?: KV | null;
  /** PostHog system props on every event (`systemProps`). */
  system?: () => Record<string, string>;
  /** `appGate`: false = this page never sends (an app binary without analytics labels), null = not known yet. */
  gate?: () => boolean | null;
}

export class Analytics {
  private queue: TrackedEvent[] = [];
  private consent: ConsentState;
  private timer: unknown = null;
  private readonly key: string | null;
  /** Where batches are posted (`${host}/capture/`). */
  readonly captureUrl: string;
  private readonly kv: KV | null;
  private readonly now: () => number;
  private readonly fetcher: Fetch | null;
  private readonly common: () => AnalyticsProps;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly relay: AnalyticsRelay | null;
  private readonly session: KV | null;
  private readonly system: () => Record<string, string>;
  private readonly gate: () => boolean | null;
  /** The signed-in account's code (`pl_…`), or null (anonymous). */
  private aid: string | null = null;
  /** Bodies posted (tests). */
  sent = 0;

  constructor(o: AnalyticsOptions = {}) {
    this.key = o.key && o.key.trim() ? o.key.trim() : null;
    this.captureUrl = posthogCaptureUrl(o.host);
    this.kv = o.kv === undefined ? store() : o.kv;
    this.now = o.now ?? (() => Date.now());
    this.fetcher = o.fetch === undefined ? ((globalThis as { fetch?: Fetch }).fetch?.bind(globalThis) ?? null) : o.fetch;
    this.common = o.common ?? (() => ({}));
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.relay = o.relay ?? null;
    this.session = o.session === undefined ? store('sessionStorage') : o.session;
    this.system = o.system ?? (() => ({}));
    this.gate = o.gate ?? (() => true);
    this.consent = readConsent(this.kv);
    if (this.relay) return;
    // what waited in this tab before a reload (first session: the landing, the first match)
    if (this.consent === 'denied') this.clearPending();
    else this.queue = this.readPending();
    if (this.consent === 'granted') {
      const aid = get(this.kv, AID_KEY)?.split(':')[0];
      if (aid && ACCOUNT_ID_RE.test(aid)) this.aid = aid;
      this.schedule();
    }
  }

  get consentState(): ConsentState {
    return this.consent;
  }

  /** The gate, never throwing (a throw counts as not known yet). */
  private gateNow(): boolean | null {
    try {
      return this.gate();
    } catch {
      return null;
    }
  }

  /**
   * A project key and a fetch exist (and, in the app, the binary declares analytics), or the host relays: the settings
   * row and the consent prompt show only then.
   */
  get configured(): boolean {
    return !!this.relay || (!!this.key && !!this.fetcher && this.gateNow() === true);
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
    return this.consent === 'granted' && !!this.key && !!this.fetcher && this.gateNow() === true;
  }

  /**
   * Store the choice and apply it (embedded, 'denied' stops the relay). A yes sends what waited; a no (the prompt, or
   * Settings later: withdrawal) drops the queue, the stored events, the anonymous id and the account link.
   */
  setConsent(granted: boolean): void {
    this.consent = granted ? 'granted' : 'denied';
    put(this.kv, CONSENT_KEY, this.consent);
    if (granted) this.flush();
    else this.forget();
  }

  /** Re-read the shared key (the site banner may have changed it). */
  refreshConsent(): void {
    const c = readConsent(this.kv);
    if (c !== this.consent) {
      this.consent = c;
      if (c === 'granted') this.flush();
      if (c === 'denied') this.forget();
    }
  }

  private forget(): void {
    this.queue = [];
    this.clearPending();
    if (this.relay) return;
    this.anon = null;
    put(this.kv, ANON_KEY, '');
    put(this.kv, AID_KEY, '');
  }

  /**
   * A signed-in account (`pl_<hash>`, never the uid or an email): later events go under it with a person profile, and
   * the next flush links the anonymous id to it (`$identify`, once per anonymous id). Embedded, the host identifies.
   */
  identify(aid: string): void {
    if (this.relay || !ACCOUNT_ID_RE.test(aid) || aid === this.aid) return;
    this.aid = aid;
    this.schedule();
  }

  /** Sign-out: a fresh anonymous id, so the next player on this device is not merged into the last account. */
  reset(): void {
    if (this.relay || !this.aid) return;
    this.flush();
    this.aid = null;
    this.anon = null;
    put(this.kv, ANON_KEY, '');
    put(this.kv, AID_KEY, '');
  }

  /** The account code events go under now (tests and QA). */
  get accountId(): string | null {
    return this.aid;
  }

  track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
    try {
      if (this.consent === 'denied' || (!this.relay && this.gateNow() === false)) return;
      const own = isMpEvent(event) ? cleanMpProps(props ?? {}) : props;
      const e: TrackedEvent = { event, props: { ...cleanProps(this.common()), ...cleanProps(own) }, at: this.now() };
      if (this.aid) e.who = this.aid;
      this.queue.push(e);
      if (this.queue.length > BUFFER_MAX) this.queue.splice(0, this.queue.length - BUFFER_MAX);
      if (!this.live) this.writePending();
      this.schedule();
    } catch {
      /* never throws */
    }
  }

  /** Keep the unanswered queue for this tab (not embedded: the host keeps its own). */
  private writePending(): void {
    if (this.relay || this.consent !== 'unset' || !this.key) return;
    put(this.session, PENDING_KEY, JSON.stringify(this.queue.slice(-PENDING_MAX)));
  }

  private clearPending(): void {
    if (get(this.session, PENDING_KEY)) put(this.session, PENDING_KEY, '');
  }

  private readPending(): TrackedEvent[] {
    try {
      const raw = get(this.session, PENDING_KEY);
      const rows: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) return [];
      const out: TrackedEvent[] = [];
      for (const r of rows.slice(-PENDING_MAX)) {
        const x = r as Partial<TrackedEvent> | null;
        if (!x || typeof x.event !== 'string' || !/^[a-z_]{2,40}$/.test(x.event) || typeof x.at !== 'number' || !x.props || typeof x.props !== 'object') continue;
        const e: TrackedEvent = { event: x.event as AnalyticsEvent, props: cleanProps(x.props as Record<string, unknown>), at: x.at };
        if (typeof x.who === 'string' && ACCOUNT_ID_RE.test(x.who)) e.who = x.who;
        out.push(e);
      }
      return out;
    } catch {
      return [];
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
    if (!this.live || !this.key || !this.fetcher || (this.queue.length === 0 && !this.aid)) return;
    const anon = this.anonId();
    // link this anonymous id to the account once (a new anonymous id after a reset or a withdrawal links again)
    const link = !!this.aid && get(this.kv, AID_KEY) !== `${this.aid}:${anon}`;
    if (this.queue.length === 0 && !link) return;
    const batch = link ? [{ event: '$identify' as const, props: {}, at: this.now(), who: this.aid! }, ...this.queue] : this.queue;
    this.queue = [];
    this.clearPending();
    if (link) put(this.kv, AID_KEY, `${this.aid}:${anon}`);
    try {
      let system: Record<string, string> = {};
      try {
        system = this.system();
      } catch {
        /* none */
      }
      for (const body of posthogBodies(this.key, anon, batch, system)) {
        this.sent++;
        void Promise.resolve(this.fetcher(this.captureUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit', mode: 'cors' })).catch(() => undefined);
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
        if (e.event === 'app_error' || e.event === '$identify') continue;
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
    let id: string | null = get(this.kv, ANON_KEY);
    if (!id || !/^[a-z0-9]{12,40}$/.test(id)) {
      const bytes = new Uint8Array(12);
      try {
        crypto.getRandomValues(bytes);
      } catch {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      put(this.kv, ANON_KEY, id);
    }
    this.anon = id;
    return id;
  }
}

/**
 * The build's PostHog config: the same two names as every Token Tails surface (client, pawlegends-web), inlined by Vite
 * (`envPrefix` lets `NEXT_PUBLIC_POSTHOG_` through, vite.config.ts). The app build (pawlegends-app/scripts/build-web.mjs)
 * carries the same token; `appGate` keeps an older binary silent. Pure over its input (tests pass an env object).
 */
export function posthogEnv(env: Record<string, unknown> = import.meta.env): { key: string | null; host: string | null } {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { key: str(env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN), host: str(env.NEXT_PUBLIC_POSTHOG_HOST) };
}

/** The page's analytics (the key comes from the build env; embedded, `relay` sends through the host instead). */
export function createAnalytics(
  common: () => AnalyticsProps,
  relay?: AnalyticsRelay | null,
  more: Pick<AnalyticsOptions, 'system' | 'gate'> = {},
): Analytics {
  const { key, host } = posthogEnv();
  return new Analytics({ key, host, common, relay: relay ?? null, ...more });
}
