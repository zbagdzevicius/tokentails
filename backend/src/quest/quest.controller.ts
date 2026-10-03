import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { CatRepository } from 'src/cat/cat.repository';
import { CatService } from 'src/cat/cat.service';
import { pickSearchParams, SearchModel } from 'src/common/validators';
import { Quest } from 'src/quest/quest.schema';
import { IResponse, RESPONSES } from 'src/shared/constants/common';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { IMessage } from 'src/shared/interfaces/common.interface';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { QUEST, QuestTypeReward } from 'src/user/user.schema';
import { IController } from '../shared/interfaces/controller.interface';
import { QuestRepository } from './quest.repository';
import { REWARDS } from 'src/shared/constants/rewards';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { tailsRewardMessage } from 'src/shared-contracts/copy';
import { earnedTails, earnTailsInc } from 'src/user/tails-ledger';

/** Per-user limit on the quest and contest reward routes (plan G5 P4). */
export const QUEST_REWARD_USER_THROTTLE = { limit: 10, ttl: 60000 };

enum MYSTERY_BOX_TYPE {
    CAMP_6 = 'CAMP_6',
    CAMP_7 = 'CAMP_7',
    CAMP_8 = 'CAMP_8',
    CAMP_9 = 'CAMP_9',
    KEYBOARD_CAT = 'KEYBOARD_CAT',
}

const mysteryBoxMessage = () => tailsRewardMessage(REWARDS.MYSTERY_BOX, 'the mystery box');

@Controller('quest')
export class QuestController implements IController<Quest> {
    constructor(
        private repository: QuestRepository,
        private userRepository: UserRepository,
        private catRepository: CatRepository,
        private catService: CatService
    ) {}

    @Post('search')
    public async search(@Body() params: SearchModel): Promise<Quest[]> {
        return this.repository.find({
            ...pickSearchParams(params),
            projection: 'name link image tails',
            populate: [{ path: 'image', select: 'url' }],
            perPage: 100,
        });
    }

