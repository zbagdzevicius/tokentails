import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PAWLEGENDS_CHAT_SCHEMAS } from './chat.schema';
import { REPORT_STATUSES, SANCTION_KINDS, STORED_REPORT_REASONS } from './report.contracts';

/*
 * Social, presence, boards, reports and sanctions (docs/plans/moba/SOCIAL-RANKED.md §11). None of these is a score:
 * board rows are written only by `/live` (pawlegends-party-live.ts, `one-writer` checks in social-no-write.spec.ts).
 * Names are never stored: they are derived at read time (`display-name.ts`). No IP and no email is stored anywhere here.
 */

@Schema({ collection: 'pawlegendssocial', versionKey: false })
export class PawlegendsSocial {
    /** The account id. */
    @Prop({ type: String, required: true })
    _id: string;

    /** 8 Crockford base32 characters; shown as PL-XXXX-XXXX. */
    @Prop({ type: String, required: true, unique: true })
    code: string;

    /** `{kind: 'generated'}` or `{kind: 'cat', catId}` (one of the player's own cats). Never free text. */
    @Prop({ type: Object, default: { kind: 'generated' } })
    name: { kind: 'generated' } | { kind: 'cat'; catId: string };

    @Prop({ default: false })
    invisible: boolean;

    @Prop({ default: true })
    allowRecent: boolean;

    /** Bumped on any change a friend's list or a request touches (the pulse compares sums). */
    @Prop({ default: 0 })
    rev: number;

    /** Code rotations: the UTC day and the count that day. */
    @Prop({ type: Object, default: null })
    rotations: { day: string; n: number } | null;

    @Prop({ type: Date, required: true })
    createdAt: Date;

    /**
     * The avatar icon (CHAT-AVATARS.md §7): a hero, one of the player's own cats, or an owned icon. Checked on write and
     * again at read time (avatar.ts); absent means the default hero.
     */
    @Prop({ type: Object, default: undefined })
    avatar?: { kind: 'hero'; hero: string } | { kind: 'cat'; catId: string } | { kind: 'icon'; icon: string };

    /** An owned frame id (`frame.*`), shown as the avatar border. */
    @Prop({ type: String, default: null })
    frame?: string | null;

    /** An owned title id (`title.*`). */
    @Prop({ type: String, default: null })
    title?: string | null;

    /** 'off': nobody can DM this player (party chat still works). */
    @Prop({ type: String, enum: ['friends', 'off'], default: 'friends' })
    dmPolicy?: 'friends' | 'off';

    /** Text chat paused until (5 filter rejections in 10 minutes); phrases still work. */
    @Prop({ type: Date, default: null })
    chatCooldownUntil?: Date | null;

    /** Filter rejections today (UTC day); 20 raise CMS flag F6. */
    @Prop({ type: Object, default: null })
    chatStrikes?: { day: string; n: number } | null;
}
export const PawlegendsSocialSchema = SchemaFactory.createForClass(PawlegendsSocial);

@Schema({ collection: 'pawlegendsfriends', versionKey: false })
export class PawlegendsFriend {
    /** `${min(a,b)}:${max(a,b)}`. */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true })
    a: string;

    @Prop({ required: true })
    b: string;

    /** The requester. */
    @Prop({ required: true })
    from: string;

    @Prop({ type: String, required: true, enum: ['pending', 'accepted'] })
    state: 'pending' | 'accepted';

    @Prop({ type: String, required: true, enum: ['code', 'recent', 'party'] })
    via: 'code' | 'recent' | 'party';

    @Prop({ type: Date, required: true })
    createdAt: Date;

    @Prop({ type: Date, default: null })
    acceptedAt: Date | null;

    /** Pending requests expire (TTL); unset on accept. */
    @Prop({ type: Date, default: undefined })
    pendingExpireAt?: Date;
}
export const PawlegendsFriendSchema = SchemaFactory.createForClass(PawlegendsFriend);
PawlegendsFriendSchema.index({ a: 1, state: 1 });
PawlegendsFriendSchema.index({ b: 1, state: 1 });
PawlegendsFriendSchema.index({ from: 1, createdAt: -1 });
PawlegendsFriendSchema.index({ pendingExpireAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'pawlegendsblocks', versionKey: false })
export class PawlegendsBlock {
    /** `${blocker}:${blocked}`. */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, index: true })
    blocker: string;

    @Prop({ required: true, index: true })
    blocked: string;

    @Prop({ type: Date, required: true })
    createdAt: Date;
}
export const PawlegendsBlockSchema = SchemaFactory.createForClass(PawlegendsBlock);

