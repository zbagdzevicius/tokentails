import { bootMm, lockAndLoad, nextTick } from './mm-relay.helper-spec';

/* Quick Play backfill (M1A-IMPL.md §3) over real sockets. */

describe('Quick Play backfill', () => {
    jest.setTimeout(120_000);

    it('a mid-match leave offers the seat to a queued solo; Join takes the slot and replaces the occupant row', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            const l = await b.guest();
            a.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            l.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await a.until(() => a.last('mm.status'));
            b.skew.ms += 9000; // the quiet pair fill
            const [ma, ml] = await lockAndLoad([a, l]);
            expect(ma.config.humans).toEqual([0, 1]);
            const leftSlot = ml.you.slot;
            const party = a.last('party')!;
            const live = [...b.relay.rooms.values()][0];
            l.send({ t: 'party.leave' });
            await a.until(() => a.json.find(j => j.t === 'slot' && j.reason === 'left'));
            // a third player queues (dog-only players are never offered a cat seat)
            const dog = await b.guest();
            dog.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            const c = await b.guest();
            c.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await c.until(() => c.last('mm.status'));
            await nextTick();
            expect(c.last('mm.backfill.offer')).toBeUndefined(); // waited < 3 s
            b.skew.ms += 3500;
            const offer = await c.until(() => c.last('mm.backfill.offer'));
            expect(offer).toMatchObject({ side: 'cat', expiresMs: 10_000 });
            expect(offer.offer).toMatch(/^[a-z0-9]{12}$/);
            expect(dog.last('mm.backfill.offer')).toBeUndefined();
            c.send({ t: 'mm.backfill', offer: offer.offer, yes: true });
            const m = await c.until(() => c.last('match'));
            expect(m.you.slot).toBe(leftSlot);
            expect(m.startInMs).toBe(0);
            expect(m.mode).toBe('coop');
            const cv = await c.until(() => c.last('party'));
            expect(cv.code).toBe('');
            expect(live.occupants.filter(o => o.slot === leftSlot)).toHaveLength(1);
            expect(live.seats.get(c.last('welcome')!.member)).toBe(leftSlot);
            expect(live.room.slots[leftSlot].reason).toBe('late');
            expect(party.mm.side).toBe('cat');
            const rec = b.mmRooms.rooms.get(live.room.id)!;
            expect(rec.members.find(x => x.backfill)).toMatchObject({ slot: leftSlot, backfill: true });
            expect((b.relay.counters() as Record<string, number>).mm_backfills).toBe(1);
        } finally {
            await b.stop();
        }
    });

    it('a dropped seat is offered after 60 s piloted; the returning leaver gets seat_taken; the AFK ticks move to before', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            const l = await b.guest();
            a.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            l.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            await a.until(() => a.last('mm.status'));
            b.skew.ms += 9000;
            const [, ml] = await lockAndLoad([a, l]);
            const slot = ml.you.slot;
            const token = l.last('welcome')!.resumeToken;
            const live = [...b.relay.rooms.values()][0];
            await a.until(() => (live.room.status === 'live' ? true : null));
            l.close();
            await a.until(() =>
                live.room.slots[slot].mode === 'pilot' && !live.room.slots[slot].connected ? true : null
            );
            const c = await b.guest();
            c.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await c.until(() => c.last('mm.status'));
            await nextTick();
            b.skew.ms += 61_000;
            const offer = await c.until(() => c.last('mm.backfill.offer'), 20_000);
            // let some piloted ticks accrue as `drop` before the claim
            const dropBefore = live.room.slots[slot].pilotTicks.drop;
            expect(dropBefore).toBeGreaterThan(0);
            c.send({ t: 'mm.backfill', offer: offer.offer, yes: true });
            await c.until(() => c.last('match'));
            expect(live.room.slots[slot].pilotTicks.drop).toBe(0);
            expect(live.room.slots[slot].pilotTicks.before).toBeGreaterThanOrEqual(dropBefore);
            const back = await b.client();
            back.hello({ guestKey: 'never-used-key-xyz', resume: { token } });
            expect((await back.until(() => back.last('error'))).code).toBe('seat_taken');
        } finally {
            await b.stop();
        }
    });

    it('declining passes the offer on: the same entry is not offered that seat again', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            const l = await b.guest();
            a.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            l.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await a.until(() => a.last('mm.status'));
            b.skew.ms += 9000;
            await lockAndLoad([a, l]);
            l.send({ t: 'party.leave' });
            const c1 = await b.guest();
            c1.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await c1.until(() => c1.last('mm.status'));
            b.skew.ms += 3500;
            const o1 = await c1.until(() => c1.last('mm.backfill.offer'));
            c1.send({ t: 'mm.backfill', offer: o1.offer, yes: false });
            const c2 = await b.guest();
            c2.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await c2.until(() => c2.last('mm.status'));
            b.skew.ms += 3500;
            await c2.until(() => c2.last('mm.backfill.offer'));
            // c1 was not offered the same seat again
            expect(c1.json.filter(j => j.t === 'mm.backfill.offer')).toHaveLength(1);
        } finally {
            await b.stop();
        }
    });
});
