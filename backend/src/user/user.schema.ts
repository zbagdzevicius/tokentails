import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';

export interface ISave {
    type: EntityType;
    entity: Types.ObjectId;
}

export interface ISaved {
    type: EntityType;
    entity: Types.ObjectId;
    isLiked: boolean;
}

export enum QUEST {
    FOLLOW_X = 'FOLLOW_X',
    FOLLOW_X_FOUNDER = 'FOLLOW_X_FOUNDER',
    FOLLOW_DISCORD = 'FOLLOW_DISCORD',
    FOLLOW_IG = 'FOLLOW_IG',
    FOLLOW_TIKTOK = 'FOLLOW_TIKTOK',
    FOLLOW_LINKEDIN = 'FOLLOW_LINKEDIN',
    REACH_TAILS_1k = 'REACH_TAILS_1k',
    REACH_TAILS_10k = 'REACH_TAILS_10k',
    REACH_TAILS_50k = 'REACH_TAILS_50k',
    REACH_TAILS_100k = 'REACH_TAILS_100k',
    INVITE_FRIENDS_10 = 'INVITE_FRIENDS_10',
    INVITE_FRIENDS_50 = 'INVITE_FRIENDS_35',
    INVITE_FRIENDS_100 = 'INVITE_FRIENDS_100',
    CATNIP_CHAOS_1 = 'CATNIP_CHAOS_1',
    CATNIP_CHAOS_2 = 'CATNIP_CHAOS_2',
    CATNIP_CHAOS_3 = 'CATNIP_CHAOS_3',
    CATNIP_CHAOS_4 = 'CATNIP_CHAOS_4',
    CATNIP_CHAOS_5 = 'CATNIP_CHAOS_5',
    CATNIP_CHAOS_6 = 'CATNIP_CHAOS_6',
    CATNIP_CHAOS_7 = 'CATNIP_CHAOS_7',
    CATNIP_CHAOS_8 = 'CATNIP_CHAOS_8',
    CATNIP_CHAOS_9 = 'CATNIP_CHAOS_9',
    CATNIP_CHAOS_10 = 'CATNIP_CHAOS_10',
    CATNIP_CHAOS_11 = 'CATNIP_CHAOS_11',
    CATNIP_CHAOS_12 = 'CATNIP_CHAOS_12',
    CATNIP_CHAOS_13 = 'CATNIP_CHAOS_13',
    CATNIP_CHAOS_14 = 'CATNIP_CHAOS_14',
    CATNIP_CHAOS_15 = 'CATNIP_CHAOS_15',
    CATNIP_CHAOS_16 = 'CATNIP_CHAOS_16',
    CATNIP_CHAOS_17 = 'CATNIP_CHAOS_17',
    CATNIP_CHAOS_18 = 'CATNIP_CHAOS_18',
    CATNIP_CHAOS_19 = 'CATNIP_CHAOS_19',
    CATNIP_CHAOS_20 = 'CATNIP_CHAOS_20',
    PIXEL_RESCUE_LEVEL = 'PIXEL_RESCUE_LEVEL',
}

export const QuestTypeReward: Record<
    QUEST,
    {
        tails?: number;
        requirements?: { tails?: number; referrals?: number };
        boxes?: number;
        cats?: string[];
    }
