import { SocialMemoryModel, TestClock } from '../social/social-model.helper-spec';
import { isoWeek } from './boards';
import { RankedService } from './ranked.service';
import { RankedStatusService } from './status';

describe('ranked live numbers (SOCIAL-RANKED.md §7.9, §7.11)', () => {
    it('the service counts ranked-eligible presence rows that have not expired', async () => {
        const clock = new TestClock();
        const presence = new SocialMemoryModel(
            [
                ...Array.from({ length: 24 }, (_, i) => ({ _id: `p${i}`, rk: 1, exp: new Date(clock.ms + 60_000) })),
                { _id: 'x', rk: 0, exp: new Date(clock.ms + 60_000) },
                { _id: 'y', rk: 1, exp: new Date(clock.ms - 1) },
            ],
            [],
            clock.now
        );
        const status = new SocialMemoryModel([], [{ fields: ['_id'] }], clock.now);
        const svc = new RankedStatusService(status, presence, clock);
        expect(await svc.refresh()).toMatchObject({ open: true, online: 24, searching: 0 });
        expect(status.docs[0]).toMatchObject({ _id: 'ranked', open: true, online: 24 });
    });

    it('always open with a few players: counts only accounts searching ranked (round 4, no gate)', async () => {
        const clock = new TestClock();
        const exp = new Date(clock.ms + 60_000);
        const presence = new SocialMemoryModel(
            [
                { _id: 'a', rk: 1, exp, relay: { state: 'queue', q: 'ranked', at: clock.now() } },
                { _id: 'b', rk: 1, exp, relay: { state: 'queue', at: clock.now() } },
                { _id: 'c', rk: 1, exp, relay: { state: 'match', at: clock.now() } },
                {
                    _id: 'd',
                    rk: 1,
                    exp: new Date(clock.ms - 1),
                    relay: { state: 'queue', q: 'ranked', at: clock.now() },
                },
            ],
            [],
            clock.now
        );
        const status = new SocialMemoryModel([], [{ fields: ['_id'] }], clock.now);
        const svc = new RankedStatusService(status, presence, clock);
        expect(await svc.refresh()).toMatchObject({ open: true, online: 3, searching: 1 });
        expect(await svc.read()).toMatchObject({ open: true, online: 3, searching: 1 });
    });
});

