import { normalizeCatName } from '../../shared-contracts/name';
import { CODE_ALPHABET } from './net';
import { ADJECTIVES, NOUNS, dedupeNames, memberName } from './party-names';
import {
    MAX_MEMBERS,
    PARTY_TIMING,
    PartyService,
    type MemberIdentity,
    type Party,
    type StartPlan,
} from './party.service';

/* Party play P1 (MULTIPLAYER.md §5.1, §12 P1): the party state machine on a fake clock. */

const HEROES = ['clem', 'mochi', 'nova', 'rex', 'biscuit', 'duke'];
const SIDE: Record<string, string> = {
    clem: 'cat',
    mochi: 'cat',
    nova: 'cat',
    rex: 'dog',
    biscuit: 'dog',
    duke: 'dog',
};

const id = (n: string, extra: Partial<MemberIdentity> = {}): MemberIdentity => ({
    accountId: `acct-${n}`,
    guestKeyHash: null,
    key: `acct:${n}`,
    ticketed: true,
    guest: false,
    ...extra,
});

function setup() {
    let now = 1_000_000;
    const sent: { to: string; msg: Record<string, unknown> }[] = [];
    const starts: StartPlan[] = [];
    let changes = 0;
    const svc = new PartyService(
        {
            heroes: HEROES,
            tricks: ['dash', 'heal', 'blink'],
            difficulties: ['rookie', 'easy', 'normal', 'hard'],
            sideOf: h => SIDE[h] ?? null,
            newbieHero: 'clem',
        },
        {
            changed: () => void changes++,
            send: (to, msg) => void sent.push({ to, msg }),
            startMatch: plan => void starts.push(plan),
        },
        () => now
    );
    return {
        svc,
        sent,
        starts,
        changes: () => changes,
        advance: (ms: number) => {
            now += ms;
            svc.tick();
        },
        now: () => now,
    };
}

/** A lobby with a leader and `n - 1` members, all connected. */
function lobby(n = 3) {
    const t = setup();
    const p = t.svc.create('A', id('a'), 'normal');
    const names = ['B', 'C'];
    for (let i = 0; i < n - 1; i++) expect(t.svc.join(p.code, names[i], id(names[i].toLowerCase()))).toBe(p);
    return { ...t, p };
}

