import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/*
 * Clubs and kudos (docs/plans/moba/CLUBS-KUDOS.md). Account ids are stored, never shown: clients see a club code, a
 * derived club name, display names and an opaque per-club member id. No free text is stored here (club chat lines live
 * in the chat collections, filtered and age-tiered like every other thread).
 */

export const CLUBS_COLLECTION = 'pawlegendsclubs';
export const CLUB_MEMBERS_COLLECTION = 'pawlegendsclubmembers';
export const CLUB_WEEKS_COLLECTION = 'pawlegendsclubweeks';
export const CLUB_WINS_COLLECTION = 'pawlegendsclubwins';
export const CLUB_CLAIMS_COLLECTION = 'pawlegendsclubclaims';
export const KUDOS_COLLECTION = 'pawlegendskudos';
export const KUDOS_MONTHS_COLLECTION = 'pawlegendskudosmonths';

@Schema({ collection: CLUBS_COLLECTION, versionKey: false })
export class PawlegendsClub {
    /** Random 24-hex id (never shown). */
    @Prop({ type: String, required: true })
    _id: string;

    /** The 6-character join code (shown as `CL-XXXXXX`). */
    @Prop({ type: String, required: true })
    code: string;

    /** The two name-list positions (clubs.contracts.ts CLUB_NAME_FIRST / CLUB_NAME_SECOND). */
    @Prop({ type: [Number], required: true })
    name: number[];

    @Prop({ type: String, required: true })
    owner: string;

    /** Members now (the 30 cap is one conditional `$inc`). */
    @Prop({ type: Number, required: true, default: 0 })
    size: number;

    /** The club chat thread (chat-ids.ts clubThreadId). */
    @Prop({ type: String, required: true })
    thread: string;

    /** Accounts the owner removed: they cannot join this club again. */
    @Prop({ type: [String], default: [] })
    banned: string[];

    @Prop({ type: Date, required: true })
    createdAt: Date;
}
export const PawlegendsClubSchema = SchemaFactory.createForClass(PawlegendsClub);
PawlegendsClubSchema.index({ code: 1 }, { unique: true });
PawlegendsClubSchema.index({ owner: 1, createdAt: -1 });

/** One row per account (`_id` = account id): one club at a time. */
@Schema({ collection: CLUB_MEMBERS_COLLECTION, versionKey: false })
export class PawlegendsClubMember {
    @Prop({ type: String, required: true })
    _id: string;

    /** The club now; '' after a leave (the row stays for the rejoin cooldown). */
    @Prop({ type: String, default: '' })
    club: string;

    @Prop({ type: Date, default: null })
    joinedAt: Date | null;

    @Prop({ type: Date, default: null })
    leftAt: Date | null;
}
export const PawlegendsClubMemberSchema = SchemaFactory.createForClass(PawlegendsClubMember);
PawlegendsClubMemberSchema.index({ club: 1, joinedAt: 1 });

/** The weekly chest of one club: `_id` = `<club>:<isoWeek>`. Written only by `/live` (applyClubChest). */
@Schema({ collection: CLUB_WEEKS_COLLECTION, versionKey: false })
export class PawlegendsClubWeek {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, required: true })
    club: string;

    @Prop({ type: String, required: true })
    week: string;

    @Prop({ type: Number, default: 0 })
    wins: number;

    /** Wins each member added this week (account id → n), for the member list. */
    @Prop({ type: Object, default: {} })
    by: Record<string, number>;

    /** 35 days after the week started (TTL). */
    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsClubWeekSchema = SchemaFactory.createForClass(PawlegendsClubWeek);
PawlegendsClubWeekSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

/** One counted win: `_id` = `<room>:<account>` (a save counts once, whatever retries). Written only by `/live`. */
@Schema({ collection: CLUB_WINS_COLLECTION, versionKey: false })
export class PawlegendsClubWin {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, required: true })
    acc: string;

    @Prop({ type: String, required: true })
    club: string;

    /** UTC day `YYYY-MM-DD` (the per-member daily cap). */
    @Prop({ type: String, required: true })
    day: string;

    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsClubWinSchema = SchemaFactory.createForClass(PawlegendsClubWin);
PawlegendsClubWinSchema.index({ acc: 1, day: 1 });
PawlegendsClubWinSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

/** The chest tiers one account took in one week, whatever club: `_id` = `<account>:<isoWeek>`. */
@Schema({ collection: CLUB_CLAIMS_COLLECTION, versionKey: false })
export class PawlegendsClubClaim {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: [Number], default: [] })
    tiers: number[];

    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsClubClaimSchema = SchemaFactory.createForClass(PawlegendsClubClaim);
PawlegendsClubClaimSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

/** One thumbs-up: `_id` = `<room>:<from>:<to>` (once per teammate per match). */
@Schema({ collection: KUDOS_COLLECTION, versionKey: false })
export class PawlegendsKudos {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, required: true })
    from: string;

    @Prop({ type: String, required: true })
    to: string;

    @Prop({ type: Date, required: true })
    at: Date;

    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsKudosSchema = SchemaFactory.createForClass(PawlegendsKudos);
PawlegendsKudosSchema.index({ from: 1, at: -1 });
PawlegendsKudosSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

/** Thumbs-ups received in a month and the chest tiers paid: `_id` = `<account>:<YYYY-MM>`. */
@Schema({ collection: KUDOS_MONTHS_COLLECTION, versionKey: false })
export class PawlegendsKudosMonth {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: Number, default: 0 })
    n: number;

    @Prop({ type: [Number], default: [] })
    paid: number[];

    /** What each paid tier gave (an item id or `yarn:<n>`), for the card. */
    @Prop({ type: [String], default: [] })
    got: string[];

    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsKudosMonthSchema = SchemaFactory.createForClass(PawlegendsKudosMonth);
PawlegendsKudosMonthSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

export const PAWLEGENDS_CLUB_SCHEMAS = [
    { name: PawlegendsClub.name, schema: PawlegendsClubSchema },
    { name: PawlegendsClubMember.name, schema: PawlegendsClubMemberSchema },
    { name: PawlegendsClubWeek.name, schema: PawlegendsClubWeekSchema },
    { name: PawlegendsClubWin.name, schema: PawlegendsClubWinSchema },
    { name: PawlegendsClubClaim.name, schema: PawlegendsClubClaimSchema },
    { name: PawlegendsKudos.name, schema: PawlegendsKudosSchema },
    { name: PawlegendsKudosMonth.name, schema: PawlegendsKudosMonthSchema },
];
