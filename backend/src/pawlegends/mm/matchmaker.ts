/*
 * The Quick Play matchmaker (docs/plans/moba/M1A-IMPL.md §2, §3): a pure class in the style of party.service.ts and
 * room.ts. No I/O, no timers; time comes in through `now`, ids through `newId`, JSON in and out. The relay glue
 * (mm-bridge.ts) owns the sockets, calls `tick()` every 500 ms and turns its matches into parties.
 *
 * M1b casual (docs/plans/moba/V16.md §4.1, casual.ts): two teams of up to three humans (slots 0..2 and 3..5), bots in
 * the empty seats after 30 s, the left-side species alternating per pool, a move to co-op at 45 s without an opponent.
 *
 * M1a co-op: up to three humans on one team (slots 0..2), the enemy is bots. Entries match only with the same region,
 * queue and sim (rooms are pinned to one sim). Cats and dogs never share a team; `any` joins either. A friend party of
 * 1 or 2 queues as one entry. Empty teammate seats are plain sim bots (§2.5).
 */
import { randomBytes } from 'crypto';
import {
    bestCasual,
    matchFillDifficulty,
    pvpRulesOf,
    team0SpeciesNext,
    teamRating,
    type CasualPlan,
    type PvpQueueRules,
    type Species,
} from './casual';
import {
    difficultyAllowed,
    matchDifficulty,
    matchSide,
    MM_DIFFICULTIES,
    partyRating,
    sidesCompatible,
    type MmDifficulty,
} from './fill';
import { fillAtMs, MM_CASUAL, MM_CLASSIC, MM_LIMITS, MM_RANKED, pairFillMs } from './mm-limits';
import { inPrimeTime } from '../ranked/windows';

/**
 * The PvP queues (two teams of humans): casual 3v3, classic 5v5 (MAP-5V5.md §9.3) and ranked 3v3 (SOCIAL-RANKED.md
 * §7.1: solo or duo; §7.11: labelled bots after the fill, vs AI after that, only for entries that sent `bots`).
 */
export type MmPvpQueue = 'casual' | 'classic' | 'ranked';
export const isPvpQueue = (q: string | undefined): q is MmPvpQueue =>
    q === 'casual' || q === 'classic' || q === 'ranked';
/** The most members one entry may hold in a queue (ranked: solo or duo; other PvP: a trio; co-op: a duo). */
export const maxPartyOf = (q: string): number => (q === 'ranked' ? MM_RANKED.maxParty : isPvpQueue(q) ? 3 : 2);

export type MmSideChoice = 'cat' | 'dog' | 'any';

export interface MmMember {
    member: string;
    /** acct:… | guest:… | ip:… (MemberIdentity.key). */
    identityKey: string;
    accountId: string | null;
    /** Hashed clientIpKey of the socket's address (abuse caps only). */
    ipKey: string;
    /** Hashed /24 or /48 network. */
    netKey: string;
    rating: { r: number; rd: number };
    newbie: boolean;
    /** Hint: caps the room difficulty (never raises it). */
    maxDifficulty: string | null;
}

export interface MmEntry {
    id: string;
    /** A friend party queued as one entry (its leader's party), else null. */
    partyId: string | null;
    members: MmMember[];
    /**
     * 'casual': PvP (solo, duo or trio). A casual entry moves to 'coop' at 45 s without an opponent. 'classic': 5v5 on
     * Hearthwood (PROTO 4); it never moves to co-op, bots fill at 45 s.
     */
    queue: 'coop' | MmPvpQueue;
    /** Keep waiting: a casual entry that never moves to co-op by itself. */
    keepCasual?: boolean;
    /** The low-priority wait before the co-op switch's grace (restored by Keep waiting). */
    penaltyUntilMs?: number;
    side: MmSideChoice;
    region: string;
    /** `${simVersion}:${simHash}`. */
    sim: string;
    enqueuedMs: number;
    /** Low-priority wait (the leaver ladder); 0 when clean. */
    notBeforeMs: number;
    /** Tab hidden since (skipped; cancelled after awayCancelMs), else null. */
    awaySinceMs: number | null;
    /** Ranked (§7.11): the game labels bots, so a quiet queue may fill this search with them or play it vs AI. */
    bots?: boolean;
}