> = {
    [QUEST.FOLLOW_X]: { tails: 10 },
    [QUEST.FOLLOW_X_FOUNDER]: { tails: 50 },
    [QUEST.FOLLOW_DISCORD]: { tails: 10 },
    [QUEST.FOLLOW_IG]: { tails: 10 },
    [QUEST.FOLLOW_TIKTOK]: { tails: 10 },
    [QUEST.FOLLOW_LINKEDIN]: { tails: 10 },
    [QUEST.REACH_TAILS_1k]: { tails: 100, requirements: { tails: 1000 } },
    [QUEST.REACH_TAILS_10k]: { tails: 1000, requirements: { tails: 10000 } },
    [QUEST.REACH_TAILS_50k]: { tails: 5000, requirements: { tails: 50000 } },
    [QUEST.REACH_TAILS_100k]: { tails: 10000, requirements: { tails: 100000 } },
    [QUEST.INVITE_FRIENDS_10]: { tails: 100, requirements: { referrals: 10 } },
    [QUEST.INVITE_FRIENDS_50]: { tails: 500, requirements: { referrals: 50 } },
    [QUEST.INVITE_FRIENDS_100]: { tails: 1000, requirements: { referrals: 100 } },
    [QUEST.PIXEL_RESCUE_LEVEL]: { tails: 10000 },
    [QUEST.CATNIP_CHAOS_1]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_2]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_3]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_4]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_5]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_6]: { boxes: 1, cats: ['689485502d20b2a537804e65'] },
    [QUEST.CATNIP_CHAOS_7]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_8]: {
        boxes: 1,
        cats: ['68fe604fd7487b331d8c590d', '68fe63a5d7487b331d8c60f7', '68fe646ad7487b331d8c63de'],
    },
    [QUEST.CATNIP_CHAOS_9]: {
        boxes: 1,
        cats: ['6907a5c4db326c19979c13f1'],
    },
    [QUEST.CATNIP_CHAOS_10]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_11]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_12]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_13]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_14]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_15]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_16]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_17]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_18]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_19]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_20]: { boxes: 1 },
};

export interface IEncryptedMessage {
    iv: string;
    content: string;
}

export interface IWallet {
    walletAddress: string;
    walletPrivateKey: IEncryptedMessage;
}

export interface IUserWallets {
    stellar: IWallet;
}

export const GUEST_MERGE_STATES = ['started', 'gamesMoved', 'bestsMerged', 'done'] as const;
export type GuestMergeState = typeof GUEST_MERGE_STATES[number];

export const ONBOARDING_STATES = ['pending', 'done'] as const;
export type OnboardingState = typeof ONBOARDING_STATES[number];

/** Version of the Meet your cat flow written on new accounts. */
export const ONBOARDING_VERSION = 1;

export interface IOnboarding {
    state: OnboardingState;
    starterChosenAt?: Date;
    skipped?: boolean;
    version?: number;
}

export const FOLLOWING_LIMIT = 50;

@Schema({ timestamps: true })
export class User extends CommonSchema {
    @Prop({ required: true })
    name: string;

    // Lowercased and trimmed on every write (F5.1). Mongoose also lowercases query filters on this
    // path, so a lookup that must still find a legacy mixed-case email goes through
    // `UserService.findByEmail` (native driver, both spellings) until the backfill has run.
    @Prop({ required: false, lowercase: true, trim: true })
    email: string;

    // Firebase uids that sign in to this account (F5.1). Absent on legacy docs until they are bound
    // by a verified sign-in or the uid backfill. `default: undefined` keeps it absent, not [].
    // Unique (partial on `'firebaseUids.0': {$exists: true}`, so empty arrays never collide) only
    // after the duplicate audit: built by
    // migrations/tokentails/2026-10-01-identity-unique-indexes.js (logic versioned in
    // scripts/audit-duplicate-users.js), never by autoIndex.
    @Prop({ type: [String], required: false, default: undefined })
    firebaseUids?: string[];

    // Set from a verified token (email_verified, or a Google/Apple sign-in).
    @Prop({ required: false, type: Date })
    emailVerifiedAt?: Date;

    // Inbox the email delivers to (guest/canonical-email.ts: Gmail dots and +tags removed), for
    // abuse checks only (referrals, the guest Tails cap per person; 2a review finding #5). Written
    // with every email; legacy docs get it from scripts/backfill-identity-fields.js. Its partial
    // index (`email_canonical`) is built by the identity migration, never by autoIndex, and the
    // lookups by it run only once IDENTITY_BACKFILL_DONE=true.
    @Prop({ required: false, type: String })
    emailCanonical?: string;

