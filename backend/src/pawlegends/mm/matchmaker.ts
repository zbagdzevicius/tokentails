/*
 * The Quick Play matchmaker (docs/plans/moba/M1A-IMPL.md §2, §3): a pure class in the style of party.service.ts and
 * room.ts. No I/O, no timers; time comes in through `now`, ids through `newId`, JSON in and out. The relay glue
 * (mm-bridge.ts) owns the sockets, calls `tick()` every 500 ms and turns its matches into parties.
 *
 * M1a co-op: up to three humans on one team (slots 0..2), the enemy is bots. Entries match only with the same region,
 * queue and sim (rooms are pinned to one sim). Cats and dogs never share a team; `any` joins either. A friend party of
 * 1 or 2 queues as one entry. Empty teammate seats are plain sim bots (§2.5).
 */
import { randomBytes } from 'crypto';
import { difficultyAllowed, matchDifficulty, matchSide, partyRating, sidesCompatible } from './fill';
import { fillAtMs, MM_LIMITS, pairFillMs } from './mm-limits';

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
    queue: 'coop';
    side: MmSideChoice;
    region: string;
    /** `${simVersion}:${simHash}`. */
    sim: string;
    enqueuedMs: number;
    /** Low-priority wait (the leaver ladder); 0 when clean. */
    notBeforeMs: number;
    /** Tab hidden since (skipped; cancelled after awayCancelMs), else null. */
    awaySinceMs: number | null;
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
}

export interface MmStatus {
    waitedMs: number;
    estimateMs: number;
    found: number;
    lowPriorityMs: number;
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
        if (e.members.length < 1 || e.members.length > 2 || e.queue !== 'coop') return 'bad_entry';
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
        const toFill = Math.max(0, fillAtMs(lambda) - waitedMs);
        const toArrival = lambda > 0 ? 60_000 / lambda : Infinity;
        const raw = Math.max(lowPriorityMs, Math.min(toFill, toArrival));
        const estimateMs = Math.max(3000, Math.ceil(raw / 5000) * 5000);
        return { waitedMs, estimateMs, found: this.found.get(entryId) ?? e.members.length, lowPriorityMs };
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
        const out: MmTick = { matches: [], offers: [], expired: [], cancelled: [] };
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
        // 2-4. full teams, then pair fill, then solo fill, oldest first
        const used = new Set<string>();
        for (const a of sorted) {
            if (used.has(a.id) || !this.eligible(a, now)) continue;
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
            if (e.region !== seat.region || e.sim !== seat.sim || !sidesCompatible(e.side, seat.side)) continue;
            if (now - e.enqueuedMs < b.minWaitMs || declined?.has(e.id)) continue;
            const m = e.members[0];
            if (m.identityKey === seat.leaverKey || seat.inRoomKeys.includes(m.identityKey)) continue;
            if (!difficultyAllowed(seat.difficulty, m.maxDifficulty)) continue;
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
}
