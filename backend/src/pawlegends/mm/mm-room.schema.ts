import { Injectable, Optional } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import type { Model } from 'mongoose';
import type { Glicko } from './glicko2';
import type { MemberIntel } from '../social/intel';

/*
 * The Quick Play room record (docs/plans/moba/M1A-IMPL.md §4.3): a small collection keyed by the room id, kept apart
 * from `party/room-store.ts` on purpose. Written by the relay glue (mm-bridge.ts: room records are the relay's to
 * write); read by `/live` (the hidden rating update) and by the leaver ladder (leaver.ts). Never a score. No IP is ever
 * stored: `identityHash` is sha256 of the identity key (account or guest key), never of an address.
 */

export interface MmRoomMember {
    slot: number;
    identityHash: string;
    accountId: string | null;
    /** The tick the member took the seat (0 at the start; later for a backfill). */
    joinedTick: number;
    backfill: boolean;
    ratingAtStart: Glicko | null;
    event?: 'left' | 'afk';
    eventTick?: number;
    /** PvP: the referee's "acts on hidden" counts (SOCIAL-RANKED.md §9.2); absent on sims without `heroSight`. */
    intel?: MemberIntel | null;
}

/** Casual PvP: one team of a room record (V16.md §4.4). */
export interface MmRoomTeam {
    species: 'cat' | 'dog';
    /** Human slots at the start. */
    slots: number[];
    /** The bot profile of the team's fill seats. */
    difficulty: string;
    /** The team's human mean rating at the start. */
    rating: number;
}

export interface MmRoomRecord {
    _id: string;
    queue: 'coop' | 'casual' | 'classic';
    /** Casual PvP: both teams (team 0 on the left), and why the room was voided (a remake: no rating, no catnip). */
    mode?: 'casual';
    /** 5v5 Classic (queue 'classic'): Hearthwood Divide, five seats a team. Absent: Crossing. */
    map?: 'hearthwood';
    teams?: MmRoomTeam[];
    void?: 'remake' | null;
    region: string;
    side: 'cat' | 'dog';
    difficulty: string;
    sim: string;
    /** Bot-filled teammate slots. */
    fill: number[];
    /** How long each human waited in the queue, by slot (the done measures). */
    queueMs: Record<string, number>;
    members: MmRoomMember[];
    outcome?: 'won' | 'lost' | null;
    endedAt?: Date | null;
    createdAt: Date;
}

export interface MmRoomStore {
    create(rec: MmRoomRecord): Promise<void>;
    get(id: string): Promise<MmRoomRecord | null>;
    /** A backfiller took a seat. */
    addMember(id: string, member: MmRoomMember): Promise<void>;
    /** The room ended: its events and outcome (team 0's view), or voided by a remake. */
    finish(
        id: string,
        members: MmRoomMember[],
        outcome: 'won' | 'lost' | null,
        endedAt: Date,
        voided?: 'remake' | null
    ): Promise<void>;
    /** The mm rooms of an identity since `since`, oldest first (the leaver ladder). */
    recentFor(identityHash: string, since: Date): Promise<MmRoomRecord[]>;
}

/** sha256 of an identity key (`acct:…` or `guest:…`); never called with an IP. */
export const identityHash = (key: string): string => createHash('sha256').update(`mm:${key}`).digest('hex');

const clone = <T>(x: T): T =>
    JSON.parse(JSON.stringify(x), (k, v) =>
        (k === 'endedAt' || k === 'createdAt') && typeof v === 'string' ? new Date(v) : v
    );

/** In memory (specs, the e2e harness, a relay built without Nest). */
export class MemoryMmRoomStore implements MmRoomStore {
    readonly rooms = new Map<string, MmRoomRecord>();

    async create(rec: MmRoomRecord): Promise<void> {
        this.rooms.set(rec._id, clone(rec));
    }

    async get(id: string): Promise<MmRoomRecord | null> {
        const r = this.rooms.get(id);
        return r ? clone(r) : null;
    }