    @Get(':_id')
    public async findOne(@Param('_id') _id: string): Promise<Quest> {
        return this.repository.findOne({
            searchObject: { _id },
            projection: 'name link image tails',
            populate: [{ path: 'image', select: 'url' }],
        });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('')
    public async create(@Body() object: Quest): Promise<Quest> {
        return this.repository.create(object);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Put(':_id')
    public async update(@Param('_id') _id: string, @Body() object: Quest): Promise<Quest> {
        const existingEntity = await this.repository.findOne({
            searchObject: { _id },
        });

        if (!existingEntity) {
            throw new NotFoundException();
        }
        return this.repository.update(existingEntity._id!, object);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Delete(':slug')
    public async delete(@Param('slug') slug: string): Promise<IResponse> {
        const entity = await this.repository.findOne({ searchObject: { slug }, projection: '_id' });
        if (!entity) {
            throw new NotFoundException();
        }

        await this.repository.delete(entity._id);
        return RESPONSES.success;
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(QUEST_REWARD_USER_THROTTLE)
    @Get('complete/:quest')
    async Tquests(@USER_ID() userId: string, @Param('quest') quest: QUEST | string): Promise<IMessage> {
        const [user, quests] = await Promise.all([
            this.userRepository.findOne({
                searchObject: { _id: userId },
                projection: 'tails tailsEarned tailsGiven referrals quests',
            }),
            this.repository.find({ searchObject: {}, projection: '_id tails' }),
        ]);
        if (user.quests?.includes(quest)) {
            return { message: 'Quest is claimed', success: false };
        }
        const questReward = QuestTypeReward[quest as QUEST] || quests.find(q => q._id!.toString() === quest);
        if (!questReward) {
            return { message: `Such quest doesn't exist`, success: false };
        }
        // REACH_TAILS quests read lifetime earned Tails, so giving to a goal never undoes them (G5).
        if (questReward.requirements?.tails) {
            if (earnedTails(user) < questReward.requirements?.tails) {
                return { message: `Tails requirement is not met`, success: false };
            }
        }
        if (questReward.requirements?.referrals) {
            if (user.referrals.length < questReward.requirements?.referrals) {
                return { message: `Referrals requirement is not met`, success: false };
            }
        }

        const tails = questReward.tails || 0;
        const boxes = questReward.boxes || 0;
        if (!tails && !boxes && !questReward.cats?.length) {
            throw new BadRequestException('Quest is missing rewards');
        }

        // One conditional write claims the quest and pays it (4e review fix #1). The read above is
        // only for the requirement checks: parallel calls all pass it, and only the first one whose
        // `quests: {$ne}` filter still matches is paid. Cats are adopted after the claim succeeds.
        const claimed = await this.claimOnce(user._id!, quest, {
            ...(tails ? { ...earnTailsInc(tails), monthTails: tails } : {}),
            ...(boxes ? { boxes } : {}),
        });
        if (!claimed) {
            return { message: 'Quest is claimed', success: false };
        }

        for (const cat of questReward.cats || []) {
            await this.catService.adopt(cat, user._id!);
        }

        if (tails) {
            return {
                message: `${tailsRewardMessage(
                    tails
                )}! Make sure the task is fully done: each task is checked every 24 hours.`,
                success: true,
            };
        }
        if (!boxes) {
            return {
                message: `You just got new pets! Check them to see them.`,
                success: true,
            };
        }
        return {
            message: `You just got ${boxes} Loot Boxes! ${questReward.cats?.length ? 'And some pets!' : ''}`,
            success: true,
        };
    }

    /**
     * Pushes `quest` to the user's claimed list and applies `inc` in one write, only if the quest is
     * not already there. False when another request claimed it first.
     */
    private async claimOnce(userId: unknown, quest: string, inc: Record<string, number>): Promise<boolean> {
        const result = await this.userRepository.model.updateOne(
            { _id: userId, quests: { $ne: quest } },
            {
                $push: { quests: { $each: [quest], $position: 0 } },
                ...(Object.keys(inc).length ? { $inc: inc } : {}),
            }
        );
        return (result?.modifiedCount ?? 0) > 0;
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(QUEST_REWARD_USER_THROTTLE)
    @Get('contest/:contest')
    async contestRedeemal(
        @USER_ID() userId: string,
        @Param('contest') contest: string
    ): Promise<IMessage & { tails?: number }> {
        const user = await this.userRepository.findOne({ searchObject: { _id: userId } });
        if (!user) {
            return { message: 'User not found', success: false };
        }
        if (user.quests?.includes(contest)) {
            return { message: 'Contest is claimed', success: false };
        }
        if (contest === MYSTERY_BOX_TYPE.CAMP_6) {
            const titles = user?.codex?.reduce((acc, item) => acc + item, 0) || 0;
            if (titles < 1) {
                return { message: 'Earn a Tails Guard title first', success: false };
            }
            return this.payContest(userId, contest);
        } else if (contest === MYSTERY_BOX_TYPE.CAMP_7) {
            if (user.catnipCount < 120) {
                return { message: 'Collect 120 catnips', success: false };
            }
            return this.payContest(userId, contest);
        } else if (contest === MYSTERY_BOX_TYPE.CAMP_8) {
            if (user.streak < 20) {
                return { message: 'Check-in 20 times', success: false };
            }
            return this.payContest(userId, contest);
        } else if (contest === MYSTERY_BOX_TYPE.CAMP_9) {
            const titles = user?.codex?.reduce((acc, item) => acc + item, 0) || 0;
            if (titles < 2) {
                return { message: 'Earn 2 Tails Guard titles first', success: false };
            }
            return this.payContest(userId, contest);
        } else {
            return { message: 'Contest not found', success: false };
        }
    }

    /** Pays a contest box once, in the same write that records it (4e review fix #1). */
    private async payContest(userId: string, contest: string): Promise<IMessage & { tails?: number }> {
        const claimed = await this.claimOnce(userId, contest, {
            ...earnTailsInc(REWARDS.MYSTERY_BOX),
            monthTails: REWARDS.MYSTERY_BOX,
        });
        if (!claimed) {
            return { message: 'Contest is claimed', success: false };
        }
        return { message: mysteryBoxMessage(), success: true, tails: REWARDS.MYSTERY_BOX };
    }
}