export interface MmMatch {
    id: string;
    region: string;
    sim: string;
    side: 'cat' | 'dog';
    difficulty: string;
    /** Oldest first. */
    entries: string[];
    /** Member ids in slot order: the oldest entry's first member is slot 0. */
    members: string[];
    humans: number;
    bots: number;
    waitedMs: Record<string, number>;
    /** The pool's fill band when the match formed by a bot fill (null: three humans). */
    fill: 'quiet' | 'normal' | 'busy' | null;
    /** Casual PvP: two teams (team 0 plays on the left, slots 0..2; team 1 slots 3..5). Absent for co-op. */
    mode?: 'casual';
    /** The PvP queue the match formed in (absent for co-op). */
    queue?: MmPvpQueue;
    teams?: [MmTeam, MmTeam];
    /** 5v5 Classic (queue 'classic'): Hearthwood Divide, slots 0..4 and 5..9. Absent: Crossing, 3 a team. */
    map?: 'hearthwood';
    /**
     * Ranked vs AI (SOCIAL-RANKED.md §7.11): a co-op shaped match (no teams) from the ranked queue: one team of players
     * against bots. `queue` is 'ranked'.
     */
    vsAi?: boolean;
}

export interface MmTeam {
    species: Species;
    entries: string[];
    /** Member ids, oldest entry first (they take the team's slots in this order). */
    members: string[];
    humans: number;
    bots: number;
    /** The bot profile of this team's fill seats (casual: the same for both teams, from the mean of every human). */
    difficulty: 'easy' | 'normal' | 'hard';
    rating: number;
}

export interface MmBackfillSeat {
    room: string;
    slot: number;
    side: 'cat' | 'dog';
    sim: string;
    region: string;
    difficulty: string;
    teamRating: number;
    /** Identity key of the member who left the seat (never offered it back). */
    leaverKey: string;
    /** Identity keys already in the room. */
    inRoomKeys: string[];
    sinceMs: number;
    /** Casual PvP: only a casual (classic) solo takes it, never from the same address as the other team. */
    queue?: 'coop' | MmPvpQueue;
    /** Casual PvP: address keys seated on the other team. */
    otherTeamIps?: string[];
}

export interface MmOffer {
    offer: string;
    entry: string;
    seat: MmBackfillSeat;
    expiresMs: number;
}

export interface MmTick {
    matches: MmMatch[];
    offers: MmOffer[];
    /** Offers that timed out unanswered (the seat goes to the next candidate). */
    expired: MmOffer[];
    cancelled: { entry: MmEntry; reason: 'away' }[];
    /** Casual entries that waited 45 s without an opponent and moved to the co-op pool. */
    switched: MmEntry[];
}

