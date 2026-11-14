import { bootMm, heroesOf, nextTick, TRICK } from './mm-relay.helper-spec';
import { CURRENT_SEASON_ID } from '../pawlegends-catalog';
import type { RankedJoinSource, RankedRefusal } from './mm-bridge';
import type { TestClient } from '../party/relay-test-client.helper-spec';

/*
 * Ranked over real sockets (SOCIAL-RANKED.md §7.1, §7.6, §7.11): always open since round 4. `mm.join {queue:'ranked'}`
 * is refused for a guest, below the saved matches and with an unsaved ranked match; six registered accounts get a
 * ranked Accept card (no bots) and a ranked room record of the season; a quiet queue fills with labelled bots or plays
 * vs AI, but only for a game that sent `bots: true`.
 */

const VET = { hint: { maxDifficulty: 'normal', newbie: false, matches: 12 } };

function source(over: Partial<RankedJoinSource> & { why?: RankedRefusal | null } = {}): RankedJoinSource {
    return {
        check: async () => over.why ?? null,
        ...(over.allowGuests ? { allowGuests: true } : {}),
    };
}

async function accounts(b: Awaited<ReturnType<typeof bootMm>>, n: number, prefix = 'acct'): Promise<TestClient[]> {
    const out: TestClient[] = [];
    for (let i = 0; i < n; i++) {
        // each player on its own network: ranked never puts one /24 on opposite teams
        const c = await b.client({ 'x-test-ip': `10.${40 + nets++}.0.1` });
        c.hello({ ticket: b.tickets.issue({ accountId: `${prefix}-${i}`, guest: false }).ticket, ...VET });
        await c.until(() => c.last('welcome'));
        out.push(c);
    }
    return out;
}

let nets = 0;
const join = (c: TestClient) => c.send({ t: 'mm.join', queue: 'ranked', side: 'any' });
/** A game that labels bots (§7.11). */
const joinBots = (c: TestClient) => c.send({ t: 'mm.join', queue: 'ranked', side: 'any', bots: true });

