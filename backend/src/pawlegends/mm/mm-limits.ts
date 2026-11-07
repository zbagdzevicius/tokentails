/*
 * Quick Play (M1a co-op) numbers in one place (docs/plans/moba/M1A-IMPL.md §2.4, §4.4, §4.5), so the matchmaker, the
 * relay glue, the specs and the queue simulation (backend/test/mm-sim.ts) read the same values. Tuning after launch
 * is a one-line change here, measured against the production `queueMs` of the mm room records. No env vars.
 */

/** The only region today (§4.7). `mm.join.region` is accepted for the wire, ignored unless it is this. */
export const MM_HOME_REGION = 'eu';

export const MM_LIMITS = Object.freeze({
    /** The matchmaker ticks with the relay's 500 ms party timer. */
    tickMs: 500,
    /** §2.4: bot fill by pool activity (λ = distinct identities that joined in the last 5 minutes, per minute). */
    fill: Object.freeze({
        arrivalWindowMs: 5 * 60_000,
        /** λ below this: a quiet pool. */
        quietPerMin: 2,
        /** λ at or above this: a busy pool. */
        busyPerMin: 6,
        solo: Object.freeze({ quiet: 8000, normal: 20_000, busy: 30_000 }),
        pair: Object.freeze({ quiet: 8000, normal: 12_000, busy: 12_000 }),
    }),
    /** No solo ever waits longer than this for bots (plus one tick). */
    maxFillMs: 30_000,
    /** §2.2: the rating window grows with the oldest entry's wait (s), capped. A member with rd > rdFree widens it. */
    window: Object.freeze({ base: 150, perSecond: 15, max: 600, rdFree: 200 }),
    /** §2.3 fit cost: |Δr| / ratingScale + newbieMismatch × newbie + order × orderWeight. */
    fit: Object.freeze({ ratingScale: 50, newbieMismatch: 4, orderWeight: 0.001 }),
    /** §2.3: the side the pool played less in the last N matches, when every entry asked for either. */
    sideBalanceN: 50,
    /** A newbie for matching: fewer completed matches (the hint) or a rating deviation above this. */
    newbieRd: 300,
    /** §3 backfill. */
    backfill: Object.freeze({
        /** A seat is backfillable only before this tick (3:00). */
        beforeTick: 5400,
        /** A dropped or AFK seat is backfillable after this long piloted. */
        pilotedMs: 60_000,
        /** Only a solo that waited this long gets an offer. */
        minWaitMs: 3000,
        ratingWithin: 300,
        offerMs: 10_000,
        offersPerWindow: 3,
        offerWindowMs: 10 * 60_000,
    }),
    /** §4.6: an away entry is skipped, and cancelled after this long away. */
    awayCancelMs: 60_000,
    /** A socket closed while queued: the entry stays this long (a quick resume keeps it). */
    closedGraceMs: 10_000,
    /** §4.5 caps. */
    queueMax: 600,
    joins: Object.freeze({ perIdentity: 30, perIp: 120, perNet: 600, windowMs: 10 * 60_000 }),
    queued: Object.freeze({ perIdentity: 1, perIp: 12, perNet: 40 }),
    sideEveryMs: 2000,
    statusEveryMs: 2000,
    /** A stranger idle this long in results leaves the matched party. */
    resultsIdleMs: 60_000,
    /** §4.4 leaver ladder. */
    leaver: Object.freeze({
        windowMs: 7 * 86_400_000,
        shortWaitMs: 60_000,
        longWaitMs: 180_000,
        /** Every this many completed mm matches without an event erase the oldest event. */
        cleanPerErase: 5,
        /** §4.3: `left` when offline this long before the end; `afk` when AFK-reason pilot ticks exceed this share. */
        offlineBeforeEndMs: 180_000,
        afkShare: 0.35,
    }),
    /** §4.2: loss forgiveness when a teammate left or went AFK before this tick (5:00). */
    forgiveBeforeTick: 9000,
    /** Rating and leaver reads are cached this long per identity. */
    readCacheMs: 60_000,
    /** A seat taken by a backfill: the leaver's resume token answers `seat_taken` this long. */
    seatTakenMs: 30 * 60_000,
});

export type MmFillBand = 'quiet' | 'normal' | 'busy';

export function fillBand(perMin: number): MmFillBand {
    if (perMin < MM_LIMITS.fill.quietPerMin) return 'quiet';
    if (perMin < MM_LIMITS.fill.busyPerMin) return 'normal';
    return 'busy';
}

/** When a lone entry is matched with bots (never later than maxFillMs). */
export const fillAtMs = (perMin: number): number =>
    Math.min(MM_LIMITS.fill.solo[fillBand(perMin)], MM_LIMITS.maxFillMs);

/** When two humans are matched with one bot. */
export const pairFillMs = (perMin: number): number =>
    Math.min(MM_LIMITS.fill.pair[fillBand(perMin)], MM_LIMITS.maxFillMs);
