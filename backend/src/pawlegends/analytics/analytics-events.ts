/*
 * The server's PostHog events (docs/BACKEND.md "Pawlegends server analytics") and the only properties each may carry.
 * `cleanProps` drops every other key, so no email, name, account id, uid, room code, IP, card or session id can leave
 * by accident: values are numbers, booleans or short id-like strings (hero, mode, map, sku, currency).
 *
 * Two kinds:
 * - per account (`serverTrack`): only for an account whose stored consent is `granted`, under its hashed id;
 * - anonymous (`serverTrackAnonymous`): a count with no person (a fresh random id each, no person profile), for facts
 *   that have no consenting account to hang on (an account created or deleted, a purchase without a session).
 */

type Kind = 'n' | 'b' | 's';

const MATCH = {
    mode: 's',
    group: 's',
    map: 's',
    mutator: 's',
    difficulty: 's',
    outcome: 's',
    reason: 's',
    ticks: 'n',
    length_s: 'n',
    hero: 's',
    takedowns: 'n',
    kills: 'n',
    deaths: 'n',
    assists: 'n',
    grade: 's',
    mvp: 'b',
    svp: 'b',
    party_size: 'n',
    humans: 'n',
    bots: 'n',
    solo: 'b',
    sim_version: 'n',
    season: 's',
} as const;

const PURCHASE = {
    store: 's',
    item: 's',
    sku: 's',
    kind: 's',
    amount_cents: 'n',
    currency: 's',
    method: 's',
    reason: 's',
} as const;

export const SERVER_EVENTS = {
    /** A verified match was stored (solo re-sim or party referee), once per account and match. */
    match_saved: MATCH,
    /** A ranked match moved the account's ranked points. */
    ranked_result: {
        kind: 's',
        won: 'b',
        delta: 'n',
        tier_idx: 'n',
        points: 'n',
        placements_left: 'n',
        grade: 's',
        saved: 'n',
        season: 's',
    },
    purchase_completed: PURCHASE,
    purchase_refunded: PURCHASE,
    yarn_granted: { reason: 's', amount: 'n', balance: 'n', new_picks: 'n' },
    yarn_spent: { reason: 's', amount: 'n', hero: 's' },
    season_tier_up: { season: 's', tier: 'n', prev_tier: 'n', xp: 'n' },
    champion_unlocked: { hero: 's', via: 's', tier: 's' },
    invite_sent: { mode: 's', offline: 'b' },
    invite_answered: { answer: 's' },
    referral_redeemed: { kind: 's' },
    account_created: { kind: 's', surface: 's' },
    account_deleted: { kind: 's' },
} as const;

// every event's property map is a Record<string, Kind> (checked at compile time without `satisfies`, TS 4.8)
const _check: Record<string, Record<string, Kind>> = SERVER_EVENTS;
void _check;

export type ServerEvent = keyof typeof SERVER_EVENTS;
export type ServerProps = Record<string, unknown>;

/** Id-like short strings only (hero ids, modes, SKUs, currencies): never free text. */
const SAFE_STRING = /^[A-Za-z0-9_.:-]{1,48}$/;

/** The event's allowed properties, each of its declared kind; everything else is dropped. Pure. */
export function cleanProps(
    event: ServerEvent,
    props: ServerProps | null | undefined
): Record<string, string | number | boolean> {
    const allowed = SERVER_EVENTS[event] as Record<string, Kind>;
    const out: Record<string, string | number | boolean> = {};
    if (!props || typeof props !== 'object') return out;
    for (const [key, kind] of Object.entries(allowed)) {
        const v = (props as Record<string, unknown>)[key];
        if (kind === 'n' && typeof v === 'number' && Number.isFinite(v)) out[key] = Math.round(v * 100) / 100;
        else if (kind === 'b' && typeof v === 'boolean') out[key] = v;
        else if (kind === 's' && typeof v === 'string' && SAFE_STRING.test(v)) out[key] = v;
    }
    return out;
}

export const isServerEvent = (e: unknown): e is ServerEvent =>
    typeof e === 'string' && Object.prototype.hasOwnProperty.call(SERVER_EVENTS, e);
