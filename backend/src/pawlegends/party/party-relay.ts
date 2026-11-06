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
import { isCorsOriginAllowed } from '../../shared/cors-origins';
import { isCloudflareIp } from '../../shared/cloudflare-ips';
import { partySimFor, simFor, type PawlegendsPartySim } from '../../vendor/pawlegends-sim';
import {
    CATCHUP_CHUNK,
    Frame,
    MAX_JSON,
    PROTO,
    ProtoError,
    SUBPROTOCOL,
    TURN_TICKS,
    WS_PATH,
    SocialLimiter,
    clampSocialPoint,
    decodeClientBinary,
    socialIdOk,
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
import { PARTY_LIMITS, TURN_MS } from './party-limits';
import {
    PartyService,
    PARTY_TIMING,
    type Member,
    type MemberIdentity,
    type Party,
    type PartyError,
    type StartPlan,
} from './party.service';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import type { RefereeEnd } from './referee-core';
import type { RefereeOut } from './referee-host';
import { AFK_REASONS, Room, type PilotReason } from './room';
import { RoomScheduler, phaseOf } from './room-scheduler';
import type { Occupant, RoomStore, StoredRoom } from './room-store';

export interface RelayOptions {
    server: Server;
    store: RoomStore;
    tickets: PartyTicketService;
    /** Referee backend: workers (production) or inline (specs, harness). */
    referee?: RefereePool;
    /** Harness only (a constructor option, never env or a header): accept sockets without an Origin. */
    allowNoOrigin?: boolean;
    /** Allowed origins check (default: the CORS list). */
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
}

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
    hint: { maxDifficulty: string; newbie: boolean } | undefined;
    memberId: string | null;
    sim: { version: number; hash: string } | null;
    strikes: number;
    json: { tokens: number; atMs: number };
    lastSyncMs: number;
    /** Social rate limit (1 per 2 s, 10 per 30 s; the client mirrors it). */
    social: SocialLimiter;
    catchup: { bodies: Uint8Array[]; from: number; to: number; sentBytes: number; windowStartMs: number } | null;
    seatRoom: string | null;
    seatSlot: number;
    pingTimer: NodeJS.Timeout | null;
    closed: boolean;
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
}

