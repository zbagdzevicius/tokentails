import { TRICK, bootMm, heroesOf, nextTick } from './mm-relay.helper-spec';
import type { TestClient } from '../party/relay-test-client.helper-spec';

/*
 * Casual PvP over real sockets (docs/plans/moba/V16.md §4.1 to §4.3, §4.6): the casual queue from PROTO 3, the Accept
 * card and a dodge, team-scoped picks, a PvP room (humans on both teams, `mode: 'pvp'`), team-only pings, a team-1
 * surrender that ends the match for team 0, and a PROTO 2 socket refused.
 */

const VET = { hint: { maxDifficulty: 'normal', newbie: false, matches: 12 } };

async function vets(b: Awaited<ReturnType<typeof bootMm>>, n: number): Promise<TestClient[]> {
    const out: TestClient[] = [];
    for (let i = 0; i < n; i++) out.push(await b.veteran(VET));
    return out;
}

/** Every client accepts the found match; resolves with each one's pick view. */
async function acceptAll(cs: TestClient[]): Promise<Record<string, any>[]> {
    const found = await Promise.all(cs.map(c => c.until(() => c.last('mm.found'))));
    cs.forEach((c, i) => c.send({ t: 'mm.accept', match: found[i].match, yes: true }));
    return Promise.all(cs.map(c => c.until(() => (c.last('party')?.phase === 'pick' ? c.last('party') : null))));
}

/** Each client locks a free hero of its own team's species, then loads; resolves with each `match` frame. */
async function pickAndLoad(cs: TestClient[], views: Record<string, any>[]): Promise<Record<string, any>[]> {
    const used: Record<string, number> = {};
    cs.forEach((c, i) => {
        const v = views[i];
        const key = `${v.mm.team}`;
        const k = used[key] ?? 0;
        used[key] = k + 1;
        c.send({ t: 'pick.lock', hero: heroesOf(v.mm.side)[k], trick: TRICK });
    });
    await cs[0].until(() => (cs[0].last('party')?.phase === 'loading' ? true : null), 15_000);
    cs.forEach(c => c.send({ t: 'loaded' }));
    const matches = await Promise.all(cs.map(c => c.until(() => c.last('match'), 15_000)));
    cs.forEach(c => c.send({ t: 'loaded' }));
    return matches;
}

