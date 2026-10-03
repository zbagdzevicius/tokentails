import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ICat, Tier } from 'src/cat/cat.schema';
import { UserRepository } from 'src/user/user.repository';
import { IUser } from 'src/user/user.schema';
import { CatRepository } from './cat.repository';
import { PackType } from 'src/web3/order.schema';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { BlessingStatus, PORTRAIT_SHELTER_ID, rescueBlessingFilter } from 'src/blessing/blessing.schema';
import { packShelterObjectIds } from 'src/blessing/featured-shelters';
import { CatOrigin } from 'src/shared-contracts/enums';
import { ImageRepository } from 'src/image/image.repository';
import { generateCat } from 'src/shared/utils/ai.utils';
import { generateAvatarFromImage } from 'src/shared/utils/ai-avatar';
import { generateRandomNumber } from 'src/user/user.service';
import { ShelterRepository } from 'src/shelter/shelter.repository';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    buildStorefront,
    IStorefrontMeta,
    STOREFRONT_BLESSING_SELECT,
    STOREFRONT_BLUEPRINT_SAMPLE,
    STOREFRONT_CACHE_TTL_MS,
    STOREFRONT_LIMIT,
    STOREFRONT_PER_SHELTER_LIMIT,
    STOREFRONT_REQUIRED_KEYS,
    STOREFRONT_SHELTER_SELECT,
    storefrontProjection,
} from './storefront';

// Paid pet portraits live under this shelter (F7.8: their blessings are `kind: 'portrait'`).
const SHELTER_ID = PORTRAIT_SHELTER_ID;

export type IStorefrontResponse = Record<string, ICat[] | IStorefrontMeta>;

/**
 * Fields a pack, redeem or adopt copy never takes from its catalogue cat (plan G3): identity (ids,
 * the minted token, the token id, the redeem code), ownership, the starter flags and per-player state. A starter can never be copied at all, but the
 * list strips the flags anyway, so a new flag on a catalogue row cannot leak into copies.
 */
export const CAT_COPY_STRIPPED_FIELDS = [
    '_id',
    '__v',
    'owner',
    // On-chain and catalogue identity: a copy is not minted, has its own token id (set below, so
    // GET /cat/nft/:tokenId matches one cat), and is never the cat a redeem code points at.
    'token',
    'tokenId',
    'nftId',
    'code',
    'isStarter',
    'isGuestStarter',
    'starterLockedAt',
    'starterBreed',
    'nameChangedAt',
    'renameOffer',
    'nameModeratedAt',
    'nameModeratedBy',
    'releasedAt',
    'releasedSourceCat',
    'staked',
    'origin',
    'sourceCat',
    'packed',
    'isBlueprint',
    'tier',
    'packType',
    'createdAt',
    'updatedAt',
] as const;

/** Builds the owner's copy of a catalogue cat. Pure, so the stripped fields are unit tested. */
export function buildCatCopy(
    source: Record<string, any>,
    {
        owner,
        tier,
        packType,
        origin,
        now = new Date(),
    }: { owner: Types.ObjectId; tier?: Tier; packType?: PackType; origin: CatOrigin; now?: Date }
): Record<string, any> {
    const copy: Record<string, any> = { ...source };
    for (const field of CAT_COPY_STRIPPED_FIELDS) {
        delete copy[field];
    }
    return {
        ...copy,
        status: copy.status || { EAT: 0 },
        _id: new Types.ObjectId(),
        owner,
        packed: true,
        isBlueprint: false,
        tier: tier || Tier.COMMON,
        createdAt: now,
        tokenId: generateRandomNumber(),
        ...(packType ? { packType } : {}),
        origin,
        sourceCat: new Types.ObjectId(String(source._id)),
    };
}

/** The owner already has a copy of this catalogue cat. */
export const ALREADY_OWNED_MESSAGE = 'User already owns this NFT cat';

/** Shown when a buyer already owns every cat of the pack's pool; the order is refunded (#21). */
export const PACK_POOL_EMPTY_MESSAGE =
    'You already have every cat this pack can bring home. Your payment will be refunded.';

@Injectable()
export class CatService {
    // One in-process cache per instance (45 s). Concurrent requests share the in-flight build.
    private storefrontCache: { expiresAt: number; value: Promise<IStorefrontResponse> } | null = null;
    // Bumped by every invalidation, so a build that started before an adoption is not cached.
    private storefrontGeneration = 0;

