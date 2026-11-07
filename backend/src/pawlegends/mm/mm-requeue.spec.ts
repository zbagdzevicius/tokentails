import { bootMm, lockAndLoad, nextTick } from './mm-relay.helper-spec';

/*
 * Quick Play after leaving a match (M1A-IMPL.md §5): Play online again must search and fill, never spin. A seat given
 * up stops counting toward the one-live-room-per-identity cap; a closed tab's seat is given up by a new search, or taken
 * back with `mm.back` (a stranger has no party code to rejoin by).
 */

describe('Quick Play: play online again after a match', () => {
    jest.setTimeout(120_000);

    /** Two strangers matched into one live room (the quiet pair fill). */
    async function twoInARoom(b: Awaited<ReturnType<typeof bootMm>>, leaverKey: string) {
        const a = await b.guest();
        const l = await b.client();
        l.hello({ guestKey: leaverKey });
        await l.until(() => l.last('welcome'));
        a.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
        l.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
        await a.until(() => a.last('mm.status'));
        b.skew.ms += 9000;
        const [, ml] = await lockAndLoad([a, l]);
        const live = [...b.relay.rooms.values()][0];
        await a.until(() => (live.room.status === 'live' ? true : null));
        return { a, l, live, slot: ml.you.slot as number };
    }

    it('party.leave then mm.join on the same socket: queued, filled with bots, no mm.cancel{server}', async () => {
        const b = await bootMm();
        try {
            const { l } = await twoInARoom(b, `leaver-key-${process.pid}-1`);
            l.send({ t: 'party.leave' });
            await l.until(() => l.json.find(j => j.t === 'party' && j.left));
            l.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await l.until(() => l.last('mm.status'));
            await nextTick();
            b.skew.ms += 31_000;
            const founds = await l.until(() => {
                const all = l.json.filter(j => j.t === 'mm.found');
                return all.length === 2 ? all : null;
            }, 20_000);
            expect(founds[1]).toMatchObject({ humans: 1, bots: 2 });
            expect(l.json.some(j => j.t === 'mm.cancel' && j.reason === 'server')).toBe(false);
        } finally {
            await b.stop();
        }
    });

    it('a closed tab, then Play online from a new tab (same guest): the old seat is given up, the search fills', async () => {
        const b = await bootMm();
        try {
            const key = `leaver-key-${process.pid}-2`;
            const { a, l, live, slot } = await twoInARoom(b, key);
            l.close();
            await a.until(() => (!live.room.slots[slot].connected ? true : null));
            const n = await b.client();
            n.hello({ guestKey: key });
            await n.until(() => n.last('welcome'));
            n.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await n.until(() => n.last('mm.status'));
            // the old member left the party; a bot keeps flying the seat for the teammate
            await a.until(() => (a.last('party')?.members.length === 1 ? true : null));
            expect(live.room.slots[slot].mode).toBe('pilot');
            b.skew.ms += 31_000;
            const f = await n.until(() => n.last('mm.found'), 20_000);
            expect(f).toMatchObject({ humans: 1 });
            expect(n.last('error')).toBeUndefined();
        } finally {
            await b.stop();
        }
    });

    it('a closed tab, then mm.back from a new tab (same guest): the seat comes back mid-match', async () => {
        const b = await bootMm();
        try {
            const key = `leaver-key-${process.pid}-3`;
            const { a, l, live, slot } = await twoInARoom(b, key);
            const member = l.last('welcome')!.member;
            l.close();
            await a.until(() => (!live.room.slots[slot].connected ? true : null));
            const n = await b.client();
            n.hello({ guestKey: key });
            await n.until(() => n.last('welcome'));
            n.send({ t: 'mm.back' });
            await n.until(() => (n.json.filter(j => j.t === 'welcome').length === 2 ? true : null));
            expect(n.last('welcome')!.member).toBe(member);
            const m = await n.until(() => n.last('match'));
            expect(m.you.slot).toBe(slot);
            expect(m.mode).toBe('coop');
            // a guest with no live seat gets party_not_found (the client closes quietly)
            const other = await b.guest();
            other.send({ t: 'mm.back' });
            expect((await other.until(() => other.last('error'))).code).toBe('party_not_found');
        } finally {
            await b.stop();
        }
    });

    it('a second live tab keeps its seat: Play online elsewhere is refused with a time (mm_locked), not a hang', async () => {
        const b = await bootMm();
        try {
            const key = `leaver-key-${process.pid}-4`;
            await twoInARoom(b, key);
            const n = await b.client();
            n.hello({ guestKey: key });
            await n.until(() => n.last('welcome'));
            n.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            const e = await n.until(() => n.last('error'));
            expect(e).toMatchObject({ code: 'mm_locked' });
            expect(e.retryMs).toBeGreaterThan(0);
        } finally {
            await b.stop();
        }
    });

    it('Cancel that crosses mm.found: the stranger leaves the matched party before the room starts', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            const c = await b.guest();
            a.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            c.send({ t: 'mm.join', queue: 'coop', side: 'dog' });
            await a.until(() => a.last('mm.status'));
            b.skew.ms += 9000;
            await c.until(() => c.last('mm.found'));
            await a.until(() => (a.last('party')?.phase === 'pick' ? true : null));
            c.send({ t: 'mm.leave' });
            await a.until(() => (a.last('party')?.members.length === 1 ? true : null));
            await c.until(() => c.json.find(j => j.t === 'party' && j.left));
        } finally {
            await b.stop();
        }
    });
});