export interface MmStatus {
    waitedMs: number;
    estimateMs: number;
    found: number;
    lowPriorityMs: number;
    /** Ranked: players searching in this pool now (this entry included). */
    searching?: number;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomId(): string {
    const b = randomBytes(12);
    let s = '';
    for (let i = 0; i < 12; i++) s += ID_ALPHABET[b[i] % 36];
    return s;
}

const poolKey = (e: { region: string; queue: string; sim: string }) => `${e.region}|${e.queue}|${e.sim}`;

/** The queue rating of an entry (a duo: mean + 0.25 × (max − mean)) and its widest RD. */
export function entryRating(e: MmEntry): { r: number; rd: number } {
    return {
        r: e.members.length === 1 ? e.members[0].rating.r : partyRating(e.members.map(m => m.rating.r)),
        rd: Math.max(...e.members.map(m => m.rating.rd)),
    };
}

const isNewbie = (e: MmEntry) => e.members.some(m => m.newbie);

export class Matchmaker {
    private readonly entries = new Map<string, MmEntry>();
    private readonly seats: MmBackfillSeat[] = [];
    private readonly offers = new Map<string, MmOffer>();
    /** Entries that declined (or let expire) an offer for a seat: `${room}:${slot}` → entry ids. */
    private readonly declined = new Map<string, Set<string>>();
    /** Offers made per identity key (the 3 per 10 minutes cap). */
    private readonly offerLog = new Map<string, number[]>();
    /** Joins per pool: [ms, address key] (the arrival-rate estimator counts addresses: guest keys cost nothing). */
    private readonly arrivals = new Map<string, { ms: number; key: string }[]>();
    /** Sides of the recent matches per region (side balance when everyone asked for either). */
    private readonly recentSides = new Map<string, ('cat' | 'dog')[]>();
    /** Casual: the species that played on the left (team 0) in the recent matches, per pool. */
    private readonly recentLeft = new Map<string, Species[]>();
    /** The human count of each waiting entry's best combination at the last tick (the status pips). */
    private readonly found = new Map<string, number>();

    constructor(
        private readonly now: () => number = Date.now,
        private readonly newId: () => string = randomId,
        private readonly limits = MM_LIMITS
    ) {}

    get size(): number {
        return this.entries.size;
    }

    entry(id: string): MmEntry | null {
        return this.entries.get(id) ?? null;
    }

    all(): MmEntry[] {
        return [...this.entries.values()];
    }

    /** The entry holding this member, or null. */
    entryOf(member: string): MmEntry | null {
        for (const e of this.entries.values()) if (e.members.some(m => m.member === member)) return e;
        return null;
    }

    join(e: MmEntry): 'ok' | 'already_queued' | 'queue_full' | 'bad_entry' {
        const max = maxPartyOf(e.queue);
        if (e.members.length < 1 || e.members.length > max || (e.queue !== 'coop' && !isPvpQueue(e.queue)))
            return 'bad_entry';
        if (this.entries.has(e.id)) return 'already_queued';
        for (const o of this.entries.values())
            for (const m of e.members)
                if (
                    o.members.some(
                        x =>
                            x.member === m.member ||
                            (!m.identityKey.startsWith('ip:') && x.identityKey === m.identityKey)
                    )
                )
                    return 'already_queued';
        if (this.entries.size >= this.limits.queueMax) return 'queue_full';
        this.entries.set(e.id, { ...e, members: e.members.map(m => ({ ...m, rating: { ...m.rating } })) });
        const key = poolKey(e);
        const list = this.arrivals.get(key) ?? [];
        const now = this.now();
        for (const m of e.members) list.push({ ms: now, key: m.ipKey || m.identityKey });
        this.arrivals.set(key, list);
        return 'ok';
    }

    leave(entryId: string): MmEntry | null {
        const e = this.entries.get(entryId);
        if (!e) return null;
        this.entries.delete(entryId);
        this.found.delete(entryId);
        for (const [id, o] of this.offers) if (o.entry === entryId) this.offers.delete(id);
        return e;
    }

    setSide(entryId: string, side: MmSideChoice): void {
        const e = this.entries.get(entryId);
        if (e) e.side = side;
    }

    /** Keep waiting (casual): back to the casual pool, never moved to co-op by itself again. */
    keepCasual(entryId: string): boolean {
        const e = this.entries.get(entryId);
        if (!e || e.members.length > 3 || e.queue === 'classic' || e.queue === 'ranked') return false;
        e.queue = 'casual';
        e.keepCasual = true;
        if (e.penaltyUntilMs !== undefined) e.notBeforeMs = e.penaltyUntilMs;
        return true;
    }

