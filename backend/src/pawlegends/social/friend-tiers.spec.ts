import { CURRENT_SEASON_ID } from '../pawlegends-catalog';
import { SocialService } from './social.service';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

/** Home friends panel (Nov 20): `social.get` friend rows carry `rk`, the ranked tier index, only when placed this season. */
describe('pawlegends social: friends ranked tier badge', () => {
    const build = (ratings?: SocialMemoryModel) => {
        const clock = new TestClock();
        const m = () => new SocialMemoryModel([], [{ fields: ['_id'] }], clock.now);
        const u = undefined;
        return new SocialService(m(), m(), m(), m(), m(), m(), m(), m(), u, clock, u, u, u, u, u, ratings);
    };

    it('reads the placed current-season tier; placements, old seasons and coop rows give none', async () => {
        const clock = new TestClock();
        const ratings = new SocialMemoryModel(
            [
                {
                    _id: 'A:ranked',
                    accountId: 'A',
                    queue: 'ranked',
                    season: CURRENT_SEASON_ID,
                    tierIdx: 7,
                    placementsLeft: 0,
                },
                {
                    _id: 'B:ranked',
                    accountId: 'B',
                    queue: 'ranked',
                    season: CURRENT_SEASON_ID,
                    tierIdx: 4,
                    placementsLeft: 2,
                },
                { _id: 'C:ranked', accountId: 'C', queue: 'ranked', season: 's0', tierIdx: 9, placementsLeft: 0 },
                { _id: 'D:coop', accountId: 'D', queue: 'coop', r: 1500 },
                {
                    _id: 'E:ranked',
                    accountId: 'E',
                    queue: 'ranked',
                    season: CURRENT_SEASON_ID,
                    tierIdx: 12,
                    placementsLeft: 0,
                },
            ],
            [{ fields: ['_id'] }],
            clock.now
        );
        const tiers = await build(ratings).tiersOf(['A', 'B', 'C', 'D', 'E', 'F']);
        expect([...tiers.entries()].sort()).toEqual([
            ['A', 7],
            ['E', 12],
        ]);
    });

    it('no ratings model or no ids: an empty map, never a throw', async () => {
        expect((await build().tiersOf(['A'])).size).toBe(0);
        expect((await build(new SocialMemoryModel([], [], new TestClock().now)).tiersOf([])).size).toBe(0);
    });
});
