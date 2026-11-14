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
        m.ratings.docs.push(ranked('A', 7, 40), ranked('B', 12, 300, 20), ranked('C', 12, 10), ranked('X', 12, 900));
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
            clock
        );
        return { svc, week };
    }

    it('weekly: by wins, then fewer games; sanctioned rows hidden; my rank', async () => {
        const { svc } = harness();
        const b = await svc.board('weekly', {}, 'A');
        expect(b.rows.map(r => r.value)).toEqual([9, 5, 5]);
        expect(b.me).toEqual({ rank: 4, value: 5 });
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
        expect(b.rows.map(r => r.tier)).toEqual(['Legend · 10 pts', 'Alley II']);
        expect(b.me).toEqual({ rank: expect.any(Number), value: 40 });
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

    it('ranked/me: eligibility from saved matches, the status (always open since round 4) passes through', async () => {
        const { svc } = harness();
        expect(await svc.me('B', false)).toMatchObject({
            eligible: false,
            why: 'matches',
            matches: { have: 3, need: 10 },
        });
        const a = await svc.me('A', false);
        expect(a).toMatchObject({
            eligible: true,
            ranked: { label: 'Alley II', points: 40 },
            status: { open: true, online: 3 },
        });
        expect(await svc.me('G', true)).toMatchObject({ eligible: false, why: 'sign_in' });
    });
});
