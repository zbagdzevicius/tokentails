/*
 * The Quick Play relay glue (docs/plans/moba/M1A-IMPL.md §5.1): the only place that knows both the party relay and
 * the matchmaker. The relay calls it through `MmHooks` (hooks, not logic, in party-relay.ts); it calls the relay back
 * through `MmRelayApi`. It owns the Matchmaker, the queued entries, `mm.status` fan-out, backfill offers, the rating
 * and leaver reads, the mm room records and the server counters.
 *
 * It never writes a score or a rating (mm-no-write.spec.ts): the hidden rating is written only by `/live`. The queue is
 * in memory in the one API instance; a restart sends `mm.cancel{server}` and clients re-queue (§5.6).
 */
import { createHash } from 'crypto';
import { clientIpKey } from '../../shared/client-ip';
import { partySimFor } from '../../vendor/pawlegends-sim';
import type { MemberIdentity, Party, PartyService } from '../party/party.service';
import { AFK_REASONS } from '../party/room';
import { PROTO_CLASSIC, teamOfSlot } from '../party/net';
import { DEFAULT_GLICKO, growRd, seedRating, type Glicko } from './glicko2';
import { CLEAN, leaverStatus, roomEvents, type LeaverStatus, type SeatEnd } from './leaver';
import {
    Matchmaker,
    randomId,
    type MmBackfillSeat,
    type MmEntry,
    type MmMatch,
    type MmMember,
    type MmSideChoice,
    isPvpQueue,
    type MmPvpQueue,
} from './matchmaker';
import { MM_CASUAL, MM_HOME_REGION, MM_LIMITS } from './mm-limits';
import { identityHash, type MmRoomMember, type MmRoomStore } from './mm-room.schema';
import type { MmRatingSource } from './rating.schema';

/** What the relay tells the glue about a socket. */
export interface MmSock {
    member: string;
    proto: number;
    identity: MemberIdentity;
    /** The resolved client address (S1 rule). Only hashed here, never stored or logged. */
    ip: string;
    /** The relay's /24 or /48 network key. */
    netKey: string;
    hint?: { maxDifficulty: string; newbie: boolean; matches?: number };
    sim: { version: number; hash: string };
    conn: 'on' | 'away';
}

export interface MmRoomSlot {
    slot: number;
    occupied: boolean;
    mode: 'human' | 'pilot';
    reason: string | null;
    connected: boolean;
    pilotTicks: Record<string, number>;
}

export interface MmRoomView {
    id: string;
    party: string;
    tick: number;
    live: boolean;
    ending: boolean;
    humans: readonly number[];
    slots: MmRoomSlot[];
    /** Identity keys seated in the room. */
    keys: string[];
    /** member id → slot */
    seats: Map<string, number>;
}

/** The relay, as the glue sees it. */
export interface MmRelayApi {
    parties: PartyService;
    now(): number;
    log(event: string, props: Record<string, unknown>): void;
    sock(member: string): MmSock | null;
    /** A JSON frame to a member's socket (the relay never sends an `mm.*` frame or a new error code to PROTO 1). */
    send(member: string, msg: Record<string, unknown>): void;
    /** The live-room caps (1 per identity, 4 per IP) allow seating this identity now. */
    canSeat(identity: MemberIdentity): boolean;
    room(roomId: string): MmRoomView | null;
    /** As `party.leave`: the seat, the party and the resume token, then the `left` party frame. */
    leaveParty(member: string): void;
    /**
     * A backfill: the member joins the room's party as a stranger and claims `slot` (Room.reopen + claimOpenSeat).
     * `holder` (the seat's AFK or dropped member) is evicted only once every check that can refuse has passed.
     */
    backfill(member: string, roomId: string, slot: number, holder?: string): boolean;
    /** The leaver of a backfilled seat: out of the party and the seat; a resume answers `seat_taken`. */
    evict(member: string, roomId: string): void;
    /** Give up this identity's seats in live Quick Play rooms held by a socket that is gone (not `except`). */
    release(identity: MemberIdentity, except: string): void;
    /** `mm.back`: this socket takes its identity's own live Quick Play seat back; false when there is none. */
    rejoin(member: string): boolean;
}

/** The relay's hooks into Quick Play. */
export interface MmHooks {
    onJson(member: string, msg: { t: string } & Record<string, unknown>): void;
    onPresence(member: string, state: 'on' | 'away' | 'off'): void;
    onTick(): void;
    onRoomStarted(roomId: string, party: Party): void;
    onRoomEnded(
        roomId: string,
        outcome: 'won' | 'lost' | null,
        endTick: number,
        voided?: 'remake' | null
    ): Promise<void>;
    onPartyChanged(party: Party): void;
    /** The member holds a queued entry (its resume token is kept while its socket is gone). */
    queued(member: string): boolean;
    shutdown(): void;
    /** A drain was called off (LIVE-MATCH-DEPLOYS.md §4.4: the newer relay went away): queue again. */
    resume(): void;
    counters(): Record<string, number>;
}

export interface MmDeps {
    rooms: MmRoomStore;
    ratings: MmRatingSource | null;
    newId?: () => string;
    /**
     * The e2e relay harness only (test/party-relay.harness.ts, browsers with no server history): the casual newbie lock
     * reads the client's `hint.matches`. Production (MmService) never sets it: the lock counts server records only.
     */
    trustHintMatches?: boolean;
}

/** How far back the completed Quick Play rooms of a guest-key identity count for the PvP newbie lock. */
const PLAYED_ROOMS_MS = 90 * 86_400_000;

/** The factory the relay takes (MmService in production; the default builds a memory-backed bridge). */
export interface MmHookFactory {
    hooks(api: MmRelayApi): MmHooks;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);

interface MatchedMember {
    member: string;
    identityKey: string;
    accountId: string | null;
    rating: Glicko;
    queueMs: number;
    ipKey: string;
}

/** A casual match waiting for every human's Accept (V16.md §4.1). */
interface PendingAccept {
    match: MmMatch;
    yes: Set<string>;
    need: Set<string>;
    deadlineMs: number;
}

interface LiveMm {
    party: string;
    side: 'cat' | 'dog';
    difficulty: string;
    sim: string;
    region: string;
    members: MmRoomMember[];
    /** member id → identity key (backfill: the leaver's key; the room's keys). */
    keys: Map<string, string>;
    ratings: Map<string, Glicko>;
    backfilled: Set<number>;
    pilotSince: Map<number, number>;
    offSince: Map<number, number>;
    left: Map<number, number>;
    /**
     * Casual PvP: slot → species of its team, and the address keys per team (a backfill never crosses them).
     * `teamSize` 5 for a 5v5 Classic room (queue 'classic', Hearthwood).
     */
    casual?: {
        species: ['cat' | 'dog', 'cat' | 'dog'];
        ips: [Set<string>, Set<string>];
        teamSize: 3 | 5;
        queue: MmPvpQueue;
    };
}

/** The team of a slot in a room with `teamSize` seats a side (casual 3, classic 5). */
const teamOf = (slot: number, teamSize = 3): 0 | 1 => teamOfSlot(slot, teamSize);
/** Seats per team of a formed match (classic: Hearthwood 5v5). */
const teamSizeOfMatch = (m: MmMatch): 3 | 5 => (m.map === 'hearthwood' ? 5 : 3);

