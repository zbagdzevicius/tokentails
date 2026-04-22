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
import { AuthGuard } from '@nestjs/passport';
import { CatRepository } from 'src/cat/cat.repository';
import { CatService } from 'src/cat/cat.service';
import { SearchModel } from 'src/common/validators';
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

enum MYSTERY_BOX_TYPE {
    CAMP_6 = 'CAMP_6',
    CAMP_7 = 'CAMP_7',
    CAMP_8 = 'CAMP_8',
    CAMP_9 = 'CAMP_9',
    KEYBOARD_CAT = 'KEYBOARD_CAT',
}

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
            ...params,
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('')
    public async create(@Body() object: Quest): Promise<Quest> {
        return this.repository.create(object);
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Delete(':slug')
    public async delete(@Param('slug') slug: string): Promise<IResponse> {
        const entity = await this.repository.findOne({ searchObject: { slug }, projection: '_id' });
        if (!entity) {
            throw new NotFoundException();
        }

        await this.repository.delete(entity._id);
        return RESPONSES.success;
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('complete/:quest')
    async Tquests(@USER_ID() userId: string, @Param('quest') quest: QUEST | string): Promise<IMessage> {
        const [user, quests] = await Promise.all([
            this.userRepository.findOne({
                searchObject: { _id: userId },
                projection: 'tails referrals quests',
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
        if (questReward.requirements?.tails) {
            if (user.tails < questReward.requirements?.tails) {
                return { message: `Tails requirement is not met`, success: false };
            }
        }
        if (questReward.requirements?.referrals) {
            if (user.referrals.length < questReward.requirements?.referrals) {
                return { message: `Referrals requirement is not met`, success: false };
            }
        }

        if (questReward.tails) {
            await this.userRepository.update(user._id!, {
                ...(!questReward.boxes ? { $push: { quests: { $each: [quest], $position: 0 } } } : {}),
                $inc: { tails: questReward.tails, monthTails: questReward.tails },
            });
            return {
                message: `You just got ${questReward.tails} tails! Make sure that task is fully completed, each task is verified every 24 hours.`,
                success: true,
            };
        }

        if (questReward.cats?.length) {
            for (const cat of questReward.cats) {
                await this.catService.adopt(cat, user._id!);
            }
            if (!questReward.boxes) {
                await this.userRepository.update(user._id!, {
                    $inc: { tails: questReward.tails, monthTails: questReward.tails },
                    $push: { quests: { $each: [quest], $position: 0 } },
                });
                return {
                    message: `You just got new pets! Check them to see them.`,
                    success: true,
                };
            }
        }

        if (questReward.boxes) {
            await this.userRepository.update(user._id!, {
                $inc: { boxes: questReward.boxes },
                $push: { quests: { $each: [quest], $position: 0 } },
            });
            return {
                message: `You just got ${questReward.boxes} Loot Boxes! ${
                    questReward.cats?.length ? 'And some pets!' : ''
                }`,
                success: true,
            };
        }

        throw new BadRequestException('Quest is missing rewards');
    }

    @UseGuards(AuthGuard('appauth'))
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
                return { message: 'Become $TAILS guard', success: false };
            }
            await this.userRepository.update(userId, {
                $push: { quests: { $each: [contest], $position: 0 } },
                $inc: { tails: REWARDS.MYSTERY_BOX, monthTails: REWARDS.MYSTERY_BOX },
            });
            return { message: `Claimed ${REWARDS.MYSTERY_BOX} $TAILS`, success: true, tails: REWARDS.MYSTERY_BOX };
        } else if (contest === MYSTERY_BOX_TYPE.CAMP_7) {
            if (user.catnipCount < 120) {
                return { message: 'Collect 120 catnips', success: false };
            }
            await this.userRepository.update(userId, {
                $push: { quests: { $each: [contest], $position: 0 } },
                $inc: { tails: REWARDS.MYSTERY_BOX, monthTails: REWARDS.MYSTERY_BOX },
            });
            return { message: `Claimed ${REWARDS.MYSTERY_BOX} $TAILS`, success: true, tails: REWARDS.MYSTERY_BOX };
        } else if (contest === MYSTERY_BOX_TYPE.CAMP_8) {
            if (user.streak < 20) {
                return { message: 'Check-in 20 times', success: false };
            }
            await this.userRepository.update(userId, {
                $push: { quests: { $each: [contest], $position: 0 } },
                $inc: { tails: REWARDS.MYSTERY_BOX, monthTails: REWARDS.MYSTERY_BOX },
            });
            return { message: `Claimed ${REWARDS.MYSTERY_BOX} $TAILS`, success: true, tails: REWARDS.MYSTERY_BOX };
        } else if (contest === MYSTERY_BOX_TYPE.CAMP_9) {
            const titles = user?.codex?.reduce((acc, item) => acc + item, 0) || 0;
            if (titles < 2) {
                return { message: 'Earn 2 $TAILS guard titles', success: false };
            }
            await this.userRepository.update(userId, {
                $push: { quests: { $each: [contest], $position: 0 } },
                $inc: { tails: REWARDS.MYSTERY_BOX, monthTails: REWARDS.MYSTERY_BOX },
            });
            return { message: `Claimed ${REWARDS.MYSTERY_BOX} $TAILS`, success: true, tails: REWARDS.MYSTERY_BOX };
        } else {
            return { message: 'Contest not found', success: false };
        }
    }
}
