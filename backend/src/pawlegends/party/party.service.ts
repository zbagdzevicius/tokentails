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
    /** A rematch pick stays up at least this long (everyone sees the locked heroes and may change theirs). */
    rematchPickMinMs: 5000,
    idleMs: 30 * 60_000,
    hardMaxMs: 3 * 3600_000,
    startInMs: 3000,
});

export const MAX_MEMBERS = 3;
/** Casual PvP (V16.md §4.2): one matched party holds both teams (up to three humans each). */
export const MAX_CASUAL_MEMBERS = 6;
/** 5v5 Classic (MAP-5V5.md §9.2): up to five humans a team on Hearthwood. */
export const MAX_CLASSIC_MEMBERS = 10;

export type Species = 'cat' | 'dog';
const teamOf = (slot: number, teamSize = 3): 0 | 1 => (slot >= teamSize ? 1 : 0);
/** Seats per team of a matched PvP party (classic: 5 on Hearthwood). */
export const casualTeamSize = (c: { map?: string } | undefined): 3 | 5 => (c?.map === 'hearthwood' ? 5 : 3);

/** The casual PvP part of a matched party: each member's planned slot, both teams' species and fill profiles. */
export interface PartyCasual {
    /** member id → slot (team 0: 0..2, team 1: 3..5), fixed by the matchmaker. */
    slots: Record<string, number>;
    species: [Species, Species];
    fillDifficulty: [string, string];
    /** The human slots of the match (a member who leaves in the pick keeps the seat for a pilot). */
    humans: number[];
    /** Slots that queued together (pre-made parties of 2 or 3): a member's leave never opens a remake for its mates. */
    premade?: number[][];
    /** 5v5 Classic: 'hearthwood' (slots 0..4 and 5..9, leads 0 and 5). Absent: Crossing 3v3. */
    map?: 'hearthwood';
}

export interface MemberIdentity {
    accountId: string | null;
    guestKeyHash: string | null;
    /** The identity key caps and bans use (account, else guest key, else IP hash). */
    key: string;
    ticketed: boolean;
    guest: boolean;
    /** The hashed IP of the socket that joined (per-IP caps only; never shown, never a ban key). */
    ipKey?: string;
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
    /** A rematch pick: loading waits until this time even when everyone is locked. */
    pickMinUntilMs?: number;
    ended: boolean;
    /**
     * Quick Play (M1A-IMPL.md §5.2): a party the matchmaker built or filled. The side is fixed for everyone; strangers
     * (members the queue added) never see the code and cannot be kicked or locked out, so the leader-only actions and
     * the rematch vote are off while any is present. `host`: a friend party that queued (its own members are not
     * strangers); it drops `mm` when its last stranger leaves.
     */
    mm?: PartyMm;
    /** A friend party queued for Quick Play (every member shows the queue card). */
    queued?: { sinceMs: number; side: 'cat' | 'dog' | 'any' };
}

export interface PartyMm {
    match: string;
    queue: 'coop' | 'casual';
    /** Co-op: the side of everyone. Casual: team 0's species (each member's own is `casual.species[team]`). */
    side: 'cat' | 'dog';
    casual?: PartyCasual;
    strangers: Set<string>;
    host: boolean;
    resultsSinceMs?: number;
}

export interface StartPlan {
    party: Party;
    seed: number;
    humans: number[];
    occupied: number[];
    seats: { slot: number; hero: string; trick: string }[];
    difficulty: string;
    /** Casual PvP: the sim runs `mode: 'pvp'` with these fill profiles; `species` per team; `map` for 5v5 Classic. */
    pvp?: { fillDifficulty: [string, string]; species: [Species, Species]; premade?: number[][]; map?: 'hearthwood' };
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
    /**
     * The heroes this party's pinned sim has (the leader's sim). Defaults to `heroes`. A party pinned to an older sim
     * (v13 has no v14 dogs) never hovers, locks, auto-locks or bot-fills a hero that sim lacks.
     */
    heroesOf?(p: Party): readonly string[];
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
    | 'already_in_party'
    | 'code_changed'
    | 'bad_message';

export class PartyService {
    private readonly parties = new Map<string, Party>();
    private readonly byCode = new Map<string, string>();
    /** Codes held back from reuse for an hour: until when, and whether the party ended (else the code was replaced). */
    private readonly retiredCodes = new Map<string, { until: number; ended: boolean }>();
    private readonly memberParty = new Map<string, string>();