    constructor(
        private repository: CatRepository,
        private userRepository: UserRepository,
        private blessingRepository: BlessingRepository,
        private imageRepository: ImageRepository,
        private shelterRepository: ShelterRepository
    ) {}

    /**
     * GET /cat/sale (G13 backend hotfix): every required key is an array, every key of the old
     * response is kept, fields are whitelisted, at most STOREFRONT_PER_SHELTER_LIMIT blessed cats per
     * shelter (STOREFRONT_LIMIT overall), and `_meta`.
     */
    async storefront(now: () => number = Date.now): Promise<IStorefrontResponse> {
        const cached = this.storefrontCache;
        if (cached && cached.expiresAt > now()) {
            return cached.value;
        }

        const generation = this.storefrontGeneration;
        const value = this.buildStorefront();
        this.storefrontCache = { expiresAt: now() + STOREFRONT_CACHE_TTL_MS, value };
        value.then(
            () => {
                if (generation !== this.storefrontGeneration && this.storefrontCache?.value === value) {
                    this.storefrontCache = null;
                }
            },
            () => {
                // A failed build is never served from the cache.
                if (this.storefrontCache?.value === value) {
                    this.storefrontCache = null;
                }
            }
        );
        return value;
    }

    /** Called whenever a cat changes owner, so the next GET /cat/sale is rebuilt. */
    invalidateStorefront() {
        this.storefrontGeneration++;
        this.storefrontCache = null;
    }

    private async buildStorefront(): Promise<IStorefrontResponse> {
        const projection = storefrontProjection();
        const blueprints = this.repository.model
            .aggregate([
                { $match: { isBlueprint: true } },
                { $sample: { size: STOREFRONT_BLUEPRINT_SAMPLE } },
                { $project: projection },
            ])
            .exec();
        const blessedForSale = this.blessedForSale(projection);
        // Names for the required keys even when they have no cat for sale; other shelters are named
        // from their populated cats.
        const shelters = this.shelterRepository.model
            .find({ slug: { $in: [...STOREFRONT_REQUIRED_KEYS] } }, { slug: 1, name: 1 })
            .lean()
            .exec();

        const [blueprintRows, blessedRows, shelterRows] = await Promise.all([blueprints, blessedForSale, shelters]);
        return buildStorefront(blueprintRows as ICat[], blessedRows as unknown as ICat[], shelterRows as any[]);
    }

    /**
     * Unowned blessed cats, newest first, capped per shelter so one large shelter can never push the
     * others out of the response. Step 1 groups only ids (small, served by `{blessing: 1, owner: 1}`);
     * step 2 loads the whitelisted, populated cats for those ids.
     *
     * Step 1 collects every id of a shelter before `$slice` (12 bytes each, so about a million unsold
     * cats in one shelter before the 16 MB group limit). `$topN` would bound it but needs MongoDB 5.2+;
     * switch once the production version is confirmed (alignment-log/1b.md, storefront cap).
     */
    private async blessedForSale(projection: Record<string, 1>): Promise<ICat[]> {
        const filter = { blessing: { $exists: true }, owner: { $exists: false } };
        const groups: { _id: unknown; ids: Types.ObjectId[] }[] = await this.repository.model
            .aggregate([
                { $match: filter },
                { $sort: { _id: -1 } },
                { $group: { _id: '$shelter', ids: { $push: '$_id' } } },
                { $project: { ids: { $slice: ['$ids', STOREFRONT_PER_SHELTER_LIMIT] } } },
            ])
            .allowDiskUse(true)
            .exec();
        const ids = (groups || []).flatMap(group => (Array.isArray(group?.ids) ? group.ids : []));
        if (!ids.length) {
            return [];
        }
        const rows = await this.repository.model
            .find({ ...filter, _id: { $in: ids } }, projection)
            .sort({ _id: -1 })
            .limit(STOREFRONT_LIMIT)
            .populate([
                {
                    path: 'blessing',
                    select: STOREFRONT_BLESSING_SELECT,
                    populate: [
                        { path: 'image', select: 'url' },
                        { path: 'catAvatar', select: 'url' },
                    ],
                },
                {
                    path: 'shelter',
                    select: STOREFRONT_SHELTER_SELECT,
                    populate: [{ path: 'image', select: 'url' }],
                },
            ])
            .lean()
            .exec();
        return rows as unknown as ICat[];
    }