describe('casual PvP relay (M1b)', () => {
    jest.setTimeout(180_000);

    it('six PROTO 3 solos: Accept, a hidden-team pick, a PvP room with humans 0..5 and team-only pings', async () => {
        const b = await bootMm();
        try {
            const cs = await vets(b, 6);
            cs.forEach(c => c.send({ t: 'mm.join', queue: 'casual', side: 'any' }));
            const found = await Promise.all(cs.map(c => c.until(() => c.last('mm.found'))));
            for (const f of found) {
                expect(f).toMatchObject({ mode: 'casual', humans: 3, bots: 0, acceptByMs: 10_000 });
                expect(f.teams).toEqual([
                    [3, 0],
                    [3, 0],
                ]);
            }
            // no party before every Accept
            await nextTick();
            expect(cs[0].last('party')).toBeUndefined();
            const views = await acceptAll(cs);
            expect(cs[0].json.some(j => j.t === 'mm.accepted')).toBe(true);
            const teams = views.map(v => v.mm.team);
            expect(teams.filter(t => t === 0)).toHaveLength(3);
            for (const v of views) {
                expect(v.code).toBe('');
                expect(v.mm.mode).toBe('casual');
                expect(v.mm.species[v.mm.team]).toBe(v.mm.side);
                expect(v.mm.species[0]).not.toBe(v.mm.species[1]);
                const me = v.members.find((m: any) => m.id === v.you);
                expect(me.slot >= 3 ? 1 : 0).toBe(v.mm.team);
            }
            // a team-0 lock is hidden from team 1 during the pick
            const t0 = cs[teams.indexOf(0)];
            const t1 = cs[teams.indexOf(1)];
            const v0 = views[teams.indexOf(0)];
            t0.send({ t: 'pick.lock', hero: heroesOf(v0.mm.side)[0], trick: TRICK });
            await t0.until(() => (t0.last('party')?.members.find((m: any) => m.id === v0.you)?.locked ? true : null));
            await nextTick();
            const seen = t1.last('party')!.members.find((m: any) => m.id === v0.you);
            expect(seen.hero).toBeUndefined();
            expect(seen.locked).toBe(false);
            // the rest pick (team 0's first player already locked its first hero)
            const rest = cs.filter(c => c !== t0);
            const restViews = views.filter((_, i) => cs[i] !== t0);
            const used: Record<number, number> = { 0: 1, 1: 0 };
            rest.forEach((c, i) => {
                const v = restViews[i];
                c.send({ t: 'pick.lock', hero: heroesOf(v.mm.side)[used[v.mm.team]++], trick: TRICK });
            });
            await cs[0].until(() => (cs[0].last('party')?.phase === 'loading' ? true : null), 15_000);
            cs.forEach(c => c.send({ t: 'loaded' }));
            const matches = await Promise.all(cs.map(c => c.until(() => c.last('match'), 15_000)));
            for (const m of matches) {
                expect(m.mode).toBe('casual');
                expect(m.config.mode).toBe('pvp');
                expect(m.config.difficulty).toBe('hard');
                expect(m.config.humans).toEqual([0, 1, 2, 3, 4, 5]);
                expect(m.config.fillDifficulty).toHaveLength(2);
                expect(m.species).toEqual(views[0].mm.species);
            }
            expect(new Set(matches.map(m => m.you.slot))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
            const rec = [...b.mmRooms.rooms.values()].find(r => !r._id.startsWith('vetroom'))!;
            expect(rec).toMatchObject({ queue: 'casual', mode: 'casual', fill: [] });
            expect(rec.teams!.map(t => t.slots)).toEqual([
                [0, 1, 2],
                [3, 4, 5],
            ]);
            // a quick-chat line reaches the own team only; an emote reaches everyone
            const slot = (c: TestClient) => c.last('match')!.you.slot as number;
            const a0 = cs.find(c => slot(c) === 0)!;
            await new Promise(r => setTimeout(r, 300));
            a0.send({ t: 'social', kind: 'chat', id: 1 });
            await a0.until(() => a0.last('social'));
            await nextTick();
            for (const c of cs) expect(!!c.last('social')).toBe(slot(c) < 3);
            await new Promise(r => setTimeout(r, 2100));
            a0.send({ t: 'social', kind: 'emote', id: 0 });
            await nextTick();
            for (const c of cs) expect(c.json.filter(j => j.t === 'social' && j.kind === 'emote')).toHaveLength(1);
        } finally {
            await b.stop();
        }
    });

    it('a decline is a dodge: the decliner is out, the other is back at the front of the queue', async () => {
        const b = await bootMm();
        try {
            const [a, c] = await vets(b, 2);
            a.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            c.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            await a.until(() => a.last('mm.status'));
            await nextTick();
            expect(a.last('mm.found')).toBeUndefined();
            b.skew.ms += 31_000;
            const fa = await a.until(() => a.last('mm.found'));
            expect(fa.teams).toEqual([
                [1, 2],
                [1, 2],
            ]);
            c.send({ t: 'mm.accept', match: fa.match, yes: false });
            expect((await c.until(() => c.last('mm.cancel'))).reason).toBe('declined');
            const back = await a.until(() => a.json.find(j => j.t === 'mm.status' && j.requeued === true) ?? null);
            expect(back.queue).toBe('casual');
            expect(back.waitedMs).toBeGreaterThanOrEqual(30_000);
            expect(b.relay.counters()).toMatchObject({ mm_casual_dodges: 1 });
        } finally {
            await b.stop();
        }
    });

    it('casual needs PROTO 3 and 5 matches; PROTO 2 gets pvp_update_required, a newbie mm_locked{pvp_newbie}', async () => {
        const b = await bootMm();
        try {
            const old = await b.veteran({ proto: 2, ...VET });
            old.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            // PROTO 2 never receives the PROTO 3 error code: nothing comes back, and nothing is queued
            await nextTick();
            expect(old.last('error')).toBeUndefined();
            expect((b.relay.counters() as Record<string, number>).mm_queued).toBe(0);
            const fresh = await b.guest({ hint: { maxDifficulty: 'easy', newbie: false, matches: 2 } });
            fresh.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            expect(await fresh.until(() => fresh.last('error'))).toMatchObject({
                code: 'mm_locked',
                reason: 'pvp_newbie',
            });
            // the hint is never trusted: 12 claimed matches with no server record (a fresh guest key) stay locked
            const liar = await b.guest(VET);
            liar.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            expect(await liar.until(() => liar.last('error'))).toMatchObject({
                code: 'mm_locked',
                reason: 'pvp_newbie',
            });
            // four completed rooms are not five
            const four = await b.veteran(VET, 4);
            four.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            expect(await four.until(() => four.last('error'))).toMatchObject({
                code: 'mm_locked',
                reason: 'pvp_newbie',
            });
            // an IP-only identity (no ticket, no guest key) has no record and never queues PvP
            const anon = await b.client();
            anon.hello({ ...VET });
            await anon.until(() => anon.last('welcome'));
            anon.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            expect(await anon.until(() => anon.last('error'))).toMatchObject({
                code: 'mm_locked',
                reason: 'pvp_newbie',
            });
            expect((b.relay.counters() as Record<string, number>).mm_queued).toBe(0);
            const late = await b.veteran(VET);
            late.send({ t: 'mm.accept', match: 'abcdefghijkl', yes: true });
            await nextTick();
            expect(late.last('error')).toBeUndefined();
        } finally {
            await b.stop();
        }
    });

    it('1v1 with bots: a team-1 surrender (from 4:00) ends the match for team 0; votes stay inside the team', async () => {
        const b = await bootMm();
        try {
            const cs = await vets(b, 2);
            cs.forEach(c => c.send({ t: 'mm.join', queue: 'casual', side: 'any' }));
            await cs[0].until(() => cs[0].last('mm.status'));
            b.skew.ms += 31_000;
            const views = await acceptAll(cs);
            const matches = await pickAndLoad(cs, views);
            const slots = matches.map(m => m.you.slot).sort();
            expect(slots).toEqual([0, 3]);
            for (const m of matches) expect(m.config.humans).toEqual([0, 3]);
            const t0 = cs[matches.findIndex(m => m.you.slot === 0)];
            const t1 = cs[matches.findIndex(m => m.you.slot === 3)];
            // jump the clock past 4:00: the room closes every overdue turn
            b.skew.ms += 4 * 60_000 + 15_000;
            await t1.until(() => (t1.turns.length && t1.turns[t1.turns.length - 1].turn >= 3650 ? true : null), 60_000);
            t1.send({ t: 'vote', kind: 'surrender', yes: true });
            const pass = await t1.until(() => t1.json.find(j => j.t === 'vote' && j.result === 'pass') ?? null);
            expect(pass).toMatchObject({ kind: 'surrender', team: 1 });
            // the other team never sees team 1's vote
            expect(t0.json.some(j => j.t === 'vote')).toBe(false);
            const end = await t0.until(() => t0.last('end'), 120_000);
            expect(end.winner).toBe(0);
            expect(end.outcome).toBe('won');
            const room = await b.store.get(t0.last('match')!.room);
            expect(room!.config.mode).toBe('pvp');
            expect(room!.verdict).toMatchObject({ winner: 0, reason: 'forfeit', verified: true });
        } finally {
            await b.stop();
        }
    });
});