const hashKey = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);
const token128 = () => randomBytes(16).toString('base64url');
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
    private readonly socks = new Set<Sock>();
    private readonly byMember = new Map<string, Sock>();
    /** member id → resume token hash (and the identity it is bound to). */
    private readonly resume = new Map<string, { hash: string; identityKey: string; expMs: number }>();
    private readonly upgrades: number[] = [];
    private readonly joinFails = { global: [] as number[], lockUntil: 0, byKey: new Map<string, number[]>() };
    private readonly pendingParty = new Set<string>();
    private partyFlush: NodeJS.Timeout | null = null;
    private partyTimer: NodeJS.Timeout | null = null;
    private readonly now: () => number;
    private readonly upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
    private stopped = false;

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
                tricks: sim.TRICK_IDS,
                difficulties: ['rookie', 'easy', 'normal', 'hard'].filter(d => sim.DIFFICULTIES.includes(d as never)),
                sideOf: h => sim.heroSideOf(h),
                newbieHero: 'clem',
            },
            {
                changed: p => this.queueParty(p.id),
                send: (member, msg) => this.sendJsonTo(member, msg),
                startMatch: plan => void this.startMatch(plan),
            },
            this.now
        );
        this.scheduler = new RoomScheduler({
            now: () => this.now(),
            setTimer: (fn, ms) => setTimeout(fn, ms),
            clearTimer: h => clearTimeout(h as NodeJS.Timeout),
        });
        this.scheduler.onAdvanced = room => this.afterAdvance(room);
        this.upgradeHandler = (req, socket, head) => this.onUpgrade(req, socket, head);
        opts.server.on('upgrade', this.upgradeHandler);
        this.partyTimer = setInterval(() => this.parties.tick(), 500);
        this.partyTimer.unref?.();
    }

    private liveSim(): PawlegendsPartySim {
        // the live bundle's party API (any party-capable bundle has the same hero/trick lists for the lobby)
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

    /** The visitor's IP: the Cloudflare header only from a real Cloudflare peer (S1). */
    static clientIp(req: IncomingMessage): string {
        const peer = req.socket.remoteAddress ?? '';
        const cf = req.headers['cf-connecting-ip'];
        if (typeof cf === 'string' && cf && isCloudflareIp(peer)) return cf.trim();
        return peer;
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
        if (this.stopped) return this.refuseUpgrade(socket, 503);
        const origin = req.headers.origin;
        if (!origin) {
            if (!this.opts.allowNoOrigin) return this.refuseUpgrade(socket, 403);
        } else if (!(this.opts.originAllowed ?? ((o: string) => isCorsOriginAllowed(o)))(origin))
            return this.refuseUpgrade(socket, 403);
        const now = this.now();
        while (this.upgrades.length && now - this.upgrades[0] > 1000) this.upgrades.shift();
        if (this.upgrades.length >= PARTY_LIMITS.upgradesPerSecond) return this.refuseUpgrade(socket, 429);
        if (this.socks.size >= PARTY_LIMITS.socketsPerInstance) return this.refuseUpgrade(socket, 503);
        let pre = 0;
        for (const s of this.socks) if (!s.helloed) pre++;
        if (pre >= PARTY_LIMITS.preHelloSockets) return this.refuseUpgrade(socket, 503);
        const ip = PartyRelay.clientIp(req);
        const ipKey = hashKey(`ip:${ip}`);
        let perIp = 0;
        for (const s of this.socks) if (s.ipKey === ipKey) perIp++;
        if (perIp >= PARTY_LIMITS.socketsPerIp) return this.refuseUpgrade(socket, 429);
        this.upgrades.push(now);
        this.wss.handleUpgrade(req, socket, head, ws => this.onSocket(ws, ip, ipKey));
    }

    private onSocket(ws: WebSocket, ip: string, ipKey: string): void {
        const s: Sock = {
            ws,
            id: token128(),
            ip,
            ipKey,
            helloed: false,
            helloTimer: null,
            identity: null,
            hint: undefined,
            memberId: null,
            sim: null,
            strikes: 0,
            json: { tokens: PARTY_LIMITS.json.burst, atMs: this.now() },
            lastSyncMs: 0,
            social: new SocialLimiter(),
            catchup: null,
            seatRoom: null,
            seatSlot: -1,
            pingTimer: null,
            closed: false,
        };
        this.socks.add(s);
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
        s.pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, PARTY_LIMITS.pingLobbyMs);
        s.pingTimer.unref?.();
    }

    private strike(s: Sock): void {
        s.strikes++;
        if (s.strikes >= PARTY_LIMITS.strikes) s.ws.close(4002, 'strikes');
    }

    private sendJson(s: Sock, msg: Record<string, unknown>): void {
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
            this.hello(s, msg);
            return;
        }
        this.onJson(s, msg);
    }

    // -----------------------------------------------------------------------------------------------------------
    // hello, identity, resume

    private hello(s: Sock, msg: Extract<ClientJson, { t: 'hello' }>): void {
        if (msg.proto !== PROTO) return this.error(s, 'update_required');
        if (!partySimFor(msg.sim, msg.simHash)) return this.error(s, 'update_required');
        const ticket = msg.ticket ? this.opts.tickets.verify(msg.ticket, this.now()) : null;
        if (msg.ticket && !ticket && this.opts.tickets.available) this.error(s, 'bad_ticket');
        const guestKeyHash = msg.guestKey ? hashKey(`guest:${msg.guestKey}`) : null;
        const key = ticket ? `acct:${ticket.accountId}` : guestKeyHash ? `guest:${guestKeyHash}` : `ip:${s.ipKey}`;
        const identity: MemberIdentity = {
            accountId: ticket?.accountId ?? null,
            guestKeyHash,
            key,
            ticketed: !!ticket,
            guest: ticket ? ticket.guest : true,
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
        s.hint = msg.hint;
        s.sim = { version: msg.sim, hash: msg.simHash };
        let memberId: string | null = null;
        let lastSeq: number | undefined;
        if (msg.resume) {
            const found = this.findResume(msg.resume.token, identity);
            if (found === 'elsewhere') return this.error(s, 'seat_elsewhere');
            memberId = found;
        }
        if (memberId) {
            const old = this.byMember.get(memberId);
            if (old && old !== s) {
                // the tab that loses the seat is told so and does not retry
                this.sendJson(old, { t: 'error', code: 'seat_elsewhere' });
                old.memberId = null;
                old.ws.close(4005, 'seat elsewhere');
            }
        }
        memberId ??= this.parties.newMemberId();
        s.memberId = memberId;
        this.byMember.set(memberId, s);
        const resumeToken = token128();
        this.resume.set(memberId, {
            hash: hashKey(resumeToken),
            identityKey: identity.key,
            expMs: this.now() + PARTY_LIMITS.lobbyResumeMs,
        });
        const party = this.parties.partyOf(memberId);
        if (party) {
            this.parties.setConn(memberId, 'on');
            const live = party.room ? this.rooms.get(party.room) : undefined;
            const slot = live?.seats.get(memberId);
            if (live && slot !== undefined) lastSeq = live.room.slots[slot].lastSeq;
        }
        this.sendJson(s, {
            t: 'welcome',
            proto: PROTO,
            member: memberId,
            resumeToken,
            serverMs: this.now(),
            ...(lastSeq !== undefined ? { lastSeq } : {}),
        });
        if (party) {
            this.sendJson(s, this.parties.view(party, memberId) as unknown as Record<string, unknown>);
            const live = party.room ? this.rooms.get(party.room) : undefined;
            if (live && live.seats.has(memberId)) this.bindSeat(s, live, memberId);
        }
    }

    private findResume(token: string, identity: MemberIdentity): string | null | 'elsewhere' {
        const h = hashKey(token);
        for (const [member, r] of this.resume) {
            if (r.hash !== h) continue;
            if (r.expMs < this.now() && !this.parties.partyOf(member)?.room) return null;
            // bound to the seat's identity: a different ticket identity is refused
            if (r.identityKey !== identity.key && !r.identityKey.startsWith('ip:')) return null;
            return member;
        }
        return null;
    }

    private onClose(s: Sock): void {
        s.closed = true;
        this.socks.delete(s);
        if (s.helloTimer) clearTimeout(s.helloTimer);
        if (s.pingTimer) clearInterval(s.pingTimer);
        if (!s.memberId || this.byMember.get(s.memberId) !== s) return;
        this.byMember.delete(s.memberId);
        this.parties.setConn(s.memberId, 'off');
        const live = s.seatRoom ? this.rooms.get(s.seatRoom) : undefined;
        if (live && s.seatSlot >= 0) live.room.disconnect(s.seatSlot, this.now());
    }

    // -----------------------------------------------------------------------------------------------------------
    // Party messages

    private joinFailed(s: Sock): void {
        const now = this.now();
        const g = this.joinFails.global;
        g.push(now);
        while (g.length && now - g[0] > PARTY_LIMITS.joinFailGlobal.windowMs) g.shift();
        if (g.length >= PARTY_LIMITS.joinFailGlobal.limit)
            this.joinFails.lockUntil = now + PARTY_LIMITS.joinFailGlobal.lockMs;
        const key = s.identity!.key;
        const list = this.joinFails.byKey.get(key) ?? [];
        list.push(now);
        while (list.length && now - list[0] > PARTY_LIMITS.joinFailPerIdentity.windowMs) list.shift();
        this.joinFails.byKey.set(key, list);
        this.log('join_fail_global', { n: g.length });
    }

    private joinBlocked(s: Sock): boolean {
        if (this.now() < this.joinFails.lockUntil) return true;
        const list = this.joinFails.byKey.get(s.identity!.key) ?? [];
        return list.length >= PARTY_LIMITS.joinFailPerIdentity.limit;
    }

    private onJson(s: Sock, msg: ClientJson): void {
        const member = s.memberId!;
        const p = this.parties;
        switch (msg.t) {
            case 'hello':
                return this.strike(s);
            case 'party.create': {
                const live = p.all().filter(x => x.members.some(m => m.identity.key === s.identity!.key)).length;
                if (live >= PARTY_LIMITS.partiesLivePerIdentity) return this.error(s, 'rate_limited');
                p.create(member, s.identity!, msg.difficulty, s.hint);
                return;
            }
            case 'party.join': {
                if (this.joinBlocked(s)) return this.error(s, 'rate_limited', 30_000);
                const party = p.join(msg.code, member, s.identity!, s.hint);
                if (typeof party === 'string') {
                    if (party === 'party_not_found' || party === 'party_ended') this.joinFailed(s);
                    return this.error(s, party as ErrorCode);
                }
                const live = party.room ? this.rooms.get(party.room) : undefined;
                if (live && party.openSeats) this.claimOpenSeat(s, live, party, member);
                return;
            }
            case 'party.leave':
                this.leaveSeat(s);
                p.leave(member);
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
                return;
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
                return p.hover(member, msg.hero);
            case 'pick.lock':
                return p.lock(member, msg.hero, msg.trick);
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
                const live = this.seatOf(s);
                if (!live) return;
                const now = this.now();
                if (now - s.lastSyncMs < PARTY_LIMITS.syncEveryMs && s.lastSyncMs !== 0) return;
                s.lastSyncMs = now;
                this.startCatchup(s, live, msg.fromTurn);
                return;
            }
            case 'away': {
                const live = this.seatOf(s);
                if (live) live.room.away(s.seatSlot);
                p.setConn(member, 'away');
                return;
            }
            case 'back': {
                const live = this.seatOf(s);
                p.setConn(member, 'on');
                if (live) live.room.back(s.seatSlot, this.now());
                return;
            }
            case 'bye':
                return this.leaveSeat(s);
        }
    }

    /** `party.card` (D8): only a card the ticketed account owns; peers never get its catId or custom name. */
    private async card(s: Sock, catId: string | null): Promise<void> {
        const member = s.memberId!;
        if (catId === null) return this.parties.setCard(member, null);
        const account = s.identity?.ticketed ? s.identity.accountId : null;
        if (!account || !this.opts.cards) return;
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
            const p = clampSocialPoint(msg.x, msg.y);
            out.x = p.x;
            out.y = p.y;
        }
        if (msg.target !== undefined && msg.target < 6) out.target = msg.target;
        for (const member of live.seats.keys()) this.sendJsonTo(member, out);
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

    private async saveParty(party: Party): Promise<void> {
        try {
            await this.opts.store.saveParty({
                _id: party.id,
                code: party.code,
                doc: {
                    leader: party.leader,
                    difficulty: party.difficulty,
                    openSeats: party.openSeats,
                    locked: party.locked,
                    room: party.room ?? null,
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
                        resume: this.resume.get(m.id)?.hash,
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

    private liveRoomsOf(key: string): number {
        let n = 0;
        for (const r of this.rooms.values())
            if (r.room.live && r.occupants.some(o => (o.accountId ? `acct:${o.accountId}` : '') === key)) n++;
        return n;
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
        if (!sim || this.stopped || this.gate.busy() || this.rooms.size >= maxRooms) return refuse();
        if (!ticketed && unticketedRooms >= maxRooms * PARTY_LIMITS.unticketedRoomShare) return refuse();
        if (
            party.members.some(
                m =>
                    m.identity.accountId &&
                    this.liveRoomsOf(`acct:${m.identity.accountId}`) >= PARTY_LIMITS.roomsLivePerIdentity
            )
        )
            return refuse();
        const entry = partySimFor(sim.version, sim.hash);
        if (!entry?.party) return refuse();
        // every member must run the leader's sim (the party is pinned to it)
        for (const m of party.members) {
            const ms = this.byMember.get(m.id)?.sim;
            if (ms && (ms.version !== sim.version || ms.hash !== sim.hash))
                this.sendJsonTo(m.id, { t: 'error', code: 'update_required' });
        }
        const ps = entry.party;
        const { picks, tricks } = ps.fillPicksParty(plan.seed, plan.seats as never);
        const config = {
            seed: plan.seed,
            picks: picks as string[],
            tricks: tricks as string[],
            difficulty: plan.difficulty,
            humans: plan.humans,
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
        const names: (string | null)[] = [null, null, null, null, null, null];
        for (const m of party.members) names[m.slot!] = m.name;
        const startMs = now + PARTY_TIMING.startInMs;
        const room = new Room(
            {
                id,
                humans: plan.humans,
                occupied: plan.occupied,
                difficulty: plan.difficulty,
                forfeitFrom: ps.forfeitFromOf(plan.difficulty),
                nowMs: now,
                startMs,
                phaseMs: phaseOf(id),
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
            heroSkins: [0, 1, 2, 3, 4, 5].map(slot => party.members.find(m => m.slot === slot)?.card?.image ?? null),
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
                lastSeq: [0, 0, 0],
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
        this.log('mp_match_start', { humans: plan.humans.length, difficulty: plan.difficulty });
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
        };
    }

    private bindSeat(s: Sock, live: LiveRoom, memberId: string, startInMs = 0): void {
        const slot = live.seats.get(memberId);
        if (slot === undefined) return;
        s.seatRoom = live.room.id;
        s.seatSlot = slot;
        if (s.pingTimer) clearInterval(s.pingTimer);
        s.pingTimer = setInterval(() => {
            if (s.ws.readyState === WebSocket.OPEN) s.ws.ping();
        }, PARTY_LIMITS.pingMatchMs);
        s.pingTimer.unref?.();
        live.room.connect(slot, this.now());
        this.sendJson(s, this.matchMsg(live, slot, startInMs) as unknown as Record<string, unknown>);
    }

    private claimOpenSeat(s: Sock, live: LiveRoom, party: Party, memberId: string): void {
        // P10: the lowest empty piloted slot
        const taken = new Set(live.seats.values());
        const slot = live.room.humans.find(h => !taken.has(h) && live.room.slots[h].reason === 'open');
        if (slot === undefined) return;
        const m = party.members.find(x => x.id === memberId);
        if (m) m.slot = slot;
        live.seats.set(memberId, slot);
        live.names[slot] = m?.name ?? null;
        live.occupants.push({
            slot,
            accountId: s.identity!.accountId,
            guestKeyHash: s.identity!.guestKeyHash,
            name: m?.name ?? '',
            ticketed: s.identity!.ticketed,
        });
        this.bindSeat(s, live, memberId);
        for (const other of live.seats.keys())
            if (other !== memberId)
                this.sendJsonTo(other, { t: 'slot', slot, reason: 'back', joined: true, name: m?.name });
    }

    private leaveSeat(s: Sock): void {
        const live = this.seatOf(s);
        if (!live) return;
        live.room.disconnect(s.seatSlot, this.now());
        s.seatRoom = null;
        s.seatSlot = -1;
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
                for (const [member, seat] of live.seats)
                    if (slot === null || seat === slot) this.sendJsonTo(member, msg);
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
            const r = live.room.intake(s.seatSlot, f.f.seq, f.f.cmd, now);
            if (r === 'bad_op') this.strike(s);
            if (r === 'ok') {
                try {
                    live.partySim.decodeCommand(f.f.cmd);
                } catch {
                    this.strike(s);
                }
            }
        } else if (f.type === Frame.BEAT) {
            live.room.beat(s.seatSlot, f.f.lastTurn, now);
            if (s.ws.readyState === WebSocket.OPEN)
                s.ws.send(encodeEcho({ clientMs: f.f.clientMs, serverMs: now >>> 0 }));
        } else if (f.type === Frame.HASH) {
            live.room.clientHash(s.seatSlot, f.f.tick, f.f.hash);
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
                this.log('referee_error', { message: m.message });
                live.room.unscored = 'referee';
                return;
        }
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
        if (room.live && !live.checkpointing && this.now() - live.lastCheckpointMs >= PARTY_LIMITS.checkpointEveryMs) {
            live.checkpointing = true;
            void this.checkpoint(live, false).finally(() => (live.checkpointing = false));
        }
        if (room.status === 'abandoned') {
            this.referee.close(room.id);
            void this.opts.store.finish(room.id, live.epoch, { status: 'abandoned' }, new Date(this.now()));
            for (const s of this.socketsOf(live)) this.error(s, 'room_gone');
            this.parties.matchEnded(live.party);
            this.rooms.delete(room.id);
        }
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
        if (live.ending) return;
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
        else this.log('checkpoint_lost', {});
        live.lastCheckpointMs = this.now();
        return ok;
    }

    async checkpointAll(handoff: boolean): Promise<void> {
        await Promise.all(
            [...this.rooms.values()].filter(r => r.room.live || handoff).map(r => this.checkpoint(r, handoff))
        );
    }

    /** SIGTERM: stop clocks, tell clients to come back in 3 s, write the final checkpoint with `handoff`. */
    async shutdown(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        this.scheduler.stop();
        for (const live of this.rooms.values()) for (const s of this.socketsOf(live)) this.error(s, 'room_gone', 3000);
        await this.checkpointAll(true);
        if (this.partyTimer) clearInterval(this.partyTimer);
        if (this.partyFlush) clearTimeout(this.partyFlush);
        for (const s of this.socks) s.ws.close(1012, 'restart');
        this.opts.server.off('upgrade', this.upgradeHandler);
        this.wss.close();
        this.gate.stop();
        await this.referee.shutdown();
    }

    /**
     * Boot restore (§3.6): claim live rooms handed off by (or stale on) another instance within the window, whose
     * bundle this relay holds. The clock and fan-out restart at once; the referee re-sims the log meanwhile (slots
     * stay piloted with reason `restore` until clients reconnect, catch up and send `back`). Others are abandoned.
     */
    async restore(): Promise<string[]> {
        const now = new Date(this.now());
        const got: string[] = [];
        const rows = await this.opts.store.restorable(
            this.opts.tickets.boot,
            now,
            PARTY_LIMITS.staleLeaseMs,
            PARTY_LIMITS.restoreWithinMs
        );
        for (const row of rows) {
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
                    forfeitFrom: entry.party.forfeitFromOf(claimed.config.difficulty),
                    nowMs: this.now(),
                    startMs: this.now(),
                    phaseMs: phaseOf(claimed._id),
                    restoredLog: bodies,
                    restoredSeq: claimed.lastSeq,
                    restoredPilotTicks: claimed.pilotTicks as never,
                },
                this.roomIO(claimed._id)
            );
            room.unscored = claimed.unscored;
            room.openUnclaimedAt1800 = claimed.openUnclaimedAt1800;
            const seats = new Map<string, number>();
            const names: (string | null)[] = [null, null, null, null, null, null];
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
                heroSkins: [null, null, null, null, null, null],
            };
            await this.restoreParty(claimed, live);
            this.rooms.set(claimed._id, live);
            this.referee.open(claimed._id, claimed.simVersion, claimed.simHash, claimed.config);
            for (const b of bodies) this.referee.turn(claimed._id, b);
            this.scheduler.add(room);
            got.push(claimed._id);
            this.log('restores', {});
        }
        await this.opts.store.abandonLive([...this.rooms.keys()], now);
        return got;
    }

    /** Rebuild the party and its members' resume tokens so reconnecting clients find their seats. */
    private async restoreParty(room: StoredRoom, live: LiveRoom): Promise<void> {
        const stored = await this.opts.store.getParty(room.party);
        if (!stored) return;
        const doc = stored.doc as {
            leader: string;
            difficulty: string;
            openSeats: boolean;
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
            }[];
        };
        const leaderDoc = doc.members.find(m => m.id === doc.leader) ?? doc.members[0];
        if (!leaderDoc) return;
        const identityOf = (m: typeof doc.members[number]): MemberIdentity => ({
            accountId: m.accountId,
            guestKeyHash: m.guestKeyHash,
            key: m.key,
            ticketed: m.ticketed,
            guest: m.guest,
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
            room._id
        );
        for (const m of doc.members) {
            if (m.resume)
                this.resume.set(m.id, {
                    hash: m.resume,
                    identityKey: m.key,
                    expMs: this.now() + PARTY_LIMITS.lobbyResumeMs,
                });
            if (m.slot !== undefined) live.seats.set(m.id, m.slot);
        }
        void party;
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
            ...this.tally,
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