    private async createCatToTheOwner(
        catToAdopt: ICat,
        user: IUser,
        origin: CatOrigin,
        tier?: Tier,
        packType?: PackType
    ): Promise<ICat> {
        const catToCreate = buildCatCopy(catToAdopt as Record<string, any>, {
            owner: new Types.ObjectId(String(user._id)),
            tier,
            packType,
            origin,
        });
        const cat = await this.repository.create(catToCreate as Partial<ICat> as any);

        return this.addCatToTheOwner(cat, user);
    }

    async addCatToTheOwner(catToAdopt: ICat, user: IUser): Promise<ICat> {
        await this.userRepository.update(user._id!, {
            $push: { cats: { $each: [catToAdopt._id], $position: 0 } },
        });
        await this.repository.update(catToAdopt._id!, {
            $set: { owner: new Types.ObjectId(user._id) },
        });
        this.invalidateStorefront();

        return this.getCat(catToAdopt._id!.toString());
    }

    async getCat(id: string): Promise<ICat> {
        return await this.repository.findOne({
            searchObject: { _id: id },
            populate: [
                {
                    path: 'blessing',
                    populate: [
                        { path: 'image', select: 'url' },
                        { path: 'catAvatar', select: 'url' },
                    ],
                },
                { path: 'shelter', select: 'country name image', populate: [{ path: 'image', select: 'url' }] },
            ],
        });
    }

    /**
     * Ownership dedupe (plan G3): the owner already has a copy of this catalogue cat when one of
     * their cats points at the same blessing, or at this cat as `sourceCat`. Names are never
     * compared, so a starter named "Luna" does not block adopting a real Luna. Legacy copies of a
     * cat without a blessing (redeem cats before `sourceCat`) match on the exact look instead.
     */
    async ownsCopyOf(userId: string | Types.ObjectId, source: Record<string, any>): Promise<boolean> {
        const owner = new Types.ObjectId(String(userId));
        const sourceId = new Types.ObjectId(String(source._id));
        const alternatives: Record<string, unknown>[] = [{ _id: sourceId }, { sourceCat: sourceId }];
        if (source.blessing) {
            alternatives.push({ blessing: new Types.ObjectId(String(source.blessing)) });
        } else if (source.name && source.spriteImg && source.catImg) {
            alternatives.push({
                sourceCat: { $exists: false },
                isStarter: { $ne: true },
                name: source.name,
                spriteImg: source.spriteImg,
                catImg: source.catImg,
            });
        }
        return !!(await this.repository.model.exists({ owner, $or: alternatives }));
    }

