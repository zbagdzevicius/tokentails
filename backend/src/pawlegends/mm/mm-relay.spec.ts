import { bootMm, lockAndLoad, nextTick } from './mm-relay.helper-spec';

/* Quick Play over real sockets (M1A-IMPL.md §5, §9.2): queue, match, party, cancel, shutdown. */

describe('Quick Play relay (M1a co-op)', () => {
    jest.setTimeout(90_000);

    it('three solo sockets become one room: humans [0,1,2], one side, mode coop, no code for strangers', async () => {
        const b = await bootMm();
        try {
            const cs = [await b.guest(), await b.guest(), await b.guest()];
            cs.forEach(c => c.send({ t: 'mm.join', queue: 'coop', side: 'any' }));
            const status = await cs[0].until(() => cs[0].last('mm.status'));
            expect(status).toMatchObject({ queue: 'coop', side: 'any' });
            const found = await Promise.all(cs.map(c => c.until(() => c.last('mm.found'))));
            for (const f of found) expect(f).toMatchObject({ humans: 3, bots: 0 });
            const views = await Promise.all(
                cs.map(c => c.until(() => (c.last('party')?.phase === 'pick' ? c.last('party') : null)))
            );
            for (const v of views) {
                expect(v.code).toBe('');
                expect(v.mm).toEqual({ side: found[0].side, strangers: true });
                expect(v.locked).toBe(true);
            }
            const matches = await lockAndLoad(cs);
            expect(new Set(matches.map(m => m.you.slot))).toEqual(new Set([0, 1, 2]));
            for (const m of matches) {
                expect(m.mode).toBe('coop');
                expect(m.config.humans).toEqual([0, 1, 2]);
            }
            const rec = [...b.mmRooms.rooms.values()][0];
            expect(rec).toMatchObject({ queue: 'coop', side: found[0].side, fill: [] });
            expect(rec.members).toHaveLength(3);
            expect(b.relay.counters()).toMatchObject({ mm_matches: 1, mm_humans_3: 1 });
        } finally {
            await b.stop();
        }
    });

    it('a solo gets a room with two bots after the quiet fill (humans [0])', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest({ hint: { maxDifficulty: 'easy', newbie: true } });
            a.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            await a.until(() => a.last('mm.status'));
            await nextTick();
            expect(a.last('mm.found')).toBeUndefined();
            b.skew.ms += 9000;
            const f = await a.until(() => a.last('mm.found'));
            expect(f).toMatchObject({ humans: 1, bots: 2, side: 'dog' });
            // the hint caps the difficulty (newbie seed, easy max)
            expect(['rookie', 'easy']).toContain(f.difficulty);
            const [m] = await lockAndLoad([a]);
            expect(m.config.humans).toEqual([0]);
            expect(m.mode).toBe('coop');
            expect([...b.mmRooms.rooms.values()][0].fill).toEqual([1, 2]);
        } finally {
            await b.stop();
        }
    });

    it('a duo party queues as one entry; a stranger joins it; leader-only actions are refused with a stranger', async () => {
        const b = await bootMm();
        try {
            const lead = await b.guest();
            lead.send({ t: 'party.create', difficulty: 'hard' });
            const pv = await lead.until(() => lead.last('party'));
            const friend = await b.guest();
            friend.send({ t: 'party.join', code: pv.code });
            await lead.until(() => (lead.last('party')?.members.length === 2 ? true : null));
            // a non-leader cannot queue the party
            friend.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            lead.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await friend.until(() => friend.last('mm.status'));
            const q = await friend.until(() => (friend.last('party')?.queue ? friend.last('party') : null));
            expect(q.queue.side).toBe('cat');
            const stranger = await b.guest();
            stranger.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            const sv = await stranger.until(() =>
                stranger.last('party')?.phase === 'pick' ? stranger.last('party') : null
            );
            expect(sv.code).toBe('');
            expect(sv.members).toHaveLength(3);
            const lv = await lead.until(() => (lead.last('party')?.phase === 'pick' ? lead.last('party') : null));
            expect(lv.code).toBe(pv.code);
            expect(lv.leader).toBe(lead.last('welcome')!.member);
            expect(lv.mm.side).toBe('cat');
            // the leader cannot kick the stranger or rotate the code
            lead.send({ t: 'party.kick', member: stranger.last('welcome')!.member });
            lead.send({ t: 'party.newcode' });
            await nextTick();
            const after = lead.last('party')!;
            expect(after.members).toHaveLength(3);
            expect(after.code).toBe(pv.code);
            expect(stranger.last('error')).toBeUndefined();
        } finally {
            await b.stop();
        }
    });

    it('Cancel before mm.found; a member leaving a queued party cancels it; shutdown sends mm.cancel{server}', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            a.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await a.until(() => a.last('mm.status'));
            a.send({ t: 'mm.leave' });
            expect((await a.until(() => a.last('mm.cancel'))).reason).toBe('left');
            expect((b.relay.counters() as Record<string, number>).mm_queued).toBe(0);

            const lead = await b.guest();
            lead.send({ t: 'party.create', difficulty: 'easy' });
            const pv = await lead.until(() => lead.last('party'));
            const friend = await b.guest();
            friend.send({ t: 'party.join', code: pv.code });
            await lead.until(() => (lead.last('party')?.members.length === 2 ? true : null));
            lead.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            await friend.until(() => friend.last('mm.status'));
            friend.send({ t: 'party.leave' });
            expect((await lead.until(() => lead.last('mm.cancel'))).reason).toBe('party');
            await lead.until(() => (lead.last('party')?.queue ? null : true));

            const c = await b.guest();
            c.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await c.until(() => c.last('mm.status'));
            void b.relay.shutdown();
            expect((await c.until(() => c.last('mm.cancel'))).reason).toBe('server');
        } finally {
            await b.stop();
        }
    });

    it('mm.status repeats about every 2 s while queued and the side can change (1 per 2 s)', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            a.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await a.until(() => a.last('mm.status'));
            a.send({ t: 'mm.side', side: 'dog' });
            await a.until(() => (a.last('mm.status')?.side === 'dog' ? true : null));
            a.send({ t: 'mm.side', side: 'cat' }); // too soon: dropped
            await new Promise(r => setTimeout(r, 2600));
            const all = a.json.filter(j => j.t === 'mm.status');
            expect(all.length).toBeGreaterThanOrEqual(3);
            expect(a.last('mm.status')!.side).toBe('dog');
            expect(a.last('mm.status')!.waitedMs).toBeGreaterThan(2000);
        } finally {
            await b.stop();
        }
    });
});