@Schema({ collection: 'pawlegendspresence', versionKey: false })
export class PawlegendsPresence {
    /** The account id (registered accounts only). */
    @Prop({ type: String, required: true })
    _id: string;

    /** Written by the relay's PresenceSink. */
    @Prop({ type: Object, default: undefined })
    relay?: { state: 'party' | 'queue' | 'match'; party?: string; joinable?: boolean; mode?: string; at: Date };

    /** Written by the API pulse. */
    @Prop({ type: Object, default: undefined })
    api?: { at: Date };

    /** 1: ranked-eligible (the liquidity count). */
    @Prop({ default: 0 })
    rk: number;

    @Prop({ type: Date, required: true })
    exp: Date;
}
export const PawlegendsPresenceSchema = SchemaFactory.createForClass(PawlegendsPresence);
PawlegendsPresenceSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });
PawlegendsPresenceSchema.index({ rk: 1, exp: 1 });

@Schema({ collection: 'pawlegendsinvites', versionKey: false })
export class PawlegendsInvite {
    @Prop({ required: true })
    from: string;

    @Prop({ required: true })
    to: string;

    /** The party code (shown to the invited friend only). */
    @Prop({ required: true })
    party: string;

    @Prop({ type: Date, required: true })
    exp: Date;

    @Prop({ type: Date, required: true })
    createdAt: Date;
}
export const PawlegendsInviteSchema = SchemaFactory.createForClass(PawlegendsInvite);
PawlegendsInviteSchema.index({ to: 1, exp: 1 });
PawlegendsInviteSchema.index({ from: 1, createdAt: -1 });
PawlegendsInviteSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'pawlegendsreports', versionKey: false })
export class PawlegendsReport {
    @Prop({ required: true })
    room: string;

    @Prop({ required: true })
    queue: string;

    /** Never returned by any route. */
    @Prop({ required: true })
    reporter: string;

    @Prop({ required: true })
    target: string;

    /** The reporter was a guest account (tighter caps). */
    @Prop({ default: false })
    guest: boolean;

    @Prop({ type: String, required: true, enum: STORED_REPORT_REASONS })
    reason: string;

    /** Chat reports: the sub-reason (harass, sexual, contact, spam, other). */
    @Prop({ type: String, default: undefined })
    chatKind?: string;

    /**
     * Chat reports: the reported message and up to 6 earlier lines of its thread, copied so the 30-day chat TTL cannot
     * delete the evidence (`{thread, kind, from, k, text?, id?, at, context[]}`). Moderators only.
     */
    @Prop({ type: Object, default: undefined })
    snapshot?: Record<string, unknown>;

    /** Moderators only; 16+ bands only; at most 140 characters. */
    @Prop({ type: String, default: undefined, maxlength: 140 })
    note?: string;

    @Prop({ type: Number, default: undefined })
    tick?: number;

    @Prop({ type: String, required: true, enum: REPORT_STATUSES, default: 'open' })
    status: string;

    @Prop({ type: Date, required: true })
    createdAt: Date;

    @Prop({ type: Date, required: true })
    expireAt: Date;
}
export const PawlegendsReportSchema = SchemaFactory.createForClass(PawlegendsReport);
PawlegendsReportSchema.index({ room: 1, reporter: 1, target: 1 }, { unique: true });
PawlegendsReportSchema.index({ target: 1, createdAt: -1 });
PawlegendsReportSchema.index({ status: 1, createdAt: -1 });
PawlegendsReportSchema.index({ reporter: 1, createdAt: -1 });
PawlegendsReportSchema.index({ room: 1 });
PawlegendsReportSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'pawlegendssanctions', versionKey: false })
export class PawlegendsSanction {
    @Prop({ required: true })
    accountId: string;

    @Prop({ type: String, required: true, enum: SANCTION_KINDS })
    kind: string;

    /** Absent: permanent (pvp_ban, board_exclude) or a one-off (warn). */
    @Prop({ type: Date, default: null })
    until: Date | null;

