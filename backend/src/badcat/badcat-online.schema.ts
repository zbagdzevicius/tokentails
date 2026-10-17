import { Injectable } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Schema as MongooseSchema } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/*
 * Bad Cat Daily Phase 2 collections (GDD 10, 17.3): short links, the public room feed, web-push subscriptions and
 * streak-email opt-ins. No score lives here: ranked runs are `Game` rows written only by
 * the one score route (`/live` in the user module) (type BAD_CAT). Every route that writes these is behind its BADCAT_* flag.
 */

// ---------------------------------------------------------------------------------------------
// Short links (POST /badcat/link, GET /badcat/s/:id, GET /badcat/og/:id.png)
// ---------------------------------------------------------------------------------------------

export type BadcatLinkKind = 'dare' | 'room' | 'cat' | 'day' | 'other';

@Schema({ collection: 'badcatlinks', timestamps: true })
export class BadcatLink extends CommonSchema {
    /** Public id: 8 url-safe characters. */
    @Prop({ required: true, unique: true })
    slug: string;

    /** The long game path and query (`/badcat/d/18?g=...`), validated against the game's link routes. */
    @Prop({ required: true })
    path: string;

    /** sha256 of `path`: the same long link always gets the same short id. */
    @Prop({ required: true, unique: true })
    pathHash: string;

    @Prop({ required: true })
    kind: BadcatLinkKind;

    /** OG card text, filtered: "Mochi scored 8,420. Your cat can't." */
    @Prop()
    title?: string;

    @Prop()
    name?: string;

    @Prop()
    score?: number;

    @Prop()
    dayNo?: number;

    @Prop()
    catCode?: string;

    @Prop({ default: 0 })
    hits: number;

    @Prop()
    lastHitAt?: Date;
}
export type BadcatLinkDocument = BadcatLink & Document;
export const BadcatLinkSchema = SchemaFactory.createForClass(BadcatLink);

// ---------------------------------------------------------------------------------------------
// Room feed (POST /badcat/room, GET /badcat/feed)
// ---------------------------------------------------------------------------------------------

export type BadcatRoomStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

@Schema({ collection: 'badcatrooms', timestamps: true })
export class BadcatRoom extends CommonSchema {
    @Prop({ required: true, unique: true })
    slug: string;

    /** Room codec v2 payload (≤ 2,000 chars), checked by the vendored Room Maker rules. */
    @Prop({ required: true })
    code: string;

    /** CRC-32 of the gameplay part: one room publishes once (a re-publish returns the same slug). */
    @Prop({ required: true, unique: true })
    gameplayHash: number;

    @Prop({ required: true })
    title: string;

    @Prop()
    author?: string;

    @Prop({ required: true })
    shell: number;

    @Prop({ required: true })
    props: number;

    @Prop({ type: [String], default: [] })
    ancestors: string[];

    /** Listed in the public feed (the maker ticked "share to the feed"); otherwise a short link only. */
    @Prop({ default: false, index: true })
    feed: boolean;

    @Prop({ default: 'pending', index: true })
    status: BadcatRoomStatus;

    /** The maker's clear run, replayed on the server: targets wrecked. */
    @Prop({ default: 0 })
    clearTargets: number;

    @Prop({ default: 0, index: true })
    plays: number;

    @Prop({ default: 0 })
    reports: number;

    /** The publisher, when signed in (never shown). */
    @Prop({ type: MongooseSchema.Types.ObjectId })
    user?: unknown;

    @Prop()
    reviewedAt?: Date;
}
export type BadcatRoomDocument = BadcatRoom & Document;
export const BadcatRoomSchema = SchemaFactory.createForClass(BadcatRoom);
BadcatRoomSchema.index({ feed: 1, status: 1, createdAt: -1 }, { name: 'badcat_feed_new' });
BadcatRoomSchema.index({ feed: 1, status: 1, plays: -1 }, { name: 'badcat_feed_top' });

// ---------------------------------------------------------------------------------------------
// Web push (POST /badcat/push/subscribe) and streak emails (POST /badcat/account/streak-email)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatpushsubs', timestamps: true })
export class BadcatPushSub extends CommonSchema {
    /** The push service endpoint (https). Unique: one row per browser. */
    @Prop({ required: true, unique: true })
    endpoint: string;

    /** Base64url P-256 public key and auth secret from PushSubscription.toJSON().keys. */
    @Prop({ required: true })
    p256dh: string;

    @Prop({ required: true })
    auth: string;

    /** The UTC hour (0..23) to remind at: the player's chosen local hour minus their offset. */
    @Prop({ required: true, index: true })
    utcHour: number;

    /** Last day number reminded (one a day). */
    @Prop()
    lastDay?: number;

    @Prop({ default: 0 })
    failures: number;
}
export type BadcatPushSubDocument = BadcatPushSub & Document;
export const BadcatPushSubSchema = SchemaFactory.createForClass(BadcatPushSub);

@Schema({ collection: 'badcatstreakemails', timestamps: true })
export class BadcatStreakEmail extends CommonSchema {
    /** The account (a verified email is required to opt in). */
    @Prop({ type: MongooseSchema.Types.ObjectId, required: true, unique: true })
    user: unknown;

    @Prop({ required: true })
    email: string;

    @Prop({ default: true, index: true })
    on: boolean;

    /** Last day number a reminder went out. */
    @Prop()
    lastDay?: number;
}
export type BadcatStreakEmailDocument = BadcatStreakEmail & Document;
export const BadcatStreakEmailSchema = SchemaFactory.createForClass(BadcatStreakEmail);

export const BADCAT_ONLINE_SCHEMAS = [
    { name: BadcatLink.name, schema: BadcatLinkSchema },
    { name: BadcatRoom.name, schema: BadcatRoomSchema },
    { name: BadcatPushSub.name, schema: BadcatPushSubSchema },
    { name: BadcatStreakEmail.name, schema: BadcatStreakEmailSchema },
];

@Injectable()
export class BadcatOnlineStore {
    constructor(
        @InjectModel(BadcatLink.name) readonly links: Model<BadcatLinkDocument>,
        @InjectModel(BadcatRoom.name) readonly rooms: Model<BadcatRoomDocument>,
        @InjectModel(BadcatPushSub.name) readonly pushSubs: Model<BadcatPushSubDocument>,
        @InjectModel(BadcatStreakEmail.name) readonly streakEmails: Model<BadcatStreakEmailDocument>
    ) {}
}
