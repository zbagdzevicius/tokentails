import { isPushEndpoint } from 'src/badcat/badcat-webpush';

/*
 * Push rules (docs/plans/moba/SHARE-PUSH.md §2), pure: the categories, the push services a subscription may point at,
 * quiet hours and the rate limits. The game and the service worker carry the same category ids
 * (pawlegends/src/social/push.ts).
 */

export const PUSH_CATEGORIES = ['invite', 'club', 'ranked', 'event', 'nap'] as const;
export type PushCategory = typeof PUSH_CATEGORIES[number];
export const isPushCategory = (v: unknown): v is PushCategory =>
    typeof v === 'string' && (PUSH_CATEGORIES as readonly string[]).includes(v);

/**
 * Per category: the shortest gap between two pushes of it to one device, how long the push service keeps it while the
 * device is off (TTL; an invite is stale in 2 minutes), whether quiet hours hold it back, and its urgency.
 */
export const PUSH_RULES: Readonly<
    Record<PushCategory, { gapMs: number; ttlSec: number; quiet: boolean; urgency: 'low' | 'normal' | 'high' }>
> = Object.freeze({
    invite: { gapMs: 60_000, ttlSec: 120, quiet: true, urgency: 'high' },
    club: { gapMs: 12 * 3600_000, ttlSec: 12 * 3600, quiet: true, urgency: 'normal' },
    ranked: { gapMs: 12 * 3600_000, ttlSec: 1800, quiet: true, urgency: 'normal' },
    event: { gapMs: 6 * 3600_000, ttlSec: 6 * 3600, quiet: true, urgency: 'low' },
    nap: { gapMs: 20 * 3600_000, ttlSec: 6 * 3600, quiet: true, urgency: 'low' },
});

/** At most this many pushes a device a rolling 24 h, all categories together (invites included). */
export const PUSH_DAILY_CAP = 4;
/** Subscriptions per account (phones, tablets, browsers). */
export const PUSH_SUBS_PER_ACCOUNT = 5;
/** Quiet hours, the device's local time: no push from 22:00 to 09:00. */
export const QUIET_FROM_H = 22;
export const QUIET_TO_H = 9;
/** The Winter Nap reminder's local hour (inside the day window). */
export const NAP_LOCAL_HOUR = 18;

/**
 * The push services a subscription may point at (the server POSTs to the endpoint, so never any other host): the
 * backend's one list (src/badcat/badcat-webpush.ts `isPushEndpoint`: FCM, Mozilla autopush, Apple, WNS), https only,
 * no credentials, no port.
 */
export function endpointAllowed(endpoint: unknown): endpoint is string {
    return typeof endpoint === 'string' && endpoint.length >= 20 && isPushEndpoint(endpoint);
}

/** A base64url key of `min`..`max` decoded bytes. */
export function keyOk(v: unknown, min: number, max: number): v is string {
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(v)) return false;
    const n = Buffer.from(v, 'base64url').length;
    return n >= min && n <= max;
}

/** The categories a device wants, from a comma list or an array (unknown names dropped; empty is "none"). */
export function parseCategories(v: unknown): PushCategory[] {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    return [...new Set(list.map(x => String(x).trim()).filter(isPushCategory))];
}

/** The device's offset from UTC in minutes (Date.getTimezoneOffset() sign: UTC+3 is -180), clamped. */
export function parseTz(v: unknown): number {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(-14 * 60, Math.min(12 * 60, Math.round(n))) : 0;
}

/** The device's local hour at `now`. */
export function localHour(now: Date, tz: number): number {
    const local = new Date(now.getTime() - tz * 60_000);
    return local.getUTCHours();
}

export function inQuietHours(now: Date, tz: number): boolean {
    const h = localHour(now, tz);
    return h >= QUIET_FROM_H || h < QUIET_TO_H;
}

export interface SendState {
    /** Send times of the last 24 h (ms). */
    recent?: number[];
    /** Last send per category (ms). */
    last?: Partial<Record<PushCategory, number>>;
}

export type PushDecision = 'send' | 'off' | 'quiet' | 'gap' | 'cap';

/** May this device get a push of `cat` now? Pure. */
export function decide(o: {
    cats: readonly string[];
    tz: number;
    state: SendState;
    cat: PushCategory;
    now: Date;
}): PushDecision {
    if (!o.cats.includes(o.cat)) return 'off';
    const rule = PUSH_RULES[o.cat];
    if (rule.quiet && inQuietHours(o.now, o.tz)) return 'quiet';
    const t = o.now.getTime();
    const last = o.state.last?.[o.cat];
    if (typeof last === 'number' && t - last < rule.gapMs) return 'gap';
    const recent = (o.state.recent ?? []).filter(x => t - x < 86_400_000);
    if (recent.length >= PUSH_DAILY_CAP) return 'cap';
    return 'send';
}

/** The state after a send at `now` (the 24 h list trimmed). Pure. */
export function afterSend(state: SendState, cat: PushCategory, now: Date): Required<SendState> {
    const t = now.getTime();
    return {
        recent: [...(state.recent ?? []).filter(x => t - x < 86_400_000), t].slice(-PUSH_DAILY_CAP * 2),
        last: { ...(state.last ?? {}), [cat]: t },
    };
}

export interface PushMessage {
    cat: PushCategory;
    title: string;
    body: string;
    /** A path on pawlegends.app the tap opens (never an outside URL). */
    path: string;
    /** Replaces an earlier notification of the same tag on the device. */
    tag: string;
}

/** Only a pawlegends.app path: `/play`, `/play?party=…`. */
export const safePath = (p: string): string =>
    /^\/[A-Za-z0-9/_?=&.-]{0,120}$/.test(p) && !p.startsWith('//') ? p : '/play';