    /** The moderator's account id. */
    @Prop({ required: true })
    by: string;

    @Prop({ required: true })
    reasonCode: string;

    @Prop({ type: [String], default: [] })
    reports: string[];

    /** A warn is shown once; set when the game has shown it. */
    @Prop({ type: Date, default: null })
    seenAt: Date | null;

    @Prop({ type: Date, required: true })
    createdAt: Date;
}
export const PawlegendsSanctionSchema = SchemaFactory.createForClass(PawlegendsSanction);
PawlegendsSanctionSchema.index({ accountId: 1, until: -1 });

@Schema({ collection: 'pawlegendsboards', versionKey: false })
export class PawlegendsBoard {
    /** `w:${isoWeek}:${acc}` or `h:${season}:${hero}:${acc}`. */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, required: true, enum: ['w', 'h'] })
    kind: 'w' | 'h';

    /** The ISO week (`2026-W46`) or the season id. */
    @Prop({ required: true })
    period: string;

    @Prop({ type: String, default: undefined })
    hero?: string;

    @Prop({ required: true })
    acc: string;

    @Prop({ default: 0 })
    wins: number;

    @Prop({ default: 0 })
    games: number;

    /** Weekly: wins counted per UTC day (the 25 a day anti-farm cap). */
    @Prop({ type: Object, default: undefined })
    days?: Record<string, number>;

    /** The last rooms applied (idempotency next to the Game digest). */
    @Prop({ type: [String], default: [] })
    rooms: string[];

    @Prop({ type: Date, required: true })
    firstAt: Date;

    @Prop({ type: Date, required: true })
    expireAt: Date;
}
export const PawlegendsBoardSchema = SchemaFactory.createForClass(PawlegendsBoard);
PawlegendsBoardSchema.index({ kind: 1, period: 1, wins: -1, games: 1, _id: 1 });
PawlegendsBoardSchema.index({ kind: 1, period: 1, hero: 1, wins: -1, games: 1, _id: 1 });
PawlegendsBoardSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'pawlegendsstatus', versionKey: false })
export class PawlegendsStatus {
    /** 'ranked'. */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ default: false })
    open: boolean;

    @Prop({ default: 0 })
    online: number;

    @Prop({ default: 0 })
    need: number;

    /** When the state last changed, and when the count first fell below the close line (null above it). */
    @Prop({ type: Date, default: null })
    since: Date | null;

    @Prop({ type: Date, default: null })
    lowSince: Date | null;

    @Prop({ type: Date, default: null })
    at: Date | null;
}
export const PawlegendsStatusSchema = SchemaFactory.createForClass(PawlegendsStatus);

/** Every schema of this feature (AppModule). The relay role registers only presence and status (relay.module.ts). */
export const PAWLEGENDS_SOCIAL_SCHEMAS = [
    { name: PawlegendsSocial.name, schema: PawlegendsSocialSchema },
    { name: PawlegendsFriend.name, schema: PawlegendsFriendSchema },
    { name: PawlegendsBlock.name, schema: PawlegendsBlockSchema },
    { name: PawlegendsPresence.name, schema: PawlegendsPresenceSchema },
    { name: PawlegendsInvite.name, schema: PawlegendsInviteSchema },
    { name: PawlegendsReport.name, schema: PawlegendsReportSchema },
    { name: PawlegendsSanction.name, schema: PawlegendsSanctionSchema },
    { name: PawlegendsBoard.name, schema: PawlegendsBoardSchema },
    { name: PawlegendsStatus.name, schema: PawlegendsStatusSchema },
    ...PAWLEGENDS_CHAT_SCHEMAS,
];

export const PAWLEGENDS_RELAY_SOCIAL_SCHEMAS = [
    { name: PawlegendsPresence.name, schema: PawlegendsPresenceSchema },
    { name: PawlegendsStatus.name, schema: PawlegendsStatusSchema },
    { name: PawlegendsSanction.name, schema: PawlegendsSanctionSchema },
    // friends chat (CHAT-AVATARS.md §5): the profile (avatar, cooldown) and blocks are read; party lines are written
    { name: PawlegendsSocial.name, schema: PawlegendsSocialSchema },
    { name: PawlegendsBlock.name, schema: PawlegendsBlockSchema },
    ...PAWLEGENDS_CHAT_SCHEMAS,
];
