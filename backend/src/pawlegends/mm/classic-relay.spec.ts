import { TRICK, bootMm, heroesOf, nextTick } from './mm-relay.helper-spec';
import type { TestClient } from '../party/relay-test-client.helper-spec';

/*
 * 5v5 Classic over real sockets (docs/plans/moba/MAP-5V5.md §2.7, §9): the `classic` queue from PROTO 4, ten humans
 * on Hearthwood Divide (slots 0..9, PvP leads 0 and 5), the bot fill at 45 s, and a PROTO 3 socket told to update.
 */

const VET = { hint: { maxDifficulty: 'normal', newbie: false, matches: 12 } };

async function vets(b: Awaited<ReturnType<typeof bootMm>>, n: number, extra = {}): Promise<TestClient[]> {
    const out: TestClient[] = [];
    for (let i = 0; i < n; i++) out.push(await b.veteran({ ...VET, ...extra }));
    return out;
}

/** A raw Move command (op 1, x and y in 250 mm quanta, little-endian u16): no sim encode, so no bound-map clamp. */
const moveBytes = (xMm: number, yMm: number): Uint8Array => {
    const qx = Math.round(xMm / 250);
    const qy = Math.round(yMm / 250);
    return new Uint8Array([1, qx & 0xff, qx >> 8, qy & 0xff, qy >> 8]);
};

describe('5v5 Classic relay (MAP-5V5.md §9)', () => {
    jest.setTimeout(240_000);

    it('ten PROTO 4 solos: one Hearthwood room, slots 0..9, a Move at y = 100 m from slot 9 reaches the TURN', async () => {
        const b = await bootMm();
        try {
            const cs = await vets(b, 10);
            cs.forEach(c => c.send({ t: 'mm.join', queue: 'classic', side: 'any' }));
            const found = await Promise.all(cs.map(c => c.until(() => c.last('mm.found'), 20_000)));
            for (const f of found) {
                expect(f).toMatchObject({ mode: 'casual', humans: 5, bots: 0, map: 'hearthwood', teamSize: 5 });
                expect(f.teams).toEqual([
                    [5, 0],
                    [5, 0],
                ]);
            }
            found.forEach((f, i) => cs[i].send({ t: 'mm.accept', match: f.match, yes: true }));
            const views = await Promise.all(
                cs.map(c => c.until(() => (c.last('party')?.phase === 'pick' ? c.last('party') : null), 15_000))
            );
            expect(views.filter(v => v.mm.team === 0)).toHaveLength(5);
            for (const v of views) {
                expect(v.mm).toMatchObject({ mode: 'casual', map: 'hearthwood', teamSize: 5 });
                const me = v.members.find((m: any) => m.id === v.you);
                expect(me.slot >= 5 ? 1 : 0).toBe(v.mm.team);
            }
            // each team locks five different heroes of its species
            const used: Record<number, number> = { 0: 0, 1: 0 };
            cs.forEach((c, i) => {
                const v = views[i];
                c.send({ t: 'pick.lock', hero: heroesOf(v.mm.side)[used[v.mm.team]++], trick: TRICK });
            });
            await cs[0].until(() => (cs[0].last('party')?.phase === 'loading' ? true : null), 20_000);
            cs.forEach(c => c.send({ t: 'loaded' }));
            const matches = await Promise.all(cs.map(c => c.until(() => c.last('match'), 20_000)));
            for (const m of matches) {
                expect(m).toMatchObject({ mode: 'casual', map: 'hearthwood', teamSize: 5 });
                expect(m.config).toMatchObject({ mode: 'pvp', difficulty: 'hard', map: 'hearthwood' });
                expect(m.config.humans).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
                expect(m.config.picks).toHaveLength(10);
                expect(m.names).toHaveLength(10);
                expect(m.cosmetics.heroSkins).toHaveLength(10);
            }
            expect(new Set(matches.map(m => m.you.slot))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
            const rec = [...b.mmRooms.rooms.values()].find(r => !r._id.startsWith('vetroom'))!;
            expect(rec).toMatchObject({ queue: 'classic', mode: 'casual', map: 'hearthwood', fill: [] });
            expect(rec.teams!.map(t => t.slots)).toEqual([
                [0, 1, 2, 3, 4],
                [5, 6, 7, 8, 9],
            ]);
            // slot 9 moves to y = 100 m (out of Crossing's 60 m): the relay decodes it on Hearthwood and turns it
            const nine = cs[matches.findIndex(m => m.you.slot === 9)];
            await nine.until(() => nine.turns.length > 5, 20_000);
            const live = [...b.relay.rooms.values()][0];
            expect(live.room.slotCount).toBe(10);
            expect(live.room.teamSize).toBe(5);
            const beat = setInterval(() => nine.beat(), 250);
            try {
                nine.send({ t: 'back' });
                await nine.until(() => (live.room.slots[9].mode === 'human' ? true : null), 15_000);
                nine.cmd(moveBytes(64_000, 100_000));
            } finally {
                setTimeout(() => clearInterval(beat), 3000);
            }
            const got = await nine.until(
                () => nine.turns.find(t => t.entries.some(e => e.slot === 9 && !e.pilot)),
                20_000
            );
            expect(got.entries.find(e => e.slot === 9)!.cmd[0]).toBe(1);
            expect(nine.closed).toBeNull();
            // a quick-chat line from team 1 reaches team 1 only (slots 5..9)
            await new Promise(r => setTimeout(r, 300));
            nine.send({ t: 'social', kind: 'chat', id: 1 });
            await nine.until(() => nine.last('social'));
            await nextTick();
            cs.forEach((c, i) => expect(!!c.last('social')).toBe(matches[i].you.slot >= 5));
        } finally {
            await b.stop();
        }
    });

    it('two classic solos fill with bots at 45 s (1 + 4 bots a side); a PROTO 3 socket is told to update', async () => {
        const b = await bootMm();
        try {
            const [old] = await vets(b, 1, { proto: 3 });
            old.send({ t: 'mm.join', queue: 'classic', side: 'any' });
            expect((await old.until(() => old.last('error'))).code).toBe('update_required');
            const [a, c] = await vets(b, 2);
            a.send({ t: 'mm.join', queue: 'classic', side: 'any' });
            c.send({ t: 'mm.join', queue: 'classic', side: 'any' });
            const st = await a.until(() => a.last('mm.status'));
            expect(st.queue).toBe('classic');
            b.skew.ms += 31_000;
            await nextTick();
            await new Promise(r => setTimeout(r, 1200));
            // casual would have filled by now; classic waits for 45 s and never moves to co-op
            expect(a.last('mm.found')).toBeUndefined();
            expect(a.json.some(j => j.t === 'mm.status' && j.queue === 'coop')).toBe(false);
            b.skew.ms += 15_000;
            const fa = await a.until(() => a.last('mm.found'), 15_000);
            expect(fa).toMatchObject({ map: 'hearthwood', teamSize: 5 });
            expect(fa.teams).toEqual([
                [1, 4],
                [1, 4],
            ]);
        } finally {
            await b.stop();
        }
    });
});
