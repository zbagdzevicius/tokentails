import { TRICK, bootMm, heroesOf, nextTick } from './mm-relay.helper-spec';

/*
 * Founder, 2026-11-20: "Too many searches from this network. Try again in 30s ... lift such restrictions please, it'll
 * result in many bugs". The 30 s came from the live-room cap: a casual (or ranked) seat the account still held after
 * a reload, an OTA update or a relaunch mid-match refused every new search until that match ended. Over real sockets:
 * the newest search wins in every mode, many players behind one address all queue, and one player can cancel and
 * search again as fast as they tap.
 */

describe('matchmaking never blocks a real player (no per-address caps, the newest search wins)', () => {
    jest.setTimeout(120_000);

    it('a reload mid casual match, then Play online: the search starts at once and the old seat goes to a bot', async () => {
        const b = await bootMm();
        try {
            const key = `reload-key-${process.pid}-1`;
            const old = await b.client();
            old.hello({ guestKey: key });
            await old.until(() => old.last('welcome'));
            old.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            await old.until(() => old.last('mm.status'));
            b.skew.ms += 15_500;
            const found = await old.until(() => old.last('mm.found'));
            old.send({ t: 'mm.accept', match: found.match, yes: true });
            const view = await old.until(() => (old.last('party')?.phase === 'pick' ? old.last('party') : null));
            old.send({ t: 'pick.lock', hero: heroesOf(view.mm.side)[0], trick: TRICK });
            await old.until(() => (old.last('party')?.phase === 'loading' ? true : null), 15_000);
            old.send({ t: 'loaded' });
            await old.until(() => old.last('match'), 15_000);
            old.send({ t: 'loaded' });
            const live = [...b.relay.rooms.values()][0];
            await old.until(() => (live.room.status === 'live' ? true : null));
            const slot = live.seats.values().next().value as number;

            // the reload: a new socket of the same player, no resume token; the old one is not closed yet
            const n = await b.client();
            n.hello({ guestKey: key });
            await n.until(() => n.last('welcome'));
            n.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            await n.until(() => n.last('mm.status'));
            expect(n.json.filter(j => j.t === 'error')).toEqual([]);
            expect((await old.until(() => old.last('error'))).code).toBe('seat_taken');
            expect(live.room.slots[slot].mode).toBe('pilot');
            // and the new search is seated like any other (a team of bots at 15 s)
            b.skew.ms += 15_500;
            await n.until(() => n.last('mm.found'), 20_000);
            expect(n.json.filter(j => j.t === 'error')).toEqual([]);
        } finally {
            await b.stop();
        }
    });

    it('20 players from one address (a carrier NAT) all search at once, casual and co-op', async () => {
        const b = await bootMm();
        try {
            const cs = [];
            for (let i = 0; i < 20; i++) cs.push(await b.guest({}, { 'x-test-ip': '85.206.1.7' }));
            cs.forEach((c, i) => c.send({ t: 'mm.join', queue: i % 2 ? 'coop' : 'casual', side: 'any' }));
            await Promise.all(cs.map(c => c.until(() => c.last('mm.status'))));
            for (const c of cs) expect(c.json.filter(j => j.t === 'error')).toEqual([]);
        } finally {
            await b.stop();
        }
    });

    it('one player: Cancel and Search again, quickly, again and again: every search is accepted', async () => {
        const b = await bootMm();
        try {
            const a = await b.guest();
            for (let i = 0; i < 12; i++) {
                a.send({ t: 'mm.join', queue: i % 2 ? 'coop' : 'casual', side: 'any' });
                await a.until(() => (a.json.filter(j => j.t === 'mm.status').length > i ? true : null));
                a.send({ t: 'mm.leave' });
                await a.until(() => (a.json.filter(j => j.t === 'mm.cancel').length > i ? true : null));
                // the JSON frame budget (5 a second) is per socket and unrelated to matchmaking
                await new Promise(r => setTimeout(r, 400));
            }
            a.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            await a.until(() => (a.json.filter(j => j.t === 'mm.status').length > 12 ? true : null));
            await nextTick();
            expect(a.json.filter(j => j.t === 'error')).toEqual([]);
        } finally {
            await b.stop();
        }
    });
});