    // Guest account (F5.2, G1). Written explicitly (false) on every new registered doc; legacy docs
    // get it from scripts/backfill-identity-fields.js. Guest docs have no email and no wallets.
    @Prop({ type: Boolean, required: false, default: false })
    isGuest?: boolean;

    // Guest economy (G1, decision #7). Guests earn into pendingTails; promotion or a merge credits
    // min(pendingTails, GUEST_TAILS_LIFETIME_CAP - guestMergedTails) as spendable Tails.
    @Prop({ required: false, type: Number })
    pendingTails?: number;

    @Prop({ required: false, type: Number })
    guestMergedTails?: number;

    // One guest merge per target account per 30 days (G1).
    @Prop({ required: false, type: Date })
    lastGuestMergeAt?: Date;

    // Guest docs already credited into this account: makes the merge's Tails credit exactly-once.
    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: false, default: undefined })
    mergedGuestIds?: Types.ObjectId[];

    // On a guest doc being merged: the target account and the resumable state (G1).
    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    mergedInto?: Types.ObjectId;

    @Prop({ type: String, required: false, enum: GUEST_MERGE_STATES })
    mergeState?: GuestMergeState;

    // When this account became a registered account: guest promotion, or first sign-in. The referral
    // window (decision #12) counts from here, or from createdAt for older accounts.
    @Prop({ required: false, type: Date })
    promotedAt?: Date;

    // One-shot: set with the promotion, cleared by the first GET /user/profile after it, which then
    // returns `promotedNow: true` (F5.2 step 1e), whichever request did the promotion.
    @Prop({ required: false, type: Boolean })
    promotionUnnotified?: boolean;

    // Set by the auth path at most once a day. Drives the guest idle cleanup (decision #11).
    @Prop({ required: false, type: Date })
    lastSeenAt?: Date;

    // Set only inside POST /user/catbassadors/live (G11, task 3b). Declared here.
    @Prop({ required: false, type: Date })
    lastPlayedAt?: Date;

    // Meet your cat (G3). A missing field means done, so legacy users never see the ceremony.
    // createUser and the manager POST /user/profile never write it.
    @Prop({ required: false, _id: false, type: Object })
    onboarding?: IOnboarding;

    // Up to FOLLOWING_LIMIT Blessing ids (G3).
    @Prop({
        type: [{ type: Types.ObjectId, ref: 'Blessing' }],
        required: false,
        default: undefined,
        validate: {
            validator: (value?: unknown[]) => !value || value.length <= FOLLOWING_LIMIT,
            message: `following holds at most ${FOLLOWING_LIMIT} blessings`,
        },
    })
    following?: Types.ObjectId[];

    // Account deletion (G9, decision #4): the record is anonymised, not removed, so Game rows,
    // orders and boards keep rendering.
    @Prop({ required: false, type: Date })
    deletedAt?: Date;

    @Prop({ required: false })
    twitter: string;

    @Prop({ required: false })
    discount: string;

    // HOW MUCH USER EARNED FROM AFFILIATE PROGRAM
    @Prop({ required: false, default: 0 })
    affiliated: number;

    @Prop({ required: false })
    discord: string;

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    wallets: IUserWallets;

    @Prop({ required: false, default: [] })
    quests: (QUEST | string)[];

    @Prop({ required: false, default: 0 })
    streak: number;

    // Spendable balance. Credits go through `earnTailsInc` (src/user/tails-ledger.ts), which also
    // moves `tailsEarned`; a give to a shelter goal takes from it (`giveTailsInc`).
    @Prop({ required: false, default: 0 })
    tails: number;

    // Ledger split (plan G5, decision #34). Lifetime earned, never decremented: every rank, tier and
    // threshold reads it. No default: absent on legacy docs until scripts/backfill-tails-earned.js;
    // read through `earnedTails()` until then.
    @Prop({ required: false, type: Number })
    tailsEarned?: number;

    // Lifetime Tails given to shelter goals, and the number of goals helped (the rescuers board).
    @Prop({ required: false, type: Number })
    tailsGiven?: number;

    @Prop({ required: false, type: Number })
    goalsHelped?: number;

    // Kept off every board (decision #35: flagged staking abuse, no clawback). Set only by
    // scripts/flag-board-exclusions.js --apply from the audit-staking.js rule; never by a route.
    @Prop({ required: false, type: Date })
    boardExcludedAt?: Date;

    @Prop({ required: false, type: String, enum: ['staking-abuse'] })
    boardExcludedReason?: 'staking-abuse';

    @Prop({ required: false, default: 0 })
    catnipCount: number;

    @Prop({ required: false, default: [] })
    catnipChaos: number[];

    @Prop({ required: false, default: 0 })
    catnipChaosCount: number;

    @Prop({ required: false, default: [] })
    seasonEvent: number[];

    @Prop({ required: false, default: 0 })
    seasonEventCount: number;

    @Prop({ required: false, default: [] })
    match3: number[];

    @Prop({ required: false, default: 0 })
    match3Count: number;

    @Prop({ required: false, default: [] })
    match3Score: number[];

    @Prop({ required: false, default: 0 })
    match3ScoreCount: number;

    // Cleared state per level (plan F6, G10, decision #67): 0/1, same indexes as the best arrays.
    // Set only by a `won` outcome on `/live` (never on INFINITE) and by the grandfathering migration.
    // No default: a missing array reads as all zeros and `/live` creates it before writing into it.
    @Prop({ type: [Number], required: false, default: undefined })
    catnipChaosCleared?: number[];

    @Prop({ type: [Number], required: false, default: undefined })
    seasonEventCleared?: number[];

    @Prop({ type: [Number], required: false, default: undefined })
    match3Cleared?: number[];

    // Catnip Heist (plan G2 layer 2): best server-verified score and stars bitmask (win 1, every coin
    // 2, clean and quick 4) per campaign level, index = HEIST_LEVELS. Written only by the replay
    // branch of `/live` (`$max` / `$bit or`). Never part of catnip, caps or loot eligibility (#14).
    @Prop({ type: [Number], required: false, default: undefined })
    heistScore?: number[];

    @Prop({ type: [Number], required: false, default: undefined })
    heistStars?: number[];

    @Prop({ required: false, default: 0 })
    monthPacks: number;

    @Prop({ required: false, default: 0 })
    boxes: number;

    @Prop({ required: false, default: 0 })
    spent: number;

    // Verified USD spend (G4, task 3c): written only at verified USD payment sites (src/web3/spend.ts).
    // No default, so "never paid since the change" stays distinguishable from 0.
    @Prop({ required: false, type: Number })
    spentUsd?: number;

    // 'legacy-estimate' once scripts/backfill-spent-usd.js --apply added the pre-change estimate.
    @Prop({ required: false, type: String, enum: ['verified', 'legacy-estimate'] })
    spentUsdSource?: 'verified' | 'legacy-estimate';

    @Prop({ required: false, type: Date })
    spentUsdLegacyAt?: Date;

    @Prop({ required: false, default: true })
    canRedeemLives: boolean;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    referrals: string[];

    @Prop({ required: false, default: 0 })
    referralsCount: number;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    referredBy: string;

    @Prop({ default: PERMISSION_LEVEL.USER })
    permission: PERMISSION_LEVEL;

    @Prop({
        _id: false,
        type: [
            {
                entity: { type: Types.ObjectId, required: true },
                type: { type: String, required: true },
            },
        ],
    })
    likes: ISave[];

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Shelter' })
    shelter?: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Cat' }], default: [] })
    cats?: Types.ObjectId[];

    @Prop({ required: false, type: Date })
    interactedAt?: Date;

    @Prop({ required: false, default: 0 })
    monthTails: number;
    @Prop({ required: false, default: 0 })
    monthCatsAdopted: number;
    @Prop({ required: false, default: 0 })
    monthBoxes: number;
    @Prop({ required: false, default: 0 })
    monthSpent: number;
    @Prop({ required: false, default: 0 })
    monthFeeded: number;
    @Prop({ required: false, default: 0 })
    monthStreak: number;
    @Prop({ required: false, default: 0 })
    monthReferrals: number;
    @Prop({ required: false, default: 0 })
    monthTailsCrafted: number;
    // This season's gives (plan G5); reset with the other month counters by the codex reset.
    @Prop({ required: false, default: 0 })
    monthTailsGiven: number;
    @Prop({ required: false, default: 0 })
    monthGoalsHelped: number;
    @Prop({ required: false, default: 0 })
    portraitPurchases: number;
    @Prop({ required: false, default: 0 })
    monthPortraitPurchases: number;
    @Prop({ required: false })
    codex: number[];
    @Prop({ required: false, default: [] })
    airdropRewardsClaimed: string[];
    @Prop({ required: false, default: [] })
    airdropChallengesClaimed: string[];
    @Prop({ required: false, default: [] })
    airdropMilestonesClaimed: string[];
}

