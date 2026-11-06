/*
 * The party state machine (docs/plans/moba/MULTIPLAYER.md §5.1): lobby → pick → loading → match → results →
 * (lobby | pick). No ready phase (D11). Pure: JSON in, JSON out through `PartyEvents`, time injected. The relay maps
 * sockets to members and turns `startMatch` into a room.
 *
 * Built in lane N as the minimal flow the netcode needs end to end (create, join by code, leave, kick with code
 * rotation, leader handover, difficulty, open seats, lock, start with the waiting chip, shared pick with side lock and
 * timeout auto-lock, loading with late pilots, results and rematch). Lane P owns the screens and extends this.
 */
import { randomBytes, randomInt } from 'crypto';
import { CODE_ALPHABET, type MemberView, type PartyPhase, type PartyView } from './net';
import { dedupeNames, memberName } from './party-names';

export const PARTY_TIMING = Object.freeze({
    pickMs: 30_000,
    loadMs: 20_000,
    startAnywayMs: 10_000,
    leaderOfflineMs: 60_000,
    kickBanMs: 10 * 60_000,
    codeReuseMs: 60 * 60_000,
    nudgeEveryMs: 10_000,
    rematchNoteMs: 3000,
    idleMs: 30 * 60_000,
    hardMaxMs: 3 * 3600_000,
    startInMs: 3000,
});

export const MAX_MEMBERS = 3;

export interface MemberIdentity {
    accountId: string | null;
    guestKeyHash: string | null;
    /** The identity key caps and bans use (account, else guest key, else IP hash). */
    key: string;
    ticketed: boolean;
    guest: boolean;
}

export interface Member {
    id: string;
    identity: MemberIdentity;
    name: string;
    newbie: boolean;
    maxDifficulty: string | null;
    conn: 'on' | 'away' | 'off';
    joinedMs: number;
    offSinceMs: number | null;
    hero?: string;
    trick?: string;
    locked: boolean;
    loadPct: number;
    loaded: boolean;
    lastHero?: string;
    lastTrick?: string;
    slot?: number;
    lastNudgeMs: number;
    card?: { image: string; element: string; tier: string; catId: string; ownName?: string; catalog?: string };
}

export interface Party {
    id: string;
    code: string;
    leader: string;
    members: Member[];
    difficulty: string;
    openSeats: boolean;
    locked: boolean;
    phase: PartyPhase;
    deadlineMs?: number;
    waitingSinceMs?: number;
    room?: string;
    createdMs: number;
    updatedMs: number;
    bans: Map<string, number>;
    rematchYes: Set<string>;
    /** Leader side for the pick ('cat' | 'dog'), from the leader's hover. */
    side: string | null;
    ended: boolean;
}

export interface StartPlan {
    party: Party;
    seed: number;
    humans: number[];
    occupied: number[];
    seats: { slot: number; hero: string; trick: string }[];
    difficulty: string;
}

export interface PartyEvents {
    /** The party changed: send each member its own view (the relay coalesces to 10 Hz). */
    changed(party: Party): void;
    send(memberId: string, msg: Record<string, unknown>): void;
    /** Loading is over: create the room. */
    startMatch(plan: StartPlan): void;
}

export interface PartyRules {
    heroes: readonly string[];
    tricks: readonly string[];
    difficulties: readonly string[];
    sideOf(hero: string): string | null;
    /** The "New? Try this" hero for newbies. */
    newbieHero: string;
}

export type PartyError =
    | 'party_not_found'
    | 'party_full'
    | 'party_busy'
    | 'party_locked'
    | 'kicked'
    | 'party_ended'
    | 'bad_message';

export class PartyService {
    private readonly parties = new Map<string, Party>();
    private readonly byCode = new Map<string, string>();
    private readonly retiredCodes = new Map<string, number>();
    private readonly memberParty = new Map<string, string>();

    constructor(
        private readonly rules: PartyRules,
        private readonly events: PartyEvents,
        private readonly now: () => number = Date.now
    ) {}

    get size(): number {
        return this.parties.size;
    }

    partyOf(memberId: string): Party | null {
        const id = this.memberParty.get(memberId);
        return id ? this.parties.get(id) ?? null : null;
    }

    byId(partyId: string): Party | null {
        return this.parties.get(partyId) ?? null;
    }

    member(memberId: string): Member | null {
        return this.partyOf(memberId)?.members.find(m => m.id === memberId) ?? null;
    }