    setAway(entryId: string, away: boolean): void {
        const e = this.entries.get(entryId);
        if (!e) return;
        if (!away) e.awaySinceMs = null;
        else if (e.awaySinceMs === null) e.awaySinceMs = this.now();
    }

    addBackfillSeat(s: MmBackfillSeat): void {
        if (this.seats.some(x => x.room === s.room && x.slot === s.slot)) return;
        this.seats.push({ ...s, inRoomKeys: [...s.inRoomKeys] });
    }

    dropBackfillSeat(room: string, slot: number): void {
        const i = this.seats.findIndex(x => x.room === room && x.slot === slot);
        if (i >= 0) this.seats.splice(i, 1);
        this.declined.delete(`${room}:${slot}`);
        for (const [id, o] of this.offers) if (o.seat.room === room && o.seat.slot === slot) this.offers.delete(id);
    }

    hasSeat(room: string, slot: number): boolean {
        return this.seats.some(x => x.room === room && x.slot === slot);
    }

    offerOf(offer: string): MmOffer | null {
        return this.offers.get(offer) ?? null;
    }

    /**
     * The entry answers an offer. Yes: the offer is returned, the entry leaves the queue and the seat is taken off the
     * list (the relay seats the member). No: the seat goes to the next candidate; the entry keeps its place.
     */
    answerOffer(offer: string, yes: boolean): MmOffer | null {
        const o = this.offers.get(offer);
        if (!o) return null;
        this.offers.delete(offer);
        if (!yes || o.expiresMs < this.now()) {
            this.decline(o);
            return null;
        }
        this.leave(o.entry);
        this.dropBackfillSeat(o.seat.room, o.seat.slot);
        return o;
    }

    private prunedMs = -Infinity;
    /** Once a minute: forget offer logs and arrival lists that aged out (guest identities are free; no growth). */
    private prune(now: number): void {
        if (now - this.prunedMs < 60_000) return;
        this.prunedMs = now;
        for (const [k, log] of this.offerLog)
            if (!log.length || now - log[log.length - 1] >= this.limits.backfill.offerWindowMs) this.offerLog.delete(k);
        for (const [k, list] of this.arrivals)
            if (!list.length || now - list[list.length - 1].ms > this.limits.fill.arrivalWindowMs)
                this.arrivals.delete(k);
        for (const [k, set] of this.declined) {
            const i = k.lastIndexOf(':');
            if (!set.size || !this.hasSeat(k.slice(0, i), Number(k.slice(i + 1)))) this.declined.delete(k);
        }
    }

    private decline(o: MmOffer): void {
        const k = `${o.seat.room}:${o.seat.slot}`;
        const set = this.declined.get(k) ?? new Set<string>();
        set.add(o.entry);
        this.declined.set(k, set);
    }

    /**
     * Distinct addresses (/64 for IPv6) that joined this pool in the last 5 minutes, per minute (without `exclude`'s).
     * Not identities: one address cycling free guest keys would otherwise push the pool into the busy band.
     */
    arrivalsPerMin(pool: string, exclude?: MmEntry): number {
        const list = this.arrivals.get(pool);
        if (!list) return 0;
        const now = this.now();
        const windowMs = this.limits.fill.arrivalWindowMs;
        while (list.length && now - list[0].ms > windowMs) list.shift();
        const skip = new Set(exclude?.members.map(m => m.ipKey || m.identityKey) ?? []);
        const keys = new Set<string>();
        for (const a of list) if (!skip.has(a.key)) keys.add(a.key);
        return keys.size / (windowMs / 60_000);
    }

    /** The arrival rate of the pool an entry waits in. */
    poolRate(e: MmEntry): number {
        return this.arrivalsPerMin(poolKey(e), e);
    }

