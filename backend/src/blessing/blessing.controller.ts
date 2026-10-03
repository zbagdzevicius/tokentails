import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Header,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Blessing, blessingKindFor, BlessingStatus, IBlessing, ICustomBlessing } from 'src/blessing/blessing.schema';
import { CatRepository } from 'src/cat/cat.repository';
import { ICat, Tier } from 'src/cat/cat.schema';
import { propsToIds } from 'src/common/utils';
import { BlessingSearchModel, pickSearchParams } from 'src/common/validators';
import { ImageRepository } from 'src/image/image.repository';
import { IResponse, RESPONSES } from 'src/shared/constants/common';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { generateAvatarFromImage } from 'src/shared/utils/ai-avatar';
import { generateCat } from 'src/shared/utils/ai.utils';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { UserService } from 'src/user/user.service';
import { BlessingRepository } from './blessing.repository';
import { IImage } from 'src/image/image.schema';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { FEATURED_CACHE_TTL_MS, IFeaturedCat, parseFeaturedLimit } from './featured';
import { FeaturedBlessingService } from './featured.service';

/**
 * `kind` is fixed at creation (F7.8). Moving a blessing into or out of the portrait shelter would
 * change what it is and skew the rescued-cats count and featured cats, so both edit routes refuse it.
 */
export function assertKindUnchanged(existing: Pick<Blessing, 'kind' | 'shelter'>, nextShelter: unknown): void {
    const currentKind = existing.kind || blessingKindFor(existing.shelter);
    if (blessingKindFor(nextShelter) !== currentKind) {
        throw new BadRequestException(
            currentKind === 'portrait'
                ? 'A pet portrait cannot be moved to a shelter'
                : 'A shelter cat cannot be moved to the portrait shelter'
        );
    }
}

@Controller('blessing')
export class BlessingController {
    constructor(
        private repository: BlessingRepository,
        private userRepository: UserRepository,
        private imageRepository: ImageRepository,
        private userService: UserService,
        private catRepository: CatRepository,
        private featuredService: FeaturedBlessingService
    ) {}

    @UseGuards(AppAuthGuard)
    @Post('search')
    public async search(@Body() params: BlessingSearchModel, @USER_ID() userId: string): Promise<IBlessing[]> {
        let searchObject: any = {};
        const user = await this.userRepository.findOne({ searchObject: { _id: userId } });
        const hasPermission = user.permission >= PERMISSION_LEVEL.MANAGER;
        if (!(user.shelter || hasPermission)) {
            throw new BadRequestException('User has no shelter or rights to fetch');
        }
        const secondarySearchObject: Partial<IBlessing> = {};
        if (params.shelter) {
            secondarySearchObject.shelter = new Types.ObjectId(params.shelter || user.shelter);
        }
        if (params.query?.length) {
            searchObject = {
                $search: {
                    index: 'blessings',
                    autocomplete: {
                        query: params.query,
                        path: 'name',
                    },
                },
            };
        }

        return this.repository.find({
            searchObject,
            secondarySearchObject,
            ...pickSearchParams(params),
            populate: [
                { path: 'image', select: 'url' },
                { path: 'catAvatar', select: 'url' },
                { path: 'cat', populate: { path: 'shelter', select: 'name' } },
            ],
        });
    }

    /**
     * Public: real shelter cats for Meet your cat ("Real cats are waiting too", plan G3). Rescue
     * blessings of Pink Paw and the catfluencers that are still WAITING or RECOVERING, never a
     * portrait, with a plain-text 140-character excerpt. Cached 10 minutes in process and at the edge.
     * Declared before `GET :id`, so `featured` is never read as an id.
     */
    @Get('featured')
    @Header('Cache-Control', `public, max-age=${FEATURED_CACHE_TTL_MS / 1000}`)
    async featured(@Query('limit') limit?: string): Promise<IFeaturedCat[]> {
        return this.featuredService.featured(parseFeaturedLimit(limit));
    }

