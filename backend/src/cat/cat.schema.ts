import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { CAT_ORIGINS, CatOrigin, isOneOf, STARTER_BREEDS, StarterBreed } from 'src/shared-contracts/enums';
import { PackType } from 'src/web3/order.schema';

export { CatOrigin, StarterBreed };

export enum StatusType {
    EAT = 'EAT',
}
export type IStatusValue = 0 | 1 | 2 | 3 | 4 | number;

export type IStatus = Partial<Record<StatusType, IStatusValue>>;

export enum Tier {
    COMMON = 'COMMON',
    RARE = 'RARE',
    EPIC = 'EPIC',
    LEGENDARY = 'LEGENDARY',
}

export enum CatOriginType {
    BLACK = 'BLACK',
    GREY = 'GREY',
    PINKIE = 'PINKIE',
    SIAMESE = 'SIAMESE',
    YELLOW = 'YELLOW',
    WHITE = 'WHITE',
    MAINE = 'MAINE',
    PEACHES = 'PEACHES',
    OREO = 'OREO',
    MIST = 'MIST', //SIAMESE LIKE CAT
    FOLD = 'FOLD', //WHITE ORANGE CTA WITH FOLDED EARS
    OBSIDIAN = 'OBSIDIAN', //BLACK CAT WITH COLOUR EYES
    SAVANHAN = 'SAVANHAN', // BROWN CAT WITH ORANGE LIEK STRIPES
    BALINESE = 'BALINESE', //SIAMESE LIKE CAT
    OBI = 'OBI', // FULY BROWN CAT
    OLIVE = 'OLIVE', //LIGHT GRAY CAT WITH GRAY STRIPES
    PICKLES = 'PICKLES', //GRAY CAT WITH DARK GRAY STRIPES
    RASCAL = 'RASCAL', //ORNAGE CAT WITH WHITE
    SABLE = 'SABLE', //DARK BROWN CAT WITH WHITE
    FICUS = 'FICUS', //DARK CAT WITH WHITE
    MERLOT = 'MERLOT', //MAINE COONE LIKE CAT
    TROUFAS = 'TROUFAS', //FULL BLACK CAT
}

export enum CatAbilityType {
    ICE = 'ICE',
    ELECTRIC = 'ELECTRIC',
    FIRE = 'FIRE',
    WIND = 'WIND',
    DARK = 'DARK',
    WATER = 'WATER',
    GRASS = 'GRASS',
    SAND = 'SAND',
    FAIRY = 'FAIRY',
    STELLAR = 'STELLAR',
}

export const CatAbilityTypes = [
    CatAbilityType.ICE,
    CatAbilityType.ELECTRIC,
    CatAbilityType.FIRE,
    CatAbilityType.WIND,
    CatAbilityType.DARK,
    CatAbilityType.WATER,
    CatAbilityType.GRASS,
    CatAbilityType.SAND,
    CatAbilityType.FAIRY,
    CatAbilityType.STELLAR,
];

export enum EmoteType {
    DIGGING = 'DIGGING',
    GROOMING = 'GROOMING',
    HIT = 'HIT',
    IDLE = 'IDLE',
    JUMPING = 'JUMPING',
    LOAF = 'LOAF',
    RUNNING = 'RUNNING',
    SITTING = 'SITTING',
    SLEEP = 'SLEEP',
    WALKING = 'WALKING',
}

export const catAbilityTypes = Object.values(CatAbilityType);

export const MAX_CAT_STATUS = 4;

@Schema({ _id: false, versionKey: false })
export class CatStatus {
    @Prop({ required: true })
    EAT: number;
}

export interface IMintedNFTs {
    stellar?: string;
    sei?: string;
}

