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
    /**
     * Play online while a live-room cap still binds (this identity in a live room from a tab that is still open, or the
     * address already in 4 live rooms): `mm_locked` with this retry (the card says when to search again).
     */
    liveRoomRetryMs: 30_000,
    /** A formed match whose room has not started after this long is forgotten (the pick lasts 30 s). */
    pendingMaxMs: 5 * 60_000,
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

/**
 * Casual PvP (M1b, docs/plans/moba/V16.md §4.1): the casual pool's numbers. A pool exists only for sims >= PVP_SINCE
 * and PROTO 3 sockets.
 */
export const MM_CASUAL = Object.freeze({
    /** Bot fill (symmetric shapes first) once the oldest entry waited this long; fixed for casual. */
    fillMs: 30_000,
    /**
     * No opponent human by then: the entry moves to the co-op pool (Keep waiting puts it back). The card then shows
     * Keep waiting for `switchGraceMs` before the co-op fill seats it, so a lone search is seated by 45 s (V16.md §4.1
     * step 4: "no PvP opponent by 45 s").
     */
    switchMs: 40_000,
    switchGraceMs: 5000,
    /** A lone human never faces three humans while a 2-human team can still form within this long after the fill. */
    loneVsThreeMs: 15_000,
    /** A side request is honoured inside the window, relaxed after this long. */
    sideRelaxMs: 25_000,
    /** Parties face parties of the same size (or larger) until this long. */
    partiesUntilMs: 40_000,
    /** Members above this rating deviation play in a protected pool until it widens. */
    protectedRd: 250,
    protectWidenMs: 45_000,
    /** Newbie lock: fewer completed matches than this, or a rating deviation above `newbieRd`. */
    newbieMatches: 5,
    newbieRd: 300,
    /** |Δ team mean| <= min(base + perSecond·w, max) + (rd − rdFree) of the widest member. */
    window: Object.freeze({ base: 75, perSecond: 12, max: 400, rdFree: 200 }),
    /** Accept card: every human answers within this long. */
    acceptMs: 10_000,
    /** Dodges (decline or no answer): this many free per UTC day, then +penaltyStepMs low-priority wait each. */
    dodgeFreePerDay: 2,
    dodgePenaltyStepMs: 60_000,
    /**
     * Every casual match (bots counted at their level, both teams' bots at one level) must be predicted inside
     * `fairBand` until the anchor waited `fairUntilMs`, then inside `fairAfter`.
     */
    fairUntilMs: 25_000,
    fairBand: Object.freeze([0.4, 0.6]) as readonly [number, number],
    fairAfter: Object.freeze([0.35, 0.65]) as readonly [number, number],
    /** Fit cost weights. */
    shapeWeight: 1000,
    sideMismatch: 5,
    orderWeight: 0.001,
    /** Candidates looked at per anchor (bounds the subset search). */
    candidates: 10,
    /** Recent matches per pool remembered for the left-side species alternation. */
    sideBalanceN: 50,
});

/**
 * 5v5 Classic (docs/plans/moba/MAP-5V5.md §9.3): the `classic` pool on Hearthwood Divide (sim v19+, PROTO 4). The
 * casual rules with five seats a team: bots fill the empty seats at 45 s (`fillMsClassic`), a search never moves to
 * co-op (there is no 5v5 co-op), and the subset search looks at fewer candidates (a team holds up to five entries).
 */
export const MM_CLASSIC = Object.freeze({
    ...MM_CASUAL,
    fillMs: 45_000,
    /** Never: a classic search stays classic (Infinity keeps the casual switch code a no-op). */
    switchMs: Number.POSITIVE_INFINITY,
    /** Parties face parties of the same size until the fill. */
    partiesUntilMs: 45_000,
    /** A lone human never faces five humans while a fuller team can still form within this long after the fill. */
    loneVsThreeMs: 15_000,
    /** Bounds the subset search: anchor + 9 candidates is one full 10-human match. */
    candidates: 9,
    /** Seats per team. */
    teamSize: 5 as const,
    /** A Hearthwood room is this many referee units (a 3v3 room is 1) until G9 measures the real ratio (§9.2). */
    refereeUnits: 3,
});