    async adopt(
        _id: string | Types.ObjectId,
        userId: string,
        tier?: Tier,
        packType?: PackType,
        origin: CatOrigin = 'adopt'
    ): Promise<{ success: boolean; message: string; cat?: ICat }> {
        if (!Types.ObjectId.isValid(String(_id)) || !Types.ObjectId.isValid(String(userId))) {
            return { success: false, message: 'Entities can not be found' };
        }
        const catToAdopt = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(_id) },
        });
        const user = await this.userRepository.findOne({
            searchObject: { _id: userId },
            projection: '_id',
        });
        if (!catToAdopt || !user) {
            return { success: false, message: 'Entities can not be found' };
        }
        // A player's starter is theirs alone: it is never a catalogue cat to copy.
        if (catToAdopt.isStarter || catToAdopt.isGuestStarter) {
            return { success: false, message: 'This cat can not be adopted' };
        }
        if (await this.ownsCopyOf(userId, catToAdopt as Record<string, any>)) {
            return { success: false, message: ALREADY_OWNED_MESSAGE };
        }

        try {
            const cat = await this.createCatToTheOwner(catToAdopt, user, origin, tier, packType);
            return { success: true, message: 'Congratz on your new cat!', cat };
        } catch (e) {
            // A parallel adopt or redeem of the same cat won the race: the unique
            // `copy_per_owner_source` index refused this copy.
            if (isDuplicateKeyError(e)) {
                return { success: false, message: ALREADY_OWNED_MESSAGE };
            }
            console.error(e);
            return { success: false, message: 'Something went wrong, please try again later' };
        }
    }

    /**
     * The catalogue cat a pack grants (plan G3): a random rescue blessing of the pack's partner
     * shelters that is not ADOPTED or HEAVEN, whose cat still exists, and that the buyer does not
     * already own (by blessing or by source cat). Null when the pool is empty; the caller refunds the
     * order (decision #21). It never falls back to a cat the buyer already owns. `exclude` lists
     * catalogue cat ids to skip as well (the retry after a failed grant).
     */
    async pickPackCat(
        userId: string | Types.ObjectId,
        packType?: PackType,
        exclude: ReadonlyArray<string | Types.ObjectId> = []
    ): Promise<Types.ObjectId | null> {
        const owner = new Types.ObjectId(String(userId));
        const owned: { blessing?: Types.ObjectId; sourceCat?: Types.ObjectId }[] = await this.repository.model
            .find(
                { owner, $or: [{ blessing: { $exists: true } }, { sourceCat: { $exists: true } }] },
                { blessing: 1, sourceCat: 1 }
            )
            .lean();
        const ownedBlessings = owned.map(cat => cat.blessing).filter(Boolean) as Types.ObjectId[];
        const ownedSourceCats = owned.map(cat => cat.sourceCat).filter(Boolean) as Types.ObjectId[];
        // Catalogue cats the caller already tried (a failed grant's retry).
        for (const id of exclude) {
            if (Types.ObjectId.isValid(String(id))) {
                ownedSourceCats.push(new Types.ObjectId(String(id)));
            }
        }
        const shelters =
            packType === PackType.INFLUENCER ? packShelterObjectIds(['catfluencers']) : packShelterObjectIds();

        const rows: { cat?: Types.ObjectId }[] = await this.blessingRepository.model
            .aggregate([
                {
                    $match: {
                        ...rescueBlessingFilter(),
                        shelter: { $in: shelters },
                        status: { $nin: [BlessingStatus.ADOPTED, BlessingStatus.HEAVEN] },
                        _id: { $nin: ownedBlessings },
                        cat: { $exists: true, $ne: null, $nin: ownedSourceCats },
                    },
                },
                {
                    $lookup: {
                        from: this.repository.model.collection.name,
                        localField: 'cat',
                        foreignField: '_id',
                        as: 'catDoc',
                    },
                },
                // The catalogue cat must exist, and must not be a player's starter.
                { $match: { 'catDoc.0': { $exists: true }, 'catDoc.isStarter': { $ne: true } } },
                { $sample: { size: 1 } },
                { $project: { cat: 1 } },
            ])
            .exec();
        return rows?.[0]?.cat ?? null;
    }

    async createBlessingWithCat(userId: string, imgUrl: string) {
        const name = `My Pet`;
        const image = await this.imageRepository.create({
            url: imgUrl,
            name,
            createdAt: new Date(),
        });

        const generatedCatNFT = await generateCat(name, imgUrl);
        if (!generatedCatNFT) {
            throw new Error('Failed to generate cat');
        }

        const catAvatar = await generateAvatarFromImage(imgUrl, generatedCatNFT.type);
        if (!catAvatar) {
            throw new Error('Failed to generate cat avatar');
        }

        const catAvatarImage = await this.imageRepository.create({
            url: catAvatar,
            name,
            createdAt: new Date(),
        });

        const blessingId = new Types.ObjectId();
        const catId = new Types.ObjectId();
        const userObjectId = new Types.ObjectId(userId);

        const cat = await this.repository.create({
            ...generatedCatNFT,
            tier: Tier.RARE,
            blessing: blessingId,
            shelter: new Types.ObjectId(SHELTER_ID),
            _id: catId,
            owner: userObjectId,
            status: { EAT: 0 },
            isBlueprint: false,
            createdAt: new Date(),
            tokenId: generateRandomNumber(),
            // After the spread: `generateCat` returns a breed family as `origin`, which the schema drops.
            origin: 'portrait',
        });

        const user = await this.userRepository.findOne({
            searchObject: { _id: userId },
        });
        await this.addCatToTheOwner(cat, user);

        const blessing = await this.blessingRepository.create({
            name: generatedCatNFT.name,
            description: generatedCatNFT.resqueStory,
            status: BlessingStatus.ADOPTED,
            image: new Types.ObjectId(image._id),
            catAvatar: new Types.ObjectId(catAvatarImage._id),
            shelter: new Types.ObjectId(SHELTER_ID),
            cat: catId,
            creator: userObjectId,
            _id: blessingId,
            createdAt: new Date(),
            // A paid pet portrait, not a rescue: impact counts and featured cats skip it (F7.8).
            kind: 'portrait',
            statusUpdatedBy: userObjectId,
            statusUpdatedAt: new Date(),
        });

        return blessing;
    }
}
