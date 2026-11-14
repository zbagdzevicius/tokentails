import { bootMm, heroesOf, TRICK } from './mm-relay.helper-spec';

/*
 * PROTO 1 → 2 (M1A-IMPL.md §5.5): the live PROTO 1 build keeps working against the new relay, unchanged; it never gets
 * an mm.* frame or a new error code.
 */

describe('Quick Play protocol compatibility', () => {
    jest.setTimeout(90_000);

    it('hello proto 1 → welcome proto 1; proto 2 → 2; proto 3 → 3; proto 4 → 4 (5v5 Classic); proto 5 → 5 (chat); proto 6 → 6 (match chat); proto 7 → 7 (spectate); proto 8 → update_required', async () => {
        const b = await bootMm();
        try {
            const one = await b.guest({ proto: 1 });
            expect(one.last('welcome')!.proto).toBe(1);
            const two = await b.guest({ proto: 2 });
            expect(two.last('welcome')!.proto).toBe(2);
            const three = await b.guest({ proto: 3 });
            expect(three.last('welcome')!.proto).toBe(3);
            const four = await b.guest({ proto: 4 });
            expect(four.last('welcome')!.proto).toBe(4);
            const five = await b.guest({ proto: 5 });
            expect(five.last('welcome')!.proto).toBe(5);
            const six = await b.guest({ proto: 6 });
            expect(six.last('welcome')!.proto).toBe(6);
            const seven = await b.guest({ proto: 7 });
            expect(seven.last('welcome')!.proto).toBe(7);
            const eight = await b.client();
            eight.hello({ proto: 8 });
            expect((await eight.until(() => eight.last('error'))).code).toBe('update_required');
        } finally {
            await b.stop();
        }
    });

    it('a PROTO 1 party plays a match as before (no mode field), and an mm.join from PROTO 1 is a strike', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest({ proto: 1 });
            a.send({ t: 'party.create', difficulty: 'easy' });
            const pv = await a.until(() => a.last('party'));
            expect(pv.mm).toBeUndefined();
            const c = await b.guest({ proto: 1 });
            c.send({ t: 'party.join', code: pv.code });
            await a.until(() => (a.last('party')?.members.length === 2 ? true : null));
            a.send({ t: 'party.start' });
            await a.until(() => (a.last('party')?.phase === 'pick' ? true : null));
            const cats = heroesOf('cat');
            a.send({ t: 'pick.lock', hero: cats[0], trick: TRICK });
            c.send({ t: 'pick.lock', hero: cats[1], trick: TRICK });
            await a.until(() => (a.last('party')?.phase === 'loading' ? true : null));
            a.send({ t: 'loaded' });
            c.send({ t: 'loaded' });
            const m = await a.until(() => a.last('match'));
            expect(m.mode).toBeUndefined();
            expect(m.config.humans).toEqual([0, 1]);
            const x = await b.guest({ proto: 1 });
            x.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            expect((await x.until(() => x.last('error'))).code).toBe('bad_message');
            expect(x.json.some(j => String(j.t).startsWith('mm.'))).toBe(false);
        } finally {
            await b.stop();
        }
    });

    it("a PROTO 1 member of a party never receives an mm.* frame; the leader's mm.join sends it update_required", async () => {
        const b = await bootMm();
        try {
            const lead = await b.guest({ proto: 2 });
            lead.send({ t: 'party.create', difficulty: 'easy' });
            const pv = await lead.until(() => lead.last('party'));
            const old = await b.guest({ proto: 1 });
            old.send({ t: 'party.join', code: pv.code });
            await lead.until(() => (lead.last('party')?.members.length === 2 ? true : null));
            lead.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            expect((await old.until(() => old.last('error'))).code).toBe('update_required');
            await new Promise(r => setTimeout(r, 800));
            expect(old.json.some(j => String(j.t).startsWith('mm.'))).toBe(false);
            expect(lead.last('mm.status')).toBeUndefined();
            expect((b.relay.counters() as Record<string, number>).mm_queued).toBe(0);
        } finally {
            await b.stop();
        }
    });
});