export class MmBridge implements MmHooks {
    readonly mm: Matchmaker;
    private readonly entries = new Map<string, MmEntry>();
    private readonly byMember = new Map<string, string>();
    private readonly ratingOf = new Map<string, Glicko>();
    private readonly warnOf = new Map<string, boolean>();
    private readonly lastSide = new Map<string, number>();
    private readonly lastStatus = new Map<string, { ms: number; key: string }>();
    private readonly offSince = new Map<string, number>();
    private readonly pending = new Map<string, { match: MmMatch; members: MatchedMember[]; at: number }>();
    private readonly live = new Map<string, LiveMm>();
    private readonly joining = new Set<string>();
    /** `mm.leave` arrived while the join's reads ran: that join is dropped when they return. */
    private readonly joinAborted = new Set<string>();
    private readonly joins = {
        byKey: new Map<string, number[]>(),
        byIp: new Map<string, number[]>(),
        byNet: new Map<string, number[]>(),
    };
    private readonly leaverCache = new Map<string, { at: number; status: LeaverStatus }>();
    /** Casual matches waiting for Accept, by match id. */
    private readonly accepting = new Map<string, PendingAccept>();
    /** Dodges (a decline or no answer) per identity key: their times (2 free per UTC day, then +1 min each). */
    private readonly dodges = new Map<string, number[]>();
    /** Casual entries moved to co-op at 45 s (the status says so; Keep waiting re-sends casual). */
    private readonly switched = new Set<string>();
    private readonly tally = {
        mm_joins: 0,
        mm_matches: 0,
        mm_humans_1: 0,
        mm_humans_2: 0,
        mm_humans_3: 0,
        mm_fills_quiet: 0,
        mm_fills_normal: 0,
        mm_fills_busy: 0,
        mm_backfill_offers: 0,
        mm_backfills: 0,
        mm_leaver_events: 0,
        mm_refused: 0,
        mm_cancels: 0,
        mm_casual_matches: 0,
        mm_casual_humans: 0,
        mm_casual_switch: 0,
        mm_casual_dodges: 0,
        mm_casual_accepted: 0,
    };
    private readonly waits: number[] = [];
    private stopped = false;

    constructor(private readonly api: MmRelayApi, private readonly deps: MmDeps) {
        this.mm = new Matchmaker(() => api.now(), deps.newId ?? randomId);
    }

    // -----------------------------------------------------------------------------------------------------------
    // Client frames

    onJson(member: string, msg: { t: string } & Record<string, unknown>): void {
        if (this.stopped) return;
        switch (msg.t) {
            case 'mm.join':
                return void this.join(
                    member,
                    msg.side as MmSideChoice,
                    msg.region as string | undefined,
                    msg.queue === 'casual' || msg.queue === 'classic' ? msg.queue : 'coop'
                ).catch(e => this.api.log('mm_error', { message: String((e as Error)?.message || e).slice(0, 200) }));
            case 'mm.leave':
                return this.leaveQueue(member, 'left');
            case 'mm.side':
                return this.side(member, msg.side as MmSideChoice);
            case 'mm.backfill':
                return this.answer(member, msg.offer as string, msg.yes === true);
            case 'mm.accept':
                return this.accept(member, msg.match as string, msg.yes === true);
            case 'mm.back':
                if (this.queued(member)) this.leaveQueue(member, 'left');
                if (!this.api.rejoin(member)) this.api.send(member, { t: 'error', code: 'party_not_found' });
                return;
        }
    }

    queued(member: string): boolean {
        return this.byMember.has(member) || this.joining.has(member);
    }

    private refuse(member: string, code: string, retryMs?: number, reason = code): void {
        this.tally.mm_refused++;
        this.api.log('mm_refused', { reason });
        const msg: Record<string, unknown> = { t: 'error', code };
        if (retryMs !== undefined) msg.retryMs = retryMs;
        if (reason === 'pvp_newbie') msg.reason = reason;
        this.api.send(member, msg);
    }

    /**
     * Casual PvP needs PROTO 3 and a sim >= PVP_SINCE. 5v5 Classic (MAP-5V5.md §2.7) also needs PROTO 4 and a sim whose
     * MAP_IDS has 'hearthwood' (sim v19+); an older socket is told `update_required`.
     */
    private pvpCapable(sock: MmSock, queue: MmPvpQueue = 'casual'): boolean {
        const party = partySimFor(sock.sim.version, sock.sim.hash)?.party;
        const since = party?.PVP_SINCE;
        if (!(sock.proto >= 3 && !!since && sock.sim.version >= since)) return false;
        if (queue !== 'classic') return true;
        return sock.proto >= PROTO_CLASSIC && !!party?.MAP_IDS?.includes('hearthwood');
    }

    /** The refusal for a socket that cannot play `queue` (classic: `update_required`, PROTO 3 knows it). */
    private pvpRefusal(queue: MmPvpQueue): 'pvp_update_required' | 'update_required' {
        return queue === 'classic' ? 'update_required' : 'pvp_update_required';
    }

    /** The dodge wait of an identity now (2 free a UTC day, then +1 min per dodge). */
    private dodgeWaitMs(key: string, now: number): number {
        const day = now - (now % 86_400_000);
        const list = (this.dodges.get(key) ?? []).filter(t => t >= day);
        if (list.length) this.dodges.set(key, list);
        else this.dodges.delete(key);
        return Math.max(0, list.length - MM_CASUAL.dodgeFreePerDay) * MM_CASUAL.dodgePenaltyStepMs;
    }

    /** The ms until this socket may join again (0: allowed). Counts the attempt when allowed. */
    private joinBlockedMs(sock: MmSock, ipKey: string): number {
        const now = this.api.now();
        const j = MM_LIMITS.joins;
        const check = (m: Map<string, number[]>, k: string, limit: number) => {
            const list = (m.get(k) ?? []).filter(t => now - t < j.windowMs);
            if (list.length) m.set(k, list);
            else m.delete(k);
            return list.length >= limit ? list[list.length - limit] + j.windowMs - now : 0;
        };
        const wait = Math.max(
            check(this.joins.byKey, sock.identity.key, j.perIdentity),
            check(this.joins.byIp, ipKey, j.perIp),
            check(this.joins.byNet, sock.netKey, j.perNet)
        );
        if (wait > 0) return wait;
        for (const [m, k] of [
            [this.joins.byKey, sock.identity.key],
            [this.joins.byIp, ipKey],
            [this.joins.byNet, sock.netKey],
        ] as const) {
            const list = m.get(k) ?? [];
            list.push(now);
            if (list.length > 1024) list.splice(0, list.length - 1024);
            m.set(k, list);
        }
        return 0;
    }

