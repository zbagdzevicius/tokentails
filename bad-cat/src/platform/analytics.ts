/**
 * Analytics (GDD 14): `track` queues events locally in a ring buffer. Events leave the device only when
 * ALL of these hold: a sender and an https endpoint are configured (the PostHog EU sender when
 * VITE_BADCAT_POSTHOG_KEY is set) AND consent is granted (shared key `tt-analytics-consent` = `granted`).
 * Otherwise nothing is sent, ever. Every event carries the common props (day_no, room_id, sim_version,
 * platform, entry, via, utm_source, in_app_browser, is_first_session) set through configureAnalytics.
 * The queue flushes when consent is granted. Never throws.
 */
import type { AnalyticsEvent, AnalyticsProps } from '../types';

export interface TrackedEvent {
  event: AnalyticsEvent;
  props: AnalyticsProps;
  at: number; // Date.now()
}

export const ANALYTICS_BUFFER = 200;
/** Shared with tokentails.com (`shared/analytics-core.ts` CONSENT_STORAGE_KEY). */
export const CONSENT_KEY = 'tt-analytics-consent';
/** Batch window: events are posted together a moment after the first one (or at 20 queued). */
export const FLUSH_DELAY_MS = 1500;
export const FLUSH_AT = 20;

export type ConsentState = 'granted' | 'denied' | 'unset';

interface ConsentStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const buffer: TrackedEvent[] = [];
let consent = false;
let sender: ((batch: readonly TrackedEvent[]) => void) | null = null;
let endpoint: string | null = null;
let devLog = false;
let common: AnalyticsProps = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function cleanProps(props: AnalyticsProps | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!props) return out;
  for (const k of Object.keys(props)) {
    if (k.length > 64) continue;
    const v = props[k];
    if (typeof v === 'string') out[k] = v.length > 200 ? v.slice(0, 200) : v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

const canSend = (): boolean => consent && !!endpoint && !!sender;

function schedule(): void {
  if (!canSend()) return;
  if (buffer.length >= FLUSH_AT) {
    flush();
    return;
  }
  if (timer !== null) return;
  try {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_DELAY_MS);
  } catch {
    flush();
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  try {
    // Event props win over common ones (e.g. a run's own day_no on an archive replay).
    const e: TrackedEvent = { event, props: { ...common, ...cleanProps(props) }, at: Date.now() };
    buffer.push(e);
    if (buffer.length > ANALYTICS_BUFFER) buffer.splice(0, buffer.length - ANALYTICS_BUFFER);
    if (devLog) console.debug('[bc]', event, e.props);
    schedule();
  } catch {
    /* never throws */
  }
}

/** Send queued events only with consent + endpoint + sender. Returns how many were handed over. */
export function flush(): number {
  if (timer !== null) {
    try {
      clearTimeout(timer);
    } catch {
      /* ignore */
    }
    timer = null;
  }
  if (!canSend() || buffer.length === 0) return 0;
  const batch = buffer.splice(0, buffer.length);
  try {
    sender!(batch);
  } catch {
    /* dropped */
  }
  return batch.length;
}

export interface AnalyticsConfig {
  dev?: boolean;
  /** https endpoint the sender posts to; anything else disables sending. */
  endpoint?: string | null;
  /** Common props merged into every event from now on (null/undefined values remove a key). */
  common?: Record<string, string | number | boolean | null | undefined>;
}

export function configureAnalytics(opts: AnalyticsConfig): void {
  if (opts.dev !== undefined) devLog = opts.dev;
  if (opts.endpoint !== undefined) endpoint = opts.endpoint && /^https:\/\//.test(opts.endpoint) ? opts.endpoint : null;
  if (opts.common) {
    const next: AnalyticsProps = { ...common };
    for (const [k, v] of Object.entries(opts.common)) {
      if (v === null || v === undefined) delete next[k];
      else Object.assign(next, cleanProps({ [k]: v }));
    }
    common = next;
  }
  schedule();
}

/** Current common props (tests, QA). */
export function analyticsCommon(): AnalyticsProps {
  return { ...common };
}

export function setAnalyticsConsent(on: boolean): void {
  consent = on;
  if (on) flush();
}
export function setAnalyticsSender(fn: ((batch: readonly TrackedEvent[]) => void) | null): void {
  sender = fn;
  schedule();
}
/** Copy of the queued events (QA hook, tests). */
export function analyticsQueue(): TrackedEvent[] {
  return buffer.slice();
}
export function clearAnalytics(): void {
  buffer.length = 0;
}
/** Test hook: back to the boot state (no sender, no endpoint, no consent, no common props). */
export function resetAnalytics(): void {
  flush();
  buffer.length = 0;
  consent = false;
  sender = null;
  endpoint = null;
  common = {};
  devLog = false;
}

function consentStorage(storage?: ConsentStorage | null): ConsentStorage | null {
  if (storage !== undefined) return storage;
  try {
    return (globalThis as { localStorage?: ConsentStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The shared consent choice. Blocked storage reads as 'unset' (nothing is sent). Never throws. */
export function readConsent(storage?: ConsentStorage | null): ConsentState {
  try {
    const v = consentStorage(storage)?.getItem(CONSENT_KEY);
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'unset';
  } catch {
    return 'unset';
  }
}

/** Store the choice (shared with tokentails.com) and apply it now. Returns false when it could not be stored. */
export function writeConsent(granted: boolean, storage?: ConsentStorage | null): boolean {
  setAnalyticsConsent(granted);
  try {
    const s = consentStorage(storage);
    if (!s) return false;
    s.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    return true;
  } catch {
    return false;
  }
}

/**
 * Entry classification for the `entry` common prop (GDD 14): typed (`?e=t`), daily_link, dare_link,
 * room_link, cat_link, clip_handoff, typed_or_direct (no referrer and no params on the main path), direct.
 */
export function classifyEntry(href: string, referrer = ''): string {
  try {
    const u = new URL(href);
    // Standalone exports carry the same params in the hash (`#d=18&g=…`, GDD 6.6).
    const q = new URLSearchParams(u.search);
    const hash = u.hash.replace(/^#/, '');
    if (hash.includes('=')) for (const [k, v] of new URLSearchParams(hash)) if (!q.has(k)) q.set(k, v);
    const path = u.pathname.replace(/\/+$/, '');
    if (q.get('e') === 't') return 'typed';
    if (q.get('clip') === '1' || q.has('rp')) return 'clip_handoff';
    if (q.has('g')) return 'dare_link';
    if (/\/r$/.test(path) || /\/r\.html$/.test(path) || q.has('r')) return 'room_link';
    if (/\/c\/[^/]+$/.test(path) || /\/c\.html$/.test(path)) return 'cat_link';
    if (/\/d\/-?\d+(\.html)?$/.test(path) || q.has('d')) return 'daily_link';
    if (!referrer && [...q.keys()].length === 0) return 'typed_or_direct';
    return 'direct';
  } catch {
    return 'direct';
  }
}

/** `via` (creator code) and `utm_source` from the URL, filtered to short safe tokens. */
export function linkAttribution(href: string): { via?: string; utm_source?: string } {
  const out: { via?: string; utm_source?: string } = {};
  try {
    const q = new URL(href).searchParams;
    const tok = (v: string | null) => (v && /^[A-Za-z0-9_.-]{1,32}$/.test(v) ? v : undefined);
    const via = tok(q.get('via'));
    const utm = tok(q.get('utm_source'));
    if (via) out.via = via;
    if (utm) out.utm_source = utm;
  } catch {
    /* ignore */
  }
  return out;
}
