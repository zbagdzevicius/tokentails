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
    partiesPerHourPerIp: 60,
    partiesLivePerIp: 10,
    roomsLivePerIdentity: 1,
    /** Rooms with anyone from one IP (a home, a school or a carrier NAT shares one): enough for a few parties. */
    roomsLivePerIp: 4,
    joinFailPerIdentity: { limit: 10, windowMs: 10 * 60_000 },
    joinFailPerIp: { limit: 30, windowMs: 10 * 60_000 },
    /** Failed joins per /24 (IPv4) or /48 (IPv6) network: a backoff for that network only, never a global lock. */
    joinFailPerNet: { limit: 100, windowMs: 10 * 60_000 },
    /** Counted for the `join_fail_global` alert only; never locks joins for everyone (one IP could hold it). */
    joinFailGlobal: { limit: 200, windowMs: 60_000 },
    /** Binary frames per socket (CMD, BEAT, HASH): a token bucket; over it each frame is a strike. */
    binary: { perSecond: 40, burst: 60 },
    /** At most one ECHO per this many ms per socket (a BEAT flood never doubles into an ECHO flood). */
    echoEveryMs: 250,
    /** A frame from a socket without a seat costs this many tokens (a late BEAT after the match is fine, a flood is not). */
    unseatedCost: 4,
    /** `party.card` per member (each one reads the cat collection). */
    cardEveryMs: 2000,
    /** Hard cap on a room's wall time (a match never lasts this long; a stuck room is abandoned). */
    roomMaxMs: 60 * 60_000,
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
    /**
     * A `back` is honoured only from a client whose last RECEIVED turn (BEAT.lastTurn) is within this many turns of
     * live: one second, enough for 150 ms RTT, jitter and a TCP retransmit, never a client still catching up.
     */
    reclaimWithinTurns: 15,
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

/**
 * The live-room cap for this relay process: PARTY_MAX_LIVE_ROOMS (an integer 1..1000, set from Terraform
 * `max_live_rooms` so the cap and its 80 % alert move together), else PARTY_LIMITS.maxLiveRooms. A capacity knob, not
 * a feature flag: the relay works the same at any value; the load run (`mp/load.mjs`) sets it per machine type.
 */
export function maxLiveRoomsFrom(env: NodeJS.ProcessEnv = process.env): number {
    const raw = env.PARTY_MAX_LIVE_ROOMS?.trim();
    if (!raw || !/^\d+$/.test(raw)) return PARTY_LIMITS.maxLiveRooms;
    const n = Number(raw);
    return n >= 1 && n <= 1000 ? n : PARTY_LIMITS.maxLiveRooms;
}