    private async join(
        member: string,
        side: MmSideChoice,
        region?: string,
        queue: 'coop' | MmPvpQueue = 'coop'
    ): Promise<void> {
        const api = this.api;
        const sock = api.sock(member);
        if (!sock || sock.proto < 2) return;
        const pvp = isPvpQueue(queue);
        if (pvp && !this.pvpCapable(sock, queue))
            return this.refuse(
                member,
                this.pvpRefusal(queue),
                undefined,
                queue === 'classic' ? 'classic_proto' : 'pvp_proto'
            );
        // casual PvP: a newbie (fewer than 5 completed matches, by the hint) plays co-op first
        if (pvp && (sock.hint?.matches ?? 0) < MM_CASUAL.newbieMatches)
            return this.refuse(member, 'mm_locked', undefined, 'pvp_newbie');
        // already queued: a repeat join only changes the side (and Keep waiting puts a switched entry back in casual)
        if (this.byMember.has(member)) {
            const e = this.entries.get(this.byMember.get(member)!);
            if (e && queue === 'casual' && e.queue !== 'casual' && this.mm.keepCasual(e.id)) {
                e.queue = 'casual';
                e.keepCasual = true;
                this.switched.delete(e.id);
                api.log('mm_keep_waiting', {});
            }
            return this.side(member, side, true);
        }
        if (this.joining.has(member)) return;
        const parties = api.parties;
        let p = parties.partyOf(member);
        // Play online from a stranger's seat still in a match (the title after Leave, a second tab): that seat is given
        // up (a bot flies it, a backfill can take it), as `party.leave` would
        if (p?.mm && p.mm.strangers.has(member) && p.phase !== 'results' && p.phase !== 'lobby') {
            api.leaveParty(member);
            p = null;
        }
        // Play again after a Quick Play match: a stranger leaves the matched party and queues alone; a host friend
        // party's leader drops the strangers still there and queues the friends
        if (p?.mm && p.phase === 'results') {
            if (p.mm.strangers.has(member)) {
                api.leaveParty(member);
                p = null;
            } else if (p.leader === member) {
                for (const s of [...p.mm.strangers]) api.leaveParty(s);
                p = parties.byId(p.id);
            }
        }
        if (p) {
            // only the leader queues a friend party, and not from inside a Quick Play match: say so (never a silent
            // return: the card would spin forever)
            if (p.leader !== member || p.mm) return this.refuse(member, 'party_busy', undefined, 'party_role');
            // a trio queues PvP only (co-op seats three humans: a trio plays its own friend party)
            if (p.members.length > (pvp ? 3 : 2)) return this.refuse(member, 'party_full');
            if (p.phase !== 'lobby' && p.phase !== 'results') return this.refuse(member, 'party_busy');
            let old = false;
            for (const m of p.members) {
                const ms = api.sock(m.id);
                if (!ms || ms.proto < 2 || (pvp && !this.pvpCapable(ms, queue))) {
                    old = true;
                    if (ms)
                        api.send(m.id, {
                            t: 'error',
                            code: ms.proto >= 3 && pvp ? this.pvpRefusal(queue) : 'update_required',
                        });
                }
            }
            if (old) return this.refuse(member, 'party_busy', undefined, 'party_proto');
        }
        const ipKey = sha(`mm:${clientIpKey(sock.ip)}`);
        const blocked = this.joinBlockedMs(sock, ipKey);
        if (blocked > 0) return this.refuse(member, 'mm_locked', blocked, 'join_rate');
        const memberIds = p ? p.members.map(m => m.id) : [member];
        const socks = memberIds.map(id => api.sock(id)).filter((x): x is MmSock => !!x);
        if (socks.length !== memberIds.length) return this.refuse(member, 'party_busy', undefined, 'party_away');
        // the live-room caps (1 per identity, 4 per IP) are checked now, not after the fill: a seat this identity
        // still holds from a closed tab is given up; anything else is refused with a time (never a silent cancel)
        for (const s of socks) if (!api.canSeat(s.identity)) api.release(s.identity, s.member);
        if (socks.some(s => !api.canSeat(s.identity)))
            return this.refuse(member, 'mm_locked', MM_LIMITS.liveRoomRetryMs, 'live_room');
        // one entry per identity: the newest socket wins (the old entry is cancelled)
        for (const s of socks) {
            if (s.identity.key.startsWith('ip:')) continue;
            for (const e of this.entries.values())
                if (e.members.some(m => m.identityKey === s.identity.key)) this.cancelEntry(e, 'left');
        }
        const ipKeys = socks.map(s => sha(`mm:${clientIpKey(s.ip)}`));
        let perIp = 0;
        let perNet = 0;
        for (const e of this.entries.values()) {
            if (e.members.some(m => ipKeys.includes(m.ipKey))) perIp++;
            if (e.members.some(m => m.netKey === sock.netKey)) perNet++;
        }
        if (perIp >= MM_LIMITS.queued.perIp || perNet >= MM_LIMITS.queued.perNet)
            return this.refuse(member, 'mm_locked', 60_000, 'queued_cap');
        if (this.mm.size >= MM_LIMITS.queueMax) return this.refuse(member, 'server_busy', 15_000, 'queue_full');
        const partyId = p?.id ?? null;
        for (const id of memberIds) {
            this.joining.add(id);
            this.joinAborted.delete(id);
        }
        let ratings: Glicko[];
        let ladders: LeaverStatus[];
        let played: number[];
        try {
            [ratings, ladders, played] = await Promise.all([
                Promise.all(socks.map(s => this.ratingFor(s, queue))),
                Promise.all(socks.map(s => this.leaverFor(s.identity))),
                pvp ? Promise.all(socks.map(s => this.playedFor(s))) : Promise.resolve([]),
            ]);
        } finally {
            for (const id of memberIds) this.joining.delete(id);
        }
        // the world may have moved during the reads (a Cancel, a closed socket, a party change)
        const aborted = memberIds.some(id => this.joinAborted.has(id));
        for (const id of memberIds) this.joinAborted.delete(id);
        if (aborted || this.stopped || memberIds.some(id => !api.sock(id) || this.byMember.has(id))) return;
        if (partyId) {
            const again = parties.byId(partyId);
            if (!again || again.leader !== member || again.members.map(m => m.id).join() !== memberIds.join()) return;
            if (again.phase !== 'lobby' && again.phase !== 'results') return;
        } else if (parties.partyOf(member)) return;
        const now = api.now();
        const members: MmMember[] = socks.map((s, i) => ({
            member: s.member,
            identityKey: s.identity.key,
            accountId: s.identity.accountId,
            ipKey: ipKeys[i],
            netKey: s.netKey,
            rating: { r: ratings[i].r, rd: ratings[i].rd },
            newbie: !!s.hint?.newbie || ratings[i].rd > MM_LIMITS.newbieRd,
            maxDifficulty: s.hint?.maxDifficulty ?? null,
        }));
        // casual: the lock on server records (never the client's hint): fewer than 5 completed matches, or a rating
        // still wide open (rd > 300); an IP-only identity (no ticket, no guest key) has no record and never queues PvP
        if (
            pvp &&
            (played.some(n => n < MM_CASUAL.newbieMatches) || members.some(m => m.rating.rd > MM_CASUAL.newbieRd))
        )
            return this.refuse(member, 'mm_locked', undefined, 'pvp_newbie');
        const wait = Math.max(
            ...ladders.map(l => l.waitMs),
            ...(pvp ? socks.map(s => this.dodgeWaitMs(s.identity.key, now)) : [0])
        );
        const entry: MmEntry = {
            id: randomId(),
            partyId,
            members,
            queue,
            side,
            region: region === MM_HOME_REGION ? region : MM_HOME_REGION,
            sim: `${sock.sim.version}:${sock.sim.hash}`,
            enqueuedMs: now,
            notBeforeMs: wait > 0 ? now + wait : 0,
            awaySinceMs: socks.some(s => s.conn !== 'on') ? now : null,
        };
        const r = this.mm.join(entry);
        if (r === 'queue_full') return this.refuse(member, 'server_busy', 15_000, 'queue_full');
        if (r !== 'ok') return;
        this.entries.set(entry.id, entry);
        socks.forEach((s, i) => {
            this.byMember.set(s.member, entry.id);
            this.ratingOf.set(s.member, ratings[i]);
            this.warnOf.set(s.member, ladders[i].level >= 1);
            this.offSince.delete(s.member);
        });
        if (partyId) {
            const party = parties.byId(partyId);
            if (party) parties.setQueued(party, { sinceMs: now, side });
        }
        this.tally.mm_joins++;
        const level = Math.max(...ladders.map(l => l.level));
        api.log('mm_join', { queue, side, party_size: members.length, ...(level ? { penalty: level } : {}) });
        this.sendStatus(entry, true);
    }

