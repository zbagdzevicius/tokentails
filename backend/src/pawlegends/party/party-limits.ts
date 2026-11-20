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
    /**
     * Upgrades per second for the whole instance: a reconnect storm after a deploy (every player of the other instance
     * at once) must get through; the client backs off with jitter on a refused upgrade.
     */
    upgradesPerSecond: 400,
    /**
     * Open sockets of one identity (founder, 2026-11-20: "lift such restrictions"). A new `hello` over the cap closes the
     * oldest socket of that identity (the newest wins), never the new one: relay bounces and app relaunches leave
     * half-closed sockets behind for a moment.
     */
    socketsPerIdentity: 8,
    /*
     * No per-IP or per-network cap on sockets, parties, joins or live rooms (founder, 2026-11-20): many players share one
     * address (carrier CGNAT, a home or school wifi, friends in a party), and a per-address cap blocked real players
     * ("Too many searches from this network"). Abuse is bounded per identity (an account or a guest key) and by the
     * instance caps above.
     */
    partiesLivePerIdentity: 3,
    partiesPerHourPerIdentity: 200,
    /** Live rooms per identity: a new search or seat gives up the older seat (the newest wins), it is never refused. */
    roomsLivePerIdentity: 1,
    joinFailPerIdentity: { limit: 60, windowMs: 10 * 60_000 },
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
    /** V16.md §4.2: a 6-human PvP room logs more per turn (160 KB was the 3-human party budget). */
    roomLogBytes: 256 * 1024,
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
    /**
     * §3.6 and live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §5.2). A crash replays at most one checkpoint
     * interval; the lease goes stale after `staleLeaseMs` (above the interval plus a slow Mongo write); a room handed off
     * or left stale stays restorable for `restoreWithinMs` (a VM recreate can pass 120 s).
     */
    checkpointEveryMs: 2_000,
    staleLeaseMs: 8_000,
    restoreWithinMs: 300_000,
    /** Every serving relay claims handed-off and stale rooms (and handed-off parties) this often, not only at boot. */
    restoreEveryMs: 1_000,
    /** While a pull it asked for is pending, the restore loop runs this often. */
    restorePullEveryMs: 250,
    /** A restored room holds its clock until its humans are bound again, at most this long (both teams frozen). */
    restoreHoldMs: 5_000,
    /** A `hello` whose room is moving here waits at most this long for the claim before it is told to retry. */
    pullHoldMs: 3_000,
    /** A draining relay checks for pull requests on its rooms this often. */
    pullPollMs: 500,
    /** Relay generation rows: heartbeat interval, and the age after which a row no longer counts. */
    relayHeartbeatMs: 5_000,
    relayStaleMs: 20_000,
    /**
     * A party's owner relay whose heartbeat is older than this (three missed beats) is gone (a crash, a SIGKILL): a join
     * or a resume that reaches another relay takes the party over from its stored row (LIVE-MATCH-DEPLOYS.md §14).
     */
    relayDeadMs: 15_000,
    /** A join whose party lives on another serving relay: reconnect after this long (the balancer picks again). */
    partyElsewhereRetryMs: 1_000,
    /**
     * SIGTERM drain when RELAY_DRAIN_MAX_MS is not set: 90 s fits any platform's default grace (DigitalOcean 120 s)
     * with 30 s left for the push handoff. DigitalOcean sets 540 000 with a 600 s grace
     * (infra/digitalocean/live-match-spec.sh); the GCP relay VM sets docker's stop timeout minus 30 s.
     */
    drainMaxMs: 90_000,
    /** `POST /pawlegends/relay/drain {maxMs}` is capped here. */
    drainEndpointMaxMs: 1_800_000,
    /**
     * Relay shards (LIVE-MATCH-DEPLOYS.md §15). The Quick Play lease (`pawlegendsleases` `_id: 'mm'`): the shard holding
     * it takes new sessions and the queue; it renews every loop tick, another shard takes it once it is this old.
     */
    mmLeaseMs: 15_000,
    /** A shard whose live rooms reach this share of its cap sends new sessions to the least loaded shard. */
    redirectLoad: 0.8,
    /** DM notices from the API (`pawlegendsnotices`): each relay polls for its own accounts this often. */
    noticePollMs: 1_000,
    /** A notice older than this is never delivered (the client's 30 s pulse covers it); the TTL index drops it. */
    noticeTtlMs: 120_000,
    /** A failed end-of-match write (verdict, Quick Play record) is retried with backoff this many times. */
    persistRetries: 6,
    persistRetryBaseMs: 500,
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