    async addMember(id: string, member: MmRoomMember): Promise<void> {
        this.rooms.get(id)?.members.push(clone(member));
    }

    async finish(
        id: string,
        members: MmRoomMember[],
        outcome: 'won' | 'lost' | null,
        endedAt: Date,
        voided?: 'remake' | null
    ): Promise<void> {
        const r = this.rooms.get(id);
        if (!r) return;
        r.members = clone(members);
        r.outcome = outcome;
        r.endedAt = endedAt;
        if (voided) r.void = voided;
    }

    async recentFor(hash: string, since: Date): Promise<MmRoomRecord[]> {
        return [...this.rooms.values()]
            .filter(r => r.createdAt.getTime() >= since.getTime() && r.members.some(m => m.identityHash === hash))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(clone);
    }
}

@Schema({ collection: 'pawlegendsmmrooms' })
export class PawlegendsMmRoom {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, default: 'coop' })
    queue: string;

    /** Casual PvP: 'casual' (absent for co-op). */
    @Prop({ type: String, default: null })
    mode: string | null;

    @Prop({ type: [Object], default: undefined })
    teams?: MmRoomTeam[];

    /** 5v5 Classic: 'hearthwood' (absent for Crossing rooms). */
    @Prop({ type: String, default: undefined })
    map?: string;

    /** A remake voided the room (V16.md §4.2). */
    @Prop({ type: String, default: null })
    void: string | null;

    @Prop({ required: true })
    region: string;

    @Prop({ required: true })
    side: string;

    @Prop({ required: true })
    difficulty: string;

    @Prop({ required: true })
    sim: string;

    @Prop({ type: [Number], default: [] })
    fill: number[];

    @Prop({ type: Object, default: {} })
    queueMs: Record<string, number>;

    @Prop({ type: [Object], default: [] })
    members: MmRoomMember[];

    @Prop({ type: String, default: null })
    outcome: string | null;

    @Prop({ type: Date, default: null })
    endedAt: Date | null;

    @Prop({ type: Date, required: true })
    createdAt: Date;
}
export const PawlegendsMmRoomSchema = SchemaFactory.createForClass(PawlegendsMmRoom);
PawlegendsMmRoomSchema.index({ 'members.identityHash': 1, createdAt: -1 });
PawlegendsMmRoomSchema.index({ 'members.accountId': 1 });
// the leaver ladder and the PvP dodge reads by occupant (V16.md §4.4)
PawlegendsMmRoomSchema.index({ 'members.accountId': 1, createdAt: -1 });
PawlegendsMmRoomSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

@Injectable()
export class MongoMmRoomStore implements MmRoomStore {
    constructor(@Optional() @InjectModel(PawlegendsMmRoom.name) private readonly model?: Model<PawlegendsMmRoom>) {}

    private get m(): Model<PawlegendsMmRoom> {
        if (!this.model) throw new Error('PawlegendsMmRoom model missing');
        return this.model;
    }

    async create(rec: MmRoomRecord): Promise<void> {
        await this.m.create(rec as any);
    }

    async get(id: string): Promise<MmRoomRecord | null> {
        return (await this.m.findById(id).lean()) as unknown as MmRoomRecord | null;
    }

    async addMember(id: string, member: MmRoomMember): Promise<void> {
        await this.m.updateOne({ _id: id }, { $push: { members: member } });
    }

    async finish(
        id: string,
        members: MmRoomMember[],
        outcome: 'won' | 'lost' | null,
        endedAt: Date,
        voided?: 'remake' | null
    ): Promise<void> {
        await this.m.updateOne(
            { _id: id },
            { $set: { members, outcome, endedAt, ...(voided ? { void: voided } : {}) } }
        );
    }

    async recentFor(hash: string, since: Date): Promise<MmRoomRecord[]> {
        return (await this.m
            .find({ 'members.identityHash': hash, createdAt: { $gte: since } })
            .sort({ createdAt: 1 })
            .limit(200)
            .lean()) as unknown as MmRoomRecord[];
    }
}