    private async ratingFor(s: MmSock, queue: 'coop' | MmPvpQueue = 'coop'): Promise<Glicko> {
        // casual never seeds from the client's hint (it would pick its own start and, through it, its fill bots): no
        // row starts at the middle with rd at the newbie line, or at the top difficulty the server saw it play
        const casualSeed = async (): Promise<Glicko> => {
            const top = s.identity.accountId
                ? await this.deps.ratings?.played?.(s.identity.accountId).catch(() => null)
                : null;
            return top?.top
                ? seedRating(top.top)
                : { r: DEFAULT_GLICKO.r, rd: MM_CASUAL.newbieRd, sigma: DEFAULT_GLICKO.sigma };
        };
        const seed = isPvpQueue(queue) ? null : seedRating(s.hint?.maxDifficulty);
        if (!s.identity.accountId || !this.deps.ratings) return seed ?? (await casualSeed());
        try {
            // casual: its own row; before the first PvP match, the co-op row seeds it. Classic (5v5): its own row,
            // seeded by the casual row, then the co-op one (MAP-5V5.md §9.3: 3v3 casual ratings stay clean)
            const ratings = this.deps.ratings;
            const acct = s.identity.accountId;
            const row =
                (queue === 'classic' ? await ratings.get(acct, 'classic') : null) ??
                (isPvpQueue(queue) ? await ratings.get(acct, 'casual') : null) ??
                (await ratings.get(acct));
            if (!row) return seed ?? (await casualSeed());
            return growRd(
                { r: row.r, rd: row.rd, sigma: row.sigma },
                row.lastAt ? new Date(row.lastAt).getTime() : null,
                this.api.now()
            );
        } catch {
            return seed ?? { r: DEFAULT_GLICKO.r, rd: MM_CASUAL.newbieRd, sigma: DEFAULT_GLICKO.sigma };
        }
    }

    /**
     * Completed matches for the casual newbie lock, from server records only: an account's saved (replay-verified)
     * matches and rated games, and every identity's completed Quick Play rooms (not left, not voided). An IP-only
     * identity has none (its rooms are keyed per socket). A failed read counts as none (the lock holds).
     */
    private async playedFor(s: MmSock): Promise<number> {
        if (this.deps.trustHintMatches) return s.hint?.matches ?? 0;
        if (s.identity.key.startsWith('ip:')) return 0;
        const hash = identityHash(s.identity.key);
        const acct = s.identity.accountId;
        const r = this.deps.ratings;
        const [saved, coop, casual, rooms] = await Promise.all([
            acct && r?.played
                ? r.played(acct).then(
                      p => p?.matches ?? 0,
                      () => 0
                  )
                : 0,
            acct && r
                ? r.get(acct).then(
                      row => row?.games ?? 0,
                      () => 0
                  )
                : 0,
            acct && r
                ? r.get(acct, 'casual').then(
                      row => row?.games ?? 0,
                      () => 0
                  )
                : 0,
            this.deps.rooms.recentFor(hash, new Date(this.api.now() - PLAYED_ROOMS_MS)).then(
                list =>
                    list.filter(
                        room =>
                            room.endedAt &&
                            !room.void &&
                            room.members.some(m => m.identityHash === hash && m.event !== 'left')
                    ).length,
                () => 0
            ),
        ]);
        return Math.max(saved, coop + casual, rooms);
    }

    private async leaverFor(identity: MemberIdentity): Promise<LeaverStatus> {
        if (identity.key.startsWith('ip:')) return { ...CLEAN };
        const hash = identityHash(identity.key);
        const now = this.api.now();
        const hit = this.leaverCache.get(hash);
        if (hit && now - hit.at < MM_LIMITS.readCacheMs) return hit.status;
        try {
            const rooms = await this.deps.rooms.recentFor(hash, new Date(now - MM_LIMITS.leaver.windowMs));
            const status = leaverStatus(hash, rooms, now);
            this.leaverCache.set(hash, { at: now, status });
            if (this.leaverCache.size > 5000)
                for (const k of [...this.leaverCache.keys()].slice(0, 1000)) this.leaverCache.delete(k);
            return status;
        } catch {
            return { ...CLEAN };
        }
    }

    private side(member: string, side: MmSideChoice, force = false): void {
        const id = this.byMember.get(member);
        const e = id ? this.entries.get(id) : undefined;
        if (!e || e.side === side) return;
        const now = this.api.now();
        if (!force && now - (this.lastSide.get(member) ?? -Infinity) < MM_LIMITS.sideEveryMs) return;
        this.lastSide.set(member, now);
        e.side = side;
        this.mm.setSide(e.id, side);
        if (e.partyId) {
            const p = this.api.parties.byId(e.partyId);
            if (p?.queued) this.api.parties.setQueued(p, { sinceMs: p.queued.sinceMs, side });
        }
        this.sendStatus(e, true);
    }

    /** Remove an entry and tell its members why. */
    private cancelEntry(
        e: MmEntry,
        reason: 'left' | 'away' | 'party' | 'server' | 'update' | 'declined' | 'timeout',
        tell = true
    ): void {
        this.mm.leave(e.id);
        this.dropEntry(e);
        this.tally.mm_cancels++;
        if (tell) for (const m of e.members) this.api.send(m.member, { t: 'mm.cancel', reason });
        if (e.partyId) {
            const p = this.api.parties.byId(e.partyId);
            if (p?.queued) this.api.parties.setQueued(p, null);
        }
        this.api.log('mm_cancel', { by: reason, waited_s: Math.round((this.api.now() - e.enqueuedMs) / 1000) });
    }

    private dropEntry(e: MmEntry): void {
        this.entries.delete(e.id);
        this.lastStatus.delete(e.id);
        this.switched.delete(e.id);
        for (const m of e.members) {
            if (this.byMember.get(m.member) === e.id) this.byMember.delete(m.member);
            this.offSince.delete(m.member);
        }
    }

