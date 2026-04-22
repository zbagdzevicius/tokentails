import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types } from 'mongoose';
import { ArticleRepository } from 'src/article/article.repository';
import { CatRepository } from 'src/cat/cat.repository';
import { BaseRepository } from 'src/common/base.repository';
import { SearchModel } from 'src/common/validators';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { CommentRepository } from './comment.repository';
import { IComment } from './comment.schema';
import { ImageRepository } from 'src/image/image.repository';

@Controller('comment')
export class CommentController {
    entityTypeRepository: Record<EntityType, BaseRepository<any>> = {
        [EntityType.ARTICLE]: this.articleRepository,
        [EntityType.COMMENT]: this.repository,
        [EntityType.CAT]: this.catRepository,
        [EntityType.BLESSING]: this.catRepository,
        [EntityType.PACK]: this.catRepository,
        [EntityType.IMAGE]: this.imageRepository,
    };

    constructor(
        private repository: CommentRepository,
        private articleRepository: ArticleRepository,
        private userRepository: UserRepository,
        private catRepository: CatRepository,
        private imageRepository: ImageRepository
    ) {}

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.USER))
    @Post()
    async create(
        @USER_ID() userId: string,
        @Body() payload: Pick<IComment, 'text' | 'type' | 'entity'>
    ): Promise<IComment> {
        if (!payload.type || !payload.entity) {
            throw new BadRequestException('missing type or entity');
        }
        const [comment, user] = await Promise.all([
            this.repository.create({ ...payload, user: new Types.ObjectId(userId) }),
            this.userRepository.findOne({
                searchObject: { _id: new Types.ObjectId(userId) },
                projection: 'name',
            }),
        ]);
        await this.entityTypeRepository[payload.type].update(payload.entity, {
            $push: { comments: { $each: [comment._id], $position: 0 } },
        });
        comment.user = user as any;

        return comment;
    }

    @Post(':entityType/:entityId')
    async search(
        @Param('entityType') entityType: EntityType,
        @Param('entityId') entityId: string,
        @Body() searchParams: SearchModel
    ): Promise<IComment> {
        if (!entityType || !entityId) {
            throw new BadRequestException('missing type or entity');
        }
        const entityWithComments = await this.entityTypeRepository[entityType].findOne({
            searchObject: { _id: new Types.ObjectId(entityId) },
            populate: [
                {
                    path: 'comments',
                    select: 'text likes entity user createdAt',
                    populate: { path: 'user', select: 'name' },
                },
            ],
            projection: {
                comments: { $slice: ['$comments', searchParams.page! * searchParams.perPage!, searchParams.perPage] },
            },
        });

        return entityWithComments?.comments || [];
    }
}
