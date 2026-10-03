import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { isIsoAlpha2 } from 'src/impact/iso-countries';
import {
    HANDOVER_STATUSES,
    HandoverStatus,
    PARTNER_STATUSES,
    PartnerStatus,
    SHELTER_ROLES,
    ShelterRole,
} from 'src/shared-contracts/enums';
import { IUserWallets } from 'src/user/user.schema';

export { HANDOVER_STATUSES, PARTNER_STATUSES, SHELTER_ROLES };
export type { HandoverStatus, PartnerStatus, ShelterRole };

/** A lowercase-insensitive 0x EVM address check; the controller DTO normalises the checksum. */
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

@Schema({ timestamps: true })
export class Shelter extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    slug: string;

    /** Free text, kept for old clients. `countryCode` is the source of truth for counts (F7.7). */
    @Prop({ required: false })
    country: string;

    /** ISO 3166-1 alpha-2, uppercase (plan F7.7). */
    @Prop({
        required: false,
        uppercase: true,
        trim: true,
        validate: {
            validator: (v: unknown) => v == null || isIsoAlpha2(v),
            message: 'countryCode must be ISO alpha-2',
        },
    })
    countryCode?: string;

    /** Partner means `active` (plan 2.13 #25). */
    @Prop({ required: false, enum: PARTNER_STATUSES })
    partnerStatus?: PartnerStatus;

    /** A real partner shelter or a Token Tails house zone in the game (plan G13, #88). */
    @Prop({ required: false, enum: SHELTER_ROLES })
    role?: ShelterRole;

    /** Who holds the shelter's funds: green money tiers need `handed-over` (plan F7.2). */
    @Prop({ required: false, enum: HANDOVER_STATUSES })
    handoverStatus?: HandoverStatus;

    @Prop({ required: false, type: Date })
    handoverAt?: Date;

    /** The on-chain transaction that proves the handover, if any. */
    @Prop({ required: false, validate: { validator: (v: unknown) => v == null || TX_HASH.test(String(v)) } })
    handoverTx?: string;

    /** The shelter's public EVM payout wallet (ShelterSplit recipient). Never a key. */
    @Prop({ required: false, validate: { validator: (v: unknown) => v == null || EVM_ADDRESS.test(String(v)) } })
    publicWallet?: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: true })
    address: string;

    @Prop({ required: false })
    website: string;

    @Prop({ required: false })
    facebook: string;

    @Prop({ required: false })
    twitter: string;

    @Prop({ required: false })
    tiktok: string;

    @Prop({ required: true })
    foundedAt: Date;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    image: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Blessing' }] })
    blessing: Types.ObjectId[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
    users: Types.ObjectId[];

    /**
     * Shelter members who may confirm payouts (plan G4 "Attestation"). Granted only by an ADMIN via
     * PUT /shelter/:id/members; never in a public projection and not writable through ShelterWriteDto.
     */
    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: false, default: undefined })
    members?: Types.ObjectId[];

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    wallets: IUserWallets;
}

export type ShelterDocument = Shelter & Document;

export type IShelter = Pick<Shelter, keyof Shelter>;

export const ShelterSchema = SchemaFactory.createForClass(Shelter);
ShelterSchema.index({ name: 1 });
ShelterSchema.index({ partnerStatus: 1, countryCode: 1 });
ShelterSchema.index({ members: 1 }, { sparse: true });
ShelterSchema.plugin(uniqueValidator);