    private leaveQueue(member: string, reason: 'left' | 'party'): void {
        const id = this.byMember.get(member);
        const e = id ? this.entries.get(id) : undefined;
        // a Cancel on the Accept card is a decline
        const pend = e ? this.pendingOf(e.id) : null;
        if (pend) return this.failAccept(pend, [member], 'declined');
        if (e) return this.cancelEntry(e, e.members.length > 1 && reason === 'left' ? 'party' : reason);
        // a Cancel during the join's reads: drop that join when they return
        if (this.joining.has(member)) {
            const p = this.api.parties.partyOf(member);
            for (const m of p && p.leader === member ? p.members.map(x => x.id) : [member]) this.joinAborted.add(m);
            return;
        }
        // a Cancel that crossed `mm.found`: the stranger leaves the matched party before its room starts (a bot takes
        // the seat; no room, so no leaver event)
        const p = this.api.parties.partyOf(member);
        if (reason === 'left' && p?.mm && p.mm.strangers.has(member) && !p.room && p.phase !== 'results')
            this.api.leaveParty(member);
    }

    // -----------------------------------------------------------------------------------------------------------
    // Presence

    onPresence(member: string, state: 'on' | 'away' | 'off'): void {
        const id = this.byMember.get(member);
        const e = id ? this.entries.get(id) : undefined;
        if (!e) return;
        if (state === 'off') {
            this.offSince.set(member, this.api.now());
            this.mm.setAway(e.id, true);
            return;
        }
        this.offSince.delete(member);
        // a party entry is away while any member is
        const away =
            state === 'away' ||
            e.members.some(
                m => m.member !== member && (this.offSince.has(m.member) || this.api.sock(m.member)?.conn === 'away')
            );
        this.mm.setAway(e.id, away);
        if (state === 'on') this.sendStatus(e, true);
    }

    onPartyChanged(party: Party): void {
        if (this.stopped) return;
        for (const e of this.entries.values()) {
            if (e.partyId !== party.id) continue;
            const same =
                !party.ended &&
                party.members.length === e.members.length &&
                e.members.every(m => party.members.some(x => x.id === m.member)) &&
                (party.phase === 'lobby' || party.phase === 'results') &&
                !!party.queued;
            if (!same) this.cancelEntry(e, 'party');
            return;
        }
    }

    // -----------------------------------------------------------------------------------------------------------
    // The tick

    onTick(): void {
        if (this.stopped) return;
        const now = this.api.now();
        for (const [member, since] of [...this.offSince]) {
            if (now - since < MM_LIMITS.closedGraceMs) continue;
            const id = this.byMember.get(member);
            const e = id ? this.entries.get(id) : undefined;
            this.offSince.delete(member);
            if (e) this.cancelEntry(e, 'party');
        }
        // seats first: a backfillable seat is offered before a long-waiting solo is filled with bots
        this.scanRooms(now);
        this.prune(now);
        const t = this.mm.tick();
        for (const c of t.cancelled) {
            const e = this.entries.get(c.entry.id) ?? c.entry;
            this.dropEntry(e);
            for (const m of e.members) this.api.send(m.member, { t: 'mm.cancel', reason: 'away' });
            if (e.partyId) {
                const p = this.api.parties.byId(e.partyId);
                if (p?.queued) this.api.parties.setQueued(p, null);
            }
            this.tally.mm_cancels++;
        }
        for (const o of t.offers) {
            const e = this.entries.get(o.entry);
            const room = this.api.room(o.seat.room);
            if (!e || !room) {
                this.mm.answerOffer(o.offer, false);
                continue;
            }
            this.tally.mm_backfill_offers++;
            this.api.send(e.members[0].member, {
                t: 'mm.backfill.offer',
                offer: o.offer,
                side: o.seat.side,
                clockS: Math.floor(room.tick / 30),
                // the relay does not run the sim: no score is known here (the client shows the clock only)
                score: [0, 0],
                expiresMs: MM_LIMITS.backfill.offerMs,
            });
            this.api.log('mm_backfill_offer', { clock_s: Math.floor(room.tick / 30) });
        }
        for (const e of t.switched) {
            const mine = this.entries.get(e.id);
            if (!mine) continue;
            mine.queue = 'coop';
            this.switched.add(e.id);
            this.tally.mm_casual_switch++;
            this.api.log('mm_switch_coop', { waited_s: Math.round((now - e.enqueuedMs) / 1000) });
            this.sendStatus(mine, true);
        }
        for (const m of t.matches) {
            if (m.mode === 'casual') this.askAccept(m);
            else this.seat(m);
        }
        for (const pend of [...this.accepting.values()])
            if (pend.deadlineMs <= now)
                this.failAccept(
                    pend,
                    [...pend.need].filter(x => !pend.yes.has(x)),
                    'timeout'
                );
        this.idleStrangers(now);
        for (const e of this.entries.values()) this.sendStatus(e, false);
    }

    private sendStatus(e: MmEntry, force: boolean): void {
        const st = this.mm.status(e.id);
        if (!st) return;
        const now = this.api.now();
        const warn = e.members.some(m => this.warnOf.get(m.member));
        const key = `${e.queue}|${e.side}|${st.found}|${st.lowPriorityMs > 0}|${warn}`;
        const last = this.lastStatus.get(e.id);
        if (!force && last && last.key === key && now - last.ms < MM_LIMITS.statusEveryMs) return;
        this.lastStatus.set(e.id, { ms: now, key });
        if (this.pendingOf(e.id)) return;
        const msg: Record<string, unknown> = {
            t: 'mm.status',
            queue: e.queue,
            side: e.side,
            waitedMs: st.waitedMs,
            estimateMs: st.estimateMs,
            found: Math.min(e.queue === 'classic' ? 5 : 3, Math.max(1, st.found)),
        };
        if (isPvpQueue(e.queue)) msg.teams = [msg.found as number, 0];
        if (this.switched.has(e.id)) msg.from = 'casual';
        if (st.lowPriorityMs > 0) msg.lowPriorityMs = st.lowPriorityMs;
        if (warn) msg.warn = 'leaver';
        for (const m of e.members) this.api.send(m.member, msg);
    }

