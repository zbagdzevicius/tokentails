/*
 * Party play relay limits (docs/plans/moba/MULTIPLAYER.md §3.2 to §3.5). One place, so the specs and the load test
 * read the same numbers. MAX_LIVE_ROOMS is a placeholder until `mp/load.mjs` has run on the production droplet size.
 */
export const PARTY_LIMITS = Object.freeze({
    /** §3.3: measured capacity replaces this (rooms per worker × workers, with 30% headroom). */
    maxLiveRooms: 60,
    /** Unticketed (unscored guest) rooms may use at most this share of maxLiveRooms. */
    unticketedRoomShare: 0.5,
    /** Event-loop delay gate (D13): p99 over the window above this refuses new rooms with server_busy. */
    loopDelayP99Ms: 20,
    loopDelayWindowMs: 10_000,
    /** A referee this many turns behind refuses new rooms until it recovers. */
    refereeLagTurns: 30,

    socketsPerInstance: 2000,
    preHelloSockets: 200,
    upgradesPerSecond: 50,
    socketsPerIdentity: 4,
    socketsPerIp: 50,
    partiesLivePerIdentity: 3,
    partiesPerHourPerIdentity: 20,
    partiesLivePerIp: 10,
    roomsLivePerIdentity: 1,
    roomsLivePerIp: 2,
    joinFailPerIdentity: { limit: 10, windowMs: 10 * 60_000 },
    joinFailPerIp: { limit: 30, windowMs: 10 * 60_000 },
    joinFailGlobal: { limit: 200, windowMs: 60_000, lockMs: 30_000 },
    json: { perSecond: 5, burst: 10 },
    partyBroadcastHz: 10,
    resyncsPerSlot: 3,
    resyncsPerRoom: 6,
    roomLogBytes: 160 * 1024,
    partyIdleMs: 30 * 60_000,
    partyHardMaxMs: 3 * 3600_000,
    lobbyResumeMs: 10 * 60_000,

    helloTimeoutMs: 5000,
    strikes: 3,
    maxJson: 1024,
    maxPayload: 1024,
    /** §3.4 */
    pingMatchMs: 5000,
    pingLobbyMs: 15_000,
    lobbySilentMs: 45_000,
    backpressureCloseBytes: 256 * 1024,
    catchupSendBelowBytes: 64 * 1024,
    catchupBytesPerMinute: 1024 * 1024,
    syncEveryMs: 5000,

    /** §3.2 timers */
    silentAwayMs: 3000,
    silentPilotMs: 6000,
    afkWarnMs: 45_000,
    afkPilotMs: 60_000,
    lateLoadMs: 20_000,
    abandonBeforePlayMs: 30_000,
    abandonAfterPlayMs: 120_000,
    /** A `back` is honoured only from a client within this many turns of live (B + 2 with B <= 5). */
    reclaimWithinTurns: 7,
    /** B4: non-move token bucket per slot. */
    cmdBucket: { perSecond: 20, burst: 10 },
    /** Votes (§3.2). */
    surrenderVoteMs: 20_000,
    voteCooldownMs: 90_000,
    pauseVoteMs: 10_000,
    pausesPerMatch: 2,
    pauseMaxMs: 60_000,
    resumeCountdownMs: 3000,
    /** §3.6 */
    checkpointEveryMs: 10_000,
    staleLeaseMs: 15_000,
    restoreWithinMs: 120_000,
});

/** Turn length (D3): 2 ticks at 30 Hz. */
export const TURN_TICKS = 2;
export const TURN_MS = 200 / 3;
