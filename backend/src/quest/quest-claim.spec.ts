import { Types } from 'mongoose';
import { REWARDS } from 'src/shared/constants/rewards';
import { QUEST, QuestTypeReward } from 'src/user/user.schema';
import { QuestController } from './quest.controller';

jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * 4e review fix #1: a quest or contest is claimed and paid in ONE conditional write
 * (`{_id, quests: {$ne: quest}}`), so parallel calls that all pass the read-side check pay once.
 * The fake model applies each `updateOne` atomically, like MongoDB does for a single document.
 */

type Doc = Record<string, any>;

function questController(user: Doc) {
    const adopt = jest.fn(async () => undefined);
    const updateOne = jest.fn(async (filter: Doc, update: Doc) => {
        if (String(filter._id) !== String(user._id)) return { matchedCount: 0, modifiedCount: 0 };
        if (filter.quests?.$ne !== undefined && (user.quests || []).includes(filter.quests.$ne)) {
            return { matchedCount: 0, modifiedCount: 0 };
        }
        for (const [key, value] of Object.entries(update.$inc || {})) {
            user[key] = (Number(user[key]) || 0) + Number(value);
        }
        for (const [key, value] of Object.entries(update.$push || {}) as Array<[string, any]>) {
            user[key] = [...value.$each, ...(user[key] || [])];
        }
        return { matchedCount: 1, modifiedCount: 1 };
    });
    const controller = Object.create(QuestController.prototype);
    controller.repository = { find: jest.fn(async () => []) };
    controller.catService = { adopt };
    controller.userRepository = {
        // Every caller reads the same pre-claim snapshot, as parallel requests would.
        findOne: jest.fn(async () => ({ ...user, quests: [...(user.quests || [])] })),
        update: jest.fn(async () => {
            throw new Error('claims must use the conditional updateOne');
        }),
        model: { updateOne },
    };
    return { controller: controller as QuestController, adopt, updateOne };
}

const newUser = (extra: Doc = {}): Doc => ({
    _id: new Types.ObjectId(),
    tails: 0,
    tailsEarned: 0,
    monthTails: 0,
    boxes: 0,
    referrals: [],
    quests: [],
    ...extra,
});

describe('quest and contest claims pay once under parallel calls (4e review fix #1)', () => {
    it('10 parallel PIXEL_RESCUE_LEVEL claims pay 10,000 Tails once', async () => {
        const user = newUser();
        const { controller, updateOne } = questController(user);
        const reward = QuestTypeReward[QUEST.PIXEL_RESCUE_LEVEL].tails!;

        const results = await Promise.all(
            Array.from({ length: 10 }, () => controller.Tquests(String(user._id), QUEST.PIXEL_RESCUE_LEVEL))
        );

        expect(results.filter(r => r.success)).toHaveLength(1);
        expect(results.filter(r => !r.success).every(r => r.message === 'Quest is claimed')).toBe(true);
        expect(user.tails).toBe(reward);
        expect(user.tailsEarned).toBe(reward);
        expect(user.monthTails).toBe(reward);
        expect(user.quests).toEqual([QUEST.PIXEL_RESCUE_LEVEL]);
        expect(updateOne).toHaveBeenCalledWith(
            { _id: user._id, quests: { $ne: QUEST.PIXEL_RESCUE_LEVEL } },
            expect.objectContaining({ $push: { quests: { $each: [QUEST.PIXEL_RESCUE_LEVEL], $position: 0 } } })
        );
    });

    it('REACH_TAILS_100k pays once and still checks lifetime earned Tails', async () => {
        const poor = newUser({ tails: 5, tailsEarned: 5 });
        const { controller: denied } = questController(poor);
        await expect(denied.Tquests(String(poor._id), QUEST.REACH_TAILS_100k)).resolves.toEqual({
            message: 'Tails requirement is not met',
            success: false,
        });

        const user = newUser({ tails: 1000, tailsEarned: 100000 });
        const { controller } = questController(user);
        const results = await Promise.all(
            Array.from({ length: 10 }, () => controller.Tquests(String(user._id), QUEST.REACH_TAILS_100k))
        );
        expect(results.filter(r => r.success)).toHaveLength(1);
        expect(user.tailsEarned).toBe(100000 + QuestTypeReward[QUEST.REACH_TAILS_100k].tails!);
    });

    it('a box quest records the claim in the same write as the boxes; cats are adopted once', async () => {
        const user = newUser();
        const { controller, adopt, updateOne } = questController(user);
        const quest = QUEST.CATNIP_CHAOS_6;

        const results = await Promise.all(Array.from({ length: 5 }, () => controller.Tquests(String(user._id), quest)));

        expect(results.filter(r => r.success)).toHaveLength(1);
        expect(user.boxes).toBe(1);
        expect(user.tails).toBe(0);
        expect(user.quests).toEqual([quest]);
        expect(adopt).toHaveBeenCalledTimes(QuestTypeReward[quest].cats!.length);
        expect(updateOne).toHaveBeenCalledWith(
            { _id: user._id, quests: { $ne: quest } },
            { $push: { quests: { $each: [quest], $position: 0 } }, $inc: { boxes: 1 } }
        );
    });

    it('a contest box pays once under parallel calls', async () => {
        const user = newUser({ streak: 25 });
        const { controller } = questController(user);

        const results = await Promise.all(
            Array.from({ length: 10 }, () => controller.contestRedeemal(String(user._id), 'CAMP_8'))
        );

        expect(results.filter(r => r.success)).toHaveLength(1);
        expect(results.filter(r => !r.success).every(r => r.message === 'Contest is claimed')).toBe(true);
        expect(user.tails).toBe(REWARDS.MYSTERY_BOX);
        expect(user.tailsEarned).toBe(REWARDS.MYSTERY_BOX);
        expect(user.quests).toEqual(['CAMP_8']);
    });

    it('a claimed quest or contest is refused without a write', async () => {
        const user = newUser({ quests: [QUEST.FOLLOW_X, 'CAMP_8'], streak: 25 });
        const { controller, updateOne } = questController(user);

        await expect(controller.Tquests(String(user._id), QUEST.FOLLOW_X)).resolves.toEqual({
            message: 'Quest is claimed',
            success: false,
        });
        await expect(controller.contestRedeemal(String(user._id), 'CAMP_8')).resolves.toEqual({
            message: 'Contest is claimed',
            success: false,
        });
        expect(updateOne).not.toHaveBeenCalled();
    });
});