    all(): Party[] {
        return [...this.parties.values()];
    }

    newMemberId(): string {
        return randomBytes(12).toString('base64url');
    }

    private newCode(): string {
        for (;;) {
            let c = '';
            for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
            const retired = this.retiredCodes.get(c);
            if (this.byCode.has(c) || (retired !== undefined && retired > this.now())) continue;
            return c;
        }
    }

    private retire(code: string): void {
        this.byCode.delete(code);
        this.retiredCodes.set(code, this.now() + PARTY_TIMING.codeReuseMs);
    }

    private makeMember(
        id: string,
        identity: MemberIdentity,
        hint?: { maxDifficulty: string; newbie: boolean }
    ): Member {
        return {
            id,
            identity,
            name: memberName(id),
            newbie: !!hint?.newbie,
            maxDifficulty: hint && this.rules.difficulties.includes(hint.maxDifficulty) ? hint.maxDifficulty : null,
            conn: 'on',
            joinedMs: this.now(),
            offSinceMs: null,
            locked: false,
            loadPct: 0,
            loaded: false,
            lastNudgeMs: 0,
        };
    }

    /** Lowest unlocked tier among members (a lie only lowers a UI default). */
    private defaultDifficulty(p: Party): string {
        const order = this.rules.difficulties;
        let lowest = -1;
        for (const m of p.members) {
            if (!m.maxDifficulty) continue;
            const i = order.indexOf(m.maxDifficulty);
            if (i >= 0 && (lowest < 0 || i < lowest)) lowest = i;
        }
        return lowest >= 0 ? order[lowest] : p.difficulty;
    }

    create(
        memberId: string,
        identity: MemberIdentity,
        difficulty: string,
        hint?: { maxDifficulty: string; newbie: boolean }
    ): Party {
        this.leave(memberId);
        const id = randomBytes(12).toString('base64url');
        const code = this.newCode();
        const leader = this.makeMember(memberId, identity, hint);
        const p: Party = {
            id,
            code,
            leader: memberId,
            members: [leader],
            difficulty: this.rules.difficulties.includes(difficulty) ? difficulty : this.rules.difficulties[0],
            openSeats: false,
            locked: false,
            phase: 'lobby',
            createdMs: this.now(),
            updatedMs: this.now(),
            bans: new Map(),
            rematchYes: new Set(),
            side: null,
            ended: false,
        };
        this.parties.set(id, p);
        this.byCode.set(code, id);
        this.memberParty.set(memberId, id);
        this.events.changed(p);
        return p;
    }

    join(
        code: string,
        memberId: string,
        identity: MemberIdentity,
        hint?: { maxDifficulty: string; newbie: boolean }
    ): Party | PartyError {
        const pid = this.byCode.get(code);
        const p = pid ? this.parties.get(pid) : undefined;
        if (!p) return this.retiredCodes.has(code) ? 'party_ended' : 'party_not_found';
        if (p.members.some(m => m.id === memberId)) return p;
        const ban = p.bans.get(identity.key);
        if (ban !== undefined && ban > this.now()) return 'kicked';
        if (p.locked) return 'party_locked';
        if (p.members.length >= MAX_MEMBERS) return 'party_full';
        if (p.phase !== 'lobby' && p.phase !== 'results' && !(p.openSeats && p.phase === 'match')) return 'party_busy';
        this.leave(memberId);
        const m = this.makeMember(memberId, identity, hint);
        p.members.push(m);
        this.memberParty.set(memberId, p.id);
        this.rename(p);
        if (p.phase === 'lobby') p.difficulty = this.defaultDifficulty(p);
        this.touch(p);
        return p;
    }

    private rename(p: Party): void {
        const names = dedupeNames(p.members.map(m => memberName(m.id, m.card?.catalog)));
        p.members.forEach((m, i) => (m.name = names[i]));
    }

    leave(memberId: string): void {
        const p = this.partyOf(memberId);
        if (!p) return;
        p.members = p.members.filter(m => m.id !== memberId);
        this.memberParty.delete(memberId);
        if (p.members.length === 0) {
            this.end(p);
            return;
        }
        if (p.leader === memberId) p.leader = this.longestPresent(p)?.id ?? p.members[0].id;
        this.touch(p);
    }

    private longestPresent(p: Party): Member | undefined {
        return [...p.members].filter(m => m.conn === 'on').sort((a, b) => a.joinedMs - b.joinedMs)[0];
    }