describe('board reads (SOCIAL-RANKED.md §6.3)', () => {
    function harness() {
        const clock = new TestClock();
        const week = isoWeek(clock.now());
        const m = {
            ratings: new SocialMemoryModel([], [], clock.now),
            boards: new SocialMemoryModel(
                [
                    { _id: `w:${week}:A`, kind: 'w', period: week, acc: 'A', wins: 5, games: 9 },
                    { _id: `w:${week}:B`, kind: 'w', period: week, acc: 'B', wins: 5, games: 7 },
                    { _id: `w:${week}:C`, kind: 'w', period: week, acc: 'C', wins: 9, games: 9 },
                    { _id: `w:${week}:X`, kind: 'w', period: week, acc: 'X', wins: 20, games: 20 },
                    { _id: 'h:s1:clem:A', kind: 'h', period: 's1', hero: 'clem', acc: 'A', wins: 6, games: 12 },
                    { _id: 'h:s1:clem:B', kind: 'h', period: 's1', hero: 'clem', acc: 'B', wins: 9, games: 9 },
                ],
                [],
                clock.now
            ),
            friends: new SocialMemoryModel([{ _id: 'A:B', a: 'A', b: 'B', state: 'accepted' }], [], clock.now),
            sanctions: new SocialMemoryModel([{ accountId: 'X', kind: 'board_exclude', until: null }], [], clock.now),
            social: new SocialMemoryModel([], [], clock.now),
            rooms: new SocialMemoryModel([], [], clock.now),
            // FLAGS.md: A and C show LT, B shows LV, X (sanctioned) shows LT, H hid an LT flag
            flags: new SocialMemoryModel(
                [
                    { _id: 'A', cc: 'LT', off: false, at: clock.now() },
                    { _id: 'B', cc: 'LV', off: false, at: clock.now() },
                    { _id: 'C', cc: 'LT', off: false, at: clock.now() },
                    { _id: 'X', cc: 'LT', off: false, at: clock.now() },
                    { _id: 'H', cc: 'LT', off: true, at: clock.now() },
                ],
                [],
                clock.now
            ),
            users: new SocialMemoryModel(
                [
                    { _id: 'A', pawlegendsMatches: { hard: 12 } },
                    { _id: 'B', pawlegendsMatches: { hard: 3 } },
                ],
                [],
                clock.now
            ),
        };
        const ranked = (acc: string, tierIdx: number, points: number, lastDaysAgo = 1) => ({
            _id: `${acc}:ranked`,
            accountId: acc,
            queue: 'ranked',
            season: 's1',
            tierIdx,
            points,
            placementsLeft: 0,
            ladder: tierIdx >= 12 ? 1200 + points : tierIdx * 100 + points,
            lastRankedAt: new Date(clock.ms - lastDaysAgo * 86_400_000),
            r: 1500,
            rd: 100,
            sigma: 0.06,
            appliedRooms: [],
            peakIdx: tierIdx,
            shield: 1,
        });
        // A played Ranked (12 games) below Lv 10 and keeps it; B's row has no games, so B waits for Lv 10
        m.ratings.docs.push(
            { ...ranked('A', 7, 40), games: 12 },
            ranked('B', 12, 300, 20),
            ranked('C', 12, 10),
            ranked('X', 12, 900),
            ranked('H', 12, 500)
        );
        const gate = { read: async () => ({ open: false, online: 3, need: 24, since: null, lowSince: null }) } as any;
        const svc = new RankedService(
            m.ratings,
            m.boards,
            m.friends,
            m.sanctions,
            m.social,
            m.rooms,
            m.users,
            gate,
            null,
            clock,
            undefined,
            m.flags
        );
        return { svc, week, m };
    }

    it('weekly: by wins, then fewer games; sanctioned rows hidden; my rank', async () => {
        const { svc } = harness();
        const b = await svc.board('weekly', {}, 'A');
        expect(b.rows.map(r => r.value)).toEqual([9, 5, 5]);
        expect(b.me).toMatchObject({ rank: 4, value: 5, cc: 'LT' });
        expect(JSON.stringify(b)).not.toMatch(/"(A|B|C|X)"/);
    });

    it('hero: at least 10 games, with the win rate', async () => {
        const { svc } = harness();
        const b = await svc.board('hero', { hero: 'clem' }, null);
        expect(b.rows).toEqual([expect.objectContaining({ rank: 1, value: 6, hero: 'clem', winRate: 50 })]);
    });

    it('global: placed ranked rows; inactive Legends and sanctioned players hidden', async () => {
        const { svc } = harness();
        const b = await svc.board('global', {}, 'A');
        // H hid the flag: still on Global, with no flag
        expect(b.rows.map(r => [r.tier, r.cc ?? null])).toEqual([
            ['Legend · 500 pts', null],
            ['Legend · 10 pts', 'LT'],
            ['Alley II', 'LT'],
        ]);
        expect(b.me).toMatchObject({ rank: expect.any(Number), value: 40, tier: 'Alley II', cc: 'LT' });
    });

    it("weekly and global: the caller's own row on the page is marked me (no second pinned row needed)", async () => {
        const { svc } = harness();
        const w = await svc.board('weekly', {}, 'C');
        expect(w.rows.map(r => [r.value, r.me ?? false])).toEqual([
            [9, true],
            [5, false],
            [5, false],
        ]);
        // `me.rank` still counts the sanctioned X above C (an existing quirk of countMe); the marked row is what
        // the game uses to skip its pinned row
        expect(w.me).toMatchObject({ value: 9 });
        // the public (cached) page never carries a me mark or an account id
        const pub = await svc.board('weekly', {}, null);
        expect(pub.rows.some(r => r.me)).toBe(false);
        expect(JSON.stringify(pub)).not.toMatch(/"(A|B|C|X)"/);
    });

    it('local: needs a caller; the season ladder kept to players showing my flag; hidden, sanctioned and other countries off', async () => {
        const { svc } = harness();
        await expect(svc.board('local', {}, null)).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_NEED_ACCOUNT' },
        });
        const b = await svc.board('local', {}, 'A');
        // LT: C (Legend 10) and A (Alley II); not B (LV), not X (sanctioned), not H (hid the flag)
        expect(b.rows.map(r => [r.tier, r.cc, r.me ?? false])).toEqual([
            ['Legend · 10 pts', 'LT', false],
            ['Alley II', 'LT', true],
        ]);
        expect(b.local).toEqual({ cc: 'LT', hidden: false });
        expect(b.me).toMatchObject({ rank: 2, value: 40, tier: 'Alley II', cc: 'LT' });
        expect(b.period).toBe('s1');
        // B (LV) is an inactive Legend: off the ladder until the next match, so an empty LV board
        const lv = await svc.board('local', {}, 'B');
        expect(lv).toMatchObject({ rows: [], me: null, local: { cc: 'LV', hidden: false } });
    });

    it("local: a caller who hid the flag (or has no country) gets no board, only why; never on anyone's board", async () => {
        const { svc } = harness();
        const h = await svc.board('local', {}, 'H');
        expect(h).toMatchObject({ rows: [], me: null, local: { cc: 'LT', hidden: true } });
        const n = await svc.board('local', {}, 'N');
        expect(n).toMatchObject({ rows: [], me: null, local: { cc: null, hidden: false } });
        const a = await svc.board('local', {}, 'A');
        expect(JSON.stringify(a)).not.toMatch(/500 pts/);
    });

    it('local: scans the ladder in steps on its index and stops at the top 100', async () => {
        const { svc, m } = harness();
        // 1,300 placed LV players above everyone: the LT board still finds A and C past them
        for (let i = 0; i < 1300; i++) {
            m.ratings.docs.push({
                _id: `v${i}:ranked`,
                accountId: `v${i}`,
                queue: 'ranked',
                season: 's1',
                tierIdx: 11,
                points: 50,
                placementsLeft: 0,
                ladder: 1150,
                lastRankedAt: new Date(),
            });
            m.flags.docs.push({ _id: `v${i}`, cc: 'LV', off: false, at: new Date() });
        }
        const lt = await svc.board('local', {}, 'A');
        expect(lt.rows.map(r => r.cc)).toEqual(['LT', 'LT']);
        const lv = await svc.board('local', { page: 12 }, 'B');
        expect(lv.pages).toBe(13); // top 100 = 13 pages of 8
        expect(lv.me).toBeNull(); // B is past the LV top 100
    });

    it('friends: needs a caller; the caller and friends by ladder', async () => {
        const { svc } = harness();
        await expect(svc.board('friends', {}, null)).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_NEED_ACCOUNT' },
        });
        const b = await svc.board('friends', {}, 'A');
        expect(b.rows.map(r => [r.tier, r.me ?? false])).toEqual([
            ['Legend · 180 pts', false],
            ['Alley II', true],
        ]);
    });

    it('ranked/me: eligibility from saved matches (Lv 10 = 25) or ranked games played, the status (always open since round 4) passes through', async () => {
        const { svc } = harness();
        expect(await svc.me('B', false)).toMatchObject({
            eligible: false,
            why: 'matches',
            matches: { have: 3, need: 25 },
        });
        const a = await svc.me('A', false);
        expect(a).toMatchObject({
            eligible: true,
            ranked: { label: 'Alley II', points: 40 },
            status: { open: true, online: 3 },
        });
        expect(await svc.me('G', true)).toMatchObject({ eligible: false, why: 'sign_in' });
    });

    it("publicCard: another player's rank, peak and level matches; nothing private; unranked reads as none", async () => {
        const { svc } = harness();
        const a = await svc.publicCard('A');
        expect(a).toMatchObject({
            matches: 12,
            ranked: { placementsLeft: 0, tierIdx: 7, label: 'Alley II', points: 40, peak: expect.any(String) },
            av: { i: expect.stringMatching(/^h:/) },
        });
        expect(a.ranked.none).toBeUndefined();
        expect(JSON.stringify(a)).not.toMatch(/lock|pendingRooms|shield|pendingRewards|eligible/);
        const n = await svc.publicCard('N');
        expect(n).toMatchObject({ matches: 0, ranked: { none: true, placementsLeft: expect.any(Number) } });
        expect(n.ranked.tierIdx).toBeUndefined();
    });
});
