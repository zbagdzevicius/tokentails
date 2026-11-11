/*
 * The party relay (docs/plans/moba/MULTIPLAYER.md §3): one WebSocket endpoint on the Nest HTTP server
 * (`/pawlegends/ws`, subprotocol `pl.1`, `noServer` upgrade). Sockets, the turn clock and JSON run on the main
 * thread; every sim step runs in the referee workers (D13). The relay only orders bytes: it never trusts a client for
 * state, never writes to user or game collections, and never shows a player's free text to another player.
 *
 * Framework-free on purpose: `PartyRelayService` (party-relay.service.ts) wires it into Nest, and the e2e harness
 * and the specs construct it directly with their own HTTP server, store and options.
 */
import { createHash, randomBytes } from 'crypto';
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { isRelayOriginAllowed } from '../../shared/cors-origins';
import { clientIpKey } from '../../shared/client-ip';
import { relayClientIp } from '../../shared/relay-client-ip';
import {
    partySimFor,
    simFor,
    SIM_VERSION as LIVE_SIM_VERSION,
    SIM_VERSIONS,
    type PawlegendsPartySim,
} from '../../vendor/pawlegends-sim';
import {
    CATCHUP_CHUNK,
    Frame,
    MAX_JSON,
    PROTO,
    PROTO_MIN,
    PROTO_PVP,
    ProtoError,
    SUBPROTOCOL,
    TURN_TICKS,
    WS_PATH,
    SocialLimiter,
    clampSocialPoint,
    decodeClientBinary,
    socialIdOk,
    teamOfSlot,
    encodeCatchup,
    encodeTurnBody,
    splitTurnBodies,
    encodeEcho,
    parseClientJson,
    type ClientJson,
    type ErrorCode,
    type MatchMsg,
} from './net';
import { LoopGate } from './loop-gate';
import { RTT_MAX_MS, RelayRtt, regionOfCountry, type RttRegion } from './relay-rtt';
import { PARTY_LIMITS, TURN_MS } from './party-limits';
import {
    MAX_MEMBERS,
    PartyService,
    PARTY_TIMING,
    type Member,
    type MemberIdentity,
    type Party,
    type PartyError,
    type StartPlan,
} from './party.service';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool, roomUnits } from './referee-pool';
import type { RefereeEnd } from './referee-core';
import type { PresenceEntry } from './presence-sink';
import type { RefereeOut } from './referee-host';
import { AFK_REASONS, Room, type PilotReason } from './room';
import { RoomScheduler, phaseOf } from './room-scheduler';
import type { Occupant, RelayRow, RoomStore, StoredParty, StoredRoom } from './room-store';
import { memoryMm, type MmHookFactory, type MmHooks, type MmRelayApi, type MmRoomView } from '../mm/mm-bridge';
import { MemoryMmRoomStore } from '../mm/mm-room.schema';
import { CHAMPION_IDS, isFreeChampion, rotationWeek } from '../pawlegends-catalog';

export interface RelayOptions {
    server: Server;
    store: RoomStore;
    tickets: PartyTicketService;
    /** Referee backend: workers (production) or inline (specs, harness). */
    referee?: RefereePool;
    /** Harness only (a constructor option, never env or a header): accept sockets without an Origin. */
    allowNoOrigin?: boolean;
    /** Specs only (a constructor option): the visitor IP of an upgrade (default: `PartyRelay.clientIp`). */
    clientIp?: (req: IncomingMessage) => string;
    /** Allowed origins check (default: the relay list, no dev localhost ports in production). */
    originAllowed?: (origin: string) => boolean;
    gate?: LoopGate;
    now?: () => number;
    log?: (event: string, props: Record<string, unknown>) => void;
    maxLiveRooms?: number;
    /**
     * `party.card` (D8): resolve a card the caller owns, or null. Production reads `CatRepository`
     * (party-cards.ts); without it (harness, specs) every card is refused and members keep generated names.
     */
    cards?: PartyCardResolver;
    /**
     * Quick Play (docs/plans/moba/M1A-IMPL.md §5): the matchmaker glue. Production passes MmService (Mongo records and
     * ratings); without it the relay uses an in-memory one (specs, the e2e harness). Always on (no flag).
     */
    mm?: MmHookFactory;
    /**
     * The relay owns its HTTP server (BACKEND_ROLE=relay, the GCP VM): a drain from the endpoint closes the listener so
     * the kernel sends every new connection to the new process sharing the port (LIVE-MATCH-DEPLOYS.md §8.2). Never on
     * DigitalOcean, where the same server also serves the HTTP API.
     */
    ownsServer?: boolean;
    /** Default drain deadline (ms) when a newer relay generation is ready (§4.4). */
    drainMaxMs?: number;
    /**
     * The relay pool (RELAY_POOL; the platform by default): only a newer relay of the same pool makes this one drain
     * (§4.4). During the GCP migration the DigitalOcean app and the GCP relay VM share one database: a GCP relay coming
     * up must never drain the relay that still serves players. Handoffs, pulls and the restore loop ignore pools.
     */
    pool?: string;
    /**
     * CHAMPION-STORE.md §8.1: the champions a ticketed account owns (PawlegendsSeasonService.ownedHeroes, the
     * Founders roster checked first). With it, a member picks only starters, the pick's rotation and owned
     * champions; without it (specs, the harness) every hero is open.
     */
    champions?: (accountId: string) => Promise<readonly string[]>;
}

/** CHAMPION-STORE.md §8.1: a member's owned champions are read again at most this often (after a refused pick). */
export const CHAMPS_RELOAD_MS = 5000;
/**
 * An owned (not free) champion is picked on a cached answer at most this old; an older one is read again first, so a
 * refund or a chargeback (the purchase row revoked) stops being playable online without a relay restart.
 */
export const CHAMPS_MAX_AGE_MS = 10 * 60_000;
const CHAMPS_CACHE_MAX = 20_000;

/** What started a drain (LIVE-MATCH-DEPLOYS.md §4.1); a later trigger only makes it more final. */
export type DrainTrigger = 'generation' | 'endpoint' | 'sigterm';
const TRIGGER_RANK: Record<DrainTrigger, number> = { generation: 0, endpoint: 1, sigterm: 2 };
export type RelayState = 'serving' | 'draining' | 'stopped';
const DEFAULT_POOL = 'app';

/** A card the relay may show: art, element, tier, the catalog or breed name, and the owner-only custom name. */
export interface PartyCard {
    catId: string;
    image: string;
    element: string;
    tier: string;
    catalog?: string;
    ownName?: string;
}
export type PartyCardResolver = (accountId: string, catId: string) => Promise<PartyCard | null>;

interface Sock {
    ws: WebSocket;
    id: string;
    ip: string;
    ipKey: string;
    helloed: boolean;
    helloTimer: NodeJS.Timeout | null;
    identity: MemberIdentity | null;
    /** `hello.hint`: UI defaults only (the lowest member tier, the newbie hero); never trusted for anything else. */
    hint: { maxDifficulty: string; newbie: boolean; matches?: number } | undefined;
    memberId: string | null;
    sim: { version: number; hash: string } | null;
    /** The `hello.proto` of this socket (PROTO_MIN..PROTO): no `mm.*` frame or new error code ever reaches a PROTO 1. */
    proto: number;
    /** The tab is hidden (`away` until `back`). */
    away: boolean;
    strikes: number;
    json: { tokens: number; atMs: number };
    /** Binary frames (CMD, BEAT, HASH): token bucket. */
    bin: { tokens: number; atMs: number };
    lastEchoMs: number;
    /** LATENCY-PLAN M2: the visitor's continent (`cf-ipcountry`) and when the open ping went out (0: none). */
    region: RttRegion;
    pingAtMs: number;
    /** `party.card`: last request time (each one reads the cat collection). */
    lastCardMs: number;
    lastSyncMs: number;
    /** Social rate limit (1 per 2 s, 10 per 30 s; the client mirrors it). */
    social: SocialLimiter;
    catchup: { bodies: Uint8Array[]; from: number; to: number; sentBytes: number; windowStartMs: number } | null;
    seatRoom: string | null;
    seatSlot: number;
    pingTimer: NodeJS.Timeout | null;
    closed: boolean;
    /** A `hello` waiting for its room or party to move here (LIVE-MATCH-DEPLOYS.md §5.4). */
    pending?: boolean;
    /** A `party.join` looking for its party in the store (LIVE-MATCH-DEPLOYS.md §14): one lookup at a time. */
    joining?: boolean;
}

interface LiveRoom {
    room: Room;
    party: string;
    sim: { version: number; hash: string };
    partySim: PawlegendsPartySim;
    config: StoredRoom['config'];
    epoch: number;
    occupants: Occupant[];
    /** member id → slot */
    seats: Map<string, number>;
    names: (string | null)[];
    lastCheckpointMs: number;
    ticketed: boolean;
    referee: { lagTurns: number; restored: boolean };
    ending: boolean;
    checkpointing?: boolean;
    heroSkins: (string | null)[];
    /** Identity keys and IP keys of the members seated at the start (or later claims): per-identity and per-IP room caps. */
    keys: Set<string>;
    ips: Set<string>;
    /** A Quick Play room (`match.mode: 'coop'`). */
    coop?: boolean;
    /** A casual PvP room (`match.mode: 'casual'`): humans on both teams, team-scoped social and votes. */
    casual?: { species: ['cat' | 'dog', 'cat' | 'dog'] };
    /** The checkpoint being written (a handoff waits for it, so its append never races a regular one). */
    inflight?: Promise<boolean>;
    /** The room is being handed to another relay (its clock is stopped; nothing else may end or move it). */
    moving?: boolean;
    /**
     * A restored room holds its clock until the humans seated in it are bound again, at most `restoreHoldMs`
     * (LIVE-MATCH-DEPLOYS.md §5.5): both teams are frozen the same, nobody plays against bots for a moment.
     */
    hold?: { sinceMs: number; need: Set<number>; timer: NodeJS.Timeout } | null;
}

/** Seats per team of a live room (5v5 Classic on Hearthwood: 5). */
const teamSizeOfLive = (live: { config: { map?: string } }): 3 | 5 => (live.config.map === 'hearthwood' ? 5 : 3);