@Schema({ timestamps: true })
export class Cat extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: false })
    packed: boolean;

    @Prop({ required: false })
    resqueStory: string;

    @Prop({ required: true })
    type: CatAbilityType;

    @Prop({ required: true })
    tier: Tier;

    @Prop({ required: false })
    packType: PackType;

    @Prop({ required: false, default: false })
    isBlueprint: boolean;

    // full path to sprites img
    @Prop({ required: true })
    spriteImg: string;

    // full path to GIF img
    @Prop({ required: true })
    catImg: string;

    @Prop({ required: false })
    staked?: Date;

    @Prop({ required: true, type: CatStatus })
    status: CatStatus;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    owner?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Blessing' })
    blessing: Types.ObjectId;

    @Prop({ required: false })
    tokenId?: number;

    @Prop({ type: Types.ObjectId, ref: 'Shelter' })
    shelter?: Types.ObjectId;

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    token?: Partial<IMintedNFTs>;

    // Starter companion (G3, F5.1): one per owner, created idempotently on {owner, isStarter: true}.
    @Prop({ required: false, type: Boolean })
    isStarter?: boolean;

    // A guest's starter (G1). Excluded from every public list, count and page until promotion
    // unsets it; dropped when the guest merges into an existing account (decision #8).
    @Prop({ required: false, type: Boolean })
    isGuestStarter?: boolean;

    // Set when the starter is committed (POST /user/starter, G3) or created locked (createUser, the
    // manager POST /user/profile). A starter without it can still be chosen and named.
    @Prop({ required: false, type: Date })
    starterLockedAt?: Date;

    @Prop({ required: false, type: String, enum: STARTER_BREEDS })
    starterBreed?: StarterBreed;

    // Where the cat came from; pack and redeem copies also point at the catalogue cat (G3).
    // The AI cat generator (`generateCat`) also returns an `origin`, meaning the breed family
    // (CatOriginType). The schema never declared it, so it was dropped on save; the setter keeps it
    // that way and stores only the CAT_ORIGINS vocabulary, so the two meanings never mix.
    @Prop({
        required: false,
        type: String,
        set: (value: unknown) => (isOneOf(CAT_ORIGINS, value) ? value : undefined),
    })
    origin?: CatOrigin | CatOriginType;

    @Prop({ type: Types.ObjectId, ref: 'Cat', required: false })
    sourceCat?: Types.ObjectId;

    // Last player rename (PUT /cat/:id/name): one free rename per 30 days (decision #22). Naming the
    // starter in Meet your cat is not a rename and leaves it unset.
    @Prop({ required: false, type: Date })
    nameChangedAt?: Date;

    // One-time rename offer for legacy Cleocatra starters (scripts/backfill-starter-cats.js,
    // decision #20). The rename it allows skips the 30-day window; renaming or dismissing clears it.
    @Prop({ required: false, type: Boolean })
    renameOffer?: boolean;

    // Set when a moderator resets or replaces the name (PUT /cat/:id/name/moderate).
    @Prop({ required: false, type: Date })
    nameModeratedAt?: Date;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    nameModeratedBy?: Types.ObjectId;

    // Account deletion (decision #4, user/guest/account-deletion.ts): a rescue cat whose blessing has
    // no adoptable cat left goes back to the pool (`owner` unset, listed by GET /cat/sale); any other
    // cat is detached with `owner: null`, which the storefront's `owner: {$exists: false}` skips.
    @Prop({ required: false, type: Date })
    releasedAt?: Date;

    // `sourceCat` of a released copy, moved here so `copy_per_owner_source` (missing and null owners
    // index alike) never rejects a second released copy of one catalogue cat.
    @Prop({ type: Types.ObjectId, ref: 'Cat', required: false })
    releasedSourceCat?: Types.ObjectId;
}

export type CatDocument = Cat & Document;

export type ICat = Pick<Cat, keyof Cat>;

export const CatSchema = SchemaFactory.createForClass(Cat);
CatSchema.index({ tokenId: 1 });
CatSchema.index({ nftId: 1 });
CatSchema.index({ name: 1 });
CatSchema.index({ packed: 1 });
CatSchema.index({ updatedAt: -1 });
CatSchema.index({ isBlueprint: 1 });
CatSchema.index({ blessing: 1, owner: 1 });
CatSchema.plugin(uniqueValidator);
// One starter per owner (F5.2 step 4, F5.5): the idempotent upsert on {owner, isStarter: true} is
// backed by this unique partial index. No existing cat has `isStarter`, so autoIndex can build it
// safely (G3's backfill-starter-cats.js marks at most one cat per owner).
// Declared AFTER the uniqueValidator plugin on purpose: the plugin turns every unique index into a
// pre-save `countDocuments` on its paths and merges the partial filter in, so it would reject every
// adopted cat of an owner who already has a starter. The database index is the only check needed.
CatSchema.index(
    { owner: 1 },
    { name: 'starter_per_owner', unique: true, partialFilterExpression: { isStarter: true } }
);
// Ownership dedupe of pack, redeem and adopt copies (G3): one copy of a catalogue cat per owner. The
// check in CatService.ownsCopyOf runs first, but two parallel adopts or redeems both pass it, so this
// unique partial index is what refuses the second copy (CatService.adopt maps the duplicate key
// error to "User already owns this NFT cat"). After the plugin, for the same reason as above.
// `sourceCat` is new in this release, so no existing cat matches the partial filter and autoIndex
// can build it; scripts/audit-orders-grants.js counts duplicate copies before and after the deploy.
CatSchema.index(
    { owner: 1, sourceCat: 1 },
    { name: 'copy_per_owner_source', unique: true, partialFilterExpression: { sourceCat: { $exists: true } } }
);
// Cat nap cap (G5 P2): counts one owner's napping cats on every stake. Partial, so it holds only the
// few cats that nap; non-unique, so autoIndex may build it.
CatSchema.index(
    { owner: 1, staked: 1 },
    { name: 'cat_nap_owner', partialFilterExpression: { staked: { $exists: true } } }
);