/**
 * How long a SIGTERM drain lets live rooms play on before the push handoff: RELAY_DRAIN_MAX_MS (integer ms, 0..1 800 000),
 * else PARTY_LIMITS.drainMaxMs. It must stay below the platform's SIGTERM-to-SIGKILL grace (DigitalOcean
 * `termination.grace_period_seconds`, docker `stop -t`) minus the time a push handoff takes.
 */
export function drainMaxMsFrom(env: NodeJS.ProcessEnv = process.env): number {
    const raw = env.RELAY_DRAIN_MAX_MS?.trim();
    if (!raw || !/^\d+$/.test(raw)) return PARTY_LIMITS.drainMaxMs;
    return Math.min(Number(raw), PARTY_LIMITS.drainEndpointMaxMs);
}

/**
 * The relay pool (LIVE-MATCH-DEPLOYS.md §4.4): RELAY_POOL ([a-z0-9-], up to 32), else `vm` for BACKEND_ROLE=relay (the
 * GCP relay VM) and `app` for everything else (DigitalOcean, local dev). Only a newer relay of the same pool drains this
 * one, so the GCP relay coming up in the shadow phase never drains the DigitalOcean relay that serves players.
 */
export function relayPoolFrom(role?: string, env: NodeJS.ProcessEnv = process.env): string {
    const raw = env.RELAY_POOL?.trim().toLowerCase();
    if (raw && /^[a-z0-9-]{1,32}$/.test(raw)) return raw;
    // a shard is its own pool (§15): only a newer process of the same shard drains it
    const shard = relayShardFrom(env);
    if (shard) return shard;
    return role === 'relay' ? 'vm' : 'app';
}

/**
 * The relay shard (LIVE-MATCH-DEPLOYS.md §15): RELAY_SHARD ([a-z0-9-], up to 16), else null (one relay per pool, as
 * before: DigitalOcean `all`, the GCP relay VM). A shard is addressable on its own path, `/pawlegends/ws/<shard>`.
 */
export function relayShardFrom(env: NodeJS.ProcessEnv = process.env): string | null {
    const raw = env.RELAY_SHARD?.trim().toLowerCase();
    return raw && /^[a-z0-9-]{1,16}$/.test(raw) ? raw : null;
}

/**
 * The deployment this relay process belongs to (LIVE-MATCH-DEPLOYS.md §15, A1): two processes of one deployment (a
 * DigitalOcean service with `instance_count: 2`) both serve; only a process of another deployment makes an older one
 * drain. RELAY_DEPLOY_ID when set; else, on a Kubernetes pod (DigitalOcean App Platform), the pod name minus its own
 * suffix, `<service>-<pod-template-hash>`, which every replica of one rollout shares and the next rollout changes
 * (unverified on DigitalOcean: the founder checks `/healthz` after the first deploy); else null, and the older relay of a
 * pool drains as before (the GCP VM, local runs, the specs).
 */
export function relayDeployIdFrom(env: NodeJS.ProcessEnv = process.env): string | null {
    const raw = env.RELAY_DEPLOY_ID?.trim();
    if (raw && /^[A-Za-z0-9._:-]{1,64}$/.test(raw)) return raw;
    const host = env.HOSTNAME?.trim() ?? '';
    const pod = /^([a-z0-9-]+)-([a-z0-9]{6,10})-([a-z0-9]{5})$/.exec(host);
    return pod ? `${pod[1]}-${pod[2]}` : null;
}