describe('PartyService', () => {
    describe('create, join, full, locked', () => {
        it('creates on the first tap with the creator as leader and a code from the alphabet', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'easy');
            expect(p.leader).toBe('A');
            expect(p.phase).toBe('lobby');
            expect(p.difficulty).toBe('easy');
            expect(p.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
            expect(t.svc.partyOf('A')).toBe(p);
        });

        it('falls back to the first difficulty for an unknown one', () => {
            const t = setup();
            expect(t.svc.create('A', id('a'), 'impossible').difficulty).toBe('rookie');
        });

        it('joins by code, up to 3 humans; a 4th gets party_full', () => {
            const { svc, p } = lobby(3);
            expect(p.members.map(m => m.id)).toEqual(['A', 'B', 'C']);
            expect(MAX_MEMBERS).toBe(3);
            expect(svc.join(p.code, 'D', id('d'))).toBe('party_full');
        });

        it('an unknown code is party_not_found, a retired one party_ended', () => {
            const t = setup();
            expect(t.svc.join('ZZZZZZ', 'B', id('b'))).toBe('party_not_found');
            const p = t.svc.create('A', id('a'), 'normal');
            const code = p.code;
            t.svc.leave('A');
            expect(t.svc.join(code, 'B', id('b'))).toBe('party_ended');
        });

        it('a locked party refuses joins with party_locked', () => {
            const { svc, p } = lobby(1);
            svc.set('A', { locked: true });
            expect(svc.join(p.code, 'B', id('b'))).toBe('party_locked');
            svc.set('A', { locked: false });
            expect(svc.join(p.code, 'B', id('b'))).toBe(p);
        });

        it('joining mid-pick is party_busy unless Open seats is on and the match runs (P10)', () => {
            const { svc, p } = lobby(2);
            svc.start('A');
            expect(p.phase).toBe('pick');
            p.locked = false; // a busy party refuses even when unlocked
            expect(svc.join(p.code, 'C', id('c'))).toBe('party_busy');
        });

        it('with Open seats on, a friend may join while the match runs', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal');
            t.svc.set('A', { openSeats: true });
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.svc.loaded('A');
            expect(p.phase).toBe('match');
            expect(p.locked).toBe(false);
            expect(t.svc.join(p.code, 'B', id('b'))).toBe(p);
        });

        it('a member who joins another party leaves the first', () => {
            const t = setup();
            const p1 = t.svc.create('A', id('a'), 'normal');
            t.svc.create('B', id('b'), 'normal');
            t.svc.join(p1.code, 'B', id('b'));
            expect(t.svc.partyOf('B')).toBe(p1);
            expect(t.svc.size).toBe(1);
        });
    });

    describe('leader', () => {
        it('hands over with party.lead (leader only)', () => {
            const { svc, p } = lobby(2);
            svc.lead('B', 'B');
            expect(p.leader).toBe('A');
            svc.lead('A', 'B');
            expect(p.leader).toBe('B');
        });

        it('passes to the longest-present connected member when the leader leaves', () => {
            const { svc, p } = lobby(3);
            svc.setConn('B', 'off');
            svc.leave('A');
            expect(p.leader).toBe('C');
        });

        it('passes automatically after 60 s offline in the lobby', () => {
            const t = lobby(3);
            t.svc.setConn('A', 'off');
            t.advance(PARTY_TIMING.leaderOfflineMs - 1000);
            expect(t.p.leader).toBe('A');
            t.advance(2000);
            expect(t.p.leader).toBe('B');
        });

        it('only the leader changes settings, starts or kicks', () => {
            const { svc, p } = lobby(2);
            svc.set('B', { difficulty: 'hard', openSeats: true, locked: true });
            expect([p.difficulty, p.openSeats, p.locked]).toEqual(['normal', false, false]);
            expect(svc.start('B')).toBeNull();
            expect(svc.kick('B', 'A')).toBe('bad_message');
        });
    });

    describe('kick and codes (S9)', () => {
        it('kick bans the identity for 10 minutes and rotates the code', () => {
            const t = lobby(2);
            const old = t.p.code;
            expect(t.svc.kick('A', 'B')).toBeNull();
            expect(t.sent).toContainEqual({ to: 'B', msg: { t: 'error', code: 'kicked' } });
            expect(t.p.members.map(m => m.id)).toEqual(['A']);
            expect(t.p.code).not.toBe(old);
            // the old link is dead; the new code refuses the kicked identity, even under a new member id
            expect(t.svc.join(old, 'B2', id('b'))).toBe('party_ended');
            expect(t.svc.join(t.p.code, 'B2', id('b'))).toBe('kicked');
            t.advance(PARTY_TIMING.kickBanMs + 1);
            expect(t.svc.join(t.p.code, 'B2', id('b'))).toBe(t.p);
        });

        it('kick only in the lobby or the results', () => {
            const { svc } = lobby(2);
            svc.start('A');
            expect(svc.kick('A', 'B')).toBe('party_busy');
        });

        it('New code rotates (leader only); a retired code is not reused for 1 hour', () => {
            const t = lobby(1);
            const old = t.p.code;
            t.svc.newCodeFor('A');
            expect(t.p.code).not.toBe(old);
            expect(t.svc.join(old, 'B', id('b'))).toBe('party_ended');
        });

        it('codes use the 31-letter alphabet and are unique over 100k draws', () => {
            expect(CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
            const t = setup();
            const seen = new Set<string>();
            const newCode = (t.svc as unknown as { newCode(): string }).newCode.bind(t.svc);
            const byCode = (t.svc as unknown as { byCode: Map<string, string> }).byCode;
            for (let i = 0; i < 100_000; i++) {
                const c = newCode();
                expect(seen.has(c)).toBe(false);
                seen.add(c);
                byCode.set(c, 'x');
            }
            for (const c of seen) expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
        });
    });

    describe('difficulty', () => {
        it('defaults to the lowest unlocked tier among members', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'hard', { maxDifficulty: 'hard', newbie: false });
            expect(p.difficulty).toBe('hard');
            t.svc.join(p.code, 'B', id('b'), { maxDifficulty: 'easy', newbie: true });
            expect(p.difficulty).toBe('easy');
            // the leader may still raise it
            t.svc.set('A', { difficulty: 'normal' });
            expect(p.difficulty).toBe('normal');
        });

        it('an unknown hint tier is ignored', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal', { maxDifficulty: 'godlike', newbie: false });
            t.svc.join(p.code, 'B', id('b'), { maxDifficulty: 'godlike', newbie: false });
            expect(p.difficulty).toBe('normal');
        });

        it('a newbie member shows in the view (the "New player in party" hint)', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal');
            t.svc.join(p.code, 'B', id('b'), { maxDifficulty: 'easy', newbie: true });
            expect(t.svc.view(p, 'A').members.find(m => m.id === 'B')?.newbie).toBe(true);
        });
    });

    describe('start (no ready check, D11)', () => {
        it('a party of one with Open seats off returns a local start (D10)', () => {
            const t = lobby(1);
            expect(t.svc.start('A')).toBe('local');
            expect(t.sent).toContainEqual({ to: 'A', msg: { t: 'local', difficulty: 'normal' } });
            expect(t.p.phase).toBe('lobby');
            expect(t.starts).toHaveLength(0);
        });

        it('a party of one with Open seats on goes to pick (the relay)', () => {
            const t = lobby(1);
            t.svc.set('A', { openSeats: true });
            expect(t.svc.start('A')).toBe('pick');
        });

        it('everyone present goes straight to pick, slots by join order, the party locks', () => {
            const t = lobby(3);
            expect(t.svc.start('A')).toBe('pick');
            expect(t.p.phase).toBe('pick');
            expect(t.p.locked).toBe(true);
            expect(t.p.members.map(m => m.slot)).toEqual([0, 1, 2]);
            expect(t.svc.view(t.p, 'A').deadlineMs).toBe(PARTY_TIMING.pickMs);
        });

        it('the leader always takes slot 0', () => {
            const t = lobby(3);
            t.svc.lead('A', 'C');
            t.svc.start('C');
            expect(Object.fromEntries(t.p.members.map(m => [m.id, m.slot]))).toEqual({ C: 0, A: 1, B: 2 });
        });

        it('someone away: waiting + nudge, then start anyway after 10 s', () => {
            const t = lobby(3);
            t.svc.setConn('C', 'away');
            expect(t.svc.start('A')).toBe('waiting');
            expect(t.svc.view(t.p, 'A').waiting).toEqual(['C']);
            t.svc.nudge('A', 'C');
            expect(t.sent).toContainEqual({ to: 'C', msg: { t: 'nudge', from: 'A' } });
            // a second nudge within 10 s is dropped
            t.svc.nudge('A', 'C');
            expect(t.sent.filter(s => s.msg.t === 'nudge')).toHaveLength(1);
            t.advance(5000);
            expect(t.svc.start('A')).toBe('waiting');
            t.advance(PARTY_TIMING.startAnywayMs);
            expect(t.svc.start('A')).toBe('pick');
            t.advance(PARTY_TIMING.nudgeEveryMs);
            t.svc.nudge('B', 'C');
            expect(t.sent.filter(s => s.msg.t === 'nudge')).toHaveLength(2);
        });

        it('waiting clears once everyone is back', () => {
            const t = lobby(2);
            t.svc.setConn('B', 'away');
            t.svc.start('A');
            t.svc.setConn('B', 'on');
            expect(t.svc.view(t.p, 'A').waiting).toEqual([]);
            expect(t.svc.start('A')).toBe('pick');
        });
    });

    describe('shared pick', () => {
        it('a lock takes the hero for other humans', () => {
            const t = lobby(2);
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.svc.hover('B', 'clem');
            expect(t.p.members[1].hero).toBeUndefined();
            t.svc.lock('B', 'clem', 'dash');
            expect(t.p.members[1].locked).toBe(false);
            t.svc.lock('B', 'mochi', 'heal');
            expect(t.p.phase).toBe('loading');
        });

        it("the leader's hover decides the side; a side change resets the others' unlocked hovers", () => {
            const t = lobby(3);
            t.svc.start('A');
            t.svc.hover('A', 'clem');
            t.svc.hover('B', 'mochi');
            t.svc.lock('C', 'nova', 'blink');
            // B may not take a dog while the leader is a cat
            t.svc.hover('B', 'rex');
            expect(t.p.members[1].hero).toBe('mochi');
            t.svc.hover('A', 'rex');
            expect(t.p.side).toBe('dog');
            expect(t.p.members[1].hero).toBeUndefined();
            // a lock stays
            expect(t.p.members[2].hero).toBe('nova');
        });

        it('an unknown hero or trick is ignored', () => {
            const t = lobby(2);
            t.svc.start('A');
            t.svc.hover('B', 'godzilla');
            t.svc.lock('B', 'mochi', 'nuke');
            expect(t.p.members[1].hero).toBeUndefined();
            expect(t.p.members[1].locked).toBe(false);
        });

        it('auto-locks at 30 s: the hover, else the newbie hero, else a free hero; nobody is kicked', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal');
            t.svc.join(p.code, 'B', id('b'), { maxDifficulty: 'easy', newbie: true });
            t.svc.join(p.code, 'C', id('c'));
            t.svc.start('A');
            t.svc.hover('A', 'mochi');
            t.advance(PARTY_TIMING.pickMs);
            expect(p.phase).toBe('loading');
            expect(p.members.map(m => [m.id, m.hero, m.locked])).toEqual([
                ['A', 'mochi', true],
                ['B', 'clem', true], // the "New? Try this" hero
                ['C', 'nova', true], // the first free hero of the leader's side
            ]);
            expect(p.members.every(m => !!m.trick)).toBe(true);
            expect(new Set(p.members.map(m => m.hero)).size).toBe(3);
        });

        it('the newbie hero is skipped when someone else locked it', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal');
            t.svc.join(p.code, 'B', id('b'), { maxDifficulty: 'easy', newbie: true });
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.advance(PARTY_TIMING.pickMs);
            expect(p.members[1].hero).not.toBe('clem');
            expect(p.members[1].locked).toBe(true);
        });

        it('the trick of a member is shown to peers only once locked', () => {
            const t = lobby(2);
            t.svc.start('A');
            t.svc.hover('B', 'mochi');
            expect(t.svc.view(t.p, 'A').members[1].trick).toBeUndefined();
            t.svc.lock('B', 'mochi', 'heal');
            expect(t.svc.view(t.p, 'A').members[1].trick).toBe('heal');
        });
    });

    describe('loading and launch', () => {
        const toLoading = () => {
            const t = lobby(3);
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.svc.lock('B', 'mochi', 'heal');
            t.svc.lock('C', 'nova', 'blink');
            expect(t.p.phase).toBe('loading');
            return t;
        };

        it('launches when everyone is loaded', () => {
            const t = toLoading();
            t.svc.loaded('A');
            t.svc.loaded('B');
            expect(t.starts).toHaveLength(0);
            t.svc.loaded('C');
            expect(t.starts).toHaveLength(1);
            const plan = t.starts[0];
            expect(plan.humans).toEqual([0, 1, 2]);
            expect(plan.seats).toEqual([
                { slot: 0, hero: 'clem', trick: 'dash' },
                { slot: 1, hero: 'mochi', trick: 'heal' },
                { slot: 2, hero: 'nova', trick: 'blink' },
            ]);
            expect(plan.seed).toBeGreaterThanOrEqual(0);
            expect(plan.seed).toBeLessThan(2 ** 32);
            expect(t.p.phase).toBe('match');
        });

        it('a late loader is piloted: launch after 20 s anyway', () => {
            const t = toLoading();
            t.svc.loaded('A');
            t.svc.load('B', 140);
            expect(t.p.members[1].loadPct).toBe(100);
            t.svc.load('C', 30);
            t.advance(PARTY_TIMING.loadMs);
            expect(t.starts).toHaveLength(1);
            expect(t.starts[0].occupied).toEqual([0, 1, 2]);
        });

        it('a disconnected member does not hold the launch', () => {
            const t = toLoading();
            t.svc.setConn('C', 'off');
            t.svc.loaded('A');
            t.svc.loaded('B');
            expect(t.starts).toHaveLength(1);
        });

        it('Open seats: every team slot is human and free seats get a hero of the leader side', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal');
            t.svc.set('A', { openSeats: true });
            t.svc.start('A');
            t.svc.lock('A', 'rex', 'dash');
            t.svc.loaded('A');
            const plan = t.starts[0];
            expect(plan.humans).toEqual([0, 1, 2]);
            expect(plan.occupied).toEqual([0]);
            expect(plan.seats.map(s => s.slot)).toEqual([0, 1, 2]);
            expect(plan.seats.slice(1).every(s => SIDE[s.hero] === 'dog' && s.hero !== 'rex')).toBe(true);
            expect(p.locked).toBe(false);
        });
    });

    describe('results and rematch', () => {
        const toResults = () => {
            const t = lobby(2);
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.svc.lock('B', 'mochi', 'heal');
            t.svc.loaded('A');
            t.svc.loaded('B');
            t.svc.matchEnded(t.p.id);
            expect(t.p.phase).toBe('results');
            expect(t.p.locked).toBe(false);
            return t;
        };

        it("the leader's rematch goes straight to pick with the last heroes prefilled", () => {
            const t = toResults();
            t.svc.rematch('A', true);
            expect(t.p.phase).toBe('pick');
            expect(t.p.members.map(m => [m.hero, m.trick, m.locked])).toEqual([
                ['clem', 'dash', false],
                ['mochi', 'heal', false],
            ]);
            // every member hears "Leader started a rematch" first; the pick timer includes those 3 s
            expect(t.sent.filter(s => s.msg.t === 'vote' && s.msg.result === 'pass').map(s => s.to)).toEqual([
                'A',
                'B',
            ]);
            expect(t.svc.view(t.p, 'B').deadlineMs).toBe(PARTY_TIMING.pickMs + PARTY_TIMING.rematchNoteMs);
        });

        it('a majority also starts it; a single member of three does not', () => {
            const t = lobby(3);
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.svc.lock('B', 'mochi', 'heal');
            t.svc.lock('C', 'nova', 'blink');
            for (const m of ['A', 'B', 'C']) t.svc.loaded(m);
            t.svc.matchEnded(t.p.id);
            t.svc.rematch('B', true);
            expect(t.p.phase).toBe('results');
            t.svc.rematch('C', true);
            expect(t.p.phase).toBe('pick');
        });

        it('a member who left is dropped from the rematch', () => {
            const t = toResults();
            t.svc.leave('B');
            t.svc.rematch('A', true);
            expect(t.p.members.map(m => m.id)).toEqual(['A']);
        });

        it('a rematch vote outside the results is ignored', () => {
            const t = lobby(2);
            t.svc.rematch('A', true);
            expect(t.p.phase).toBe('lobby');
        });
    });

    describe('TTLs', () => {
        it('an empty-of-connections party ends after 30 minutes idle and its code retires', () => {
            const t = lobby(2);
            const code = t.p.code;
            t.svc.setConn('A', 'off');
            t.svc.setConn('B', 'off');
            t.advance(PARTY_TIMING.idleMs + 1000);
            expect(t.svc.size).toBe(0);
            expect(t.svc.join(code, 'C', id('c'))).toBe('party_ended');
        });

        it('a running match is never idled out, but the 3 h hard cap ends any party', () => {
            const t = lobby(2);
            t.svc.start('A');
            t.svc.lock('A', 'clem', 'dash');
            t.svc.lock('B', 'mochi', 'heal');
            t.svc.loaded('A');
            t.svc.loaded('B');
            t.svc.setConn('A', 'off');
            t.svc.setConn('B', 'off');
            t.advance(PARTY_TIMING.idleMs + 1000);
            expect(t.svc.size).toBe(1);
            t.advance(PARTY_TIMING.hardMaxMs);
            expect(t.svc.size).toBe(0);
        });

        it('the last member leaving ends the party', () => {
            const t = lobby(1);
            t.svc.leave('A');
            expect(t.svc.size).toBe(0);
            expect(t.svc.partyOf('A')).toBeNull();
        });
    });

    describe('names and cards (D8)', () => {
        it('names are deterministic from the member id and never a custom cat name for peers', () => {
            expect(memberName('abc')).toBe(memberName('abc'));
            expect(memberName('abc')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
            const t = lobby(2);
            t.svc.setCard('B', {
                catId: '64b000000000000000000001',
                image: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png',
                element: 'fire',
                tier: 'rare',
                catalog: 'Tabby',
                ownName: 'Mr Whiskers',
            });
            const forA = t.svc.view(t.p, 'A').members[1];
            const forB = t.svc.view(t.p, 'B').members[1];
            expect(forA.name).toMatch(/ Tabby$/);
            expect(JSON.stringify(t.svc.view(t.p, 'A'))).not.toContain('Mr Whiskers');
            expect(forA.card).toEqual({
                image: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png',
                element: 'fire',
                tier: 'rare',
            });
            // catId and the custom name only in the owner's own copy
            expect(JSON.stringify(t.svc.view(t.p, 'A'))).not.toContain('64b000000000000000000001');
            expect(forB.card?.catId).toBe('64b000000000000000000001');
            expect(forB.ownName).toBe('Mr Whiskers');
        });

        it('an unsafe catalog string never becomes part of a name', () => {
            expect(memberName('x', '<script>')).not.toContain('<');
            expect(memberName('x', 'a'.repeat(40))).not.toContain('aaaa');
        });

        it('taking a card off restores the generated name; cards only in lobby or results', () => {
            const t = lobby(2);
            const before = t.p.members[1].name;
            t.svc.setCard('B', { catId: '1', image: 'i', element: 'fire', tier: 'rare', catalog: 'Siamese' });
            expect(t.p.members[1].name).not.toBe(before);
            t.svc.setCard('B', null);
            expect(t.p.members[1].name).toBe(before);
            t.svc.start('A');
            t.svc.setCard('B', { catId: '1', image: 'i', element: 'fire', tier: 'rare', catalog: 'Siamese' });
            expect(t.p.members[1].card).toBeUndefined();
        });

        it('duplicates get " 2"', () => {
            expect(dedupeNames(['Sunny Tabby', 'Sunny Tabby', 'Brave Sage', 'Sunny Tabby'])).toEqual([
                'Sunny Tabby',
                'Sunny Tabby 2',
                'Brave Sage',
                'Sunny Tabby 3',
            ]);
        });

        it('every adjective and noun pair passes the profanity check', () => {
            expect(ADJECTIVES.length).toBeGreaterThanOrEqual(64);
            expect(NOUNS.length).toBeGreaterThanOrEqual(64);
            for (const a of ADJECTIVES)
                for (const n of NOUNS) {
                    const r = normalizeCatName(`${a} ${n}`);
                    if (!r.ok) expect([a, n, r.code]).not.toContain('NAME_BLOCKED');
                }
            for (const w of [...ADJECTIVES, ...NOUNS]) {
                const r = normalizeCatName(w);
                expect(r.ok || r.code !== 'NAME_BLOCKED').toBe(true);
            }
        });

        it('peers never see account ids or guest keys', () => {
            const t = setup();
            const p = t.svc.create('A', id('a'), 'normal');
            t.svc.join(p.code, 'B', {
                accountId: null,
                guestKeyHash: 'gkh',
                key: 'guest:gkh',
                ticketed: false,
                guest: true,
            });
            const json = JSON.stringify(t.svc.view(p, 'A'));
            expect(json).not.toContain('acct-a');
            expect(json).not.toContain('gkh');
            expect(t.svc.view(p, 'A').members[1].guest).toBe(true);
        });
    });

    describe('view', () => {
        it('every change notifies (the relay coalesces broadcasts to 10 Hz)', () => {
            const t = lobby(2);
            const n = t.changes();
            t.svc.set('A', { difficulty: 'hard' });
            t.svc.set('A', { openSeats: true });
            expect(t.changes()).toBe(n + 2);
        });

        it('shows the phase, the leader and the remaining deadline', () => {
            const t = lobby(2);
            t.svc.start('A');
            t.advance(10_000);
            const v = t.svc.view(t.p as Party, 'B');
            expect(v).toMatchObject({ t: 'party', phase: 'pick', leader: 'A', you: 'B' });
            expect(v.deadlineMs).toBe(PARTY_TIMING.pickMs - 10_000);
        });
    });
});