    status(entryId: string): MmStatus | null {
        const e = this.entries.get(entryId);
        if (!e) return null;
        const now = this.now();
        const waitedMs = Math.max(0, now - e.enqueuedMs);
        const lowPriorityMs = Math.max(0, e.notBeforeMs - now);
        const lambda = this.poolRate(e);
        const pvpFill = e.queue === 'classic' ? MM_CLASSIC.fillMs : MM_CASUAL.fillMs;
        const toFill = Math.max(0, (isPvpQueue(e.queue) ? pvpFill : fillAtMs(lambda)) - waitedMs);
        const toArrival = lambda > 0 ? 60_000 / lambda : Infinity;
        // ranked: the arrival of the five other players (at least a minute, never "never"); with bots, at most the vs AI
        // line (§7.11)
        const rankedPlayersMs =
            lambda > 0
                ? Math.max(60_000, (5 * 60_000) / lambda - waitedMs)
                : Math.max(30_000, MM_RANKED.offerCasualMs - waitedMs);
        const rankedMs = e.bots
            ? Math.min(rankedPlayersMs, Math.max(0, this.rankedAiAtMs(now) - waitedMs))
            : rankedPlayersMs;
        const raw =
            e.queue === 'ranked'
                ? Math.max(lowPriorityMs, Math.min(rankedMs, 10 * 60_000))
                : Math.max(lowPriorityMs, Math.min(toFill, toArrival));
        const estimateMs = Math.max(3000, Math.ceil(raw / 5000) * 5000);
        if (e.queue === 'ranked') {
            let searching = 0;
            const key = poolKey(e);
            for (const o of this.entries.values()) if (poolKey(o) === key) searching += o.members.length;
            return {
                waitedMs,
                estimateMs,
                found: this.found.get(entryId) ?? e.members.length,
                lowPriorityMs,
                searching,
            };
        }
        return { waitedMs, estimateMs, found: this.found.get(entryId) ?? e.members.length, lowPriorityMs };
    }

    /** Ranked (§7.11): when the bot fill starts (longer inside Prime Time). */
    rankedFillAtMs(now: number): number {
        return inPrimeTime(now) ? MM_RANKED.primeFillMs : MM_RANKED.fillMs;
    }

    /** Ranked (§7.11): when a search with no opponent player plays vs AI. */
    rankedAiAtMs(now: number): number {
        return this.rankedFillAtMs(now) + MM_RANKED.aiAfterMs;
    }

    private eligible(e: MmEntry, now: number): boolean {
        return e.awaySinceMs === null && e.notBeforeMs <= now && ![...this.offers.values()].some(o => o.entry === e.id);
    }

    /** The rating window of an entry that waited `waitedMs` (RD-aware). */
    window(e: MmEntry, waitedMs: number): number {
        const w = this.limits.window;
        const extra = Math.max(0, entryRating(e).rd - w.rdFree);
        return Math.min(w.base + w.perSecond * (waitedMs / 1000), w.max) + extra;
    }

    /** Hard rules (§2.2) between two entries; `windowFor` is the window of the oldest entry. */
    private compatible(a: MmEntry, b: MmEntry, windowFor: number): boolean {
        if (a.region !== b.region || a.queue !== b.queue || a.sim !== b.sim) return false;
        if (!sidesCompatible(a.side, b.side)) return false;
        if (a.members.length + b.members.length > 3) return false;
        for (const m of a.members)
            if (!m.identityKey.startsWith('ip:') && b.members.some(x => x.identityKey === m.identityKey)) return false;
        return Math.abs(entryRating(a).r - entryRating(b).r) <= windowFor;
    }

    private groupOk(group: MmEntry[], windowFor: number): boolean {
        for (let i = 0; i < group.length; i++)
            for (let j = i + 1; j < group.length; j++)
                if (!this.compatible(group[i], group[j], windowFor)) return false;
        const sides = new Set(group.map(e => e.side).filter(s => s !== 'any'));
        return sides.size <= 1 && group.reduce((n, e) => n + e.members.length, 0) <= 3;
    }

