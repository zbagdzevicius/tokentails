import { PartyService, type MemberIdentity } from '../party/party.service';

/* Quick Play parties (M1A-IMPL.md §5.2): createMatched, startMatched, joinMatched, the fixed side, strangers. */

const id = (k: string): MemberIdentity => ({
    accountId: k,
    guestKeyHash: null,
    key: `acct:${k}`,
    ticketed: true,
    guest: false,
});

function make() {
    const sent: { to: string; msg: Record<string, unknown> }[] = [];
    const clock = { now: 1_000_000 };
    const ps = new PartyService(
        {
            heroes: ['clem', 'sage', 'mochi', 'nugget', 'bravo', 'chili'],
            tricks: ['pounce'],
            difficulties: ['rookie', 'easy', 'normal', 'hard'],
            sideOf: h => (['nugget', 'bravo', 'chili'].includes(h) ? 'dog' : 'cat'),
            newbieHero: 'clem',
        },
        { changed: () => undefined, send: (to, msg) => sent.push({ to, msg }), startMatch: () => undefined },
        () => clock.now
    );
    return { ps, sent, clock };
}

describe('Quick Play parties', () => {
    it('createMatched: strangers in slot order, locked, pick at once, the side fixed for everyone (the leader too)', () => {
        const { ps } = make();
        const p = ps.createMatched(
            [
                { id: 'm1', identity: id('a') },
                { id: 'm2', identity: id('b') },
            ],
            { match: 'x', side: 'dog', difficulty: 'easy' }
        );
        expect(p).toMatchObject({
            phase: 'pick',
            locked: true,
            openSeats: false,
            leader: 'm1',
            difficulty: 'easy',
            side: 'dog',
        });
        expect(p.members.map(m => m.slot)).toEqual([0, 1]);
        ps.hover('m1', 'clem');
        expect(p.members[0].hero).toBeUndefined();
        expect(p.side).toBe('dog');
        ps.lock('m1', 'nugget', 'pounce');
        ps.lock('m2', 'clem', 'pounce');
        expect(p.members[1].locked).toBe(false);
        expect(ps.view(p, 'm2').code).toBe('');
        expect(ps.view(p, 'm2').mm).toEqual({ side: 'dog', strangers: true });
    });

    it('auto-lock on the pick timeout picks the fixed side (a newbie never gets the cat newbie hero on dogs)', () => {
        const { ps, clock } = make();
        const p = ps.createMatched([{ id: 'n1', identity: id('n'), hint: { maxDifficulty: 'rookie', newbie: true } }], {
            match: 'x',
            side: 'dog',
            difficulty: 'rookie',
        });
        clock.now += 31_000;
        ps.tick();
        expect(p.phase).toBe('loading');
        expect(['nugget', 'bravo', 'chili']).toContain(p.members[0].hero);
    });

    it('startMatched keeps a friend party (its code for friends, not for strangers); leader-only actions are refused', () => {
        const { ps } = make();
        const p = ps.create('lead', id('l'), 'hard');
        ps.join(p.code, 'fr', id('f'));
        ps.setQueued(p, { sinceMs: 0, side: 'cat' });
        expect(ps.view(p, 'fr').queue).toMatchObject({ side: 'cat' });
        ps.startMatched(p, { match: 'x', side: 'cat', difficulty: 'normal' }, [{ id: 'st', identity: id('s') }]);
        expect(p.members.map(m => [m.id, m.slot])).toEqual([
            ['lead', 0],
            ['fr', 1],
            ['st', 2],
        ]);
        expect(p.queued).toBeUndefined();
        expect(ps.view(p, 'fr').code).toBe(p.code);
        expect(ps.view(p, 'st').code).toBe('');
        expect(ps.isStranger('st')).toBe(true);
        expect(ps.isStranger('fr')).toBe(false);
        expect(ps.kick('lead', 'st')).toBe('bad_message');
        const code = p.code;
        ps.newCodeFor('lead');
        expect(p.code).toBe(code);
        ps.lead('lead', 'st');
        expect(p.leader).toBe('lead');
        ps.set('lead', { difficulty: 'hard' });
        expect(p.difficulty).toBe('normal');
    });

    it('results: no rematch vote; the friend party is plain again when its last stranger leaves', () => {
        const { ps } = make();
        const p = ps.create('lead', id('l'), 'easy');
        ps.startMatched(p, { match: 'x', side: 'cat', difficulty: 'easy' }, [{ id: 'st', identity: id('s') }]);
        p.phase = 'match';
        ps.matchEnded(p.id);
        expect(p.phase).toBe('results');
        expect(p.mm?.resultsSinceMs).toBeDefined();
        ps.rematch('lead', true);
        expect(p.phase).toBe('results');
        ps.leave('st');
        expect(p.mm).toBeUndefined();
        expect(p.locked).toBe(false);
        expect(ps.view(p, 'lead').mm).toBeUndefined();
        ps.rematch('lead', true);
        expect(p.phase).toBe('pick');
    });

    it('joinMatched seats a backfiller as a stranger in a running Quick Play party (no code, no lock check)', () => {
        const { ps } = make();
        const p = ps.createMatched([{ id: 'a1', identity: id('a') }], { match: 'x', side: 'cat', difficulty: 'easy' });
        p.phase = 'match';
        const m = ps.joinMatched(p, 'b1', id('b'));
        expect(m).not.toBeNull();
        expect(p.mm!.strangers.has('b1')).toBe(true);
        expect(ps.partyOf('b1')).toBe(p);
        // a member leaving a queued friend party drops the queue state
        const q = ps.create('q1', id('q'), 'easy');
        ps.join(q.code, 'q2', id('q2'));
        ps.setQueued(q, { sinceMs: 0, side: 'any' });
        ps.leave('q2');
        expect(q.queued).toBeUndefined();
    });
});