    /** A formed match becomes a party in `pick`; an entry that can no longer be seated is dropped, the rest re-queue. */
    private seat(match: MmMatch): void {
        const api = this.api;
        const group = match.entries.map(id => this.entries.get(id)).filter((e): e is MmEntry => !!e);
        const ok: MmEntry[] = [];
        for (const e of group) {
            const socks = e.members.map(m => api.sock(m.member));
            const present = socks.every(s => !!s && s.proto >= 2);
            // a seat from a closed tab is given up first (as at join); a cap still hit is refused with a time
            if (present) for (const s of socks) if (!api.canSeat(s!.identity)) api.release(s!.identity, s!.member);
            const seatable = present && socks.every(s => api.canSeat(s!.identity));
            const partyFine =
                !e.partyId ||
                (() => {
                    const p = api.parties.byId(e.partyId!);
                    return !!p && !p.mm && (p.phase === 'lobby' || p.phase === 'results');
                })();
            if (seatable && partyFine) ok.push(e);
            else {
                this.mm.leave(e.id);
                // never `server` here: the client reads `mm.cancel{server}` as a relay restart and waits for a welcome
                if (present && partyFine) {
                    this.cancelEntry(e, 'party', false);
                    for (const m of e.members)
                        api.send(m.member, { t: 'error', code: 'mm_locked', retryMs: MM_LIMITS.liveRoomRetryMs });
                    this.tally.mm_refused++;
                    api.log('mm_refused', { reason: 'live_room' });
                } else this.cancelEntry(e, 'party');
            }
        }
        if (ok.length !== group.length) {
            // put the others back with their place in the queue (they match again on the next tick)
            for (const e of ok) this.mm.join({ ...e, awaySinceMs: null });
            return;
        }
        for (const e of group) this.dropEntry(e);
        // a host friend party keeps its party (the oldest one queued); a party of 1 that is not the host is left
        const host = group.find(e => e.partyId && api.parties.byId(e.partyId)?.members.length);
        const ordered = host ? [host, ...group.filter(e => e !== host)] : group;
        const memberOrder = ordered.flatMap(e => e.members);
        for (const e of ordered) if (e !== host && e.partyId) for (const m of e.members) api.leaveParty(m.member);
        const casual = match.teams
            ? (() => {
                  const n = teamSizeOfMatch(match);
                  const slots: Record<string, number> = {};
                  match.teams[0].members.forEach((m, i) => (slots[m] = i));
                  match.teams[1].members.forEach((m, i) => (slots[m] = n + i));
                  return {
                      slots,
                      ...(match.map ? { map: match.map } : {}),
                      species: [match.teams[0].species, match.teams[1].species] as ['cat' | 'dog', 'cat' | 'dog'],
                      fillDifficulty: [match.teams[0].difficulty, match.teams[1].difficulty] as [string, string],
                      humans: Object.values(slots).sort((a, b) => a - b),
                      // pre-made parties by slot (V16 §4.2: a party mate's leave never opens a remake for the rest)
                      premade: group
                          .filter(e => e.members.length > 1)
                          .map(e => e.members.map(m => slots[m.member]).sort((a, b) => a - b)),
                  };
              })()
            : undefined;
        const opts = { match: match.id, side: match.side, difficulty: match.difficulty, ...(casual ? { casual } : {}) };
        const seatOf = (m: MmMember) => {
            const s = api.sock(m.member)!;
            return { id: m.member, identity: s.identity, hint: s.hint };
        };
        let party: Party | null;
        if (host) {
            party = api.parties.byId(host.partyId!);
            if (!party) return;
            api.parties.startMatched(
                party,
                opts,
                ordered.filter(e => e !== host).flatMap(e => e.members.map(seatOf))
            );
        } else party = api.parties.createMatched(memberOrder.map(seatOf), opts);
        const members: MatchedMember[] = [];
        for (const e of ordered)
            for (const m of e.members)
                members.push({
                    member: m.member,
                    identityKey: m.identityKey,
                    accountId: m.accountId,
                    rating: this.ratingOf.get(m.member) ?? { ...DEFAULT_GLICKO },
                    queueMs: match.waitedMs[e.id] ?? 0,
                    ipKey: m.ipKey,
                });
        this.pending.set(party.id, { match, members, at: api.now() });
        if (match.mode === 'casual') {
            this.tally.mm_casual_matches++;
            this.tally.mm_casual_humans += match.humans;
        }
        for (const m of members) {
            this.ratingOf.delete(m.member);
            this.warnOf.delete(m.member);
            this.waits.push(m.queueMs);
            // casual: `mm.found` went out with the Accept card already
            if (match.mode === 'casual') continue;
            api.send(m.member, {
                t: 'mm.found',
                side: match.side,
                humans: match.humans,
                bots: match.bots,
                difficulty: match.difficulty,
            });
        }
        if (this.waits.length > 1000) this.waits.splice(0, this.waits.length - 1000);
        this.tally.mm_matches++;
        if (match.mode !== 'casual') this.tally[`mm_humans_${match.humans}` as 'mm_humans_1']++;
        if (match.fill) this.tally[`mm_fills_${match.fill}` as 'mm_fills_quiet']++;
        api.log('mm_found', {
            humans: match.humans,
            bots: match.bots,
            difficulty: match.difficulty,
            side: match.side,
            ...(match.mode ? { mode: match.mode } : {}),
        });
    }

    // -----------------------------------------------------------------------------------------------------------
    // Casual PvP: the Accept card (V16.md §4.1)

    private pendingOf(entryId: string): PendingAccept | null {
        for (const p of this.accepting.values()) if (p.match.entries.includes(entryId)) return p;
        return null;
    }

    /** A casual match formed: every human gets `mm.found` with 10 s to Accept (a friend party accepts for itself). */
    private askAccept(match: MmMatch): void {
        const api = this.api;
        const now = api.now();
        const pend: PendingAccept = { match, yes: new Set(), need: new Set(), deadlineMs: now + MM_CASUAL.acceptMs };
        for (const id of match.entries) {
            const e = this.entries.get(id);
            if (!e) continue;
            for (const m of e.members) {
                pend.need.add(m.member);
                // D11: a friend party's own members skip the card (their leader queued them together)
                if (e.partyId && e.members.length > 1) pend.yes.add(m.member);
            }
        }
        this.accepting.set(match.id, pend);
        const teams = match.teams!;
        for (const member of pend.need) {
            const t = teams[0].members.includes(member) ? 0 : 1;
            const mine = teams[t];
            const theirs = teams[1 - t];
            api.send(member, {
                t: 'mm.found',
                mode: 'casual',
                match: match.id,
                side: mine.species,
                humans: mine.humans,
                bots: mine.bots,
                difficulty: 'hard',
                teams: [
                    [mine.humans, mine.bots],
                    [theirs.humans, theirs.bots],
                ],
                acceptByMs: MM_CASUAL.acceptMs,
                ...(match.map ? { map: match.map, teamSize: teamSizeOfMatch(match) } : {}),
            });
        }
        api.log('mm_found', {
            mode: 'casual',
            humans: match.humans,
            bots: match.bots,
            ...(match.map ? { map: match.map } : {}),
        });
        if (pend.yes.size === pend.need.size) this.acceptDone(pend);
    }

    private accept(member: string, matchId: string, yes: boolean): void {
        const pend = this.accepting.get(matchId);
        if (!pend || !pend.need.has(member)) return;
        if (!yes) return this.failAccept(pend, [member], 'declined');
        pend.yes.add(member);
        for (const m of pend.need)
            this.api.send(m, { t: 'mm.accepted', match: matchId, yes: pend.yes.size, need: pend.need.size });
        if (pend.yes.size === pend.need.size) this.acceptDone(pend);
    }

    private acceptDone(pend: PendingAccept): void {
        this.accepting.delete(pend.match.id);
        this.tally.mm_casual_accepted++;
        this.seat(pend.match);
    }

    /**
     * Someone declined (or let the 10 s pass): their entry leaves the queue with a dodge (2 free a day, then +1 min
     * each); every other entry goes back to the front of the queue (its wait kept) and is told so.
     */
    private failAccept(pend: PendingAccept, dodgers: string[], reason: 'declined' | 'timeout'): void {
        this.accepting.delete(pend.match.id);
        const now = this.api.now();
        for (const id of pend.match.entries) {
            const e = this.entries.get(id);
            if (!e) continue;
            const dodged = e.members.some(m => dodgers.includes(m.member));
            if (dodged) {
                for (const m of e.members) {
                    if (!dodgers.includes(m.member) || m.identityKey.startsWith('ip:')) continue;
                    const list = this.dodges.get(m.identityKey) ?? [];
                    list.push(now);
                    this.dodges.set(m.identityKey, list.slice(-16));
                }
                this.tally.mm_casual_dodges++;
                this.cancelEntry(e, reason);
                continue;
            }
            if (this.mm.join({ ...e, awaySinceMs: null }) !== 'ok') {
                this.cancelEntry(e, 'party');
                continue;
            }
            this.lastStatus.delete(e.id);
            const st = this.mm.status(e.id);
            for (const m of e.members)
                this.api.send(m.member, {
                    t: 'mm.status',
                    queue: e.queue,
                    side: e.side,
                    waitedMs: st?.waitedMs ?? 0,
                    estimateMs: st?.estimateMs ?? 5000,
                    found: e.members.length,
                    teams: [e.members.length, 0],
                    requeued: true,
                });
        }
        this.api.log('mm_dodge', { reason, n: dodgers.length });
    }