describe('ranked relay (gap plan P4, round 4 low population)', () => {
    jest.setTimeout(120_000);

    it('without a ranked source (no account checks wired) ranked is closed', async () => {
        const b = await bootMm();
        try {
            const [a] = await accounts(b, 1);
            join(a);
            expect(await a.until(() => a.last('error'))).toMatchObject({ code: 'mm_ranked_closed' });
        } finally {
            await b.stop();
        }
    });

    it('guests are refused (ranked is for registered accounts)', async () => {
        const b = await bootMm({ ranked: source() });
        try {
            const g = await b.veteran(VET);
            join(g);
            expect(await g.until(() => g.last('error'))).toMatchObject({ code: 'mm_need_account' });
            const t = await b.client();
            t.hello({ ticket: b.tickets.issue({ accountId: 'acct-guest', guest: true }).ticket, ...VET });
            await t.until(() => t.last('welcome'));
            join(t);
            expect(await t.until(() => t.last('error'))).toMatchObject({ code: 'mm_need_account' });
        } finally {
            await b.stop();
        }
    });

    it('the account checks answer with their own codes: saved matches, then an unsaved ranked match', async () => {
        const few = await bootMm({ ranked: source({ why: { code: 'mm_ranked_matches', have: 4, need: 10 } }) });
        try {
            const [a] = await accounts(few, 1);
            join(a);
            expect(await a.until(() => a.last('error'))).toMatchObject({
                code: 'mm_ranked_matches',
                have: 4,
                need: 10,
            });
        } finally {
            await few.stop();
        }
        const pend = await bootMm({ ranked: source({ why: { code: 'mm_ranked_pending', rooms: ['room-x'] } }) });
        try {
            const [a] = await accounts(pend, 1);
            join(a);
            expect(await a.until(() => a.last('error'))).toMatchObject({
                code: 'mm_ranked_pending',
                rooms: ['room-x'],
            });
        } finally {
            await pend.stop();
        }
    });

    it('open: six accounts get a ranked Accept card with no bots, and the room record is ranked for the season', async () => {
        const b = await bootMm({ ranked: source() });
        try {
            const cs = await accounts(b, 6);
            cs.forEach(join);
            const found = await Promise.all(cs.map(c => c.until(() => c.last('mm.found'))));
            for (const f of found) {
                expect(f).toMatchObject({ mode: 'casual', queue: 'ranked', humans: 3, bots: 0 });
                expect(f.teams).toEqual([
                    [3, 0],
                    [3, 0],
                ]);
            }
            cs.forEach((c, i) => c.send({ t: 'mm.accept', match: found[i].match, yes: true }));
            const views = await Promise.all(
                cs.map(c => c.until(() => (c.last('party')?.phase === 'pick' ? c.last('party') : null)))
            );
            expect(views.every(v => v.mm.mode === 'casual')).toBe(true);
            // pick and load: the room starts, and its record is a ranked room of the season (no fill seat)
            const used: Record<string, number> = {};
            cs.forEach((c, i) => {
                const v = views[i];
                const k = used[v.mm.team] ?? 0;
                used[v.mm.team] = k + 1;
                c.send({ t: 'pick.lock', hero: heroesOf(v.mm.side)[k], trick: TRICK });
            });
            await cs[0].until(() => (cs[0].last('party')?.phase === 'loading' ? true : null), 15_000);
            cs.forEach(c => c.send({ t: 'loaded' }));
            await Promise.all(cs.map(c => c.until(() => c.last('match'), 15_000)));
            const rec = await cs[0].until(() => [...b.mmRooms.rooms.values()][0] ?? null);
            expect(rec).toMatchObject({ queue: 'ranked', season: CURRENT_SEASON_ID, mode: 'casual', fill: [] });
            expect(rec.map).toBeUndefined();
        } finally {
            await b.stop();
        }
    });

    it('a lone account with bots: the card counts it searching, then it plays vs AI (a ranked room of the season)', async () => {
        const b = await bootMm({ ranked: source() });
        try {
            const [a] = await accounts(b, 1);
            joinBots(a);
            expect(await a.until(() => a.last('mm.status'))).toMatchObject({ queue: 'ranked', searching: 1 });
            b.skew.ms += 10 * 60_000;
            const f = await a.until(() => a.last('mm.found'));
            expect(f).toMatchObject({ queue: 'ranked', ai: true, humans: 1, bots: 2 });
            expect(f.mode).toBeUndefined();
            expect(['normal', 'hard']).toContain(f.difficulty);
            const view = await a.until(() => (a.last('party')?.phase === 'pick' ? a.last('party') : null));
            a.send({ t: 'pick.lock', hero: heroesOf(view.mm.side)[0], trick: TRICK });
            await a.until(() => (a.last('party')?.phase === 'loading' ? true : null), 15_000);
            a.send({ t: 'loaded' });
            await a.until(() => a.last('match'), 15_000);
            const rec = await a.until(() => [...b.mmRooms.rooms.values()][0] ?? null);
            expect(rec).toMatchObject({ queue: 'ranked', season: CURRENT_SEASON_ID, vsAi: true });
            expect(rec.teams).toBeUndefined();
        } finally {
            await b.stop();
        }
    });

    it('two accounts with bots: after the fill a fair 1v1 with labelled bots on both teams (Accept card counts them)', async () => {
        const b = await bootMm({ ranked: source() });
        try {
            const cs = await accounts(b, 2);
            cs.forEach(joinBots);
            await cs[0].until(() => cs[0].last('mm.status'));
            b.skew.ms += 80_000;
            const found = await Promise.all(cs.map(c => c.until(() => c.last('mm.found'))));
            for (const f of found) {
                expect(f).toMatchObject({ mode: 'casual', queue: 'ranked', humans: 1, bots: 2 });
                expect(f.teams).toEqual([
                    [1, 2],
                    [1, 2],
                ]);
            }
        } finally {
            await b.stop();
        }
    });

    it('five accounts of a game that does not label bots never get a match: no bot, even after ten minutes', async () => {
        const b = await bootMm({ ranked: source() });
        try {
            const cs = await accounts(b, 5);
            cs.forEach(join);
            await cs[0].until(() => cs[0].last('mm.status'));
            b.skew.ms += 10 * 60_000;
            await nextTick();
            await nextTick();
            for (const c of cs) {
                expect(c.last('mm.found')).toBeUndefined();
                expect(c.last('mm.status')).toMatchObject({ queue: 'ranked' });
            }
        } finally {
            await b.stop();
        }
    });

    it('a trio party is refused: ranked is solo or duo', async () => {
        const b = await bootMm({ ranked: source() });
        try {
            const [lead, m1, m2] = await accounts(b, 3, 'trio');
            lead.send({ t: 'party.create', difficulty: 'normal' });
            const view = await lead.until(() => lead.last('party'));
            for (const m of [m1, m2]) {
                m.send({ t: 'party.join', code: view.code });
                await m.until(() => m.last('party'));
            }
            await lead.until(() => (lead.last('party')?.members.length === 3 ? true : null));
            join(lead);
            expect(await lead.until(() => lead.last('error'))).toMatchObject({
                code: 'party_full',
                reason: 'ranked_party',
            });
        } finally {
            await b.stop();
        }
    });
});