export interface IMealPlan {
    date: Date | string;
    meals: Types.ObjectId[];
}

export type UserDocument = User & Document;

export type IUser = Pick<User, keyof User>;

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
// Multikey lookup index. The UNIQUE partial variant (`firebaseUids_unique`, and `email_unique` on
// `{email: {$type: 'string'}}`) is deliberately not declared here: autoIndex would try to build it on
// startup before the duplicate audit. migrations/tokentails/2026-10-01-identity-unique-indexes.js
// (a wrapper over buildIdentityIndexes in scripts/audit-duplicate-users.js) builds both after scripts/audit-duplicate-users.js reports zero duplicates (F5.3).
UserSchema.index({ firebaseUids: 1 });
UserSchema.index({ likes: 1 });
UserSchema.index({ shelter: 1 });
UserSchema.index({ cat: 1 });
UserSchema.index({ twitter: 1 });
UserSchema.index({ spent: 1 });
UserSchema.index({ discount: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ tails: 1 });
UserSchema.index({ catnipCount: 1 });
UserSchema.index({ canRedeemLives: 1 });
// Board indexes (F5.1, G1): partial on registered accounts, used once `notGuestFilter()` sends the
// strict `{isGuest: false}` (IDENTITY_BACKFILL_DONE=true, after the backfill). Non-unique, so
// autoIndex may build them.
UserSchema.index({ tails: -1 }, { name: 'board_tails', partialFilterExpression: { isGuest: false } });
UserSchema.index({ catnipCount: -1 }, { name: 'board_catnip', partialFilterExpression: { isGuest: false } });
// G5 boards: earned Tails (used once TAILS_EARNED_BACKFILL_DONE=true) and the rescuers board.
UserSchema.index({ tailsEarned: -1 }, { name: 'board_tails_earned', partialFilterExpression: { isGuest: false } });
UserSchema.index({ tailsGiven: -1 }, { name: 'board_tails_given', partialFilterExpression: { isGuest: false } });
UserSchema.index(
    { monthTailsGiven: -1 },
    { name: 'board_month_tails_given', partialFilterExpression: { isGuest: false } }
);
// Guest idle cleanup and merge resume (decision #11): only guest docs are indexed.
UserSchema.index({ lastSeenAt: 1 }, { name: 'guest_idle', partialFilterExpression: { isGuest: true } });
UserSchema.index({ mergedInto: 1 }, { name: 'guest_merge', partialFilterExpression: { isGuest: true } });
UserSchema.plugin(uniqueValidator);
