import { createHash } from 'crypto';
import { bootMm, lockAndLoad, nextTick } from './mm-relay.helper-spec';
import { identityHash } from './mm-room.schema';

/*
 * The leaver ladder is for players who choose to leave (founder, 2026-11-20: "it should handle gracefully"). A crash, an
 * app relaunch, an OTA reload or a network drop is no early leave when the player takes the rejoin, and our own update
 * never counts. Real sockets; the room's events are read by ending the room through the relay's hook.
 */

const hashOfGuest = (guestKey: string): string =>
    identityHash(`guest:${createHash('sha256').update(`guest:${guestKey}`).digest('hex').slice(0, 24)}`);

describe('Quick Play leaver grace: crashes, reloads and updates are not early leaves', () => {
    jest.setTimeout(120_000);

    async function twoInARoom(b: Awaited<ReturnType<typeof bootMm>>, key: string) {
        const a = await b.guest();
        const l = await b.client();
        l.hello({ guestKey: key });
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

    /** End the room through the relay's hook and return the leaver's event (undefined: none). */
    async function eventOf(
        b: Awaited<ReturnType<typeof bootMm>>,
        live: { room: { id: string; tick: number } },
        key: string
    ) {
        // the bridge's per-tick scan records a freed seat
        await nextTick();
        await b.relay.mm.onRoomEnded(live.room.id, null, live.room.tick);
        const rec = b.mmRooms.rooms.get(live.room.id)!;
        const rows = rec.members.filter(m => m.identityHash === hashOfGuest(key));
        expect(rows.length).toBeGreaterThan(0);
        return rows.map(r => r.event).find(e => !!e);
    }

    async function closedTab(b: Awaited<ReturnType<typeof bootMm>>, key: string, hint?: Record<string, unknown>) {
        const room = await twoInARoom(b, key);
        room.l.close();
        await room.a.until(() => (!room.live.room.slots[room.slot].connected ? true : null));
        const n = await b.client();
        n.hello({ guestKey: key, ...(hint ? { hint } : {}) });
        await n.until(() => n.last('welcome'));
        return { ...room, n };
    }

    it('a crash, then Play online: the game is offered its live seat first; Rejoin takes it back and nothing counts', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-1`;
            const { live, slot, n } = await closedTab(b, key);
            n.send({ t: 'mm.join', queue: 'coop', side: 'any', held: 'ask' });
            const offer = await n.until(() => n.last('mm.rejoin'));
            expect(offer).toMatchObject({ mode: 'coop' });
            expect(offer.clockS).toBeGreaterThanOrEqual(0);
            expect(n.last('mm.status')).toBeUndefined(); // no search yet
            n.send({ t: 'mm.back' });
            const m = await n.until(() => n.last('match'));
            expect(m.you.slot).toBe(slot);
            expect(await eventOf(b, live, key)).toBeUndefined();
            expect((b.relay.counters() as Record<string, number>).mm_rejoins).toBe(1);
        } finally {
            await b.stop();
        }
    });

    it('declining the rejoin (Search new match) gives the seat up as an early leave', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-2`;
            const { a, live, n } = await closedTab(b, key);
            n.send({ t: 'mm.join', queue: 'coop', side: 'any', held: 'ask' });
            await n.until(() => n.last('mm.rejoin'));
            n.send({ t: 'mm.join', queue: 'coop', side: 'any', held: 'leave' });
            await n.until(() => n.last('mm.status'));
            await a.until(() => (a.last('party')?.members.length === 1 ? true : null));
            expect(await eventOf(b, live, key)).toBe('left');
        } finally {
            await b.stop();
        }
    });

    it('an older game (no `held`) searching from a crashed seat: the seat is given up as a drop, never a leave', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-3`;
            const { a, live, n } = await closedTab(b, key);
            n.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await n.until(() => n.last('mm.status'));
            expect(n.last('mm.rejoin')).toBeUndefined();
            await a.until(() => (a.last('party')?.members.length === 1 ? true : null));
            expect(await eventOf(b, live, key)).toBe('dropped');
        } finally {
            await b.stop();
        }
    });

    it('our own update reloaded the app (hint.reload): even Search new match is a drop', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-4`;
            const { live, n } = await closedTab(b, key, { maxDifficulty: 'easy', newbie: false, reload: 'update' });
            n.send({ t: 'mm.join', queue: 'coop', side: 'any', held: 'leave' });
            await n.until(() => n.last('mm.status'));
            expect(await eventOf(b, live, key)).toBe('dropped');
        } finally {
            await b.stop();
        }
    });

    it('a backfill replaces a dropped player who comes back before the end: dropped, not left', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-5`;
            const { live, slot, l } = await twoInARoom(b, key);
            l.close();
            await nextTick();
            const c = await b.guest();
            c.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await c.until(() => c.last('mm.status'));
            await nextTick();
            b.skew.ms += 61_000;
            const offer = await c.until(() => c.last('mm.backfill.offer'), 20_000);
            c.send({ t: 'mm.backfill', offer: offer.offer, yes: true });
            const m = await c.until(() => c.last('match'));
            expect(m.you.slot).toBe(slot);
            // the dropped player opens the game again (same guest key) while the match runs
            const back = await b.client();
            back.hello({ guestKey: key });
            await back.until(() => back.last('welcome'));
            b.skew.ms += 200_000;
            expect(await eventOf(b, live, key)).toBe('dropped');
        } finally {
            await b.stop();
        }
    });

    it('a backfill replaces a dropped player who never comes back: left at the end', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-6`;
            const { live, l } = await twoInARoom(b, key);
            l.close();
            await nextTick();
            const c = await b.guest();
            c.send({ t: 'mm.join', queue: 'coop', side: 'any' });
            await c.until(() => c.last('mm.status'));
            await nextTick();
            b.skew.ms += 61_000;
            const offer = await c.until(() => c.last('mm.backfill.offer'), 20_000);
            c.send({ t: 'mm.backfill', offer: offer.offer, yes: true });
            await c.until(() => c.last('match'));
            b.skew.ms += 200_000;
            expect(await eventOf(b, live, key)).toBe('left');
        } finally {
            await b.stop();
        }
    });

    it('Leave match (party.leave) is still an early leave', async () => {
        const b = await bootMm();
        try {
            const key = `grace-${process.pid}-7`;
            const { a, l, live } = await twoInARoom(b, key);
            l.send({ t: 'party.leave' });
            await a.until(() => a.json.find(j => j.t === 'slot' && j.reason === 'left'));
            expect(await eventOf(b, live, key)).toBe('left');
        } finally {
            await b.stop();
        }
    });
});