    constructor(
        private readonly rules: PartyRules,
        private readonly events: PartyEvents,
        private readonly now: () => number = Date.now
    ) {}

    get size(): number {
        return this.parties.size;
    }

    /** Retired codes still held back from reuse (bounded by the sweep in `tick`). */
    get retiredCount(): number {
        return this.retiredCodes.size;
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
            if (this.byCode.has(c) || (retired !== undefined && retired.until > this.now())) continue;
            return c;
        }
    }

    private retire(code: string, ended: boolean): void {
        this.byCode.delete(code);
        this.retiredCodes.set(code, { until: this.now() + PARTY_TIMING.codeReuseMs, ended });
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

    /**
     * The party's difficulty capped at the lowest unlocked tier among members, so a new friend is never dropped into
     * bots above their level (a lie in `hello.hint` only lowers this UI default; the leader may raise it again).
     */
    private defaultDifficulty(p: Party): string {
        const order = this.rules.difficulties;
        let lowest = order.indexOf(p.difficulty);
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
        p.difficulty = this.defaultDifficulty(p);
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
        if (!p) {
            const retired = this.retiredCodes.get(code);
            return retired ? (retired.ended ? 'party_ended' : 'code_changed') : 'party_not_found';
        }
        if (p.members.some(m => m.id === memberId)) return p;
        // one seat per person: the same account, guest key or IP-keyed guest cannot take a second seat (a second tab)
        // (an identity keyed by IP only is many people behind one address: the IP caps cover it instead)
        if (!identity.key.startsWith('ip:') && p.members.some(m => m.identity.key === identity.key))
            return 'already_in_party';
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

    /**
     * The member of the party behind `code` that is this same person (account or guest key; never an IP-keyed guest),
     * or null: a player who closed the tab and opens the invite link again gets their own seat back.
     */
    twinOf(code: string, identity: MemberIdentity): string | null {
        if (identity.key.startsWith('ip:')) return null;
        const pid = this.byCode.get(code);
        const p = pid ? this.parties.get(pid) : undefined;
        return p?.members.find(m => m.identity.key === identity.key)?.id ?? null;
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
        if (p.mm) {
            p.mm.strangers.delete(memberId);
            // a friend party whose last stranger left is a plain party again (back to its own results or lobby)
            if (
                p.mm.host &&
                p.mm.strangers.size === 0 &&
                p.phase !== 'pick' &&
                p.phase !== 'loading' &&
                p.phase !== 'match'
            ) {
                delete p.mm;
                p.locked = false;
            }
        }
        if (p.queued) delete p.queued;
        if (p.leader === memberId) p.leader = this.longestPresent(p)?.id ?? p.members[0].id;
        this.touch(p);
    }

    private longestPresent(p: Party): Member | undefined {
        return [...p.members].filter(m => m.conn === 'on').sort((a, b) => a.joinedMs - b.joinedMs)[0];
    }

    end(p: Party): void {
        p.ended = true;
        this.retire(p.code, true);
        this.parties.delete(p.id);
        for (const m of p.members) this.memberParty.delete(m.id);
    }

    /** Strangers present: no kick, lead, set, new code, start or rematch (nobody can lock a stranger out). */
    private withStrangers(p: Party): boolean {
        return !!p.mm && p.mm.strangers.size > 0;
    }

    /** Is this member a stranger in its (Quick Play) party? */
    isStranger(memberId: string): boolean {
        return !!this.partyOf(memberId)?.mm?.strangers.has(memberId);
    }

    kick(by: string, target: string): PartyError | null {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || by === target || this.withStrangers(p)) return 'bad_message';
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
        this.retire(p.code, false);
        p.code = this.newCode();
        this.byCode.set(p.code, p.id);
        this.touch(p);
    }

    newCodeFor(by: string): void {
        const p = this.partyOf(by);
        if (p && p.leader === by && !this.withStrangers(p)) this.rotateCode(p);
    }

    lead(by: string, target: string): void {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || !p.members.some(m => m.id === target) || this.withStrangers(p)) return;
        p.leader = target;
        this.touch(p);
    }