    /**
     * GET /blessing/featured/names (public): the cat names reserved because those cats are featured
     * right now. Meet your cat passes them to `normalizeCatName` as `reserved`, so its inline check
     * agrees with POST /user/starter and PUT /cat/:id/name. Same 10-minute cache as `featured`.
     */
    @Get('featured/names')
    @Header('Cache-Control', `public, max-age=${FEATURED_CACHE_TTL_MS / 1000}`)
    async featuredNames(): Promise<{ names: string[] }> {
        return { names: await this.featuredService.reservedNames() };
    }

    @UseGuards(AppAuthGuard)
    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Blessing> {
        return this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
            populate: [
                {
                    path: 'cat',
                    populate: { path: 'shelter', select: 'name image', populate: [{ path: 'image', select: 'url' }] },
                },
                { path: 'image', select: 'url' },
                { path: 'catAvatar', select: 'url' },
                { path: 'creator', select: 'name' },
            ],
        });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Post('')
    async create(@Body() object: Blessing, @USER_ID() creatorUserId: string): Promise<Blessing> {
        if (!object.shelter) {
            throw new BadRequestException('Shelter is required');
        }
        if (!object.image) {
            throw new BadRequestException('Image is required');
        }
        if (!object.status) {
            throw new BadRequestException('Status is required');
        }
        if (!object.name) {
            throw new BadRequestException('Name is required');
        }
        if (!object.description) {
            throw new BadRequestException('Description is required');
        }
        const user = await this.userRepository.findOne({
            searchObject: { _id: creatorUserId },
            projection: '_id permission',
        });
        const hasShelter = object.shelter !== user.shelter;
        const hasPermission = user.permission >= PERMISSION_LEVEL.MANAGER;
        if (!(hasShelter || hasPermission)) {
            throw new BadRequestException('User does not have permission to create this blessing');
        }

        const image = await this.imageRepository.findOne({ searchObject: { _id: object.image }, projection: 'url' });
        const generatedCatNFT = await generateCat(object.name, image.url);
        if (!generatedCatNFT) {
            throw new BadRequestException('Failed to generate cat');
        }

        const catAvatar = await generateAvatarFromImage(image.url, (object.cat as unknown as ICat)?.type);
        if (!catAvatar) {
            throw new BadRequestException('Cat avatar is required');
        }
        const catAvatarImage = await this.imageRepository.create({
            url: catAvatar,
            name: object.name,
            createdAt: new Date(),
        });

        const blessingId = new Types.ObjectId();
        const catId = new Types.ObjectId();
        await this.userService.createCat({
            ...generatedCatNFT,
            tier: Tier.COMMON,
            blessing: blessingId,
            shelter: new Types.ObjectId(object.shelter),
            _id: catId,
            createdAt: new Date(),
        });

        const now = new Date();
        return this.repository.create({
            ...object,
            image: new Types.ObjectId(object.image),
            catAvatar: new Types.ObjectId(catAvatarImage._id),
            shelter: new Types.ObjectId(object.shelter),
            cat: catId,
            creator: new Types.ObjectId(creatorUserId),
            _id: blessingId,
            createdAt: now,
            // Set from the shelter (F7.8), never from the body: the portrait shelter makes a portrait.
            kind: blessingKindFor(object.shelter),
            statusUpdatedBy: new Types.ObjectId(creatorUserId),
            statusUpdatedAt: now,
        });
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Post('custom')
    async createCustom(@Body() body: ICustomBlessing, @USER_ID() creatorUserId: string): Promise<Blessing> {
        if (!body.shelter) {
            throw new BadRequestException('Shelter is required');
        }
        if (!body.image) {
            throw new BadRequestException('Image is required');
        }
        if (!body.status) {
            throw new BadRequestException('Status is required');
        }
        if (!body.name) {
            throw new BadRequestException('Name is required');
        }
        if (!body.description) {
            throw new BadRequestException('Description is required');
        }
        const user = await this.userRepository.findOne({
            searchObject: { _id: creatorUserId },
            projection: '_id permission',
        });
        const hasPermission = user.permission >= PERMISSION_LEVEL.MANAGER;
        if (!hasPermission) {
            throw new BadRequestException('User does not have permission to create this blessing');
        }

        const blessingId = new Types.ObjectId();
        const catId = new Types.ObjectId();
        await this.userService.createCat({
            name: body.name,
            blessing: blessingId,
            shelter: new Types.ObjectId(body.shelter),
            _id: catId,
            resqueStory: body.resqueStory,
            type: body.type,
            isBlueprint: true,
            spriteImg: body.spriteImg,
            catImg: body.catImg,
            status: {
                EAT: 0,
            },
        });
        const image = await this.imageRepository.findOne({ searchObject: { _id: body.image }, projection: 'url' });
        if (!image) {
            throw new BadRequestException('Image is required');
        }
        const catAvatar = await generateAvatarFromImage(image.url, body.type);
        if (!catAvatar) {
            throw new BadRequestException('Cat avatar is required');
        }
        const catAvatarImage = await this.imageRepository.create({
            url: catAvatar,
            name: body.name,
            createdAt: new Date(),
        });
        const blessing: Partial<IBlessing> = {
            _id: blessingId,
            cat: catId,
            image: new Types.ObjectId(body.image),
            shelter: new Types.ObjectId(body.shelter),
            creator: new Types.ObjectId(creatorUserId),
            catAvatar: new Types.ObjectId(catAvatarImage._id),
            name: body.name,
            status: body.status,
            instagram: body.instagram,
            description: body.description,
            kind: blessingKindFor(body.shelter),
            statusUpdatedBy: new Types.ObjectId(creatorUserId),
            statusUpdatedAt: new Date(),
        };

        return this.repository.create(blessing);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() object: Blessing,
        @USER_ID() creatorUserId: string
    ): Promise<Blessing> {
        const user = await this.userRepository.findOne({
            searchObject: { _id: creatorUserId },
            projection: '_id permission shelter',
        });
        object.shelter = new Types.ObjectId(object.shelter || user.shelter);
        const hasShelter = object.shelter !== user.shelter;
        const hasPermission = user.permission >= PERMISSION_LEVEL.MANAGER;
        if (!(hasShelter || hasPermission)) {
            throw new BadRequestException('User does not have permission to create this blessing');
        }

        const existingEntity = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
        });

        if (!existingEntity) {
            throw new NotFoundException();
        }
        propsToIds(object, ['image', 'shelter', 'catAvatar', 'savior']);
        // `kind` is fixed at creation and the status audit is server-written (F7.8). A move into or
        // out of the portrait shelter would change what the blessing is, so it is refused.
        delete (object as Partial<Blessing>).kind;
        assertKindUnchanged(existingEntity, object.shelter);
        delete (object as Partial<Blessing>).statusUpdatedBy;
        delete (object as Partial<Blessing>).statusUpdatedAt;
        if (object.status && object.status !== existingEntity.status) {
            object.statusUpdatedBy = new Types.ObjectId(creatorUserId);
            object.statusUpdatedAt = new Date();
        }
        if (object.name !== existingEntity.name) {
            const image = await this.imageRepository.findOne({
                searchObject: { _id: object.image },
                projection: 'url',
            });
            const generatedCatNFT = await generateCat(object.name, image.url);
            if (!generatedCatNFT) {
                throw new BadRequestException('Failed to generate cat');
            }
            await this.catRepository.update(existingEntity.cat!, generatedCatNFT);
        }
        const updatedEntity = await this.repository.update(existingEntity?._id, object);
        await this.catRepository.update(existingEntity.cat!, {
            shelter: object.shelter,
        });
        return updatedEntity;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Put(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() object: { status: BlessingStatus },
        @USER_ID() creatorUserId: string
    ): Promise<IResponse> {
        const user = await this.userRepository.findOne({
            searchObject: { _id: creatorUserId },
            projection: '_id permission shelter',
        });
        const blessing = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
            projection: '_id status shelter',
        });
        // The 404 check runs first: it used to run after `blessing.shelter` was read, so a missing
        // blessing answered 500 instead of 404.
        if (!blessing) {
            throw new NotFoundException();
        }
        if (user.shelter !== blessing.shelter && user.permission < PERMISSION_LEVEL.MANAGER) {
            throw new BadRequestException('User does not have permission to update this blessing');
        }
        await this.repository.update(blessing._id, {
            status: object.status,
            statusUpdatedBy: new Types.ObjectId(creatorUserId),
            statusUpdatedAt: new Date(),
        });
        return RESPONSES.success;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Put(':id/avatar')
    async regenerateAvatar(@Param('id') id: string, @USER_ID() creatorUserId: string): Promise<IResponse> {
        const user = await this.userRepository.findOne({
            searchObject: { _id: creatorUserId },
            projection: '_id permission shelter',
        });
        const blessing = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
            projection: '_id image cat shelter catAvatar',
            populate: [
                { path: 'image', select: 'url' },
                { path: 'cat', select: 'type' },
            ],
        });
        if (!blessing.image) {
            throw new BadRequestException('Cat image is required for avatar generation');
        }
        if (user.shelter !== blessing.shelter && user.permission < PERMISSION_LEVEL.MANAGER) {
            throw new BadRequestException('User does not have permission to update this blessing');
        }
        const newCatAvatar = await generateAvatarFromImage(
            (blessing.image as unknown as IImage).url,
            (blessing.cat as unknown as ICat).type
        );
        if (!newCatAvatar) {
            throw new BadRequestException('Failed to generate cat avatar');
        }
        await this.imageRepository.update(blessing.catAvatar!, {
            url: newCatAvatar,
        });
        return RESPONSES.success;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Put(':id/custom')
    async updateCustom(
        @Param('id') id: string,
        @Body() body: ICustomBlessing,
        @USER_ID() creatorUserId: string
    ): Promise<Blessing> {
        const user = await this.userRepository.findOne({
            searchObject: { _id: creatorUserId },
            projection: '_id permission shelter',
        });
        body.shelter = new Types.ObjectId(body.shelter || user.shelter);
        const hasShelter = body.shelter !== user.shelter;
        const hasPermission = user.permission >= PERMISSION_LEVEL.MANAGER;
        if (!(hasShelter || hasPermission)) {
            throw new BadRequestException('User does not have permission to create this blessing');
        }

        const existingEntity = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
        });

        if (!existingEntity) {
            throw new NotFoundException();
        }
        propsToIds(body, ['image', 'shelter', 'catAvatar', 'savior']);
        // Same F7.8 rule as PUT /blessing/:id: the custom editor cannot change what the blessing is.
        assertKindUnchanged(existingEntity, body.shelter);

        await this.catRepository.update(existingEntity.cat!, {
            name: body.name,
            type: body.type,
            resqueStory: body.resqueStory,
            spriteImg: body.spriteImg,
            catImg: body.catImg,
        });
        const updatedEntity = await this.repository.update(existingEntity?._id, {
            name: body.name,
            description: body.description,
            image: new Types.ObjectId(body.image),
            shelter: body.shelter,
            cat: existingEntity.cat,
            instagram: body.instagram,
            creator: new Types.ObjectId(creatorUserId),
        });
        return updatedEntity;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Delete(':id')
    async delete(@Param('id') id: string) {
        const entity = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
            projection: '_id cat',
            populate: [{ path: 'cat', populate: { path: 'owner' } }],
        });
        if (!entity) {
            throw new NotFoundException();
        }

        await this.repository.delete(entity._id);
        if (entity.cat) {
            await this.catRepository.delete(entity.cat);
        }

        return RESPONSES.success;
    }
}