const hashKey = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);
/** The /24 (IPv4) or /48 (IPv6) network of an IP, hashed: failed joins back off a whole network after its own limit. */
export const netKey = (ip: string): string => {
    const v4 = ip.replace(/^::ffff:/, '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return hashKey(`net4:${v4.split('.').slice(0, 3).join('.')}`);
    return hashKey(`net6:${ip.toLowerCase().split(':').slice(0, 3).join(':')}`);
};
const token128 = () => randomBytes(16).toString('base64url');
/** Error codes only a PROTO 2 socket understands. */
const PROTO2_ERRORS: ReadonlySet<string> = new Set(['mm_locked', 'seat_taken']);
/** Error codes and frames only a PROTO 3 socket understands (casual PvP). */
const PROTO3_ERRORS: ReadonlySet<string> = new Set(['pvp_update_required']);
const PROTO3_FRAMES: ReadonlySet<string> = new Set(['void', 'mm.accepted']);
/** How long the resume token of a backfilled leaver answers `seat_taken`. */
const MM_SEAT_TAKEN_MS = 30 * 60_000;
const roomId = () => {
    const b = randomBytes(12);
    let s = '';
    for (let i = 0; i < 12; i++) s += (b[i] % 36).toString(36);
    return s;
};

/** Logged events that also bump a server counter (MULTIPLAYER.md §10). */
const COUNTED: Readonly<Record<string, 'desyncs' | 'divergences' | 'restores' | 'refused_busy' | 'join_fail_global'>> =
    {
        mp_desync: 'desyncs',
        mp_referee_divergence: 'divergences',
        restores: 'restores',
        refused_busy: 'refused_busy',
        join_fail_global: 'join_fail_global',
    };

export class PartyRelay {
    readonly wss: WebSocketServer;
    readonly parties: PartyService;
    readonly scheduler: RoomScheduler;
    readonly referee: RefereePool;
    readonly gate: LoopGate;
    readonly rooms = new Map<string, LiveRoom>();
    /** Rooms that ended in the last 2 minutes: a client still missing the last turns can `sync` them (§3.4). */
    private readonly finished = new Map<string, { live: LiveRoom; untilMs: number }>();
    private readonly socks = new Set<Sock>();
    private readonly byMember = new Map<string, Sock>();
    /**
     * Resume tokens by token hash (O(1) on `hello`), with the member, the identity it is bound to and, for an identity
     * keyed by IP only, that IP. One live token per member (`resumeOf`); expired ones are swept.
     */
    private readonly resume = new Map<string, { member: string; identityKey: string; ipKey: string; expMs: number }>();
    private readonly resumeOf = new Map<string, string>();
    /** Resume token hashes of members whose seat a backfill took: a resume answers `seat_taken` until the time. */
    private readonly seatTaken = new Map<string, number>();
    /** Quick Play (M1A-IMPL.md §5.1): hooks into the matchmaker glue. */
    readonly mm: MmHooks;
    private readonly upgrades: number[] = [];
    /** Failed joins: global (an alert only), per identity, per IP and per network (each one backs off only itself). */
    private readonly joinFails = {
        global: [] as number[],
        byKey: new Map<string, number[]>(),
        byIp: new Map<string, number[]>(),
        byNet: new Map<string, number[]>(),
    };
    /** Parties created per IP and per identity in the last hour. */
    private readonly created = { byIp: new Map<string, number[]>(), byKey: new Map<string, number[]>() };
    private readonly pendingParty = new Set<string>();
    private partyFlush: NodeJS.Timeout | null = null;
    private partyTimer: NodeJS.Timeout | null = null;
    private readonly now: () => number;
    private readonly upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
    /** serving → draining → stopped (LIVE-MATCH-DEPLOYS.md §4.1); a generation drain can return to serving. */
    private state: RelayState = 'serving';
    private drainInfo: {
        trigger: DrainTrigger;
        startedMs: number;
        deadlineMs: number;
        done: Promise<void>;
        resolve: () => void;
        finished: boolean;
    } | null = null;
    /** When this relay first finished a restore pass; 0 before. */
    private readyAtMs = 0;
    /**
     * When a player's socket first reached this ready relay (its generation, §4.4); 0 before. Until then its row says
     * `standby` and it never makes an older relay drain: on DigitalOcean the new container is ready (Mongo up, restore
     * pass done) well before the load balancer routes to it, and an old relay draining in that gap would bounce lobby
     * players and the Quick Play queue back to itself for 10 to 30 s.
     */
    private announcedMs = 0;
    private sawSocket = false;
    private lastBeatMs = 0;
    private loopTimer: NodeJS.Timeout | null = null;
    private drainTimer: NodeJS.Timeout | null = null;
    private looping = false;
    private drainTicking = false;
    private restoreRun: Promise<string[]> | null = null;
    /** Relay rows seen by the last loop pass (fresh ones only). */
    private relayRows: RelayRow[] = [];
    /** When a party's room ended (its results tail may still sync): a draining relay moves it a little later. */
    private readonly partyEndedAt = new Map<string, number>();
    /** Party saves run one after another per party, so a handoff save is never overtaken by an older one. */
    private readonly partySaves = new Map<string, Promise<void>>();
    /** Rooms and parties a player here is waiting for (a pull, §5.4): claimable across pools. Counted per waiter. */
    private readonly pulling = new Map<string, number>();
    /** Gaps (ms) between a room's last turn on its old relay and its clock running here (restore and handoff). */
    private readonly restoreGaps: number[] = [];
    /** CHAMPION-STORE.md §8.1: owned champions per ticketed account, and when they were read. */
    private readonly champs = new Map<string, { heroes: Set<string>; atMs: number; loading: Promise<void> | null }>();

    constructor(private readonly opts: RelayOptions) {
        this.now = opts.now ?? Date.now;
        this.gate = opts.gate ?? new LoopGate();
        this.gate.start();
        this.referee = opts.referee ?? new RefereePool();
        this.referee.onRoom = m => this.onReferee(m);
        this.referee.onWorkerLost = rooms => rooms.forEach(r => this.reopenReferee(r));
        this.wss = new WebSocketServer({
            noServer: true,
            maxPayload: PARTY_LIMITS.maxPayload,
            perMessageDeflate: false,
            handleProtocols: protocols => (protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
        });
        const sim = this.liveSim();
        this.parties = new PartyService(
            {
                heroes: sim.HERO_IDS,
                heroesOf: p => this.pinnedSimOf(p)?.HERO_IDS ?? sim.HERO_IDS,
                tricks: sim.TRICK_IDS,
                difficulties: ['rookie', 'easy', 'normal', 'hard'].filter(d => sim.DIFFICULTIES.includes(d as never)),
                sideOf: h => sim.heroSideOf(h),
                newbieHero: 'clem',
                allowed: (p, m, hero) => this.championAllowed(p.rotationWeek, m.identity, hero),
            },
            {
                changed: p => {
                    this.queueParty(p.id);
                    this.mm?.onPartyChanged(p);
                },
                send: (member, msg) => this.sendJsonTo(member, msg),
                startMatch: plan => void this.startMatch(plan),
                ended: p => this.endPartyRow(p),
            },
            this.now
        );
        this.scheduler = new RoomScheduler({
            now: () => this.now(),
            setTimer: (fn, ms) => setTimeout(fn, ms),
            clearTimer: h => clearTimeout(h as NodeJS.Timeout),
        });
        this.scheduler.onAdvanced = room => this.afterAdvance(room);
        this.mm = (opts.mm ?? memoryMm({ rooms: new MemoryMmRoomStore(), ratings: null })).hooks(this.mmApi());
        this.upgradeHandler = (req, socket, head) => this.onUpgrade(req, socket, head);
        opts.server.on('upgrade', this.upgradeHandler);
        this.partyTimer = setInterval(() => {
            this.parties.tick();
            this.mm.onTick();
            this.sweep();
        }, 500);
        this.partyTimer.unref?.();
        // LIVE-MATCH-DEPLOYS.md §5.3: claim handed-off and stale rooms every second, not only at boot
        this.loopTimer = setInterval(() => void this.loop(), PARTY_LIMITS.restoreEveryMs);
        this.loopTimer.unref?.();
    }

    /** serving, draining or stopped. */
    get relayState(): RelayState {
        return this.state;
    }

    get draining(): boolean {
        return this.state !== 'serving';
    }

    private get pool(): string {
        return this.opts.pool || DEFAULT_POOL;
    }

    /**
     * CHAMPION-STORE.md §8.1: a starter, the pick's rotation week, or a champion the member's ticketed account owns.
     * A hero the catalogue does not know (a newer sim's) is open; unticketed members get starters and the rotation.
     */
    private championAllowed(week: number | undefined, identity: MemberIdentity, hero: string): boolean {
        if (!this.opts.champions || !CHAMPION_IDS.includes(hero)) return true;
        if (isFreeChampion(hero, week ?? rotationWeek(this.now()))) return true;
        const account = identity.ticketed ? identity.accountId : null;
        return !!account && !!this.champs.get(account)?.heroes.has(hero);
    }

    /** Reads an account's owned champions (at most every CHAMPS_RELOAD_MS; a failed read keeps the last answer). */
    private loadChamps(accountId: string): Promise<void> {
        const load = this.opts.champions;
        if (!load) return Promise.resolve();
        const now = this.now();
        const e = this.champs.get(accountId);
        if (e?.loading) return e.loading;
        if (e && now - e.atMs < CHAMPS_RELOAD_MS) return Promise.resolve();
        const entry = e ?? { heroes: new Set<string>(), atMs: 0, loading: null };
        entry.atMs = now;
        entry.loading = load(accountId)
            .then(heroes => {
                entry.heroes = new Set(heroes);
            })
            .catch(() => undefined)
            .finally(() => {
                entry.loading = null;
            });
        this.champs.delete(accountId);
        this.champs.set(accountId, entry);
        // oldest first: the cache never grows past its cap
        while (this.champs.size > CHAMPS_CACHE_MAX) this.champs.delete(this.champs.keys().next().value as string);
        return entry.loading;
    }

    /**
     * A hover or lock of a champion the member may not pick yet: read its account's champions again first (a purchase
     * or a Yarn unlock in this session), then apply the pick. The party service refuses it again if still locked.
     */
    private pickChamp(s: Sock, member: string, hero: string, apply: () => void): void {
        const party = this.parties.partyOf(member);
        const identity = s.identity;
        const account = identity?.ticketed ? identity.accountId : null;
        if (!this.opts.champions || !party || !identity || !account) return apply();
        const week = party.rotationWeek ?? rotationWeek(this.now());
        const owns = CHAMPION_IDS.includes(hero) && !isFreeChampion(hero, week);
        const e = this.champs.get(account);
        const stale = owns && (!e || this.now() - e.atMs >= CHAMPS_MAX_AGE_MS);
        if (!stale && this.championAllowed(party.rotationWeek, identity, hero)) return apply();
        void this.loadChamps(account).then(() => {
            if (s.memberId === member && !s.closed) apply();
        });
    }

    /** The party API of the sim the party is pinned to (its leader's), or null before the leader's hello. */
    private pinnedSimOf(p: Party): PawlegendsPartySim | null {
        const s = this.byMember.get(p.leader)?.sim;
        return (s && partySimFor(s.version, s.hash)?.party) || null;
    }

    private liveSim(): PawlegendsPartySim {
        // the live bundle's party API: the lobby offers its heroes and tricks (an older party bundle may lack some,
        // e.g. sim v13 has no v14 dogs; startMatch refuses those seats on an older pinned sim)
        for (const v of [20, 19, 18, 17, 16, 15, 14, 13, 12, 11]) {
            const s = simFor(v);
            if (s?.party) return s.party;
        }
        throw new Error('no party sim vendored');
    }

    private log(event: string, props: Record<string, unknown> = {}): void {
        const c = COUNTED[event];
        if (c) this.tally[c]++;
        this.opts.log?.(event, props);
    }

    /** Server counters (MULTIPLAYER.md §10): totals since boot, read by `counters()` (structured logs, never ids). */
    private readonly tally = { desyncs: 0, divergences: 0, restores: 0, refused_busy: 0, join_fail_global: 0 };

    // -----------------------------------------------------------------------------------------------------------
    // Upgrade and sockets

    /**
     * The visitor's IP (S1), see shared/relay-client-ip.ts: the Cloudflare header only when the request came through
     * Cloudflare (a Cloudflare peer, or the DigitalOcean ingress whose X-Forwarded-For names a Cloudflare edge) and
     * only when it is an IP; a direct caller through the ingress is keyed by the address the ingress saw.
     */
    static clientIp(req: IncomingMessage): string {
        return relayClientIp(req.socket.remoteAddress ?? '', req.headers);
    }

    private refuseUpgrade(socket: Duplex, status: number): void {
        socket.write(
            `HTTP/1.1 ${status} ${
                status === 403 ? 'Forbidden' : status === 429 ? 'Too Many Requests' : 'Service Unavailable'
            }\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
        );
        socket.destroy();
    }

    private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
        const url = req.url ?? '';
        if (url.split('?')[0] !== WS_PATH) return;
        if (this.state === 'stopped') return this.refuseUpgrade(socket, 503);
        const origin = req.headers.origin;
        if (!origin) {
            if (!this.opts.allowNoOrigin) return this.refuseUpgrade(socket, 403);
        } else if (!(this.opts.originAllowed ?? ((o: string) => isRelayOriginAllowed(o)))(origin))
            return this.refuseUpgrade(socket, 403);
        const now = this.now();
        while (this.upgrades.length && now - this.upgrades[0] > 1000) this.upgrades.shift();
        if (this.upgrades.length >= PARTY_LIMITS.upgradesPerSecond) return this.refuseUpgrade(socket, 429);
        if (this.socks.size >= PARTY_LIMITS.socketsPerInstance) return this.refuseUpgrade(socket, 503);
        let pre = 0;
        for (const s of this.socks) if (!s.helloed) pre++;
        if (pre >= PARTY_LIMITS.preHelloSockets) return this.refuseUpgrade(socket, 503);
        const ip = (this.opts.clientIp ?? PartyRelay.clientIp)(req);
        // an IPv6 host rotates through its /64: key it like the Quick Play caps (clientIpKey), not per address
        const ipKey = hashKey(`ip:${clientIpKey(ip)}`);
        let perIp = 0;
        for (const s of this.socks) if (s.ipKey === ipKey) perIp++;
        if (perIp >= PARTY_LIMITS.socketsPerIp) return this.refuseUpgrade(socket, 429);
        this.upgrades.push(now);
        this.wss.handleUpgrade(req, socket, head, ws =>
            this.onSocket(ws, ip, ipKey, regionOfCountry(req.headers['cf-ipcountry']))
        );
    }

    private onSocket(ws: WebSocket, ip: string, ipKey: string, region: RttRegion = 'unknown'): void {
        const s: Sock = {
            ws,
            id: token128(),
            ip,
            ipKey,
            bin: { tokens: PARTY_LIMITS.binary.burst, atMs: this.now() },
            lastEchoMs: -Infinity,
            region,
            pingAtMs: 0,
            lastCardMs: -Infinity,
            helloed: false,
            helloTimer: null,
            identity: null,
            hint: undefined,
            memberId: null,
            sim: null,
            strikes: 0,
            json: { tokens: PARTY_LIMITS.json.burst, atMs: this.now() },
            lastSyncMs: 0,
            proto: PROTO_MIN,
            away: false,
            social: new SocialLimiter(),
            catchup: null,
            seatRoom: null,
            seatSlot: -1,
            pingTimer: null,
            closed: false,
        };
        this.socks.add(s);
        this.sawSocket = true;
        this.announce();
        s.helloTimer = setTimeout(() => {
            if (!s.helloed) ws.close(4000, 'hello timeout');
        }, PARTY_LIMITS.helloTimeoutMs);
        ws.on('message', (data: RawData, isBinary: boolean) => {
            try {
                this.onMessage(s, data, isBinary);
            } catch (e) {
                // one bad message never takes the process down
                this.log('relay_error', { message: String((e as Error)?.message || e).slice(0, 200) });
                this.strike(s);
            }
        });
        ws.on('close', () => this.onClose(s));
        ws.on('error', () => undefined);
        ws.on('pong', () => this.onPong(s));
        s.pingTimer = setInterval(() => this.ping(s), PARTY_LIMITS.pingLobbyMs);
        s.pingTimer.unref?.();
    }

    /** A keep-alive ping; its pong is an RTT sample (LATENCY-PLAN M2). Off the tick path: a timer per socket. */
    private ping(s: Sock): void {
        if (s.ws.readyState !== WebSocket.OPEN) return;
        const now = this.now();
        // a pong still due: keep its ping's time (a newer stamp would measure a slow link short); past RTT_MAX_MS it
        // is a stall (no sample) and a new ping starts
        if (s.pingAtMs > 0 && now - s.pingAtMs <= RTT_MAX_MS) return;
        s.pingAtMs = now;
        s.ws.ping();
    }

    private onPong(s: Sock): void {
        if (s.pingAtMs <= 0) return;
        const now = this.now();
        this.rtt.add(s.region, now - s.pingAtMs, now);
        s.pingAtMs = 0;
    }

    /** Server-measured socket RTT by continent (relay-rtt.ts): no IPs, no ids. */
    private readonly rtt = new RelayRtt();

    /** The per-socket binary token bucket (40/s, burst 60). */
    private binaryAllowed(s: Sock, cost: number): boolean {
        const now = this.now();
        const b = s.bin;
        b.tokens = Math.min(
            PARTY_LIMITS.binary.burst,
            b.tokens + ((now - b.atMs) * PARTY_LIMITS.binary.perSecond) / 1000
        );
        b.atMs = now;
        if (b.tokens < cost) return false;
        b.tokens -= cost;
        return true;
    }

    private strike(s: Sock): void {
        s.strikes++;
        if (s.strikes >= PARTY_LIMITS.strikes) s.ws.close(4002, 'strikes');
    }

    private sendJson(s: Sock, msg: Record<string, unknown>): void {
        // PROTO 1 (the live build before M1a) never gets a Quick Play frame or error code
        if (
            s.proto < 2 &&
            (String(msg.t).startsWith('mm.') || (msg.t === 'error' && PROTO2_ERRORS.has(String(msg.code))))
        )
            return;
        if (
            s.proto < PROTO_PVP &&
            (PROTO3_FRAMES.has(String(msg.t)) || (msg.t === 'error' && PROTO3_ERRORS.has(String(msg.code))))
        )
            return;
        if (s.ws.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(msg));
    }

    private error(s: Sock, code: ErrorCode, retryMs?: number): void {
        this.sendJson(s, retryMs !== undefined ? { t: 'error', code, retryMs } : { t: 'error', code });
    }

    private sendJsonTo(memberId: string, msg: Record<string, unknown>): void {
        const s = this.byMember.get(memberId);
        if (s) this.sendJson(s, msg);
    }

    private onMessage(s: Sock, data: RawData, isBinary: boolean): void {
        const buf = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer);
        if (isBinary) {
            if (!s.helloed) return this.strike(s);
            // a frame from a socket without a seat (a late BEAT right after the match) costs more; a flood strikes
            if (!this.binaryAllowed(s, this.seatOf(s) ? 1 : PARTY_LIMITS.unseatedCost)) return this.strike(s);
            let f;
            try {
                f = decodeClientBinary(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
            } catch (e) {
                if (e instanceof ProtoError) return this.strike(s);
                throw e;
            }
            this.onBinary(s, f);
            return;
        }
        if (buf.length > MAX_JSON) {
            s.ws.close(4003, 'too large');
            return;
        }
        // JSON rate limit: 5 per second, burst 10 (over the limit is a strike)
        const now = this.now();
        const b = s.json;
        b.tokens = Math.min(PARTY_LIMITS.json.burst, b.tokens + ((now - b.atMs) * PARTY_LIMITS.json.perSecond) / 1000);
        b.atMs = now;
        if (b.tokens < 1) {
            this.error(s, 'rate_limited');
            return this.strike(s);
        }
        b.tokens -= 1;
        let msg: ClientJson;
        try {
            msg = parseClientJson(buf.toString('utf8'));
        } catch (e) {
            if (e instanceof ProtoError) {
                this.error(s, 'bad_message');
                return this.strike(s);
            }
            throw e;
        }
        if (!s.helloed) {
            if (msg.t !== 'hello') return this.strike(s);
            if (s.pending) return;
            void this.helloOrMove(s, msg).catch(e =>
                this.log('relay_error', { message: String((e as Error)?.message || e).slice(0, 200) })
            );
            return;
        }
        this.onJson(s, msg);
    }

    // -----------------------------------------------------------------------------------------------------------
    // hello, identity, resume

    /** Tell a socket this relay is draining: reconnect at once (to the new relay) and close it with 1012. */
    private moveSock(s: Sock, tell = true): void {
        if (s.closed) return;
        if (tell) this.error(s, 'server_moving', 250);
        s.ws.close(1012, 'moving');
    }

    /**
     * LIVE-MATCH-DEPLOYS.md §4.1 and §5.4. A draining relay welcomes only the players of a room (or a starting party)
     * still here; everyone else reconnects to the new relay. A serving relay that does not know a resume token looks
     * for its party in the store: when the party or its room is moving here, the hello waits for the claim.
     */
    private async helloOrMove(s: Sock, msg: Extract<ClientJson, { t: 'hello' }>): Promise<void> {
        const token = typeof msg.resume?.token === 'string' ? msg.resume.token : null;
        if (this.state !== 'serving') {
            const member = token ? this.resume.get(hashKey(token))?.member : undefined;
            const party = member ? this.parties.partyOf(member) : undefined;
            const live = party?.room ? this.rooms.get(party.room) : undefined;
            const here = !!party && ((!!live && !live.moving) || party.phase === 'pick' || party.phase === 'loading');
            if (this.state === 'stopped' || !here) {
                // its lobby or results party goes first, so the new relay finds it when this socket gets there
                if (this.state === 'draining' && party && !live && this.parties.byId(party.id) === party)
                    await this.handoffParty(party);
                return this.moveSock(s);
            }
            return this.hello(s, msg);
        }
        if (!token || this.resume.has(hashKey(token)) || this.seatTaken.has(hashKey(token))) return this.hello(s, msg);
        // the checks hello() makes first: an outdated client is told so without a store read
        if (msg.proto < PROTO_MIN || msg.proto > PROTO || !partySimFor(msg.sim, msg.simHash)) return this.hello(s, msg);
        s.pending = true;
        if (s.helloTimer) clearTimeout(s.helloTimer);
        let verdict: 'local' | 'retry' | 'over' | 'none' = 'none';
        try {
            verdict = await this.pull(hashKey(token));
        } catch (e) {
            this.log('relay_pull_error', { message: String((e as Error)?.message || e).slice(0, 200) });
        }
        s.pending = false;
        if (s.closed) return;
        if (verdict === 'retry') {
            this.error(s, 'room_elsewhere', 500);
            s.ws.close(4013, 'room elsewhere');
            return;
        }
        this.hello(s, msg);
        if (verdict === 'over') this.error(s, 'room_over');
    }

    /**
     * Where the party of an unknown resume token is (LIVE-MATCH-DEPLOYS.md §5.4): `local` once it was claimed here,
     * `retry` while another serving relay holds it (or the claim did not come in time), `over` when its match ended,
     * `none` when nothing is known (a fresh member, as before).
     */
    private async pull(hash: string): Promise<'local' | 'retry' | 'over' | 'none'> {
        const store = this.opts.store;
        const me = this.opts.tickets.boot;
        const nowMs = this.now();
        const party = await store.partyByResume(hash, new Date(nowMs - PARTY_LIMITS.partyHardMaxMs));
        if (!party || party.ended) return 'none';
        if (this.resume.has(hash)) return 'local';
        const owners = await store.relays(new Date(nowMs - PARTY_LIMITS.relayStaleMs));
        const ownerOf = (id: string | undefined | null) => (id ? owners.find(r => r._id === id) : undefined);
        const roomId = ((party.doc as { room?: string | null }).room ?? null) as string | null;
        if (roomId) {
            const row = await store.get(roomId);
            if (!row) return 'none';
            if (row.status !== 'live') return 'over';
            // this relay runs the room and does not know the token: not a move (a backfilled leaver, a left member)
            if (row.owner === me) return 'none';
            if (!row.handoff) {
                const owner = ownerOf(row.owner);
                if (owner && owner.state !== 'draining' && !this.ownerDead(owner, nowMs)) return 'retry';
                // a draining owner hands this room over within a poll; an owner without a row (a crash, or a relay
                // from before live-match deploys) loses its lease and the restore loop claims the room
                if (owner) await store.want(roomId, row.owner, me, new Date(nowMs));
            }
        } else if (!party.handoff) {
            if (!party.owner || party.owner === me) return 'none';
            const owner = ownerOf(party.owner);
            // §14: its owner is gone without a handoff (a crash): the party continues here, with its code and tokens
            if (!owner || this.ownerDead(owner, nowMs)) return (await this.takeOver(party)) ? 'local' : 'retry';
            if (owner.state !== 'draining') return 'retry';
            // a draining owner hands its lobby parties over within a tick
        }
        return (await this.waitHere(roomId ?? party._id, () => this.resume.has(hash))) ? 'local' : 'retry';
    }

    /**
     * Run restore passes until `here()` holds, at most `pullHoldMs` (§5.4 step 5). Meanwhile `id` (a room or a party)
     * is claimable by this relay whatever pool left it.
     */
    private async waitHere(id: string, here: () => boolean): Promise<boolean> {
        this.pulling.set(id, (this.pulling.get(id) ?? 0) + 1);
        try {
            const until = Date.now() + PARTY_LIMITS.pullHoldMs;
            while (Date.now() < until && this.state === 'serving') {
                if (here()) return true;
                await this.restore();
                if (here()) return true;
                await new Promise(r => setTimeout(r, PARTY_LIMITS.restorePullEveryMs));
            }
            return here();
        } finally {
            const n = (this.pulling.get(id) ?? 1) - 1;
            if (n > 0) this.pulling.set(id, n);
            else this.pulling.delete(id);
        }
    }

    /** A relay row whose heartbeat stopped: the process is gone (crash, SIGKILL), its parties may be taken over. */
    private ownerDead(owner: RelayRow, nowMs: number): boolean {
        return nowMs - new Date(owner.heartbeatAt).getTime() > PARTY_LIMITS.relayDeadMs;
    }

    /**
     * §14: a lobby party whose owner relay is gone (no heartbeat, no handoff) continues on this relay from its stored
     * row: same code, same members, their resume tokens. Fenced on the old owner, so two relays never both take it.
     */
    private async takeOver(row: StoredParty): Promise<boolean> {
        if (this.state !== 'serving' || !row.owner) return false;
        if (this.parties.byId(row._id)) return true;
        const taken = await this.opts.store.takeParty(row._id, row.owner, this.opts.tickets.boot, new Date(this.now()));
        if (!taken) return false;
        if (!this.parties.byId(taken._id)) this.rebuildParty(taken, null, null);
        this.log('relay_takeover_party', {});
        return true;
    }

    /** The party ended here: its row says so (serialized behind its pending saves), for joins on other relays. */
    private endPartyRow(p: Party): void {
        this.pendingParty.delete(p.id);
        const prev = this.partySaves.get(p.id) ?? Promise.resolve();
        const next = prev
            .then(() => this.opts.store.endParty(p.id, this.opts.tickets.boot, new Date(this.now())))
            .catch(() => undefined);
        this.partySaves.set(p.id, next);
        void next.finally(() => {
            if (this.partySaves.get(p.id) === next) this.partySaves.delete(p.id);
        });
    }

    /**
     * A join by code this relay does not hold (LIVE-MATCH-DEPLOYS.md §14). The party row in the store names its owner:
     * - `here`: the party is here now (claimed from a handoff, pulled from a draining owner, or taken over from a dead
     *   one), so the join runs as usual;
     * - `retry`: another live relay holds it; the client reconnects (the balancer picks again) and joins again;
     * - `ended` or `none`: what the code means everywhere.
     */
    private async findParty(code: string): Promise<'here' | 'retry' | 'ended' | 'none'> {
        const store = this.opts.store;
        const me = this.opts.tickets.boot;
        const nowMs = this.now();
        const row = await store.partyByCode(code, new Date(nowMs - PARTY_LIMITS.partyHardMaxMs));
        if (this.parties.hasCode(code)) return 'here';
        if (!row) return 'none';
        if (row.ended) return 'ended';
        if (this.state !== 'serving') return 'retry';
        if (row.handoff) {
            const claimed = await store.claimParty(row._id, me, new Date(nowMs));
            if (claimed && !this.parties.byId(claimed._id)) {
                this.rebuildParty(claimed, null, null);
                this.log('relay_restore_party', { via: 'join' });
            }
            return this.parties.hasCode(code) ? 'here' : 'retry';
        }
        // a row this relay wrote but no longer holds (the party moved away and on): nothing to find here
        if (!row.owner || row.owner === me) return 'none';
        const owners = await store.relays(new Date(nowMs - PARTY_LIMITS.relayStaleMs));
        const owner = owners.find(r => r._id === row.owner);
        const roomId = ((row.doc as { room?: string | null }).room ?? null) as string | null;
        const room = roomId ? await store.get(roomId) : null;
        if (room && room.status === 'live') {
            // a party in a match: its room moves with its players (pull, push or the restore loop), never by a join
            const roomOwner = owners.find(r => r._id === room.owner);
            if (room.owner === me) return 'none';
            if (roomOwner && !this.ownerDead(roomOwner, nowMs) && roomOwner.state !== 'draining' && !room.handoff)
                return 'retry';
            if (roomOwner && roomOwner.state === 'draining' && !room.handoff)
                await store.want(room._id, room.owner, me, new Date(nowMs));
            return (await this.waitHere(room._id, () => this.parties.hasCode(code))) ? 'here' : 'retry';
        }
        if (!owner || this.ownerDead(owner, nowMs)) return (await this.takeOver(row)) ? 'here' : 'retry';
        // a serving owner newer than this relay keeps the party (this relay drains within a second): retry there
        const mine = this.announcedMs || Number.POSITIVE_INFINITY;
        if (owner.state !== 'draining' && new Date(owner.readyAt).getTime() > mine) return 'retry';
        // a draining owner hands its lobby parties over within a tick; an older serving one drains within a second
        // (this relay is the newer generation) and then does
        return (await this.waitHere(row._id, () => this.parties.hasCode(code))) ? 'here' : 'retry';
    }

    /** `party.join` for a code this relay does not hold: look in the store, then join here or send the socket on. */
    private async joinElsewhere(s: Sock, code: string): Promise<void> {
        if (s.joining) return;
        s.joining = true;
        let where: 'here' | 'retry' | 'ended' | 'none' = 'none';
        try {
            where = await this.findParty(code);
        } catch (e) {
            this.log('relay_join_lookup_error', { message: String((e as Error)?.message || e).slice(0, 200) });
            where = 'retry';
        } finally {
            s.joining = false;
        }
        if (s.closed || !s.memberId) return;
        if (where === 'here') return this.joinHere(s, code, false);
        if (where === 'retry') {
            this.log('relay_join_elsewhere', {});
            this.error(s, 'party_elsewhere', PARTY_LIMITS.partyElsewhereRetryMs);
            s.ws.close(4013, 'party elsewhere');
            return;
        }
        this.joinFailed(s);
        this.error(s, where === 'ended' ? 'party_ended' : 'party_not_found');
    }

    /** `party.join` on this relay; a code it does not hold is looked up in the store when `lookup` (§14). */
    private joinHere(s: Sock, code: string, lookup: boolean): void {
        const member = s.memberId!;
        const p = this.parties;
        // the same person again (a closed tab, a new tab without the resume token): their own seat back. A
        // tab still holding it loses it ("Playing in another tab"), as a resume does: one seat per person,
        // and a phone whose old socket is not dead yet on the server still gets back in at once
        const twin = p.twinOf(code, s.identity!);
        if (twin && twin !== member) return this.adopt(s, twin);
        const party = p.join(code, member, s.identity!, s.hint);
        if (party === 'party_not_found' && lookup) {
            // a draining relay holds no lobby: the party is (or will be) on the new relay
            if (this.state !== 'serving') return this.moveSock(s);
            void this.joinElsewhere(s, code).catch(e =>
                this.log('relay_error', { message: String((e as Error)?.message || e).slice(0, 200) })
            );
            return;
        }
        if (typeof party === 'string') {
            if (party === 'party_not_found' || party === 'party_ended' || party === 'code_changed') this.joinFailed(s);
            return this.error(s, party as ErrorCode);
        }
        const live = party.room ? this.rooms.get(party.room) : undefined;
        if (live && party.openSeats) this.claimOpenSeat(s, live, party, member);
    }

    private hello(s: Sock, msg: Extract<ClientJson, { t: 'hello' }>): void {
        if (msg.proto < PROTO_MIN || msg.proto > PROTO) return this.error(s, 'update_required');
        if (!partySimFor(msg.sim, msg.simHash)) return this.error(s, 'update_required');
        let ticket = msg.ticket ? this.opts.tickets.verify(msg.ticket, this.now()) : null;
        // a reconnect re-sends its first hello, whose single-use ticket is spent (or expired) by then: a ticket minted
        // for the account the resume token belongs to keeps that account (the soak found ticketed players losing their
        // seat on every network drop). The token alone never names an account.
        if (msg.ticket && !ticket && msg.resume) ticket = this.resumedTicket(msg.ticket, msg.resume.token);
        if (msg.ticket && !ticket && this.opts.tickets.available) this.error(s, 'bad_ticket');
        const guestKeyHash = msg.guestKey ? hashKey(`guest:${msg.guestKey}`) : null;
        const key = ticket ? `acct:${ticket.accountId}` : guestKeyHash ? `guest:${guestKeyHash}` : `ip:${s.ipKey}`;
        const identity: MemberIdentity = {
            accountId: ticket?.accountId ?? null,
            guestKeyHash,
            key,
            ticketed: !!ticket,
            guest: ticket ? ticket.guest : true,
            ipKey: s.ipKey,
        };
        let perIdentity = 0;
        for (const o of this.socks) if (o.identity?.key === key) perIdentity++;
        if (perIdentity >= PARTY_LIMITS.socketsPerIdentity) {
            this.error(s, 'rate_limited');
            s.ws.close(4004, 'too many sockets');
            return;
        }
        s.helloed = true;
        if (s.helloTimer) clearTimeout(s.helloTimer);
        s.identity = identity;
        // CHAMPION-STORE.md §8.1: the account's champions are read before its first pick
        if (identity.ticketed && identity.accountId) void this.loadChamps(identity.accountId);
        s.hint = msg.hint;
        s.sim = { version: msg.sim, hash: msg.simHash };
        s.proto = msg.proto;
        let memberId: string | null = null;
        let lastSeq: number | undefined;
        if (msg.resume) memberId = this.findResume(msg.resume.token, identity, s.ipKey);
        if (memberId) {
            const old = this.byMember.get(memberId);
            if (old && old !== s) {
                // the tab that loses the seat is told so and does not retry
                this.sendJson(old, { t: 'error', code: 'seat_elsewhere' });
                old.memberId = null;
                old.ws.close(4005, 'seat elsewhere');
            }
        }
        // a backfill took this member's seat: say so once (PROTO 2), then a fresh member as usual
        const taken = !memberId && msg.resume ? this.seatTaken.get(hashKey(msg.resume.token)) : undefined;
        if (taken !== undefined && msg.resume) this.seatTaken.delete(hashKey(msg.resume.token));
        memberId ??= this.parties.newMemberId();
        s.memberId = memberId;
        this.byMember.set(memberId, s);
        const resumeToken = token128();
        this.setResume(memberId, hashKey(resumeToken), identity.key, s.ipKey);
        const party = this.parties.partyOf(memberId);
        if (party) {
            this.parties.setConn(memberId, 'on');
            const live = party.room ? this.rooms.get(party.room) : undefined;
            const slot = live?.seats.get(memberId);
            if (live && slot !== undefined) lastSeq = live.room.slots[slot].lastSeq;
        }
        this.sendJson(s, {
            t: 'welcome',
            proto: s.proto,
            member: memberId,
            resumeToken,
            serverMs: this.now(),
            ...(lastSeq !== undefined ? { lastSeq } : {}),
        });
        if (taken !== undefined && taken > this.now()) this.error(s, 'seat_taken');
        this.mm.onPresence(memberId, 'on');
        if (party) {
            this.sendJson(s, this.parties.view(party, memberId) as unknown as Record<string, unknown>);
            const live = party.room ? this.rooms.get(party.room) : undefined;
            if (live && live.seats.has(memberId)) this.bindSeat(s, live, memberId);
        }
    }

    /** A spent or expired ticket re-sent with a resume token issued to that ticket's account: the account, else null. */
    private resumedTicket(ticket: string, token: unknown): { accountId: string; guest: boolean } | null {
        if (typeof token !== 'string') return null;
        const minted = this.opts.tickets.mintedFor(ticket);
        const r = minted ? this.resume.get(hashKey(token)) : undefined;
        return minted && r && r.identityKey === `acct:${minted.accountId}` ? minted : null;
    }

    /** One live resume token per member: the old one is forgotten when a new one is issued. */
    private setResume(member: string, hash: string, identityKey: string, ipKey: string): void {
        const old = this.resumeOf.get(member);
        if (old) this.resume.delete(old);
        this.resume.set(hash, { member, identityKey, ipKey, expMs: this.now() + PARTY_LIMITS.lobbyResumeMs });
        this.resumeOf.set(member, hash);
    }

    private dropResume(member: string): void {
        const h = this.resumeOf.get(member);
        if (h) this.resume.delete(h);
        this.resumeOf.delete(member);
    }

    /**
     * The member a resume token names, or null. Bound to the identity it was issued to: a different identity is refused,
     * and a token issued to an identity keyed by IP only (no ticket, no guest key) works only from that IP.
     */
    private findResume(token: string, identity: MemberIdentity, ipKey: string): string | null {
        const r = this.resume.get(hashKey(token));
        if (!r) return null;
        if (r.expMs < this.now() && !this.parties.partyOf(r.member)?.room) return null;
        if (r.identityKey.startsWith('ip:')) return r.ipKey === ipKey ? r.member : null;
        return r.identityKey === identity.key ? r.member : null;
    }

    /** Every 500 ms: forget expired resume tokens, ended rooms past their grace, old join-failure and creation stamps. */
    private sweep(): void {
        const now = this.now();
        for (const [id, f] of this.finished) if (f.untilMs <= now) this.finished.delete(id);
        for (const [h, until] of this.seatTaken) if (until <= now) this.seatTaken.delete(h);
        // the results tail a draining relay waits for is 5 s: older stamps are never read again
        for (const [id, at] of this.partyEndedAt) if (now - at > 60_000) this.partyEndedAt.delete(id);
        for (const [h, r] of this.resume) {
            if (
                r.expMs >= now ||
                this.byMember.has(r.member) ||
                this.parties.partyOf(r.member) ||
                this.mm.queued(r.member)
            )
                continue;
            this.resume.delete(h);
            if (this.resumeOf.get(r.member) === h) this.resumeOf.delete(r.member);
        }
        const prune = (m: Map<string, number[]>, windowMs: number) => {
            for (const [k, list] of m) {
                while (list.length && now - list[0] > windowMs) list.shift();
                if (!list.length) m.delete(k);
            }
        };
        prune(this.joinFails.byKey, PARTY_LIMITS.joinFailPerIdentity.windowMs);
        prune(this.joinFails.byIp, PARTY_LIMITS.joinFailPerIp.windowMs);
        prune(this.joinFails.byNet, PARTY_LIMITS.joinFailPerNet.windowMs);
        prune(this.created.byIp, 3600_000);
        prune(this.created.byKey, 3600_000);
    }

    /** Test seam: sizes of the maps the sweep keeps bounded. */
    memo() {
        return {
            resume: this.resume.size,
            joinFailKeys: this.joinFails.byKey.size + this.joinFails.byIp.size + this.joinFails.byNet.size,
            retiredCodes: this.parties.retiredCount,
            partyEnded: this.partyEndedAt.size,
            partySaves: this.partySaves.size,
            pulling: this.pulling.size,
            restoreGaps: this.restoreGaps.length,
        };
    }

    private onClose(s: Sock): void {
        s.closed = true;
        this.socks.delete(s);
        if (s.helloTimer) clearTimeout(s.helloTimer);
        if (s.pingTimer) clearInterval(s.pingTimer);
        if (!s.memberId || this.byMember.get(s.memberId) !== s) return;
        this.byMember.delete(s.memberId);
        // a member without a party (or a Quick Play entry) keeps nothing to resume
        if (!this.parties.partyOf(s.memberId) && !this.mm.queued(s.memberId)) this.dropResume(s.memberId);
        this.parties.setConn(s.memberId, 'off');
        this.mm.onPresence(s.memberId, 'off');
        const live = s.seatRoom ? this.rooms.get(s.seatRoom) : undefined;
        if (live && s.seatSlot >= 0) live.room.disconnect(s.seatSlot, this.now());
    }

    // -----------------------------------------------------------------------------------------------------------
    // Party messages

    /**
     * A failed join (unknown or ended code). Counted per identity, per IP and per network; each backs off only itself.
     * The global count is an alert (`join_fail_global` past its limit), never a lock: one IP must not be able to stop
     * joins for everyone.
     */
    private joinFailed(s: Sock): void {
        const now = this.now();
        const g = this.joinFails.global;
        g.push(now);
        while (g.length && now - g[0] > PARTY_LIMITS.joinFailGlobal.windowMs) g.shift();
        const add = (m: Map<string, number[]>, k: string) => {
            const list = m.get(k) ?? [];
            list.push(now);
            if (list.length > 256) list.splice(0, list.length - 256);
            m.set(k, list);
        };
        add(this.joinFails.byKey, s.identity!.key);
        add(this.joinFails.byIp, s.ipKey);
        add(this.joinFails.byNet, netKey(s.ip));
        if (g.length >= PARTY_LIMITS.joinFailGlobal.limit) this.log('join_fail_global', { n: g.length });
    }

    /** The ms until this socket may try a code again (0: allowed). */
    private joinBlockedMs(s: Sock): number {
        const now = this.now();
        const check = (m: Map<string, number[]>, k: string, rule: { limit: number; windowMs: number }) => {
            const list = (m.get(k) ?? []).filter(t => now - t <= rule.windowMs);
            return list.length >= rule.limit ? list[list.length - rule.limit] + rule.windowMs - now : 0;
        };
        return Math.max(
            check(this.joinFails.byKey, s.identity!.key, PARTY_LIMITS.joinFailPerIdentity),
            check(this.joinFails.byIp, s.ipKey, PARTY_LIMITS.joinFailPerIp),
            check(this.joinFails.byNet, netKey(s.ip), PARTY_LIMITS.joinFailPerNet)
        );
    }

    /** Live parties with a member from this identity or IP, and parties created in the last hour by either. */
    private createRefused(s: Sock): boolean {
        const key = s.identity!.key;
        let byKey = 0;
        let byIp = 0;
        for (const x of this.parties.all()) {
            if (x.members.some(m => m.identity.key === key)) byKey++;
            if (x.members.some(m => m.identity.ipKey === s.ipKey)) byIp++;
        }
        if (byKey >= PARTY_LIMITS.partiesLivePerIdentity || byIp >= PARTY_LIMITS.partiesLivePerIp) return true;
        const now = this.now();
        const hour = (m: Map<string, number[]>, k: string) => (m.get(k) ?? []).filter(t => now - t < 3600_000).length;
        return (
            hour(this.created.byKey, key) >= PARTY_LIMITS.partiesPerHourPerIdentity ||
            hour(this.created.byIp, s.ipKey) >= PARTY_LIMITS.partiesPerHourPerIp
        );
    }

    private countCreate(s: Sock): void {
        const now = this.now();
        for (const [m, k] of [
            [this.created.byKey, s.identity!.key],
            [this.created.byIp, s.ipKey],
        ] as const) {
            const list = m.get(k) ?? [];
            list.push(now);
            if (list.length > 64) list.shift();
            m.set(k, list);
        }
    }

    private onJson(s: Sock, msg: ClientJson): void {
        const member = s.memberId!;
        const p = this.parties;
        // LIVE-MATCH-DEPLOYS.md §4.1 step 4: a draining relay starts no new room. A start or a rematch vote from a party
        // without a live room here (a lobby inside the first drain tick, a results screen inside its 5 s tail) moves the
        // party to the new relay instead (server_moving, 1012); the leader starts it there.
        if (this.state === 'draining' && (msg.t === 'party.start' || (msg.t === 'vote' && msg.kind === 'rematch'))) {
            const party = p.partyOf(member);
            if (
                party &&
                !(party.room && this.rooms.has(party.room)) &&
                party.phase !== 'pick' &&
                party.phase !== 'loading'
            ) {
                void this.handoffParty(party).catch(e =>
                    this.log('relay_error', { message: String((e as Error)?.message || e).slice(0, 200) })
                );
                return;
            }
        }
        switch (msg.t) {
            case 'hello':
                return this.strike(s);
            case 'party.create': {
                if (this.mm.queued(member)) this.mm.onJson(member, { t: 'mm.leave' });
                // leaving the old party first is part of create: count only the parties this create would keep
                const mine = p.partyOf(member);
                if (mine) {
                    this.leaveSeat(s, true);
                    p.leave(member);
                }
                if (this.createRefused(s)) return this.error(s, 'rate_limited', 60_000);
                this.countCreate(s);
                p.create(member, s.identity!, msg.difficulty, s.hint);
                return;
            }
            case 'party.join': {
                const wait = this.joinBlockedMs(s);
                if (wait > 0) return this.error(s, 'rate_limited', Math.min(wait, PARTY_LIMITS.joinFailPerIp.windowMs));
                if (this.mm.queued(member)) this.mm.onJson(member, { t: 'mm.leave' });
                return this.joinHere(s, msg.code, true);
            }
            case 'party.leave':
                if (this.mm.queued(member)) this.mm.onJson(member, { t: 'mm.leave' });
                return this.leaveParty(member);
            case 'party.kick':
                return void p.kick(member, msg.member);
            case 'party.lead':
                return p.lead(member, msg.member);
            case 'party.set':
                return p.set(member, msg);
            case 'party.newcode':
                return p.newCodeFor(member);
            case 'party.card':
                return void this.card(s, msg.catId);
            case 'party.start': {
                const r = p.start(member);
                if (r === 'pick' && this.gate.busy()) {
                    this.error(s, 'server_busy', 15_000);
                    this.log('refused_busy', {});
                }
                return;
            }
            case 'party.nudge':
                return p.nudge(member, msg.member);
            case 'pick.hover':
                return this.pickChamp(s, member, msg.hero, () => p.hover(member, msg.hero));
            case 'pick.lock':
                return this.pickChamp(s, member, msg.hero, () => p.lock(member, msg.hero, msg.trick));
            case 'pick.unlock':
                return p.unlock(member);
            case 'load':
                return p.load(member, msg.pct);
            case 'loaded': {
                p.loaded(member);
                const live = this.seatOf(s);
                if (live) live.room.loaded(s.seatSlot);
                return;
            }
            case 'vote': {
                if (msg.kind === 'rematch') return p.rematch(member, msg.yes);
                const live = this.seatOf(s);
                if (live) live.room.castVote(s.seatSlot, msg.kind, msg.yes, this.now());
                return;
            }
            case 'social':
                return this.social(s, msg);
            case 'sync': {
                const live = this.seatOf(s) ?? this.finishedSeat(s);
                if (!live) return;
                const now = this.now();
                if (now - s.lastSyncMs < PARTY_LIMITS.syncEveryMs && s.lastSyncMs !== 0) return;
                s.lastSyncMs = now;
                if (msg.fromTurn > live.room.nextTurn && this.rooms.get(live.room.id) === live) {
                    // the client applied turns this log does not hold: the room was restored from a checkpoint after
                    // a crash (LIVE-MATCH-DEPLOYS.md §5.6). Rebuild it from turn 0 of the restored log.
                    this.sendJson(s, { t: 'resync', reason: 'gap' });
                    this.startCatchup(s, live, 0);
                    this.log('relay_rollback_resync', { ahead: msg.fromTurn - live.room.nextTurn });
                    return;
                }
                this.startCatchup(s, live, msg.fromTurn);
                return;
            }
            case 'away': {
                const live = this.seatOf(s);
                if (live) live.room.away(s.seatSlot);
                s.away = true;
                p.setConn(member, 'away');
                this.mm.onPresence(member, 'away');
                return;
            }
            case 'back': {
                const live = this.seatOf(s);
                s.away = false;
                p.setConn(member, 'on');
                if (live) live.room.back(s.seatSlot, this.now());
                this.mm.onPresence(member, 'on');
                return;
            }
            case 'bye':
                return this.leaveSeat(s);
            case 'mm.join':
            case 'mm.leave':
            case 'mm.side':
            case 'mm.backfill':
            case 'mm.back':
            case 'mm.accept':
                // PROTO 3 only (casual PvP)
                if (msg.t === 'mm.accept' && s.proto < PROTO_PVP) {
                    this.error(s, 'bad_message');
                    return this.strike(s);
                }
                // PROTO 2 only: a PROTO 1 socket sending one is a malformed frame
                if (s.proto < 2) {
                    this.error(s, 'bad_message');
                    return this.strike(s);
                }
                return this.mm.onJson(member, msg as unknown as { t: string } & Record<string, unknown>);
        }
    }

    /** `party.leave` (and a stranger leaving a Quick Play party): the seat, the party, the resume token, a `left` frame. */
    private leaveParty(member: string): void {
        const s = this.byMember.get(member);
        if (s) this.leaveSeat(s, true);
        this.parties.leave(member);
        this.dropResume(member);
        if (!s) return;
        this.sendJson(s, {
            t: 'party',
            code: '',
            phase: 'lobby',
            leader: '',
            difficulty: '',
            openSeats: false,
            locked: false,
            members: [],
            you: member,
            left: true,
        });
    }

    /**
     * The socket becomes `twin`, a member of the same identity whose socket is gone: a new `welcome` (member id and a
     * fresh resume token), the party view and, mid-match, the seat (the client catches up and takes its hero back).
     */
    private adopt(s: Sock, twin: string): void {
        const holder = this.byMember.get(twin);
        if (holder && holder !== s) {
            this.sendJson(holder, { t: 'error', code: 'seat_elsewhere' });
            holder.memberId = null;
            holder.seatRoom = null;
            holder.seatSlot = -1;
            holder.ws.close(4005, 'seat elsewhere');
        }
        const old = s.memberId!;
        if (this.parties.partyOf(old)) {
            this.leaveSeat(s, true);
            this.parties.leave(old);
        }
        if (this.byMember.get(old) === s) this.byMember.delete(old);
        this.dropResume(old);
        s.memberId = twin;
        this.byMember.set(twin, s);
        const resumeToken = token128();
        this.setResume(twin, hashKey(resumeToken), s.identity!.key, s.ipKey);
        const party = this.parties.partyOf(twin);
        const live = party?.room ? this.rooms.get(party.room) : undefined;
        const slot = live?.seats.get(twin);
        this.sendJson(s, {
            t: 'welcome',
            proto: s.proto,
            member: twin,
            resumeToken,
            serverMs: this.now(),
            ...(live && slot !== undefined ? { lastSeq: live.room.slots[slot].lastSeq } : {}),
        });
        this.parties.setConn(twin, 'on');
        if (!party) return;
        this.sendJson(s, this.parties.view(party, twin) as unknown as Record<string, unknown>);
        if (live && slot !== undefined) this.bindSeat(s, live, twin);
        this.log('party_rejoin_link', {});
    }

    /** `party.card` (D8): only a card the ticketed account owns; peers never get its catId or custom name. */
    private async card(s: Sock, catId: string | null): Promise<void> {
        const member = s.memberId!;
        if (catId === null) return this.parties.setCard(member, null);
        const account = s.identity?.ticketed ? s.identity.accountId : null;
        if (!account || !this.opts.cards) return;
        // one lookup per 2 s per socket, and none for the card already worn
        const now = this.now();
        if (now - s.lastCardMs < PARTY_LIMITS.cardEveryMs) return;
        if (this.parties.member(member)?.card?.catId === catId) return;
        s.lastCardMs = now;
        let card: PartyCard | null = null;
        try {
            card = await this.opts.cards(account, catId);
        } catch {
            card = null;
        }
        if (!card || s.memberId !== member) return;
        this.parties.setCard(member, card);
    }

    private social(s: Sock, msg: Extract<ClientJson, { t: 'social' }>): void {
        const live = this.seatOf(s);
        if (!live) return;
        // D8: enumerated ids only (the quick lines and emotes of src/data/social.ts, the ping kinds); anything else is
        // dropped without a strike (an older client may know fewer lines)
        if (!socialIdOk(msg.kind, msg.id)) return;
        const now = this.now();
        if (!s.social.allow(now)) return;
        const out: Record<string, unknown> = {
            t: 'social',
            kind: msg.kind,
            id: msg.id,
            from: s.memberId,
            slot: s.seatSlot,
        };
        if (msg.x !== undefined && msg.y !== undefined) {
            const p = clampSocialPoint(msg.x, msg.y, live.config.map);
            out.x = p.x;
            out.y = p.y;
        }
        const n = teamSizeOfLive(live);
        if (msg.target !== undefined && msg.target < 2 * n) out.target = msg.target;
        // casual PvP (V16.md §4.2): pings and quick chat reach the own team only; emotes reach everyone (the client
        // has an opponent mute-all)
        const team = teamOfSlot(s.seatSlot, n);
        for (const o of this.socketsOf(live)) {
            if (live.casual && msg.kind !== 'emote' && teamOfSlot(o.seatSlot, n) !== team) continue;
            this.sendJson(o, out);
        }
    }

    private queueParty(partyId: string): void {
        this.pendingParty.add(partyId);
        if (this.partyFlush) return;
        // coalesced to at most 10 Hz per party
        this.partyFlush = setTimeout(() => {
            this.partyFlush = null;
            for (const id of this.pendingParty) {
                const party = this.parties.byId(id);
                if (party)
                    for (const m of party.members)
                        this.sendJsonTo(m.id, this.parties.view(party, m.id) as unknown as Record<string, unknown>);
                if (party) void this.saveParty(party);
            }
            this.pendingParty.clear();
        }, 1000 / PARTY_LIMITS.partyBroadcastHz);
        this.partyFlush.unref?.();
    }

    /** Persist a party (best effort), one save at a time per party; `handoff` hands a lobby party to the next relay. */
    private saveParty(party: Party, handoff = false): Promise<void> {
        const prev = this.partySaves.get(party.id) ?? Promise.resolve();
        const next = prev.then(() => this.writeParty(party, handoff));
        this.partySaves.set(party.id, next);
        void next.finally(() => {
            if (this.partySaves.get(party.id) === next) this.partySaves.delete(party.id);
        });
        return next;
    }

    private async writeParty(party: Party, handoff: boolean): Promise<void> {
        // a party that left this relay (handed over) is never written again from here
        if (!handoff && this.parties.byId(party.id) !== party) return;
        try {
            await this.opts.store.saveParty({
                owner: this.opts.tickets.boot,
                handoff,
                _id: party.id,
                code: party.code,
                doc: {
                    leader: party.leader,
                    difficulty: party.difficulty,
                    openSeats: party.openSeats,
                    locked: party.locked,
                    room: party.room ?? null,
                    // Quick Play: strangers and the fixed side survive a restore (the queue itself does not)
                    ...(party.mm
                        ? {
                              mm: {
                                  match: party.mm.match,
                                  side: party.mm.side,
                                  strangers: [...party.mm.strangers],
                                  host: party.mm.host,
                                  ...(party.mm.casual ? { casual: party.mm.casual } : {}),
                              },
                          }
                        : {}),
                    members: party.members.map(m => ({
                        id: m.id,
                        accountId: m.identity.accountId,
                        guestKeyHash: m.identity.guestKeyHash,
                        key: m.identity.key,
                        ticketed: m.identity.ticketed,
                        guest: m.identity.guest,
                        lastHero: m.lastHero,
                        lastTrick: m.lastTrick,
                        slot: m.slot,
                        resume: this.resumeOf.get(m.id),
                        ipKey: m.identity.ipKey,
                    })),
                },
                updatedAt: new Date(this.now()),
            });
        } catch {
            /* persistence is best effort for parties */
        }
    }

    // -----------------------------------------------------------------------------------------------------------
    // Rooms

    /** Live rooms seating this identity (account, guest key or IP-keyed) or anyone from this IP. */
    private liveRoomsOf(key: string, ipKey?: string): { key: number; ip: number } {
        let byKey = 0;
        let byIp = 0;
        for (const r of this.rooms.values()) {
            if (!r.room.live) continue;
            if (r.keys.has(key)) byKey++;
            if (ipKey && r.ips.has(ipKey)) byIp++;
        }
        return { key: byKey, ip: byIp };
    }

    private async startMatch(plan: StartPlan): Promise<void> {
        const party = plan.party;
        const leader = party.members.find(m => m.id === party.leader)!;
        const leaderSock = this.byMember.get(leader.id);
        const sim = leaderSock?.sim;
        const maxRooms = this.opts.maxLiveRooms ?? PARTY_LIMITS.maxLiveRooms;
        const ticketed = party.members.some(m => m.identity.ticketed);
        const unticketedRooms = [...this.rooms.values()].filter(r => !r.ticketed && r.room.live).length;
        const refuse = () => {
            for (const m of party.members) this.sendJsonTo(m.id, { t: 'error', code: 'server_busy', retryMs: 15_000 });
            this.parties.matchEnded(party.id);
            this.log('refused_busy', {});
        };
        // capacity in referee units (MAP-5V5.md §9.2): a 5v5 Hearthwood room is 3, a 3v3 room 1
        const units = roomUnits(plan.pvp?.map ? { map: plan.pvp.map } : undefined);
        if (!sim || this.state === 'stopped' || this.gate.busy() || this.liveUnits() + units > maxRooms)
            return refuse();
        if (!ticketed && unticketedRooms >= maxRooms * PARTY_LIMITS.unticketedRoomShare) return refuse();
        // every member, guests included: one live room per identity, two per IP (a party from one home shares an IP,
        // so the IP rule counts rooms, not seats)
        const ipsHere = new Set(party.members.map(m => m.identity.ipKey).filter((x): x is string => !!x));
        if (
            party.members.some(
                m =>
                    !m.identity.key.startsWith('ip:') &&
                    this.liveRoomsOf(m.identity.key).key >= PARTY_LIMITS.roomsLivePerIdentity
            )
        )
            return refuse();
        for (const ip of ipsHere) if (this.liveRoomsOf('', ip).ip >= PARTY_LIMITS.roomsLivePerIp) return refuse();
        const entry = partySimFor(sim.version, sim.hash);
        if (!entry?.party) return refuse();
        // every member must run the leader's sim (the party is pinned to it)
        for (const m of party.members) {
            const ms = this.byMember.get(m.id)?.sim;
            if (ms && (ms.version !== sim.version || ms.hash !== sim.hash))
                this.sendJsonTo(m.id, { t: 'error', code: 'update_required' });
        }
        const ps = entry.party;
        // the lobby only offers the pinned sim's heroes (PartyRules.heroesOf), so a seat with a hero that sim lacks is a
        // bug or a forged lock: refuse the room. Only members on an older sim than the live one are told to update; a
        // member already on the live sim (a v14 member in a v13 leader's party) gets a plain, non-fatal refusal.
        if (plan.seats.some(seat => !ps.HERO_IDS.includes(seat.hero as never))) {
            for (const m of party.members) {
                const ms = this.byMember.get(m.id)?.sim;
                const code = !ms || ms.version < LIVE_SIM_VERSION ? 'update_required' : 'bad_message';
                this.sendJsonTo(m.id, { t: 'error', code });
            }
            this.parties.matchEnded(party.id);
            this.log('refused_old_sim', { simVersion: sim.version });
            return;
        }
        // CHAMPION-STORE.md §8.2: every human seat again (a lock was checked; a forged or stale one refuses the room,
        // never a silent swap). Pilots and bots pick any champion. A seat that fails on this relay's cache (a party
        // restored or handed off here before its members' champions were read) reads its account once first.
        const failing = () => party.members.filter(m => !!m.hero && !this.parties.heroAllowedFor(party, m, m.hero));
        const stale = failing()
            .map(m => (m.identity.ticketed ? m.identity.accountId : null))
            .filter((a): a is string => !!a);
        if (stale.length) {
            await Promise.all(stale.map(a => this.loadChamps(a)));
            if (party.ended || (this.state as string) === 'stopped') return;
        }
        if (failing().length) {
            for (const m of party.members) this.sendJsonTo(m.id, { t: 'error', code: 'bad_message' });
            this.parties.matchEnded(party.id);
            this.log('refused_hero_locked', {});
            return;
        }
        // casual PvP: the pinned sim must run PvP, and each team must be one species (V16.md §3.1.6, §4.2); 5v5
        // Classic also needs a sim with the Hearthwood map (sim v19+, MAP-5V5.md §9.1)
        const map = plan.pvp?.map;
        const n = map === 'hearthwood' ? 5 : 3;
        if (plan.pvp) {
            const teamsOk = plan.seats.every(
                seat => seat.slot < 2 * n && ps.heroSideOf(seat.hero) === plan.pvp!.species[teamOfSlot(seat.slot, n)]
            );
            const mapOk = !map || !!ps.MAP_IDS?.includes(map);
            if (!ps.PVP_SINCE || sim.version < ps.PVP_SINCE || !mapOk || !teamsOk) {
                for (const m of party.members)
                    this.sendJsonTo(m.id, { t: 'error', code: teamsOk ? 'pvp_update_required' : 'bad_message' });
                this.parties.matchEnded(party.id);
                this.log('refused_pvp', { simVersion: sim.version, teams: teamsOk });
                return;
            }
        }
        const { picks, tricks } = map
            ? ps.fillPicksParty(plan.seed, plan.seats as never, map)
            : ps.fillPicksParty(plan.seed, plan.seats as never);
        const config: StoredRoom['config'] = {
            seed: plan.seed,
            picks: picks as string[],
            tricks: tricks as string[],
            difficulty: plan.difficulty,
            humans: plan.humans,
            ...(plan.pvp ? { mode: 'pvp' as const, fillDifficulty: plan.pvp.fillDifficulty } : {}),
            ...(map ? { map } : {}),
        };
        const id = roomId();
        const now = this.now();
        const occupants: Occupant[] = party.members.map(m => ({
            slot: m.slot!,
            accountId: m.identity.accountId,
            guestKeyHash: m.identity.guestKeyHash,
            name: m.name,
            ticketed: m.identity.ticketed,
        }));
        const seats = new Map<string, number>(party.members.map(m => [m.id, m.slot!]));
        const names: (string | null)[] = new Array(2 * n).fill(null);
        for (const m of party.members) names[m.slot!] = m.name;
        const startMs = now + PARTY_TIMING.startInMs;
        const room = new Room(
            {
                id,
                humans: plan.humans,
                occupied: plan.occupied,
                difficulty: plan.difficulty,
                forfeitFrom: ps.forfeitFromOf(plan.pvp ? 'pvp' : plan.difficulty),
                nowMs: now,
                startMs,
                phaseMs: phaseOf(id),
                pvp: !!plan.pvp,
                premade: plan.pvp?.premade,
                teamSize: n,
            },
            this.roomIO(id)
        );
        const live: LiveRoom = {
            room,
            party: party.id,
            sim: { version: sim.version, hash: sim.hash },
            partySim: ps,
            config,
            epoch: 0,
            occupants,
            seats,
            names,
            lastCheckpointMs: now,
            ticketed,
            referee: { lagTurns: 0, restored: true },
            ending: false,
            heroSkins: Array.from(
                { length: 2 * n },
                (_, slot) => party.members.find(m => m.slot === slot)?.card?.image ?? null
            ),
            keys: new Set(party.members.map(m => m.identity.key)),
            ips: ipsHere,
            ...(party.mm && !plan.pvp ? { coop: true } : {}),
            ...(plan.pvp ? { casual: { species: plan.pvp.species } } : {}),
        };
        this.rooms.set(id, live);
        party.room = id;
        try {
            await this.opts.store.create({
                _id: id,
                party: party.id,
                simVersion: sim.version,
                simHash: sim.hash,
                config,
                occupants,
                chunks: [],
                lastTurn: 0,
                lastSeq: room.slots.map(() => 0),
                pilotTicks: {},
                openUnclaimedAt1800: false,
                unscored: this.opts.tickets.available ? null : 'no_secret',
                status: 'live',
                verdict: null,
                owner: this.opts.tickets.boot,
                epoch: 0,
                handoff: false,
                resume: {},
                createdAt: new Date(now),
                updatedAt: new Date(now),
            });
        } catch {
            /* the room still plays; it is unscored without a stored log */
            room.unscored = 'store';
        }
        if (!this.opts.tickets.available) room.unscored = 'no_secret';
        this.referee.open(id, sim.version, sim.hash, config);
        this.scheduler.add(room);
        for (const m of party.members) {
            const s = this.byMember.get(m.id);
            if (s) this.bindSeat(s, live, m.id, startMs - now);
        }
        this.mm.onRoomStarted(id, party);
        this.log('mp_match_start', {
            humans: plan.humans.length,
            difficulty: plan.difficulty,
            ...(party.mm ? { mode: plan.pvp ? 'casual' : 'coop' } : {}),
            ...(map ? { map, units } : {}),
        });
    }

    /** Referee capacity units of the rooms held now (MAP-5V5.md §9.2: Hearthwood 3, Crossing 1). */
    private liveUnits(): number {
        let u = 0;
        for (const r of this.rooms.values()) u += roomUnits(r.config);
        return u;
    }

    /**
     * Sim v19: point the shared sim module at this room's map before a decode on the main thread (`decodeCommand`
     * reads the bound map's bounds and ping kinds; a Hearthwood move to y = 100 m is out of Crossing's 60 m).
     * `checkPvpShape` of a stub record binds the map and stops at the seats; nothing else here runs a match.
     */
    private bindMapOf(live: LiveRoom): void {
        if (!live.partySim.MAP_IDS || !live.partySim.checkPvpShape) return;
        live.partySim.checkPvpShape({
            v: 3,
            mode: 'pvp',
            simVersion: live.sim.version,
            seed: 0,
            difficulty: 'hard',
            fillDifficulty: ['normal', 'normal'],
            ...(live.config.map ? { map: live.config.map } : {}),
            humans: [],
        });
    }

    private matchMsg(live: LiveRoom, slot: number, startInMs: number): MatchMsg {
        return {
            t: 'match',
            room: live.room.id,
            config: live.config,
            cosmetics: { heroSkins: live.heroSkins },
            you: { slot },
            names: live.names,
            turnTicks: TURN_TICKS,
            startTurn: 0,
            startInMs: Math.max(0, startInMs),
            lastSeq: live.room.slots[slot]?.lastSeq ?? 0,
            simVersion: live.sim.version,
            ...(live.coop ? { mode: 'coop' as const } : {}),
            ...(live.casual ? { mode: 'casual' as const, species: live.casual.species } : {}),
            ...(live.config.map ? { map: live.config.map, teamSize: teamSizeOfLive(live) } : {}),
        };
    }

    private bindSeat(s: Sock, live: LiveRoom, memberId: string, startInMs = 0): void {
        const slot = live.seats.get(memberId);
        if (slot === undefined) return;
        s.seatRoom = live.room.id;
        s.seatSlot = slot;
        if (s.pingTimer) clearInterval(s.pingTimer);
        s.pingTimer = setInterval(() => this.ping(s), PARTY_LIMITS.pingMatchMs);
        s.pingTimer.unref?.();
        live.room.connect(slot, this.now());
        this.sendJson(s, this.matchMsg(live, slot, startInMs) as unknown as Record<string, unknown>);
        if (live.hold) {
            live.hold.need.delete(slot);
            if (live.hold.need.size === 0) this.releaseHold(live);
        }
    }

    private claimOpenSeat(s: Sock, live: LiveRoom, party: Party, memberId: string, want?: number): void {
        // P10: the lowest empty piloted slot (a Quick Play backfill names its slot)
        const taken = new Set(live.seats.values());
        const slot = live.room.humans.find(
            h => !taken.has(h) && live.room.slots[h].reason === 'open' && (want === undefined || h === want)
        );
        if (slot === undefined) return;
        const key = s.identity!.key;
        if (!key.startsWith('ip:') && this.liveRoomsOf(key).key >= PARTY_LIMITS.roomsLivePerIdentity) return;
        const m = party.members.find(x => x.id === memberId);
        if (m) m.slot = slot;
        live.seats.set(memberId, slot);
        live.names[slot] = m?.name ?? null;
        // a seat left mid-match is claimed again: the newcomer replaces the old occupant row
        live.occupants = live.occupants.filter(o => o.slot !== slot);
        live.occupants.push({
            slot,
            accountId: s.identity!.accountId,
            guestKeyHash: s.identity!.guestKeyHash,
            name: m?.name ?? '',
            ticketed: s.identity!.ticketed,
        });
        live.keys.add(s.identity!.key);
        live.ips.add(s.ipKey);
        this.bindSeat(s, live, memberId);
        for (const other of live.seats.keys())
            if (other !== memberId)
                this.sendJsonTo(other, { t: 'slot', slot, reason: 'back', joined: true, name: m?.name });
    }

    /**
     * `bye` (back to the title, the party kept) disconnects the seat; `party.leave` (`left`) also gives it up: the member
     * gets no more room messages, the seat is open again and the others see "left", not "dropped".
     */
    private leaveSeat(s: Sock, left = false): void {
        const live = this.seatOf(s);
        if (!live) return;
        if (left) {
            live.seats.delete(s.memberId!);
            live.names[s.seatSlot] = null;
            live.room.vacate(s.seatSlot, this.now(), !!this.parties.byId(live.party)?.openSeats);
            this.releaseKeys(live, s.identity);
        } else live.room.disconnect(s.seatSlot, this.now());
        s.seatRoom = null;
        s.seatSlot = -1;
    }

    /**
     * A seat given up for good (left, evicted): its identity and IP stop counting toward the live-room caps, unless
     * another seat of the room still has them. Without this a leaver could not queue again until the room ended.
     */
    private releaseKeys(live: LiveRoom, identity: MemberIdentity | null | undefined): void {
        if (!identity) return;
        const party = this.parties.byId(live.party);
        const seated = [...live.seats.keys()]
            .map(id => party?.members.find(m => m.id === id)?.identity ?? this.byMember.get(id)?.identity)
            .filter((x): x is MemberIdentity => !!x);
        if (!seated.some(i => i.key === identity.key)) live.keys.delete(identity.key);
        if (identity.ipKey && !seated.some(i => i.ipKey === identity.ipKey)) live.ips.delete(identity.ipKey);
    }

    /** The ended room this socket sat in (kept 2 minutes for the tail catch-up), or null. */
    private finishedSeat(s: Sock): LiveRoom | null {
        if (!s.seatRoom) return null;
        const f = this.finished.get(s.seatRoom);
        return f && f.live.seats.get(s.memberId ?? '') === s.seatSlot ? f.live : null;
    }

    private seatOf(s: Sock): LiveRoom | null {
        if (!s.seatRoom) return null;
        const live = this.rooms.get(s.seatRoom);
        return live && live.seats.get(s.memberId ?? '') === s.seatSlot ? live : null;
    }

    private socketsOf(live: LiveRoom): Sock[] {
        const out: Sock[] = [];
        for (const member of live.seats.keys()) {
            const s = this.byMember.get(member);
            if (s && s.seatRoom === live.room.id) out.push(s);
        }
        return out;
    }

    private roomIO(id: string) {
        return {
            turn: (frame: Uint8Array, body: Uint8Array) => {
                const live = this.rooms.get(id);
                if (!live) return;
                for (const s of this.socketsOf(live)) {
                    if (s.catchup) continue; // in catch-up: the live turn arrives in the next chunk
                    if (s.ws.bufferedAmount > PARTY_LIMITS.backpressureCloseBytes) {
                        s.ws.close(4001, 'backpressure');
                        continue;
                    }
                    if (s.ws.readyState === WebSocket.OPEN) s.ws.send(frame);
                }
                this.referee.turn(id, body);
            },
            json: (slot: number | null, msg: Record<string, unknown>) => {
                const live = this.rooms.get(id);
                if (!live) return;
                for (const s of this.socketsOf(live)) if (slot === null || s.seatSlot === slot) this.sendJson(s, msg);
            },
            catchup: (slot: number, fromTurn: number) => {
                const live = this.rooms.get(id);
                if (!live) return;
                for (const [member, seat] of live.seats) {
                    if (seat !== slot) continue;
                    const s = this.byMember.get(member);
                    if (s) this.startCatchup(s, live, fromTurn);
                }
            },
            log: (event: string, props: Record<string, unknown>) =>
                this.log(event, { room_h: hashKey(id).slice(0, 8), ...props }),
        };
    }

    // -----------------------------------------------------------------------------------------------------------
    // Catch-up (paced, §3.4)

    private startCatchup(s: Sock, live: LiveRoom, fromTurn: number): void {
        const from = Math.max(0, Math.min(fromTurn, live.room.nextTurn));
        s.catchup = {
            bodies: live.room.bodiesFrom(from),
            from,
            to: live.room.nextTurn,
            sentBytes: s.catchup?.sentBytes ?? 0,
            windowStartMs: s.catchup?.windowStartMs ?? this.now(),
        };
        this.pumpCatchup(s, live);
    }

    private pumpCatchup(s: Sock, live: LiveRoom): void {
        const c = s.catchup;
        if (!c || s.closed) return;
        const now = this.now();
        if (now - c.windowStartMs >= 60_000) {
            c.windowStartMs = now;
            c.sentBytes = 0;
        }
        while (
            c &&
            s.ws.bufferedAmount < PARTY_LIMITS.catchupSendBelowBytes &&
            c.sentBytes < PARTY_LIMITS.catchupBytesPerMinute
        ) {
            // refresh with the turns closed meanwhile
            if (c.bodies.length === 0 && c.to < live.room.nextTurn) {
                c.bodies = live.room.bodiesFrom(c.to);
                c.from = c.to;
                c.to = live.room.nextTurn;
            }
            let size = 0;
            let n = 0;
            while (n < c.bodies.length && size + c.bodies[n].length <= CATCHUP_CHUNK) size += c.bodies[n++].length;
            const parts = c.bodies.splice(0, n);
            const buf = new Uint8Array(size);
            let at = 0;
            for (const p of parts) {
                buf.set(p, at);
                at += p.length;
            }
            const from = c.from;
            c.from += n;
            const last = c.bodies.length === 0 && c.from >= live.room.nextTurn;
            s.ws.send(encodeCatchup(from, c.from, last, buf));
            c.sentBytes += buf.length;
            if (last) {
                s.catchup = null;
                return;
            }
        }
        setTimeout(() => this.pumpCatchup(s, live), 20).unref?.();
    }

    // -----------------------------------------------------------------------------------------------------------
    // Binary frames

    private onBinary(s: Sock, f: ReturnType<typeof decodeClientBinary>): void {
        const live = this.seatOf(s);
        if (!live) return;
        const now = this.now();
        if (f.type === Frame.CMD) {
            // the full sim decode runs BEFORE the command can enter a turn: bytes every client and the referee would
            // throw on (a cast slot 4, a bad talent, a ping kind out of range) never reach a TURN
            try {
                this.bindMapOf(live);
                live.partySim.decodeCommand(f.f.cmd);
            } catch {
                return this.strike(s);
            }
            live.room.heard(s.seatSlot, now);
            const r = live.room.intake(s.seatSlot, f.f.seq, f.f.cmd, now);
            if (r === 'bad_op') this.strike(s);
        } else if (f.type === Frame.BEAT) {
            live.room.beat(s.seatSlot, f.f.lastTurn, now);
            if (s.ws.readyState === WebSocket.OPEN && now - s.lastEchoMs >= PARTY_LIMITS.echoEveryMs) {
                s.lastEchoMs = now;
                s.ws.send(encodeEcho({ clientMs: f.f.clientMs, serverMs: now >>> 0 }));
            }
        } else if (f.type === Frame.HASH) {
            live.room.heard(s.seatSlot, now);
            // an off-cadence or repeated mark costs the socket's budget again (a HASH flood strikes)
            if (!live.room.clientHash(s.seatSlot, f.f.tick, f.f.hash) && !this.binaryAllowed(s, 2)) this.strike(s);
        }
    }

    // -----------------------------------------------------------------------------------------------------------
    // Referee

    private onReferee(m: Exclude<RefereeOut, { t: 'verified' }>): void {
        const live = this.rooms.get(m.room);
        if (!live) return;
        switch (m.t) {
            case 'hash':
                live.room.refereeHash(m.tick, m.hash, m.alive);
                return;
            case 'pilot':
                live.room.pilotCommands(
                    m.slot,
                    m.cmds.map(c => new Uint8Array(c))
                );
                return;
            case 'progress':
                live.referee.lagTurns = live.room.nextTurn - m.turn;
                this.gate.reportLag(Math.max(...[...this.rooms.values()].map(r => r.referee.lagTurns)));
                if (live.referee.lagTurns > PARTY_LIMITS.refereeLagTurns)
                    this.log('referee_lag', { turns: live.referee.lagTurns });
                return;
            case 'end':
                void this.endRoom(live, m.end);
                return;
            case 'error':
                // the referee dropped the room: no more hashes, pilots or `end`. End it now (abandoned, unscored) so
                // the clients get their screen back and the live-room slot is freed
                this.log('referee_error', { message: m.message });
                live.room.unscored = 'referee';
                this.abandon(live, 'referee');
                return;
        }
    }

    /** Close a room without a verdict: the store row abandoned, clients told `room_gone`, the party back to results. */
    private abandon(live: LiveRoom, why: string): void {
        const room = live.room;
        if (live.ending || !this.rooms.has(room.id)) return;
        // a casual PvP remake (V16.md §4.2): the room is voided, every socket already got `void` from the room
        const voided = room.voided;
        void this.mm.onRoomEnded(room.id, null, room.tick, voided).catch(() => undefined);
        live.ending = true;
        if (room.status !== 'abandoned') room.status = 'abandoned';
        this.scheduler.remove(room);
        this.referee.close(room.id);
        void this.opts.store
            .finish(
                room.id,
                live.epoch,
                { status: 'abandoned', ...(voided ? { void: voided } : {}) },
                new Date(this.now())
            )
            .catch(() => undefined);
        for (const s of this.socketsOf(live)) {
            if (!voided) this.sendJson(s, { t: 'error', code: 'room_gone' });
            s.seatRoom = null;
            s.seatSlot = -1;
        }
        this.parties.matchEnded(live.party);
        this.rooms.delete(room.id);
        this.log('room_abandoned', { why });
    }

    private reopenReferee(id: string): void {
        const live = this.rooms.get(id);
        if (!live) return;
        this.referee.open(id, live.sim.version, live.sim.hash, live.config);
        for (const b of live.room.log) this.referee.turn(id, b);
    }

    private afterAdvance(room: Room): void {
        const live = this.rooms.get(room.id);
        if (!live) return;
        // checkpoint every 10 s of room time (an append of the delta)
        if (
            room.live &&
            !live.checkpointing &&
            !live.moving &&
            this.now() - live.lastCheckpointMs >= PARTY_LIMITS.checkpointEveryMs
        ) {
            live.checkpointing = true;
            live.inflight = this.checkpoint(live, false).finally(() => (live.checkpointing = false));
        }
        if (room.status === 'abandoned') this.abandon(live, room.voided ? 'remake' : 'timer');
    }

    private concatLog(live: LiveRoom): Uint8Array {
        const total = live.room.log.reduce((n, b) => n + b.length, 0);
        const out = new Uint8Array(total);
        let at = 0;
        for (const b of live.room.log) {
            out.set(b, at);
            at += b.length;
        }
        return out;
    }

    private async endRoom(live: LiveRoom, end: RefereeEnd): Promise<void> {
        // a room on its way to another relay ends there (that referee re-sims the same log to the same end)
        if (live.ending || live.moving) return;
        live.ending = true;
        const room = live.room;
        room.end({
            finalHash: end.finalHash,
            outcome: end.outcome,
            ticks: end.ticks,
            winner: end.winner,
            reason: end.reason,
        });
        this.scheduler.remove(room);
        // the tail first: a client whose last received turn is behind the log gets the rest now (a stalled stream at
        // the very end otherwise leaves it short of the end turn, frozen without a results screen)
        for (const s of this.socketsOf(live)) {
            const seen = room.slots[s.seatSlot]?.lastTurnSeen ?? 0;
            if (!s.catchup && seen + 1 < room.nextTurn) this.startCatchup(s, live, seen + 1);
        }
        this.finished.set(room.id, { live, untilMs: this.now() + 120_000 });
        await this.checkpoint(live, false);
        // §6 item 1: raw log re-sim → record → verifyPartyReplay must equal the verdict
        const check = await this.referee.verify(
            live.sim.version,
            live.sim.hash,
            live.config,
            this.concatLog(live),
            end
        );
        const verified = check.ok && !room.unscored;
        if (!check.ok) this.log('mp_verify_failed', { why: check.why });
        // the Quick Play record (events, outcome) is written before the verdict, so a `/live` save sees it
        await this.mm
            .onRoomEnded(
                room.id,
                end.outcome === 'won' || end.outcome === 'lost' ? end.outcome : null,
                end.ticks,
                null,
                end.intel
            )
            .catch(() => undefined);
        await this.opts.store.finish(
            room.id,
            live.epoch,
            {
                status: check.ok ? 'ended' : 'abandoned',
                verdict: {
                    finalHash: end.finalHash,
                    outcome: end.outcome,
                    ticks: end.ticks,
                    winner: end.winner,
                    reason: end.reason,
                    verified,
                    stats: end.stats as unknown[],
                },
                unscored: room.unscored,
            },
            new Date(this.now())
        );
        this.referee.close(room.id);
        for (const [member, slot] of live.seats) {
            const s = this.byMember.get(member);
            if (!s) continue;
            const occ = live.occupants.find(o => o.slot === slot);
            const ticks = room.slots[slot].pilotTicks;
            const afk = AFK_REASONS.reduce((n, r: PilotReason) => n + ticks[r], 0);
            let why: string | undefined;
            if (!check.ok) why = 'verify';
            else if (room.unscored) why = room.unscored;
            else if (!occ?.ticketed) why = 'no_ticket';
            else if (afk * 2 > end.ticks) why = 'afk';
            this.sendJson(s, {
                t: 'end',
                winner: end.winner,
                outcome: end.outcome,
                ticks: end.ticks,
                finalHash: end.finalHash,
                scored: !why,
                ...(why ? { why } : {}),
            });
        }
        this.parties.matchEnded(live.party);
        this.partyEndedAt.set(live.party, this.now());
        this.rooms.delete(room.id);
        this.log('mp_match_end', { outcome: end.outcome, scored: verified });
    }

    // -----------------------------------------------------------------------------------------------------------
    // Checkpoints, shutdown, restore (N9)

    private async checkpoint(live: LiveRoom, handoff: boolean): Promise<boolean> {
        const room = live.room;
        const from = room.checkpointedTurn;
        const bodies = room.log.slice(from);
        const size = bodies.reduce((n, b) => n + b.length, 0);
        const chunk = Buffer.alloc(size);
        let at = 0;
        for (const b of bodies) {
            chunk.set(b, at);
            at += b.length;
        }
        const meta = { ...room.snapshotMeta(), ...(handoff ? { handoff: true } : {}) };
        const ok = await this.opts.store.append(
            room.id,
            live.epoch,
            from,
            chunk,
            { ...meta, lastTurn: from + bodies.length },
            new Date(this.now())
        );
        if (ok) room.checkpointedTurn = from + bodies.length;
        else {
            this.log('checkpoint_lost', {});
            if (!handoff) void this.leaseLost(live);
        }
        live.lastCheckpointMs = this.now();
        return ok;
    }

    async checkpointAll(handoff: boolean): Promise<void> {
        await Promise.all(
            [...this.rooms.values()]
                .filter(r => r.room.live || handoff)
                .map(async r => {
                    await r.inflight?.catch(() => false);
                    return this.checkpoint(r, handoff);
                })
        );
    }

    /**
     * A checkpoint was refused: when another relay now owns the room (it claimed a lease this relay let go stale, e.g.
     * a Mongo stall), stop running it here and send its players to the owner. Two relays never both run one room.
     */
    private async leaseLost(live: LiveRoom): Promise<void> {
        const id = live.room.id;
        const row = await this.opts.store.get(id).catch(() => null);
        if (!row || (row.owner === this.opts.tickets.boot && row.epoch === live.epoch)) return;
        if (this.rooms.get(id) !== live || live.moving || live.ending) return;
        live.moving = true;
        this.scheduler.remove(live.room);
        this.referee.close(id);
        this.rooms.delete(id);
        this.releaseParty(live, true);
        this.log('relay_lease_lost', { owner_changed: row.owner !== this.opts.tickets.boot });
    }

    /** The party of a room that left this relay: forgotten here, its sockets sent on (room_gone, retry at once). */
    private releaseParty(live: LiveRoom, roomGone: boolean): void {
        const party = this.parties.byId(live.party);
        const members = party ? party.members.map(m => m.id) : [...live.seats.keys()];
        if (party) this.parties.forget(party);
        this.pendingParty.delete(live.party);
        if (live.hold) {
            clearTimeout(live.hold.timer);
            live.hold = null;
        }
        for (const id of members) {
            const s = this.byMember.get(id);
            this.dropResume(id);
            if (!s) continue;
            if (roomGone && s.seatRoom === live.room.id) this.error(s, 'room_gone', 0);
            s.seatRoom = null;
            s.seatSlot = -1;
            this.moveSock(s, false);
        }
    }

    /**
     * Push handoff of one room (LIVE-MATCH-DEPLOYS.md §5.3): stop its clock, tell its players to reconnect at once,
     * write the party (fresh resume tokens) and the final checkpoint with `handoff`, then let it go. The serving relay
     * claims it within a loop tick; a pull claims it at once.
     */
    private async pushRoom(live: LiveRoom, reason: 'pull' | 'deadline' | 'sigterm'): Promise<void> {
        if (live.moving || live.ending || this.rooms.get(live.room.id) !== live) return;
        live.moving = true;
        const room = live.room;
        this.scheduler.remove(room);
        for (const s of this.socketsOf(live)) this.error(s, 'room_gone', 0);
        await live.inflight?.catch(() => false);
        const party = this.parties.byId(live.party);
        if (party) await this.saveParty(party);
        const ok = await this.checkpoint(live, true);
        this.referee.close(room.id);
        this.rooms.delete(room.id);
        this.releaseParty(live, false);
        this.log('relay_handoff', { reason, ok, turn: room.nextTurn });
    }

    /**
     * Push handoff of a lobby (or results) party (§4.1 step 5): written with `handoff`, forgotten here, its members sent
     * on. The serving relay claims it within a loop tick (or at once, for a member's reconnect) with the same code.
     */
    private async handoffParty(p: Party): Promise<void> {
        const members = p.members.map(m => m.id);
        this.parties.forget(p);
        this.pendingParty.delete(p.id);
        await this.saveParty(p, true);
        for (const id of members) {
            const s = this.byMember.get(id);
            this.dropResume(id);
            if (s) this.moveSock(s);
        }
        this.log('relay_handoff', { reason: 'party' });
    }

    /**
     * Stop now (after a drain, or at once): stop the clocks, tell clients to reconnect at once (`room_gone`, retry 0),
     * write every party (lobby ones with `handoff`) and every room's final checkpoint with `handoff`, close the sockets
     * with 1012. The serving relay claims all of it within a loop tick (LIVE-MATCH-DEPLOYS.md §5.3).
     */
    async shutdown(): Promise<void> {
        if (this.state === 'stopped') return;
        this.mm.shutdown();
        const wasDraining = this.state === 'draining';
        this.state = 'stopped';
        if (this.loopTimer) clearInterval(this.loopTimer);
        if (this.drainTimer) clearInterval(this.drainTimer);
        this.scheduler.stop();
        for (const live of this.rooms.values()) {
            live.moving = true;
            if (live.hold) clearTimeout(live.hold.timer);
            for (const s of this.socketsOf(live)) this.error(s, 'room_gone', 0);
        }
        const lobby = this.parties.all().filter(p => !(p.room && this.rooms.has(p.room)));
        const inRooms = this.parties.all().filter(p => p.room && this.rooms.has(p.room));
        await Promise.all([
            ...inRooms.map(p => this.saveParty(p).catch(() => undefined)),
            ...lobby.map(p => this.saveParty(p, true).catch(() => undefined)),
        ]);
        await this.checkpointAll(true);
        if (this.rooms.size)
            this.log('relay_handoff', { reason: wasDraining ? 'deadline' : 'sigterm', rooms: this.rooms.size });
        if (this.partyTimer) clearInterval(this.partyTimer);
        if (this.partyFlush) clearTimeout(this.partyFlush);
        for (const s of this.socks) s.ws.close(1012, 'restart');
        this.opts.server.off('upgrade', this.upgradeHandler);
        this.wss.close();
        this.gate.stop();
        await this.referee.shutdown();
        this.finishDrain();
    }

    // -----------------------------------------------------------------------------------------------------------
    // Drain, generations, the restore loop (docs/plans/moba/LIVE-MATCH-DEPLOYS.md)

    /**
     * Start (or tighten) a drain: readiness drops at once, no new parties, rooms or queue entries; live rooms play on
     * until they end; lobby parties and idle sockets move to the new relay now; a pulled room moves at once; whatever is
     * left at the deadline is pushed. `done` resolves when no room is left here.
     */
    drain(trigger: DrainTrigger, maxMs = this.opts.drainMaxMs ?? PARTY_LIMITS.drainMaxMs) {
        const nowMs = this.now();
        if (this.state === 'stopped')
            return { state: this.state, rooms_live: 0, deadlineMs: nowMs, done: Promise.resolve() };
        const deadlineMs = nowMs + Math.max(0, Math.min(maxMs, PARTY_LIMITS.drainEndpointMaxMs));
        if (this.drainInfo) {
            const d = this.drainInfo;
            if (TRIGGER_RANK[trigger] > TRIGGER_RANK[d.trigger]) d.trigger = trigger;
            d.deadlineMs = Math.min(d.deadlineMs, deadlineMs);
            if (trigger === 'endpoint') this.closeListener();
            void this.drainTick();
            return { state: this.state, rooms_live: this.rooms.size, deadlineMs: d.deadlineMs, done: d.done };
        }
        let resolve!: () => void;
        const done = new Promise<void>(r => (resolve = r));
        this.drainInfo = { trigger, startedMs: nowMs, deadlineMs, done, resolve, finished: false };
        this.state = 'draining';
        this.log('relay_drain_start', { trigger, rooms: this.rooms.size, deadline_ms: deadlineMs - nowMs });
        // queued players get mm.cancel{server}: the client keeps its search card and re-joins after the reconnect
        this.mm.shutdown();
        if (trigger === 'endpoint') this.closeListener();
        void this.beat(true);
        this.drainTimer = setInterval(() => void this.drainTick(), PARTY_LIMITS.pullPollMs);
        this.drainTimer.unref?.();
        void this.drainTick();
        return { state: this.state, rooms_live: this.rooms.size, deadlineMs, done };
    }

    /** A generation drain whose newer relay went away (crash, failed deploy): serve again (§4.4). */
    private undrain(): void {
        if (this.state !== 'draining' || this.drainInfo?.trigger !== 'generation') return;
        if (this.drainTimer) clearInterval(this.drainTimer);
        this.drainTimer = null;
        this.drainInfo.resolve();
        this.drainInfo = null;
        this.state = 'serving';
        this.readyAtMs = this.now();
        this.announcedMs = this.now();
        this.mm.resume();
        this.log('relay_drain_cancel', {});
        void this.beat(true);
    }

    private closeListener(): void {
        if (!this.opts.ownsServer || !this.opts.server.listening) return;
        // upgraded sockets are detached from the server and stay open; only new connections go elsewhere
        this.opts.server.close();
        this.log('relay_listener_closed', {});
    }

    private finishDrain(): void {
        const d = this.drainInfo;
        if (!d || d.finished) return;
        d.finished = true;
        this.log('relay_drain_done', { trigger: d.trigger, ms: this.now() - d.startedMs });
        d.resolve();
    }

    /** Every `pullPollMs` while draining: move idle parties and sockets, hand over pulled rooms, push at the deadline. */
    private async drainTick(): Promise<void> {
        if (this.state !== 'draining' || this.drainTicking || !this.drainInfo) return;
        this.drainTicking = true;
        try {
            const nowMs = this.now();
            for (const p of this.parties.all()) {
                if (p.room && this.rooms.has(p.room)) continue;
                if (p.phase === 'pick' || p.phase === 'loading' || p.phase === 'match') continue;
                // the results tail: the last turns of the match still reach everyone before the party moves
                const ended = this.partyEndedAt.get(p.id);
                if (ended !== undefined && nowMs - ended < 5000) continue;
                await this.handoffParty(p);
            }
            for (const s of [...this.socks]) {
                if (!s.helloed || s.closed || s.pending) continue;
                if (s.memberId && this.parties.partyOf(s.memberId)) continue;
                this.moveSock(s);
            }
            const deadline = nowMs >= this.drainInfo.deadlineMs;
            const wanted = deadline
                ? null
                : new Set(await this.opts.store.wanted(this.opts.tickets.boot).catch(() => []));
            await Promise.all(
                [...this.rooms.values()]
                    .filter(live => deadline || wanted!.has(live.room.id))
                    .map(live => this.pushRoom(live, deadline ? 'deadline' : 'pull'))
            );
            const starting = this.parties.all().some(p => p.phase === 'pick' || p.phase === 'loading');
            if (this.rooms.size === 0 && !starting && this.drainInfo.trigger !== 'generation') {
                this.finishDrain();
                // the endpoint drain (the GCP VM) stops the relay; deploy.sh then stops the container
                if (this.drainInfo.trigger === 'endpoint') await this.shutdown();
            }
        } catch (e) {
            this.log('relay_drain_error', { message: String((e as Error)?.message || e).slice(0, 200) });
        } finally {
            this.drainTicking = false;
        }
    }

    /** A ready serving relay that a player reached: from now on it is the newest generation (§4.4). */
    private announce(): void {
        if (this.announcedMs || !this.readyAtMs || !this.sawSocket || this.state !== 'serving') return;
        this.announcedMs = this.now();
        void this.beat(true);
    }

    /** Write this relay's generation row (§4.4) every `relayHeartbeatMs`, or now. */
    private async beat(now = false): Promise<void> {
        if (!this.readyAtMs || this.state === 'stopped') return;
        const t = this.now();
        if (!now && t - this.lastBeatMs < PARTY_LIMITS.relayHeartbeatMs) return;
        this.lastBeatMs = t;
        await this.opts.store
            .heartbeat({
                _id: this.opts.tickets.boot,
                state: this.state !== 'serving' ? 'draining' : this.announcedMs ? 'serving' : 'standby',
                readyAt: new Date(this.announcedMs || this.readyAtMs),
                heartbeatAt: new Date(t),
                simVersions: [...SIM_VERSIONS],
                pool: this.pool,
            })
            .catch(() => undefined);
    }

    /** The 1 s loop: restore (serving), heartbeat, newest-generation check, held rooms. */
    private async loop(): Promise<void> {
        if (this.state === 'stopped') return;
        // the heartbeat never waits behind a slow restore pass: a relay whose row goes 15 s without a beat counts as
        // gone, and another relay would take its lobby parties over while it still runs them (§14)
        void this.beat();
        if (this.looping) return;
        this.looping = true;
        try {
            if (this.state === 'serving') await this.restore();
            await this.generations();
        } catch (e) {
            this.log('relay_loop_error', { message: String((e as Error)?.message || e).slice(0, 200) });
        } finally {
            this.looping = false;
        }
    }

    /** §4.4: a serving relay that sees a newer ready serving relay drains; a generation drain without one serves again. */
    private async generations(): Promise<void> {
        if (!this.readyAtMs || this.state === 'stopped') return;
        const me = this.opts.tickets.boot;
        this.relayRows = await this.opts.store.relays(new Date(this.now() - PARTY_LIMITS.relayStaleMs));
        // a relay no player reached yet is never the older one (and its row says standby, so it drains nobody)
        const mine = this.announcedMs || Number.POSITIVE_INFINITY;
        const newer = this.relayRows.some(
            r =>
                r._id !== me &&
                (r.pool ?? DEFAULT_POOL) === this.pool &&
                r.state === 'serving' &&
                (new Date(r.readyAt).getTime() > mine || (new Date(r.readyAt).getTime() === mine && r._id > me))
        );
        if (this.state === 'serving' && newer) this.drain('generation');
        else if (this.state === 'draining' && this.drainInfo?.trigger === 'generation' && !newer) this.undrain();
    }

    /** Release a held restored room (§5.5): its clock continues from where the log ended, both teams together. */
    private releaseHold(live: LiveRoom): void {
        const h = live.hold;
        if (!h || this.rooms.get(live.room.id) !== live || live.moving) return;
        clearTimeout(h.timer);
        live.hold = null;
        const held = Math.max(0, this.now() - h.sinceMs);
        live.room.shiftClock(held);
        this.scheduler.add(live.room);
        this.restoreGaps.push(held);
        if (this.restoreGaps.length > 256) this.restoreGaps.splice(0, 128);
        this.log('relay_restore', { simVersion: live.sim.version, gapMs: held, waiting: h.need.size });
    }

    /**
     * Boot restore (§3.6): claim live rooms handed off by (or stale on) another instance within the window, whose
     * bundle this relay holds. The clock and fan-out restart at once; the referee re-sims the log meanwhile (slots
     * stay piloted with reason `restore` until clients reconnect, catch up and send `back`). Others are abandoned.
     */
    restore(): Promise<string[]> {
        // one pass at a time: a pull waiting for its room joins the pass already running
        if (this.restoreRun) return this.restoreRun;
        const run = this.restoreOnce().finally(() => {
            if (this.restoreRun === run) this.restoreRun = null;
        });
        this.restoreRun = run;
        return run;
    }

    private async restoreOnce(): Promise<string[]> {
        if (this.state !== 'serving') return [];
        const now = new Date(this.now());
        const got: string[] = [];
        const rows = await this.opts.store.restorable(
            this.opts.tickets.boot,
            now,
            PARTY_LIMITS.staleLeaseMs,
            PARTY_LIMITS.restoreWithinMs
        );
        const claimable = await this.claimableFrom(now);
        for (const row of rows) {
            if (this.state !== 'serving') break;
            if (!claimable(row.owner, row._id)) continue;
            const entry = partySimFor(row.simVersion, row.simHash);
            if (!entry?.party) continue;
            const claimed = await this.opts.store.claim(row._id, row.epoch, this.opts.tickets.boot, now);
            if (!claimed) continue;
            const bodies = splitTurnBodies(new Uint8Array(Buffer.concat(claimed.chunks))).map(f => encodeTurnBody(f));
            const room = new Room(
                {
                    id: claimed._id,
                    humans: claimed.config.humans,
                    occupied: claimed.occupants.map(o => o.slot),
                    difficulty: claimed.config.difficulty,
                    forfeitFrom: entry.party.forfeitFromOf(
                        claimed.config.mode === 'pvp' ? 'pvp' : claimed.config.difficulty
                    ),
                    nowMs: this.now(),
                    startMs: this.now(),
                    phaseMs: phaseOf(claimed._id),
                    pvp: claimed.config.mode === 'pvp',
                    teamSize: claimed.config.map === 'hearthwood' ? 5 : 3,
                    restoredLog: bodies,
                    restoredSeq: claimed.lastSeq,
                    restoredPilotTicks: claimed.pilotTicks as never,
                },
                this.roomIO(claimed._id)
            );
            room.unscored = claimed.unscored;
            room.openUnclaimedAt1800 = claimed.openUnclaimedAt1800;
            const seats = new Map<string, number>();
            const names: (string | null)[] = new Array(room.slotCount).fill(null);
            for (const o of claimed.occupants) names[o.slot] = o.name;
            const live: LiveRoom = {
                room,
                party: claimed.party,
                sim: { version: claimed.simVersion, hash: claimed.simHash },
                partySim: entry.party,
                config: claimed.config,
                epoch: claimed.epoch,
                occupants: claimed.occupants,
                seats,
                names,
                lastCheckpointMs: this.now(),
                ticketed: claimed.occupants.some(o => o.ticketed),
                referee: { lagTurns: room.nextTurn, restored: false },
                ending: false,
                heroSkins: new Array(room.slotCount).fill(null),
                keys: new Set(),
                ips: new Set(),
            };
            await this.restoreParty(claimed, live);
            this.rooms.set(claimed._id, live);
            this.referee.open(claimed._id, claimed.simVersion, claimed.simHash, claimed.config);
            for (const b of bodies) this.referee.turn(claimed._id, b);
            // §5.5: the clock waits for the humans seated in the room (or restoreHoldMs), then runs for both teams
            const need = new Set([...live.seats.values()].filter(slot => room.isHumanSlot(slot)));
            const timer = setTimeout(() => this.releaseHold(live), PARTY_LIMITS.restoreHoldMs);
            timer.unref?.();
            live.hold = { sinceMs: this.now(), need, timer };
            if (!need.size) this.releaseHold(live);
            got.push(claimed._id);
            this.log('restores', {});
        }
        await this.restoreLobbies(now, claimable);
        // only rows past the restore window: a handed-off room inside it may still be claimed by a relay carrying its sim
        await this.opts.store.abandonLive([...this.rooms.keys()], now);
        if (!this.readyAtMs && this.state === 'serving') {
            this.readyAtMs = this.now();
            void this.beat(true);
            this.announce();
        }
        return got;
    }

    /**
     * Which rooms and parties this pass may claim (§4.4 pools). The boot pass claims everything handed off or stale, as
     * before (the GCP cutover relies on it). Later passes claim only what a relay of this pool left (an owner with no
     * relay row predates live-match deploys: DigitalOcean, pool `app`), plus a room or party a player of it is waiting
     * for here (a pull). So during the migration the GCP relay never takes DigitalOcean's deploy handoffs from it.
     */
    private async claimableFrom(now: Date): Promise<(owner: string | null | undefined, id: string) => boolean> {
        if (!this.readyAtMs) return () => true;
        const rows = await this.opts.store.relays(new Date(now.getTime() - 3_600_000));
        const pools = new Map(rows.map(r => [r._id, r.pool ?? DEFAULT_POOL]));
        return (owner, id) =>
            this.pulling.has(id) || (pools.get(owner ?? '') ?? (owner ? DEFAULT_POOL : this.pool)) === this.pool;
    }

    /** Lobby parties another relay handed over (§4.1 step 5): claimed and rebuilt here with their codes and tokens. */
    private async restoreLobbies(now: Date, claimable: (owner: string | null | undefined, id: string) => boolean) {
        const rows = await this.opts.store.handedParties(
            this.opts.tickets.boot,
            new Date(now.getTime() - PARTY_LIMITS.restoreWithinMs)
        );
        for (const row of rows) {
            if (this.state !== 'serving') return;
            if (!claimable(row.owner, row._id)) continue;
            if (this.parties.byId(row._id)) continue;
            const claimed = await this.opts.store.claimParty(row._id, this.opts.tickets.boot, now);
            if (!claimed) continue;
            this.rebuildParty(claimed, null, null);
            this.log('relay_restore_party', {});
        }
    }

    /** Rebuild the party and its members' resume tokens so reconnecting clients find their seats. */
    private async restoreParty(room: StoredRoom, live: LiveRoom): Promise<void> {
        const stored = await this.opts.store.getParty(room.party);
        if (!stored) return;
        this.rebuildParty(stored, room._id, live);
    }

    /** A party from its stored document: with its room (`live`) or back in the lobby (`roomId` null). */
    private rebuildParty(stored: StoredParty, roomId: string | null, live: LiveRoom | null): void {
        const doc = stored.doc as {
            leader: string;
            difficulty: string;
            openSeats: boolean;
            locked?: boolean;
            members: {
                id: string;
                accountId: string | null;
                guestKeyHash: string | null;
                key: string;
                ticketed: boolean;
                guest: boolean;
                lastHero?: string;
                lastTrick?: string;
                slot?: number;
                resume?: string;
                ipKey?: string;
            }[];
            mm?: {
                match: string;
                side: 'cat' | 'dog';
                strangers: string[];
                host: boolean;
                casual?: import('./party.service').PartyCasual;
            };
        };
        const leaderDoc = doc.members.find(m => m.id === doc.leader) ?? doc.members[0];
        if (!leaderDoc) return;
        const identityOf = (m: typeof doc.members[number]): MemberIdentity => ({
            accountId: m.accountId,
            guestKeyHash: m.guestKeyHash,
            key: m.key,
            ticketed: m.ticketed,
            guest: m.guest,
            ...(m.ipKey ? { ipKey: m.ipKey } : {}),
        });
        const party = this.parties.restoreParty(
            stored._id,
            stored.code,
            doc.difficulty,
            doc.openSeats,
            doc.members.map(m => ({
                id: m.id,
                identity: identityOf(m),
                lastHero: m.lastHero,
                lastTrick: m.lastTrick,
                slot: m.slot,
            })),
            leaderDoc.id,
            roomId,
            typeof doc.locked === 'boolean' ? doc.locked : undefined
        );
        this.parties.restoreMm(party, doc.mm);
        if (live) {
            if (doc.mm?.casual) live.casual = { species: doc.mm.casual.species };
            else if (doc.mm) live.coop = true;
        }
        for (const m of doc.members) {
            if (m.resume) this.setResume(m.id, m.resume, m.key, m.ipKey ?? '');
            if (!live) continue;
            if (m.slot !== undefined) live.seats.set(m.id, m.slot);
            live.keys.add(m.key);
            if (m.ipKey) live.ips.add(m.ipKey);
        }
        // its row now names this relay as the owner
        this.queueParty(party.id);
    }

    // -----------------------------------------------------------------------------------------------------------
    // Quick Play glue (M1A-IMPL.md §5.1): what the matchmaker may see and do

    private mmApi(): MmRelayApi {
        return {
            parties: this.parties,
            now: () => this.now(),
            log: (event, props) => this.log(event, props),
            sock: member => {
                const s = this.byMember.get(member);
                if (!s || !s.identity || !s.sim || s.closed) return null;
                return {
                    member,
                    proto: s.proto,
                    identity: s.identity,
                    ip: s.ip,
                    netKey: netKey(s.ip),
                    hint: s.hint,
                    sim: s.sim,
                    conn: s.away ? 'away' : 'on',
                };
            },
            send: (member, msg) => this.sendJsonTo(member, msg),
            canSeat: identity =>
                !(
                    !identity.key.startsWith('ip:') &&
                    this.liveRoomsOf(identity.key).key >= PARTY_LIMITS.roomsLivePerIdentity
                ) && !(identity.ipKey && this.liveRoomsOf('', identity.ipKey).ip >= PARTY_LIMITS.roomsLivePerIp),
            room: roomId => this.mmRoomView(roomId),
            leaveParty: member => this.leaveParty(member),
            backfill: (member, roomId, slot, holder) => this.backfillSeat(member, roomId, slot, holder),
            evict: (member, roomId) => this.evictSeat(member, roomId),
            release: (identity, except) => this.releaseStale(identity, except),
            rejoin: member => this.rejoinMm(member),
        };
    }

    private mmRoomView(roomId: string): MmRoomView | null {
        const live = this.rooms.get(roomId);
        if (!live) return null;
        const room = live.room;
        return {
            id: roomId,
            party: live.party,
            tick: room.tick,
            live: room.live,
            ending: live.ending,
            humans: room.humans,
            slots: room.slots.map(x => ({
                slot: x.slot,
                occupied: x.occupied,
                mode: x.mode,
                reason: x.reason,
                connected: x.connected,
                pilotTicks: { ...x.pilotTicks },
            })),
            keys: [...live.keys],
            seats: new Map(live.seats),
        };
    }

    /**
     * A Quick Play backfill (§3): the member joins the room's party as a stranger, the piloted slot reopens (the
     * earlier holder's AFK ticks no longer count) and the open-seat claim seats them; the client catches up as in P10.
     */
    private backfillSeat(member: string, roomId: string, slot: number, holder?: string): boolean {
        const s = this.byMember.get(member);
        const live = this.rooms.get(roomId);
        const party = live ? this.parties.byId(live.party) : null;
        if (!s || !s.identity || !live || !party?.mm || live.ending || !live.room.live) return false;
        const key = s.identity.key;
        if (!key.startsWith('ip:') && this.liveRoomsOf(key).key >= PARTY_LIMITS.roomsLivePerIdentity) return false;
        if (s.ipKey && this.liveRoomsOf('', s.ipKey).ip >= PARTY_LIMITS.roomsLivePerIp) return false;
        if (live.room.slots[slot]?.mode !== 'pilot' || party.members.some(m => m.id === member)) return false;
        // every check that can refuse runs before the holder loses the seat (a refused backfill evicts no one)
        if (holder && holder !== member) this.evictSeat(holder, roomId);
        if (!this.parties.joinMatched(party, member, s.identity, s.hint)) return false;
        if (!live.room.reopen(slot, this.now())) {
            this.parties.leave(member);
            return false;
        }
        this.claimOpenSeat(s, live, party, member, slot);
        if (live.seats.get(member) !== slot) {
            this.parties.leave(member);
            return false;
        }
        return true;
    }

    /** The holder of a backfilled seat: out of the seat and the party; a resume answers `seat_taken` (PROTO 2). */
    private evictSeat(member: string, roomId: string): void {
        const live = this.rooms.get(roomId);
        const identity =
            this.parties.partyOf(member)?.members.find(m => m.id === member)?.identity ??
            this.byMember.get(member)?.identity;
        live?.seats.delete(member);
        if (live) this.releaseKeys(live, identity);
        const h = this.resumeOf.get(member);
        if (h) this.seatTaken.set(h, this.now() + MM_SEAT_TAKEN_MS);
        const s = this.byMember.get(member);
        if (s && s.seatRoom === roomId) {
            s.seatRoom = null;
            s.seatSlot = -1;
            this.error(s, 'seat_taken');
        }
        this.parties.leave(member);
        this.dropResume(member);
    }

    /**
     * Quick Play: give up the seats this identity still holds in live Quick Play rooms from a socket that is gone (a
     * closed tab, a dead phone socket), so a new Play online is not blocked by the live-room cap. A bot keeps flying
     * the seat (and it can be backfilled); the old member leaves the party as `party.leave` would.
     */
    private releaseStale(identity: MemberIdentity, except: string): void {
        if (identity.key.startsWith('ip:')) return;
        for (const live of [...this.rooms.values()]) {
            if (!live.coop || !live.room.live || !live.keys.has(identity.key)) continue;
            const party = this.parties.byId(live.party);
            for (const m of [...(party?.members ?? [])]) {
                if (m.id === except || m.identity.key !== identity.key) continue;
                const ms = this.byMember.get(m.id);
                if (ms && !ms.closed) continue; // a live tab keeps its seat
                this.giveUpSeat(live, m.id);
            }
        }
    }

    /** A member without a socket gives up its seat and party (as `party.leave`, without the `left` frame). */
    private giveUpSeat(live: LiveRoom, member: string): void {
        const party = this.parties.byId(live.party);
        const identity = party?.members.find(m => m.id === member)?.identity;
        const slot = live.seats.get(member);
        if (slot !== undefined) {
            live.seats.delete(member);
            live.names[slot] = null;
            live.room.vacate(slot, this.now(), !!party?.openSeats);
            this.releaseKeys(live, identity);
        }
        const s = this.byMember.get(member);
        if (s) {
            s.seatRoom = null;
            s.seatSlot = -1;
        }
        this.parties.leave(member);
        this.dropResume(member);
    }

    /**
     * Quick Play `mm.back`: a stranger's closed tab has no party code to rejoin by, so the same identity takes its own
     * live Quick Play seat back (as a `party.join` twin does). False when there is none.
     */
    private rejoinMm(member: string): boolean {
        const s = this.byMember.get(member);
        if (!s?.identity || s.identity.key.startsWith('ip:')) return false;
        for (const live of this.rooms.values()) {
            if (!live.coop || !live.room.live || live.ending || !live.keys.has(s.identity.key)) continue;
            const party = this.parties.byId(live.party);
            const twin = party?.members.find(
                m => m.id !== member && m.identity.key === s.identity!.key && live.seats.has(m.id)
            );
            if (!twin) continue;
            this.adopt(s, twin.id);
            return true;
        }
        return false;
    }

    /**
     * Presence (SOCIAL-RANKED.md §4.3): the registered (ticketed, non-guest) accounts on this relay and their phase,
     * the most important one per account (match > queue > party). Read by the PresenceSink timer every 5 s, never on
     * the socket path. A matchmaker party's code is never listed (strangers never see it); a friend party's is, for
     * accepted friends only (the API decides who reads it).
     */
    presenceSnapshot(): PresenceEntry[] {
        const rank = { party: 1, queue: 2, match: 3 } as const;
        const out = new Map<string, PresenceEntry>();
        for (const s of this.socks) {
            const id = s.identity;
            if (!s.helloed || s.closed || !id?.ticketed || id.guest || !id.accountId) continue;
            let e: PresenceEntry | null = null;
            if (s.seatRoom) e = { accountId: id.accountId, state: 'match' };
            else if (s.memberId && this.mm.queued(s.memberId)) e = { accountId: id.accountId, state: 'queue' };
            else {
                const p = s.memberId ? this.parties.partyOf(s.memberId) : null;
                if (p && p.queued) e = { accountId: id.accountId, state: 'queue' };
                else if (p && (!p.mm || p.mm.host))
                    e = {
                        accountId: id.accountId,
                        state: 'party',
                        party: p.code,
                        joinable: p.phase === 'lobby' && !p.locked && p.members.length < MAX_MEMBERS,
                    };
            }
            if (!e) continue;
            const prev = out.get(e.accountId);
            if (!prev || rank[e.state] > rank[prev.state]) out.set(e.accountId, e);
        }
        return [...out.values()];
    }

    /** Counters for logs and the load test. */
    counters() {
        const overruns = [...this.rooms.values()].flatMap(r => r.room.overrunsMs).sort((a, b) => a - b);
        return {
            rooms_live: this.rooms.size,
            sockets: this.socks.size,
            turn_overrun_ms_p99: overruns.length ? overruns[Math.floor(overruns.length * 0.99)] : 0,
            loop_delay_p99: this.gate.p99Ms(),
            referee_lag_turns: this.gate.lag,
            draining: this.state === 'serving' ? 0 : 1,
            restore_gap_ms_p99: this.restoreGaps.length
                ? [...this.restoreGaps].sort((a, b) => a - b)[Math.floor(this.restoreGaps.length * 0.99)]
                : 0,
            ...this.tally,
            ...this.mm.counters(),
            ...this.rtt.counters(this.now()),
        };
    }

    /** Test seam: the room of a party. */
    roomOfParty(partyId: string): LiveRoom | undefined {
        return [...this.rooms.values()].find(r => r.party === partyId);
    }

    static turnMs = TURN_MS;
}

export type { Member };
export type { PartyError };