    end(p: Party): void {
        p.ended = true;
        this.retire(p.code);
        this.parties.delete(p.id);
        for (const m of p.members) this.memberParty.delete(m.id);
    }

    kick(by: string, target: string): PartyError | null {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || by === target) return 'bad_message';
        if (p.phase !== 'lobby' && p.phase !== 'results') return 'party_busy';
        const m = p.members.find(x => x.id === target);
        if (!m) return 'bad_message';
        p.bans.set(m.identity.key, this.now() + PARTY_TIMING.kickBanMs);
        this.events.send(target, { t: 'error', code: 'kicked' });
        this.leave(target);
        this.rotateCode(p);
        return null;
    }

    private rotateCode(p: Party): void {
        this.retire(p.code);
        p.code = this.newCode();
        this.byCode.set(p.code, p.id);
        this.touch(p);
    }

    newCodeFor(by: string): void {
        const p = this.partyOf(by);
        if (p && p.leader === by) this.rotateCode(p);
    }

    lead(by: string, target: string): void {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || !p.members.some(m => m.id === target)) return;
        p.leader = target;
        this.touch(p);
    }

    set(by: string, s: { difficulty?: string; openSeats?: boolean; locked?: boolean }): void {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || (p.phase !== 'lobby' && p.phase !== 'results')) return;
        if (s.difficulty !== undefined && this.rules.difficulties.includes(s.difficulty)) p.difficulty = s.difficulty;
        if (s.openSeats !== undefined) p.openSeats = s.openSeats;
        if (s.locked !== undefined) p.locked = s.locked;
        this.touch(p);
    }

    setConn(memberId: string, conn: Member['conn']): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || m.conn === conn) return;
        m.conn = conn;
        m.offSinceMs = conn === 'on' ? null : this.now();
        this.touch(p);
    }

    nudge(by: string, target: string): void {
        const p = this.partyOf(by);
        const from = p?.members.find(m => m.id === by);
        if (!p || !from || !p.members.some(m => m.id === target)) return;
        if (this.now() - from.lastNudgeMs < PARTY_TIMING.nudgeEveryMs) return;
        from.lastNudgeMs = this.now();
        this.events.send(target, { t: 'nudge', from: by });
    }

    /** Leader taps Start. Returns 'local' for a party of one with Open seats off (D10). */
    start(by: string): 'local' | 'pick' | 'waiting' | null {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || (p.phase !== 'lobby' && p.phase !== 'results')) return null;
        if (p.members.length === 1 && !p.openSeats) {
            this.events.send(by, { t: 'local', difficulty: p.difficulty });
            return 'local';
        }
        const away = p.members.filter(m => m.conn !== 'on');
        if (away.length > 0) {
            if (p.waitingSinceMs === undefined || this.now() - p.waitingSinceMs < PARTY_TIMING.startAnywayMs) {
                p.waitingSinceMs ??= this.now();
                this.touch(p);
                return 'waiting';
            }
        }
        this.toPick(p, false);
        return 'pick';
    }

    private toPick(p: Party, rematch: boolean): void {
        p.phase = 'pick';
        p.deadlineMs = this.now() + PARTY_TIMING.pickMs + (rematch ? PARTY_TIMING.rematchNoteMs : 0);
        p.waitingSinceMs = undefined;
        p.rematchYes.clear();
        if (!p.openSeats) p.locked = true;
        p.side = null;
        // slots: the leader 0, the others 1 and 2 in join order
        const ordered = [p.members.find(m => m.id === p.leader)!, ...p.members.filter(m => m.id !== p.leader)];
        ordered.forEach((m, i) => {
            m.slot = i;
            m.locked = false;
            m.loaded = false;
            m.loadPct = 0;
            m.hero = rematch ? m.lastHero : undefined;
            m.trick = rematch ? m.lastTrick : undefined;
        });
        const lead = ordered[0];
        if (lead.hero) p.side = this.rules.sideOf(lead.hero);
        this.touch(p);
    }

    hover(memberId: string, hero: string): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || p.phase !== 'pick' || m.locked || !this.rules.heroes.includes(hero)) return;
        if (!this.heroAllowed(p, m, hero)) return;
        m.hero = hero;
        if (memberId === p.leader) this.leaderSide(p, this.rules.sideOf(hero));
        this.touch(p);
    }

    private leaderSide(p: Party, side: string | null): void {
        if (side === p.side) return;
        p.side = side;
        // a side change resets the others' unlocked hovers
        for (const o of p.members)
            if (o.id !== p.leader && !o.locked && o.hero && this.rules.sideOf(o.hero) !== side) o.hero = undefined;
    }

    private heroAllowed(p: Party, m: Member, hero: string): boolean {
        if (p.members.some(o => o.id !== m.id && o.locked && o.hero === hero)) return false;
        if (m.id !== p.leader && p.side && this.rules.sideOf(hero) !== p.side) return false;
        return true;
    }

    lock(memberId: string, hero: string, trick: string): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || p.phase !== 'pick' || m.locked) return;
        if (!this.rules.heroes.includes(hero) || !this.rules.tricks.includes(trick) || !this.heroAllowed(p, m, hero))
            return;
        m.hero = hero;
        m.trick = trick;
        m.locked = true;
        if (memberId === p.leader) this.leaderSide(p, this.rules.sideOf(hero));
        this.touch(p);
        if (p.members.every(x => x.locked)) this.toLoading(p);
    }

    /** Timeout: lock the hover, else the last hero if free, else a free hero in seeded order. Nobody is kicked. */
    private autoLock(p: Party): void {
        const ordered = [...p.members].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
        for (const m of ordered) {
            if (m.locked) continue;
            const candidates = [
                m.newbie ? this.rules.newbieHero : undefined,
                m.hero,
                m.lastHero,
                ...this.rules.heroes,
            ].filter((h): h is string => !!h);
            const hero = candidates.find(h => this.heroAllowed(p, m, h));
            if (!hero) continue;
            m.hero = hero;
            m.trick = m.trick ?? m.lastTrick ?? this.rules.tricks[0];
            m.locked = true;
            if (m.id === p.leader) this.leaderSide(p, this.rules.sideOf(hero));
        }
        this.toLoading(p);
    }

    private toLoading(p: Party): void {
        p.phase = 'loading';
        p.deadlineMs = this.now() + PARTY_TIMING.loadMs;
        this.touch(p);
    }

    load(memberId: string, pct: number): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m) return;
        m.loadPct = Math.max(0, Math.min(100, pct));
        this.touch(p);
    }

    loaded(memberId: string): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m) return;
        m.loaded = true;
        m.loadPct = 100;
        this.touch(p);
        if (p.phase === 'loading' && p.members.every(x => x.loaded || x.conn !== 'on')) this.launch(p);
    }

    private launch(p: Party): void {
        const seed = randomInt(0, 2 ** 32 - 1) >>> 0;
        const occupied = p.members.map(m => m.slot!).sort((a, b) => a - b);
        const humans = p.openSeats ? [0, 1, 2] : occupied;
        const seats = p.members
            .map(m => ({ slot: m.slot!, hero: m.hero!, trick: m.trick! }))
            .sort((a, b) => a.slot - b.slot);
        // open seats: a pilot flies them; give them a free hero of the leader's side
        if (p.openSeats) {
            for (const s of [0, 1, 2]) {
                if (seats.some(x => x.slot === s)) continue;
                const used = seats.map(x => x.hero);
                const hero =
                    this.rules.heroes.find(h => !used.includes(h) && this.rules.sideOf(h) === (p.side ?? 'cat')) ??
                    this.rules.heroes[0];
                seats.push({ slot: s, hero, trick: this.rules.tricks[s % this.rules.tricks.length] });
            }
            seats.sort((a, b) => a.slot - b.slot);
        }
        for (const m of p.members) {
            m.lastHero = m.hero;
            m.lastTrick = m.trick;
        }
        p.phase = 'match';
        p.deadlineMs = undefined;
        this.touch(p);
        this.events.startMatch({ party: p, seed, humans, occupied, seats, difficulty: p.difficulty });
    }

    /** The room ended: show results. */
    matchEnded(partyId: string): void {
        const p = this.parties.get(partyId);
        if (!p) return;
        p.phase = 'results';
        p.room = undefined;
        if (!p.openSeats) p.locked = false;
        this.touch(p);
    }

    /** "Play again together": the leader's tap or a majority starts it. */
    rematch(memberId: string, yes: boolean): void {
        const p = this.partyOf(memberId);
        if (!p || p.phase !== 'results') return;
        if (yes) p.rematchYes.add(memberId);
        else p.rematchYes.delete(memberId);
        const majority = p.rematchYes.size * 2 > p.members.length;
        if (p.rematchYes.has(p.leader) || majority) {
            for (const m of p.members) this.events.send(m.id, { t: 'vote', kind: 'rematch', result: 'pass' });
            this.toPick(p, true);
        } else this.touch(p);
    }

    /** Timers: pick and load deadlines, leader handover, idle TTL. */
    tick(): void {
        const now = this.now();
        for (const p of [...this.parties.values()]) {
            if (p.phase === 'pick' && p.deadlineMs !== undefined && now >= p.deadlineMs) this.autoLock(p);
            else if (p.phase === 'loading' && p.deadlineMs !== undefined && now >= p.deadlineMs) this.launch(p);
            if (p.phase === 'lobby' || p.phase === 'results') {
                const lead = p.members.find(m => m.id === p.leader);
                if (
                    lead &&
                    lead.conn !== 'on' &&
                    lead.offSinceMs !== null &&
                    now - lead.offSinceMs > PARTY_TIMING.leaderOfflineMs
                ) {
                    const next = this.longestPresent(p);
                    if (next) {
                        p.leader = next.id;
                        this.touch(p);
                    }
                }
            }
            const nobody = p.members.every(m => m.conn !== 'on');
            const idleSince = Math.max(...p.members.map(m => m.offSinceMs ?? now));
            if (
                (nobody && p.phase !== 'match' && now - idleSince > PARTY_TIMING.idleMs) ||
                now - p.createdMs > PARTY_TIMING.hardMaxMs
            )
                this.end(p);
        }
    }

    private touch(p: Party): void {
        p.updatedMs = this.now();
        this.events.changed(p);
    }

    /** N9: rebuild a party from its stored document after a restart (its room is being restored). */
    restoreParty(
        id: string,
        code: string,
        difficulty: string,
        openSeats: boolean,
        members: { id: string; identity: MemberIdentity; lastHero?: string; lastTrick?: string; slot?: number }[],
        leader: string,
        room: string
    ): Party {
        const existing = this.parties.get(id);
        if (existing) return existing;
        const p: Party = {
            id,
            code,
            leader,
            members: members.map(m => ({
                ...this.makeMember(m.id, m.identity),
                conn: 'off' as const,
                offSinceMs: this.now(),
                lastHero: m.lastHero,
                lastTrick: m.lastTrick,
                hero: m.lastHero,
                trick: m.lastTrick,
                slot: m.slot,
                locked: true,
                loaded: true,
            })),
            difficulty,
            openSeats,
            locked: !openSeats,
            phase: 'match',
            room,
            createdMs: this.now(),
            updatedMs: this.now(),
            bans: new Map(),
            rematchYes: new Set(),
            side: null,
            ended: false,
        };
        this.rename(p);
        this.parties.set(id, p);
        this.byCode.set(code, id);
        for (const m of p.members) this.memberParty.set(m.id, id);
        return p;
    }

    /** The `party` frame for one member: its own copy adds its card's catId and custom cat name. */
    view(p: Party, forMember: string): PartyView {
        const members: MemberView[] = p.members.map(m => {
            const own = m.id === forMember;
            const v: MemberView = {
                id: m.id,
                name: m.name,
                guest: m.identity.guest || !m.identity.ticketed,
                conn: m.conn,
                locked: m.locked,
            };
            if (m.newbie) v.newbie = true;
            if (m.slot !== undefined) v.slot = m.slot;
            if (m.hero) v.hero = m.hero;
            if (m.trick && (own || m.locked)) v.trick = m.trick;
            if (p.phase === 'loading' || p.phase === 'match') v.loadPct = m.loadPct;
            if (m.card) {
                v.card = { image: m.card.image, element: m.card.element, tier: m.card.tier };
                if (own) {
                    v.card.catId = m.card.catId;
                    if (m.card.ownName) v.ownName = m.card.ownName;
                }
            }
            return v;
        });
        const view: PartyView = {
            t: 'party',
            code: p.code,
            phase: p.phase,
            leader: p.leader,
            difficulty: p.difficulty,
            openSeats: p.openSeats,
            locked: p.locked,
            members,
            you: forMember,
        };
        if (p.deadlineMs !== undefined) view.deadlineMs = Math.max(0, p.deadlineMs - this.now());
        if (p.waitingSinceMs !== undefined) view.waiting = p.members.filter(m => m.conn !== 'on').map(m => m.id);
        return view;
    }
}