    // -----------------------------------------------------------------------------------------------------------
    // Rooms: the record, backfill seats, events

    onRoomStarted(roomId: string, party: Party): void {
        const pend = this.pending.get(party.id);
        this.pending.delete(party.id);
        if (!party.mm || !pend) return;
        const slotOf = new Map(party.members.map(m => [m.id, m.slot ?? -1]));
        const members: MmRoomMember[] = [];
        const keys = new Map<string, string>();
        const ratings = new Map<string, Glicko>();
        const queueMs: Record<string, number> = {};
        const ips = new Map<number, string>();
        for (const m of pend.members) {
            const slot = slotOf.get(m.member);
            if (slot === undefined || slot < 0) continue;
            members.push({
                slot,
                identityHash: m.identityKey.startsWith('ip:')
                    ? sha(`ipmember:${m.member}`)
                    : identityHash(m.identityKey),
                accountId: m.accountId,
                joinedTick: 0,
                backfill: false,
                ratingAtStart: { r: m.rating.r, rd: m.rating.rd, sigma: m.rating.sigma },
            });
            ips.set(slot, m.ipKey);
            keys.set(m.member, m.identityKey);
            ratings.set(m.member, m.rating);
            queueMs[String(slot)] = m.queueMs;
        }
        const humans = members.map(m => m.slot);
        const n = teamSizeOfMatch(pend.match);
        const live: LiveMm = {
            party: party.id,
            side: pend.match.side,
            difficulty: pend.match.difficulty,
            sim: pend.match.sim,
            region: pend.match.region,
            members,
            keys,
            ratings,
            backfilled: new Set(),
            pilotSince: new Map(),
            offSince: new Map(),
            left: new Map(),
            ...(pend.match.teams
                ? {
                      casual: {
                          species: [pend.match.teams[0].species, pend.match.teams[1].species] as [
                              'cat' | 'dog',
                              'cat' | 'dog'
                          ],
                          ips: [
                              new Set([...ips].filter(([s]) => teamOf(s, n) === 0).map(([, k]) => k)),
                              new Set([...ips].filter(([s]) => teamOf(s, n) === 1).map(([, k]) => k)),
                          ] as [Set<string>, Set<string>],
                          teamSize: n,
                          queue: pend.match.map === 'hearthwood' ? ('classic' as const) : ('casual' as const),
                      },
                  }
                : {}),
        };
        this.live.set(roomId, live);
        const casual = pend.match.teams;
        void this.deps.rooms
            .create({
                _id: roomId,
                queue: casual ? (pend.match.map === 'hearthwood' ? 'classic' : 'casual') : 'coop',
                ...(casual
                    ? {
                          mode: 'casual' as const,
                          teams: casual.map((t, i) => ({
                              species: t.species,
                              slots: humans.filter(s => teamOf(s, n) === i),
                              difficulty: t.difficulty,
                              rating: Math.round(t.rating),
                          })),
                          ...(pend.match.map ? { map: pend.match.map } : {}),
                      }
                    : {}),
                region: pend.match.region,
                side: pend.match.side,
                difficulty: pend.match.difficulty,
                sim: pend.match.sim,
                fill: Array.from({ length: casual ? 2 * n : 3 }, (_, s) => s).filter(s => !humans.includes(s)),
                queueMs,
                members,
                createdAt: new Date(this.api.now()),
            })
            .catch(() => this.api.log('mm_store_failed', {}));
    }

    /** Every tick: which human seats of the live mm rooms are backfillable (§3), and the leave/offline bookkeeping. */
    private scanRooms(now: number): void {
        for (const [roomId, lm] of this.live) {
            const room = this.api.room(roomId);
            if (!room) continue;
            const hostParty = this.api.parties.byId(lm.party);
            for (const s of room.slots) {
                if (!room.humans.includes(s.slot)) continue;
                if (!s.connected) {
                    if (!lm.offSince.has(s.slot)) lm.offSince.set(s.slot, now);
                } else lm.offSince.delete(s.slot);
                const leftSeat = !s.occupied;
                if (leftSeat && !lm.left.has(s.slot)) lm.left.set(s.slot, room.tick);
                // a friend in a host friend party is never backfilled while their seat exists (only a seat they left):
                // a phone call or app switch must not cost them their friends' match
                const holderNow = [...room.seats].find(([, slot]) => slot === s.slot)?.[0];
                const friend = !!holderNow && !!hostParty?.mm?.host && !hostParty.mm.strangers.has(holderNow);
                const afkPilot =
                    !friend && s.mode === 'pilot' && (s.reason === 'drop' || s.reason === 'away' || s.reason === 'afk');
                if (afkPilot && !lm.pilotSince.has(s.slot)) lm.pilotSince.set(s.slot, now);
                if (!afkPilot && !leftSeat) {
                    lm.pilotSince.delete(s.slot);
                    if (this.mm.hasSeat(roomId, s.slot)) this.mm.dropBackfillSeat(roomId, s.slot);
                    continue;
                }
                const open =
                    room.live &&
                    !room.ending &&
                    room.tick < MM_LIMITS.backfill.beforeTick &&
                    !lm.backfilled.has(s.slot) &&
                    (leftSeat || now - (lm.pilotSince.get(s.slot) ?? now) >= MM_LIMITS.backfill.pilotedMs);
                if (!open) {
                    if (
                        this.mm.hasSeat(roomId, s.slot) &&
                        (room.tick >= MM_LIMITS.backfill.beforeTick || !room.live || room.ending)
                    )
                        this.mm.dropBackfillSeat(roomId, s.slot);
                    continue;
                }
                if (this.mm.hasSeat(roomId, s.slot)) continue;
                const holder = [...room.seats].find(([, slot]) => slot === s.slot)?.[0];
                const holderRow = lm.members
                    .filter(m => m.slot === s.slot)
                    .sort((a, b) => b.joinedTick - a.joinedTick)[0];
                const leaverKey = (holder && lm.keys.get(holder)) ?? holderRow?.identityHash ?? '';
                // casual: the seat's own team (its species, its rating, never an address of the other team)
                const n = lm.casual?.teamSize ?? 3;
                const team = teamOf(s.slot, n);
                const rs = lm.members
                    .filter(m => !lm.casual || teamOf(m.slot, n) === team)
                    .map(m => m.ratingAtStart?.r ?? 1500);
                const seat: MmBackfillSeat = {
                    room: roomId,
                    slot: s.slot,
                    side: lm.casual ? lm.casual.species[team] : lm.side,
                    sim: lm.sim,
                    region: lm.region,
                    difficulty: lm.difficulty,
                    teamRating: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1500,
                    leaverKey,
                    inRoomKeys: [...new Set([...room.keys, ...lm.keys.values()])],
                    sinceMs: now,
                    ...(lm.casual ? { queue: lm.casual.queue, otherTeamIps: [...lm.casual.ips[1 - team]] } : {}),
                };
                this.mm.addBackfillSeat(seat);
            }
        }
    }