    set(by: string, s: { difficulty?: string; openSeats?: boolean; locked?: boolean }): void {
        const p = this.partyOf(by);
        if (!p || p.leader !== by || (p.phase !== 'lobby' && p.phase !== 'results') || this.withStrangers(p)) return;
        if (s.difficulty !== undefined && this.rules.difficulties.includes(s.difficulty)) p.difficulty = s.difficulty;
        if (s.openSeats !== undefined) p.openSeats = s.openSeats;
        if (s.locked !== undefined) p.locked = s.locked;
        this.touch(p);
    }

    /**
     * `party.card` (lobby or results): wear a card the relay resolved and checked for ownership (D8). `null` takes it
     * off. Peers see only `{image, element, tier}` and a name built from the card's catalog or breed name; the
     * custom name (`ownName`) stays in the owner's own copy.
     */
    setCard(memberId: string, card: Member['card'] | null): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || (p.phase !== 'lobby' && p.phase !== 'results')) return;
        if (card) m.card = card;
        else delete m.card;
        this.rename(p);
        this.touch(p);
    }

    setConn(memberId: string, conn: Member['conn']): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || m.conn === conn) return;
        m.conn = conn;
        m.offSinceMs = conn === 'on' ? null : this.now();
        this.touch(p);
        // the leader pressed Start while a friend was away: the friend is back, so the Start goes on by itself
        if (
            conn === 'on' &&
            p.waitingSinceMs !== undefined &&
            (p.phase === 'lobby' || p.phase === 'results') &&
            p.members.every(x => x.conn === 'on')
        )
            this.toPick(p, false);
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
        if (
            !p ||
            p.leader !== by ||
            (p.phase !== 'lobby' && p.phase !== 'results') ||
            this.withStrangers(p) ||
            p.queued
        )
            return null;
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
        p.pickMinUntilMs = rematch ? this.now() + PARTY_TIMING.rematchPickMinMs : undefined;
        p.waitingSinceMs = undefined;
        p.rematchYes.clear();
        if (!p.openSeats) p.locked = true;
        p.side = null;
        // slots: the leader 0, the others 1 and 2 in join order (casual PvP: the matchmaker's slots, both teams)
        const ordered = [p.members.find(m => m.id === p.leader)!, ...p.members.filter(m => m.id !== p.leader)];
        const casual = p.mm?.casual;
        ordered.forEach((m, i) => {
            m.slot = casual ? casual.slots[m.id] ?? i : i;
            m.locked = false;
            m.loaded = false;
            m.loadPct = 0;
            m.hero = rematch ? m.lastHero : undefined;
            m.trick = rematch ? m.lastTrick : undefined;
        });
        const lead = ordered[0];
        if (p.mm) p.side = p.mm.side;
        else if (lead.hero) p.side = this.rules.sideOf(lead.hero);
        this.touch(p);
    }

    hover(memberId: string, hero: string): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || p.phase !== 'pick' || m.locked || !this.heroesOf(p).includes(hero)) return;
        if (!this.heroAllowed(p, m, hero)) return;
        m.hero = hero;
        if (memberId === p.leader) this.leaderSide(p, this.rules.sideOf(hero));
        this.touch(p);
    }

    /**
     * The leader's hero sets the team's side. A side change resets the others' hovers on the old side and unlocks a
     * friend locked on it (a team is never cats and dogs mixed); the unlocked friend picks again.
     */
    private leaderSide(p: Party, side: string | null): void {
        // Quick Play: the side is the match's, never the leader's hover
        if (p.mm || side === p.side) return;
        p.side = side;
        for (const o of p.members) {
            if (o.id === p.leader || !o.hero || this.rules.sideOf(o.hero) === side) continue;
            o.hero = undefined;
            // the friend's client sees its lock drop and says why ("Leader switched sides")
            o.locked = false;
        }
    }

    private heroesOf(p: Party): readonly string[] {
        return this.rules.heroesOf?.(p) ?? this.rules.heroes;
    }

    /** Casual PvP: the team of a member (from its slot), else 0. */
    teamOfMember(p: Party, m: Member): 0 | 1 {
        return p.mm?.casual && m.slot !== undefined ? teamOf(m.slot, casualTeamSize(p.mm.casual)) : 0;
    }

    /** The species a member must pick: its team's in casual PvP, the match's in co-op, else null. */
    private speciesOf(p: Party, m: Member): string | null {
        if (p.mm?.casual) return p.mm.casual.species[this.teamOfMember(p, m)];
        return p.mm ? p.mm.side : null;
    }

    private heroAllowed(p: Party, m: Member, hero: string): boolean {
        // heroes are unique within a team (casual PvP: the other team may pick the same hero... of its own species)
        const team = this.teamOfMember(p, m);
        if (p.members.some(o => o.id !== m.id && o.locked && o.hero === hero && this.teamOfMember(p, o) === team))
            return false;
        const species = this.speciesOf(p, m);
        if (species && this.rules.sideOf(hero) !== species) return false;
        if (!p.mm && m.id !== p.leader && p.side && this.rules.sideOf(hero) !== p.side) return false;
        return true;
    }

    lock(memberId: string, hero: string, trick: string): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || p.phase !== 'pick' || m.locked) return;
        if (!this.heroesOf(p).includes(hero) || !this.rules.tricks.includes(trick) || !this.heroAllowed(p, m, hero))
            return;
        m.hero = hero;
        m.trick = trick;
        m.locked = true;
        if (memberId === p.leader) this.leaderSide(p, this.rules.sideOf(hero));
        this.touch(p);
        this.maybeLoad(p);
    }

    /** Everyone locked: loading (a rematch pick waits for its minimum time, then `tick` moves it on). */
    private maybeLoad(p: Party): void {
        if (p.phase !== 'pick' || !p.members.every(x => x.locked)) return;
        if (p.pickMinUntilMs !== undefined && this.now() < p.pickMinUntilMs) return;
        this.toLoading(p);
    }

    /** "Change hero" on the pick after a lock (the rematch pick): open again until the deadline. */
    unlock(memberId: string): void {
        const p = this.partyOf(memberId);
        const m = p?.members.find(x => x.id === memberId);
        if (!p || !m || p.phase !== 'pick' || !m.locked) return;
        m.locked = false;
        this.touch(p);
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
                ...this.heroesOf(p),
            ].filter((h): h is string => !!h);
            const heroes = this.heroesOf(p);
            const hero = candidates.find(h => heroes.includes(h) && this.heroAllowed(p, m, h));
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
        const casual = p.mm?.casual;
        if (casual) return this.launchCasual(p, casual, seed, occupied);
        const humans = p.openSeats ? [0, 1, 2] : occupied;
        const seats = p.members
            .map(m => ({ slot: m.slot!, hero: m.hero!, trick: m.trick! }))
            .sort((a, b) => a.slot - b.slot);
        // open seats: a pilot flies them; give them a free hero of the leader's side
        if (p.openSeats) {
            for (const s of [0, 1, 2]) {
                if (seats.some(x => x.slot === s)) continue;
                const used = seats.map(x => x.hero);
                const heroes = this.heroesOf(p);
                const hero =
                    heroes.find(h => !used.includes(h) && this.rules.sideOf(h) === (p.side ?? 'cat')) ?? heroes[0];
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

    /**
     * Casual PvP: every planned human slot plays (a member who left in the pick leaves a piloted seat with a free hero of
     * its team's species), slots 0 and 3 always among them (0 and 5 on Hearthwood); the sim runs `mode: 'pvp'`.
     */
    private launchCasual(p: Party, casual: PartyCasual, seed: number, occupied: number[]): void {
        const n = casualTeamSize(casual);
        const teamOfSeat = (slot: number) => teamOf(slot, n);
        const humans = [...new Set([...casual.humans, 0, n])].sort((a, b) => a - b);
        const seats = p.members
            .map(m => ({ slot: m.slot!, hero: m.hero!, trick: m.trick! }))
            .sort((a, b) => a.slot - b.slot);
        const heroes = this.heroesOf(p);
        for (const s of humans) {
            if (seats.some(x => x.slot === s)) continue;
            const team = teamOfSeat(s);
            const used = seats.filter(x => teamOfSeat(x.slot) === team).map(x => x.hero);
            const hero =
                heroes.find(h => !used.includes(h) && this.rules.sideOf(h) === casual.species[team]) ?? heroes[0];
            seats.push({ slot: s, hero, trick: this.rules.tricks[s % this.rules.tricks.length] });
        }
        seats.sort((a, b) => a.slot - b.slot);
        for (const m of p.members) {
            m.lastHero = m.hero;
            m.lastTrick = m.trick;
        }
        p.phase = 'match';
        p.deadlineMs = undefined;
        this.touch(p);
        this.events.startMatch({
            party: p,
            seed,
            humans,
            occupied,
            seats,
            difficulty: 'hard',
            pvp: {
                fillDifficulty: [...casual.fillDifficulty] as [string, string],
                species: [...casual.species] as [Species, Species],
                ...(casual.premade?.length ? { premade: casual.premade.map(g => g.slice()) } : {}),
                ...(casual.map ? { map: casual.map } : {}),
            },
        });
    }

    /** The room ended: show results. */
    matchEnded(partyId: string): void {
        const p = this.parties.get(partyId);
        if (!p) return;
        p.phase = 'results';
        p.room = undefined;
        if (!p.openSeats) p.locked = false;
        if (p.mm) {
            p.mm.resultsSinceMs = this.now();
            // a Quick Play party stays locked: nobody joins it by code
            p.locked = true;
        }
        this.touch(p);
    }

    /** "Play again together": the leader's tap or a majority starts it. */
    rematch(memberId: string, yes: boolean): void {
        const p = this.partyOf(memberId);
        if (!p || p.phase !== 'results' || p.mm) return;
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
        for (const [code, r] of this.retiredCodes) if (r.until <= now) this.retiredCodes.delete(code);
        for (const p of this.parties.values()) for (const [k, until] of p.bans) if (until <= now) p.bans.delete(k);
        for (const p of [...this.parties.values()]) {
            if (p.phase === 'pick' && p.deadlineMs !== undefined && now >= p.deadlineMs) this.autoLock(p);
            else if (p.phase === 'pick') this.maybeLoad(p);
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
        const me = p.members.find(m => m.id === forMember);
        const casual = p.mm?.casual;
        const myTeam = casual && me ? this.teamOfMember(p, me) : 0;
        // casual PvP: the other team's heroes stay hidden until loading (a counter-pick needs their lock)
        const hideOther = !!casual && p.phase === 'pick';
        const members: MemberView[] = p.members.map(m => {
            const own = m.id === forMember;
            const hidden = hideOther && this.teamOfMember(p, m) !== myTeam;
            const v: MemberView = {
                id: m.id,
                name: m.name,
                guest: m.identity.guest || !m.identity.ticketed,
                conn: m.conn,
                locked: m.locked,
            };
            if (m.newbie) v.newbie = true;
            if (m.slot !== undefined) v.slot = m.slot;
            if (m.hero && !hidden) v.hero = m.hero;
            if (m.trick && (own || m.locked) && !hidden) v.trick = m.trick;
            if (hidden) v.locked = false;
            if (p.phase === 'loading' || p.phase === 'match') v.loadPct = m.loadPct;
            // lane M6: "Play again together (2/3)" counts who pressed it
            if (p.phase === 'results' && p.rematchYes.has(m.id)) v.again = true;
            if (m.card) {
                v.card = { image: m.card.image, element: m.card.element, tier: m.card.tier };
                if (own) {
                    v.card.catId = m.card.catId;
                    if (m.card.ownName) v.ownName = m.card.ownName;
                }
            }
            return v;
        });
        const stranger = !!p.mm?.strangers.has(forMember);
        const view: PartyView = {
            t: 'party',
            // a stranger never sees the friend party's code
            code: stranger ? '' : p.code,
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
        if (p.mm && casual)
            view.mm = {
                side: casual.species[myTeam],
                strangers: p.mm.strangers.size > 0,
                mode: 'casual',
                team: myTeam,
                species: [...casual.species] as [Species, Species],
                ...(casual.map ? { map: casual.map, teamSize: casualTeamSize(casual) } : {}),
            };
        else if (p.mm) view.mm = { side: p.mm.side, strangers: p.mm.strangers.size > 0 };
        if (p.queued) view.queue = { sinceMs: Math.max(0, this.now() - p.queued.sinceMs), side: p.queued.side };
        return view;
    }

    // -----------------------------------------------------------------------------------------------------------
    // Quick Play (M1A-IMPL.md §5.2)

    /** A friend party queued (or stopped queueing): the members' views show the queue card. */
    setQueued(p: Party, queued: { sinceMs: number; side: 'cat' | 'dog' | 'any' } | null): void {
        if (queued) p.queued = { ...queued };
        else delete p.queued;
        this.touch(p);
    }

    /**
     * A new Quick Play party of strangers (no host): members in slot order (the first is the leader, slot 0), locked,
     * Open seats off, straight to the shared pick with the side fixed.
     */
    createMatched(
        members: { id: string; identity: MemberIdentity; hint?: { maxDifficulty: string; newbie: boolean } }[],
        opts: { match: string; side: 'cat' | 'dog'; difficulty: string; casual?: PartyCasual }
    ): Party {
        for (const m of members) this.leave(m.id);
        const id = randomBytes(12).toString('base64url');
        const code = this.newCode();
        const p: Party = {
            id,
            code,
            leader: members[0].id,
            members: members.map(m => this.makeMember(m.id, m.identity, m.hint)),
            difficulty: this.rules.difficulties.includes(opts.difficulty)
                ? opts.difficulty
                : this.rules.difficulties[0],
            openSeats: false,
            locked: true,
            phase: 'lobby',
            createdMs: this.now(),
            updatedMs: this.now(),
            bans: new Map(),
            rematchYes: new Set(),
            side: opts.side,
            ended: false,
            mm: {
                match: opts.match,
                queue: opts.casual ? 'casual' : 'coop',
                side: opts.side,
                strangers: new Set(members.map(m => m.id)),
                host: false,
                ...(opts.casual ? { casual: opts.casual } : {}),
            },
        };
        this.rename(p);
        this.parties.set(id, p);
        this.byCode.set(code, id);
        for (const m of p.members) this.memberParty.set(m.id, id);
        this.toPick(p, false);
        return p;
    }

    /**
     * A stranger joins a Quick Play party: a queued friend party being matched (before `startMatched`), or a running mm
     * party (a backfill). Bypasses the code, the lock and `party_busy`; the member leaves any other party first.
     */
    joinMatched(
        p: Party,
        memberId: string,
        identity: MemberIdentity,
        hint?: { maxDifficulty: string; newbie: boolean }
    ): Member | null {
        const max = p.mm?.casual
            ? casualTeamSize(p.mm.casual) === 5
                ? MAX_CLASSIC_MEMBERS
                : MAX_CASUAL_MEMBERS
            : MAX_MEMBERS;
        if (p.ended || p.members.length >= max || p.members.some(m => m.id === memberId)) return null;
        this.leave(memberId);
        const m = this.makeMember(memberId, identity, hint);
        p.members.push(m);
        this.memberParty.set(memberId, p.id);
        if (p.mm) p.mm.strangers.add(memberId);
        this.rename(p);
        this.touch(p);
        return m;
    }

    /**
     * A queued friend party was matched: Quick Play state, the room difficulty, the strangers seated after the friends
     * (in queue order), and the shared pick with the side fixed.
     */
    startMatched(
        p: Party,
        opts: { match: string; side: 'cat' | 'dog'; difficulty: string; casual?: PartyCasual },
        strangers: { id: string; identity: MemberIdentity; hint?: { maxDifficulty: string; newbie: boolean } }[]
    ): void {
        delete p.queued;
        p.mm = {
            match: opts.match,
            queue: opts.casual ? 'casual' : 'coop',
            side: opts.side,
            strangers: new Set(),
            host: true,
            ...(opts.casual ? { casual: opts.casual } : {}),
        };
        p.difficulty = this.rules.difficulties.includes(opts.difficulty) ? opts.difficulty : p.difficulty;
        p.openSeats = false;
        p.locked = true;
        for (const s of strangers) this.joinMatched(p, s.id, s.identity, s.hint);
        this.toPick(p, false);
    }

    /** Restore helper (N9): the Quick Play state of a stored party. */
    restoreMm(
        p: Party,
        mm: { match: string; side: 'cat' | 'dog'; strangers: string[]; host: boolean; casual?: PartyCasual } | undefined
    ): void {
        if (!mm) return;
        p.mm = {
            match: mm.match,
            queue: mm.casual ? 'casual' : 'coop',
            side: mm.side,
            strangers: new Set(mm.strangers),
            host: mm.host,
            ...(mm.casual ? { casual: mm.casual } : {}),
        };
        p.side = mm.side;
    }
}