    /** Fit cost of `others` joining `a` (lower is better): rating gap, newbie mismatch, queue order. */
    private cost(a: MmEntry, others: MmEntry[], order: Map<string, number>): number {
        const f = this.limits.fit;
        const ra = entryRating(a).r;
        let c = 0;
        for (const o of others) {
            c += Math.abs(entryRating(o).r - ra) / f.ratingScale;
            if (isNewbie(o) !== isNewbie(a)) c += f.newbieMismatch;
            c += f.orderWeight * (order.get(o.id) ?? 0);
        }
        return c;
    }

    /** The best combination for `a` among `pool` (most humans, then the lowest cost). */
    private best(a: MmEntry, pool: MmEntry[], order: Map<string, number>, now: number): MmEntry[] {
        const windowFor = this.window(a, now - a.enqueuedMs);
        const cands = pool.filter(o => o !== a && this.compatible(a, o, windowFor)).slice(0, 48);
        let bestGroup: MmEntry[] = [a];
        let bestHumans = a.members.length;
        let bestCost = 0;
        const consider = (others: MmEntry[]) => {
            const group = [a, ...others];
            if (!this.groupOk(group, windowFor)) return;
            const humans = group.reduce((n, e) => n + e.members.length, 0);
            const c = this.cost(a, others, order);
            if (humans > bestHumans || (humans === bestHumans && c < bestCost)) {
                bestGroup = group;
                bestHumans = humans;
                bestCost = c;
            }
        };
        for (let i = 0; i < cands.length; i++) {
            consider([cands[i]]);
            for (let j = i + 1; j < cands.length; j++) consider([cands[i], cands[j]]);
        }
        return bestGroup;
    }