    private answer(member: string, offerId: string, yes: boolean): void {
        const o = this.mm.offerOf(offerId);
        const id = this.byMember.get(member);
        if (!o || !id || o.entry !== id) return;
        const e = this.entries.get(id)!;
        const taken = this.mm.answerOffer(offerId, yes);
        this.api.log('mm_backfill_join', { answer: yes ? 'yes' : 'no' });
        if (!taken) return;
        const lm = this.live.get(o.seat.room);
        const room = this.api.room(o.seat.room);
        const ok =
            !!lm &&
            !!room &&
            room.live &&
            !room.ending &&
            room.tick < MM_LIMITS.backfill.beforeTick &&
            !lm.backfilled.has(o.seat.slot) &&
            room.slots[o.seat.slot]?.mode === 'pilot' &&
            !!this.api.sock(member) &&
            this.api.canSeat(this.api.sock(member)!.identity);
        if (!ok) {
            // the seat is gone: back in the queue with the same place
            this.mm.join({ ...e, awaySinceMs: null });
            return;
        }
        // a leaver still in the party (dropped or AFK) is evicted by the relay, and only once the backfill can no longer
        // be refused; the leaver's row gets its event only when the seat really changed hands
        const holder = [...room!.seats].find(([, slot]) => slot === o.seat.slot)?.[0];
        if (!this.api.backfill(member, o.seat.room, o.seat.slot, holder && holder !== member ? holder : undefined)) {
            this.mm.join({ ...e, awaySinceMs: null });
            return;
        }
        const holderRow = lm!.members
            .filter(m => m.slot === o.seat.slot && !m.event)
            .sort((a, b) => b.joinedTick - a.joinedTick)[0];
        if (holderRow) {
            holderRow.event = 'left';
            holderRow.eventTick = lm!.left.get(o.seat.slot) ?? room!.tick;
        }
        this.dropEntry(e);
        lm!.backfilled.add(o.seat.slot);
        lm!.left.delete(o.seat.slot);
        lm!.pilotSince.delete(o.seat.slot);
        lm!.offSince.delete(o.seat.slot);
        const m = e.members[0];
        const rating = this.ratingOf.get(member) ?? { ...DEFAULT_GLICKO };
        this.ratingOf.delete(member);
        lm!.keys.set(member, m.identityKey);
        const row: MmRoomMember = {
            slot: o.seat.slot,
            identityHash: m.identityKey.startsWith('ip:') ? sha(`ipmember:${member}`) : identityHash(m.identityKey),
            accountId: m.accountId,
            joinedTick: room!.tick,
            backfill: true,
            ratingAtStart: { ...rating },
        };
        lm!.members.push(row);
        this.tally.mm_backfills++;
        void this.deps.rooms.addMember(o.seat.room, row).catch(() => undefined);
    }

    async onRoomEnded(
        roomId: string,
        outcome: 'won' | 'lost' | null,
        endTick: number,
        voided: 'remake' | null = null
    ): Promise<void> {
        const lm = this.live.get(roomId);
        if (!lm) return;
        this.live.delete(roomId);
        for (let slot = 0; slot < 2 * (lm.casual?.teamSize ?? 3); slot++) this.mm.dropBackfillSeat(roomId, slot);
        const room = this.api.room(roomId);
        const now = this.api.now();
        const seats: SeatEnd[] = (room?.slots ?? [])
            .filter(s => room!.humans.includes(s.slot))
            .map(s => ({
                slot: s.slot,
                left: lm.left.has(s.slot),
                leftTick: lm.left.get(s.slot),
                offSinceMs: lm.offSince.get(s.slot) ?? null,
                pilotTicks: Object.fromEntries(AFK_REASONS.map(r => [r, s.pilotTicks[r] ?? 0])),
            }));
        const members = roomEvents(lm.members, seats, endTick, now, 1000 / 30);
        this.tally.mm_leaver_events += members.filter(m => m.event).length;
        try {
            await this.deps.rooms.finish(roomId, members, outcome, new Date(now), voided);
        } catch {
            this.api.log('mm_store_failed', {});
        }
        // the leaver ladders of these identities read fresh next time
        for (const m of members) this.leaverCache.delete(m.identityHash);
    }

    private prunedMs = -Infinity;
    /**
     * Once a minute: forget what can no longer matter (guest identities cost nothing, so nothing may grow per key):
     * matches whose room never started (pick abandoned, start refused, the party dropped `mm`), join logs past the
     * window, side-change stamps.
     */
    private prune(now: number): void {
        if (now - this.prunedMs < 60_000) return;
        this.prunedMs = now;
        for (const [pid, pend] of this.pending) {
            const p = this.api.parties.byId(pid);
            const waiting = !!p && !p.ended && !!p.mm && p.mm.match === pend.match.id && !p.room;
            if (!waiting || now - pend.at > MM_LIMITS.pendingMaxMs) this.pending.delete(pid);
        }
        const j = MM_LIMITS.joins;
        for (const m of [this.joins.byKey, this.joins.byIp, this.joins.byNet])
            for (const [k, list] of m) if (!list.length || now - list[list.length - 1] >= j.windowMs) m.delete(k);
        for (const [k, at] of this.lastSide) if (now - at >= MM_LIMITS.sideEveryMs) this.lastSide.delete(k);
        for (const [k, at] of this.leaverCache) if (now - at.at >= MM_LIMITS.readCacheMs) this.leaverCache.delete(k);
    }

    /** A stranger idle 60 s in results leaves the matched party. */
    private idleStrangers(now: number): void {
        for (const p of this.api.parties.all()) {
            if (!p.mm || p.phase !== 'results' || p.mm.resultsSinceMs === undefined) continue;
            if (now - p.mm.resultsSinceMs < MM_LIMITS.resultsIdleMs) continue;
            for (const s of [...p.mm.strangers]) if (!this.byMember.has(s)) this.api.leaveParty(s);
        }
    }

    shutdown(): void {
        if (this.stopped) return;
        for (const e of [...this.entries.values()]) this.cancelEntry(e, 'server');
        this.stopped = true;
    }

    resume(): void {
        this.stopped = false;
    }

    counters(): Record<string, number> {
        const w = [...this.waits].sort((a, b) => a - b);
        const q = (p: number) => (w.length ? w[Math.min(w.length - 1, Math.floor(w.length * p))] : 0);
        return { mm_queued: this.mm.size, mm_wait_ms_p50: q(0.5), mm_wait_ms_p95: q(0.95), ...this.tally };
    }

    /** Test seam: the entry of a member. */
    entryOf(member: string): MmEntry | null {
        const id = this.byMember.get(member);
        return id ? this.entries.get(id) ?? null : null;
    }
}

/** The memory-backed bridge a relay built without Nest uses (specs, the e2e harness). */
export const memoryMm = (deps: MmDeps): MmHookFactory => ({ hooks: api => new MmBridge(api, deps) });
