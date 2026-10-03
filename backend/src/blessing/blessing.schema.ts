import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { ICat } from 'src/cat/cat.schema';
import { CommonSchema } from 'src/common/common.schema';

export enum BlessingStatus {
    WAITING = 'WAITING',
    RECOVERING = 'RECOVERING',
    ADOPTED = 'ADOPTED',
    HEAVEN = 'HEAVEN',
}

/**
 * What a blessing is (plan F7.8): a real shelter `rescue`, or a paid pet `portrait` (stored as an
 * ADOPTED blessing of the portrait shelter, cat.service.ts `createBlessingWithCat`). Set at creation;
 * impact counts and featured cats use `rescue` only. Old rows get it from
 * scripts/backfill-blessing-kind.js (dry run by default). Shared with the client once
 * shared/enums.ts adds `BLESSING_KINDS` (requested in the 2b log).
 */
export const BLESSING_KINDS = ['rescue', 'portrait'] as const;
export type BlessingKind = typeof BLESSING_KINDS[number];

/** The shelter paid pet portraits are stored under (cat.service.ts, scripts/backfill-blessing-kind.js). */
export const PORTRAIT_SHELTER_ID = '69a0008f83f121409ebfed1e';

/**
 * Filter for rescue blessings. A row without `kind` (created before F7.8, not yet backfilled) counts
 * the way scripts/backfill-blessing-kind.js will classify it: rescue unless it belongs to the
 * portrait shelter. So counts are right before and after the backfill runs.
 *
 * `excludeShelters` leaves out whole zones whatever their kind: the public impact figures pass the
 * house zones (Token Tails' own `token-tails` and `token-tails-2`, `houseShelterIds()` in
 * src/impact/impact-public.ts), so the rescued-cats figure and the shelter list agree. Featured cats
 * and the pack pool keep their explicit G3 shelter list and pass nothing.
 */
export function rescueBlessingFilter(excludeShelters: Types.ObjectId[] = []): Record<string, unknown> {
    const byKind = {
        $or: [
            { kind: 'rescue' },
            { kind: { $exists: false }, shelter: { $ne: new Types.ObjectId(PORTRAIT_SHELTER_ID) } },
        ],
    };
    return excludeShelters.length ? { $and: [byKind, { shelter: { $nin: excludeShelters } }] } : byKind;
}

/** `kind` a new blessing of `shelter` gets: `portrait` in the portrait shelter, otherwise `rescue`. */
export function blessingKindFor(shelter: unknown): BlessingKind {
    const id = shelter && typeof shelter === 'object' && '_id' in (shelter as any) ? (shelter as any)._id : shelter;
    return String(id ?? '') === PORTRAIT_SHELTER_ID ? 'portrait' : 'rescue';
}

export interface IMintedNFTs {
    stellar?: string;
    evm?: string;
}

export type ICustomBlessing = Pick<
    IBlessing,
    '_id' | 'shelter' | 'image' | 'status' | 'instagram' | 'name' | 'description' | 'catAvatar' | 'savior'
> &
    Pick<ICat, 'type' | 'resqueStory' | 'spriteImg' | 'catImg'>;

@Schema({ timestamps: true })
export class Blessing extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: true })
    status: BlessingStatus;

    /** Absent only on rows created before F7.8 and not yet backfilled. */
    @Prop({ required: false, enum: BLESSING_KINDS })
    kind?: BlessingKind;

    /** Who last changed `status`, and when (plan F7.8). */
    @Prop({ required: false, type: Types.ObjectId, ref: 'User' })
    statusUpdatedBy?: Types.ObjectId;

    @Prop({ required: false, type: Date })
    statusUpdatedAt?: Date;

    @Prop({ required: false, type: Types.ObjectId, ref: 'Image' })
    savior: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    image: Types.ObjectId;

    @Prop({ required: false })
    instagram?: string;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    creator?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;

    @Prop({ required: false, type: Types.ObjectId, ref: 'Image' })
    catAvatar?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Shelter' })
    shelter?: Types.ObjectId;

    @Prop({ required: false })
    tokenId?: number;

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    token?: Partial<IMintedNFTs>;
}

export type BlessingDocument = Blessing & Document;

export type IBlessing = Pick<Blessing, keyof Blessing>;

export const BlessingSchema = SchemaFactory.createForClass(Blessing);
BlessingSchema.index({ shelter: 1 });
BlessingSchema.index({ kind: 1, status: 1 });
BlessingSchema.index({ nftId: 1 });
BlessingSchema.plugin(uniqueValidator);