    tick(): MmTick {
        const now = this.now();
        const out: MmTick = { matches: [], offers: [], expired: [], cancelled: [], switched: [] };
        this.prune(now);
        for (const e of [...this.entries.values()]) {
            if (e.awaySinceMs !== null && now - e.awaySinceMs >= this.limits.awayCancelMs) {
                this.leave(e.id);
                out.cancelled.push({ entry: e, reason: 'away' });
            }
        }
        for (const [id, o] of this.offers) {
            if (o.expiresMs <= now) {
                this.offers.delete(id);
                this.decline(o);
                out.expired.push(o);
            }
        }
        const sorted = [...this.entries.values()].sort(
            (a, b) => a.enqueuedMs - b.enqueuedMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        );
        const order = new Map(sorted.map((e, i) => [e.id, i]));
        // 1. backfill first: every open seat takes the best compatible solo that waited >= 3 s
        for (const seat of this.seats) {
            if ([...this.offers.values()].some(o => o.seat.room === seat.room && o.seat.slot === seat.slot)) continue;
            const pick = this.backfillCandidate(seat, sorted, now);
            if (!pick) continue;
            const offer: MmOffer = {
                offer: this.newId(),
                entry: pick.id,
                seat,
                expiresMs: now + this.limits.backfill.offerMs,
            };
            this.offers.set(offer.offer, offer);
            const key = pick.members[0].identityKey;
            const log = (this.offerLog.get(key) ?? []).filter(t => now - t < this.limits.backfill.offerWindowMs);
            log.push(now);
            this.offerLog.set(key, log);
            out.offers.push(offer);
        }
        // casual: no opponent by 45 s moves a solo or duo to co-op (its wait is credited; Keep waiting undoes it)
        for (const e of sorted) {
            // a trio switches too: co-op seats three humans against bots
            if (e.queue !== 'casual' || e.keepCasual) continue;
            if (now - e.enqueuedMs < MM_CASUAL.switchMs) continue;
            e.queue = 'coop';
            // a few seconds to tap Keep waiting before the co-op fill seats it (a penalty wait is kept)
            e.penaltyUntilMs = e.notBeforeMs;
            e.notBeforeMs = Math.max(e.notBeforeMs, now + MM_CASUAL.switchGraceMs);
            out.switched.push(e);
        }
        const used = new Set<string>();
        const prime = inPrimeTime(now);
        // PvP first (casual 3v3, classic 5v5, ranked 3v3): two teams, oldest anchor first
        for (const a of sorted) {
            if (!isPvpQueue(a.queue) || used.has(a.id) || !this.eligible(a, now)) continue;
            const rules = pvpRulesOf(a.queue, prime);
            const pool = sorted.filter(o => o.queue === a.queue && !used.has(o.id) && this.eligible(o, now));
            const plan = bestCasual(a, pool, now, order, rules);
            this.found.set(a.id, a.members.length + (plan ? plan.humans[0] - a.members.length : 0));
            if (!plan) continue;
            for (const t of plan.teams) for (const e of t) used.add(e.id);
            out.matches.push(this.makeCasual(plan, now, rules));
        }
        // ranked vs AI (§7.11): an opted-in search with no opponent player by the vs AI line plays its team (with up to
        // two more such ranked players) against bots
        const aiAt = this.rankedAiAtMs(now);
        for (const a of sorted) {
            if (a.queue !== 'ranked' || !a.bots || used.has(a.id) || !this.eligible(a, now)) continue;
            if (now - a.enqueuedMs < aiAt) continue;
            const pool = sorted.filter(
                o => o.queue === 'ranked' && o.bots === true && !used.has(o.id) && this.eligible(o, now)
            );
            const group = this.best(a, pool, order, now);
            for (const e of group) used.add(e.id);
            out.matches.push(this.makeVsAi(group, now));
        }
        // 2-4. co-op: full teams, then pair fill, then solo fill, oldest first
        for (const a of sorted) {
            if (a.queue !== 'coop' || used.has(a.id) || !this.eligible(a, now)) continue;
            const pool = sorted.filter(o => !used.has(o.id) && this.eligible(o, now));
            const group = this.best(a, pool, order, now);
            const humans = group.reduce((n, e) => n + e.members.length, 0);
            for (const e of group) this.found.set(e.id, humans);
            const waited = now - a.enqueuedMs;
            const lambda = this.poolRate(a);
            let fill: MmMatch['fill'] = null;
            if (humans < 3) {
                const band =
                    lambda < this.limits.fill.quietPerMin
                        ? 'quiet'
                        : lambda < this.limits.fill.busyPerMin
                        ? 'normal'
                        : 'busy';
                if (humans === 2 && waited >= pairFillMs(lambda)) fill = band;
                else if (waited >= fillAtMs(lambda)) fill = band;
                else continue;
            }
            for (const e of group) used.add(e.id);
            out.matches.push(this.makeMatch(group, now, fill));
        }
        for (const m of out.matches) for (const id of m.entries) this.leave(id);
        return out;
    }

    private backfillCandidate(seat: MmBackfillSeat, sorted: MmEntry[], now: number): MmEntry | null {
        const b = this.limits.backfill;
        const declined = this.declined.get(`${seat.room}:${seat.slot}`);
        let best: MmEntry | null = null;
        let bestGap = Infinity;
        for (const e of sorted) {
            if (e.members.length !== 1 || !this.eligible(e, now)) continue;
            if (e.queue !== (seat.queue ?? 'coop')) continue;
            if (e.region !== seat.region || e.sim !== seat.sim || !sidesCompatible(e.side, seat.side)) continue;
            if (now - e.enqueuedMs < b.minWaitMs || declined?.has(e.id)) continue;
            const m = e.members[0];
            if (m.identityKey === seat.leaverKey || seat.inRoomKeys.includes(m.identityKey)) continue;
            if (seat.otherTeamIps?.includes(m.ipKey)) continue;
            if (!isPvpQueue(seat.queue) && !difficultyAllowed(seat.difficulty, m.maxDifficulty)) continue;
            const gap = Math.abs(m.rating.r - seat.teamRating);
            if (gap > b.ratingWithin) continue;
            const log = (this.offerLog.get(m.identityKey) ?? []).filter(t => now - t < b.offerWindowMs);
            if (log.length >= b.offersPerWindow) continue;
            if (gap < bestGap) {
                best = e;
                bestGap = gap;
            }
        }
        return best;
    }

