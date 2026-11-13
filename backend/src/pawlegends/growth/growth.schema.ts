import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/*
 * Paw Legends growth collections (growth.rules.ts). Cosmetic and attribution data only: nothing here is a score, and
 * the one match-derived counter (an invite's verified matches) is written only inside the `/live` save
 * (`applyInviteProgress`).
 */

/** Each registered account's own invite code (made on first read). */
@Schema({ collection: 'pawlegendsreferralcodes', timestamps: true })
export class PawlegendsReferralCode extends CommonSchema {
    @Prop({ required: true, unique: true })
    accountId: string;

    @Prop({ required: true, unique: true })
    code: string;
}
export type PawlegendsReferralCodeDocument = PawlegendsReferralCode & Document;
export const PawlegendsReferralCodeSchema = SchemaFactory.createForClass(PawlegendsReferralCode);

export type PawlegendsReferralStatus = 'pending' | 'done' | 'expired';

/**
 * One accepted invite: an account is invited once, ever (unique `inviteeId`), and a device accepts one invite (unique
 * sparse `deviceId`). `matches`/`refs` are written only by the `/live` save; `inviterClaimed`/`inviteeClaimed` only by
 * the claim route.
 */
@Schema({ collection: 'pawlegendsreferrals', timestamps: true })
export class PawlegendsReferral extends CommonSchema {
    @Prop({ required: true, unique: true })
    inviteeId: string;

    @Prop({ required: true, index: true })
    inviterId: string;

    @Prop({ required: true })
    code: string;

    /** 'new' (a first-time player) or 'comeback' (back after 21+ days). */
    @Prop({ required: true })
    kind: string;

    @Prop({ unique: true, sparse: true })
    deviceId?: string;

    @Prop({ required: true, default: 'pending', index: true })
    status: PawlegendsReferralStatus;

    /** Verified matches the invitee finished since accepting (INVITE_MATCHES needed). */
    @Prop({ required: true, default: 0 })
    matches: number;

    /** The saves that counted (replay digests), so a save is never counted twice. */
    @Prop({ type: [String], default: [] })
    refs: string[];

    @Prop({ required: true })
    expiresAt: Date;

    @Prop()
    doneAt?: Date;

    @Prop()
    inviterClaimed?: boolean;

    @Prop()
    inviteeClaimed?: boolean;

    /** The coats the claims gave (null: the player already owned every invite coat). */
    @Prop()
    inviterCoat?: string;

    @Prop()
    inviteeCoat?: string;
}
export type PawlegendsReferralDocument = PawlegendsReferral & Document;
export const PawlegendsReferralSchema = SchemaFactory.createForClass(PawlegendsReferral);
PawlegendsReferralSchema.index({ inviterId: 1, status: 1 });

/** A creator in the program (admin routes create them). */
@Schema({ collection: 'pawlegendscreators', timestamps: true })
export class PawlegendsCreator extends CommonSchema {
    @Prop({ required: true, unique: true })
    code: string;

    /** The public name shown at checkout ("Supporting <name>"). */
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, default: true })
    active: boolean;

    /** The creator's share of each attributed order, in basis points. */
    @Prop({ required: true })
    shareBps: number;
}
export type PawlegendsCreatorDocument = PawlegendsCreator & Document;
export const PawlegendsCreatorSchema = SchemaFactory.createForClass(PawlegendsCreator);

/** The creator code an account entered last, applied to its purchases for CREATOR_LINK_DAYS. */
@Schema({ collection: 'pawlegendscreatorlinks', timestamps: true })
export class PawlegendsCreatorLink extends CommonSchema {
    @Prop({ required: true, unique: true })
    accountId: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true })
    setAt: Date;
}
export type PawlegendsCreatorLinkDocument = PawlegendsCreatorLink & Document;
export const PawlegendsCreatorLinkSchema = SchemaFactory.createForClass(PawlegendsCreatorLink);

/** The first-purchase gift: one row per account, ever (the unique index is the "once"). */
@Schema({ collection: 'pawlegendsfirstgifts', timestamps: true })
export class PawlegendsFirstGift extends CommonSchema {
    @Prop({ required: true, unique: true })
    accountId: string;

    @Prop({ required: true })
    coat: string;

    /** The paid Checkout Session that earned it (a refund of that session revokes the coat with it). */
    @Prop({ required: true })
    sessionId: string;
}
export type PawlegendsFirstGiftDocument = PawlegendsFirstGift & Document;
export const PawlegendsFirstGiftSchema = SchemaFactory.createForClass(PawlegendsFirstGift);

export const PAWLEGENDS_GROWTH_SCHEMAS = [
    { name: PawlegendsReferralCode.name, schema: PawlegendsReferralCodeSchema },
    { name: PawlegendsReferral.name, schema: PawlegendsReferralSchema },
    { name: PawlegendsCreator.name, schema: PawlegendsCreatorSchema },
    { name: PawlegendsCreatorLink.name, schema: PawlegendsCreatorLinkSchema },
    { name: PawlegendsFirstGift.name, schema: PawlegendsFirstGiftSchema },
];