    /** A casual match: the left side (team 0) goes to the species that played there less in this pool lately. */
    private makeCasual(plan: CasualPlan, now: number, rules: PvpQueueRules = pvpRulesOf('casual')): MmMatch {
        const n = rules.teamSize;
        const a = plan.teams[0][0];
        const key = poolKey(a);
        const recent = this.recentLeft.get(key) ?? [];
        const left = team0SpeciesNext(recent);
        const flip = plan.species[0] !== left;
        const order: [0 | 1, 0 | 1] = flip ? [1, 0] : [0, 1];
        recent.push(left);
        if (recent.length > rules.limits.sideBalanceN) recent.shift();
        this.recentLeft.set(key, recent);
        // one bot level for both teams (from every human), so the fill never tilts the match
        const difficulty = matchFillDifficulty(plan.teams);
        const teams = order.map(i => {
            const group = plan.teams[i];
            const members = group.flatMap(e => e.members);
            const rating = teamRating(group);
            return {
                species: plan.species[i],
                entries: group.map(e => e.id),
                members: members.map(m => m.member),
                humans: members.length,
                bots: n - members.length,
                difficulty,
                rating,
            };
        }) as [MmTeam, MmTeam];
        const all = [...plan.teams[order[0]], ...plan.teams[order[1]]];
        const waitedMs: Record<string, number> = {};
        for (const e of all) waitedMs[e.id] = now - e.enqueuedMs;
        const humans = teams[0].humans + teams[1].humans;
        return {
            id: this.newId(),
            region: a.region,
            sim: a.sim,
            side: teams[0].species,
            difficulty: 'hard',
            entries: all.map(e => e.id),
            members: [...teams[0].members, ...teams[1].members],
            humans,
            bots: 2 * n - humans,
            waitedMs,
            fill: plan.fill ? 'normal' : null,
            mode: 'casual',
            queue: rules.queue,
            teams,
            ...(rules.queue === 'classic' ? { map: 'hearthwood' as const } : {}),
        };
    }

    private makeMatch(group: MmEntry[], now: number, fill: MmMatch['fill']): MmMatch {
        const region = group[0].region;
        const recent = this.recentSides.get(region) ?? [];
        const side = matchSide(
            group.map(e => e.side),
            recent
        );
        recent.push(side);
        if (recent.length > this.limits.sideBalanceN) recent.shift();
        this.recentSides.set(region, recent);
        const members = group.flatMap(e => e.members);
        const difficulty = matchDifficulty(
            members.map(m => m.rating.r),
            members.map(m => m.maxDifficulty)
        );
        const waitedMs: Record<string, number> = {};
        for (const e of group) waitedMs[e.id] = now - e.enqueuedMs;
        return {
            id: this.newId(),
            region,
            sim: group[0].sim,
            side,
            difficulty,
            entries: group.map(e => e.id),
            members: members.map(m => m.member),
            humans: members.length,
            bots: 3 - members.length,
            waitedMs,
            fill,
        };
    }

    /**
     * Ranked vs AI (§7.11): the group's team against bots, as a co-op match from the ranked queue. The bots play at
     * least Normal (never Rookie or Easy: the points are earned), from the players' ranked ratings.
     */
    private makeVsAi(group: MmEntry[], now: number): MmMatch {
        const m = this.makeMatch(group, now, 'quiet');
        const floor = MM_DIFFICULTIES.indexOf('normal');
        const d = Math.max(floor, MM_DIFFICULTIES.indexOf(m.difficulty as MmDifficulty));
        return { ...m, difficulty: MM_DIFFICULTIES[d], queue: 'ranked', vsAi: true };
    }
}
