import { Injectable, Optional } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PARTY_LIMITS } from './party-limits';

/*
 * Room and party persistence (docs/plans/moba/MULTIPLAYER.md §3.6, lane N9). Checkpoints APPEND the log delta since
 * the last checkpoint (`$push: {chunks}` guarded by `{_id, epoch, lastTurn: previous}`), never `$set` the whole log.
 * A room belongs to one instance (the lease: `owner` + `epoch`); claims go through `findOneAndUpdate({_id, epoch})`.
 * The relay never writes to user or game collections (party-relay.no-score.spec.ts): scores save only through
 * `POST /user/catbassadors/live`.
 */

export type StoredRoomStatus = 'live' | 'ended' | 'abandoned';

export interface Occupant {
    slot: number;
    accountId: string | null;
    guestKeyHash: string | null;
    /** Peer-visible name (never a custom cat name). */
    name: string;
    ticketed: boolean;
}

export interface StoredRoom {
    _id: string;
    party: string;
    simVersion: number;
    simHash: string;
    config: {
        seed: number;
        picks: string[];
        tricks: string[];
        difficulty: string;
        humans: number[];
        /** Casual PvP (V16.md §4.2): humans on both teams, PvpReplayRecord v: 3. */
        mode?: 'pvp';
        fillDifficulty?: [string, string];
        /** 5v5 Classic (sim v19, MAP-5V5.md §9.1): 'hearthwood' (10 slots, PvP leads 0 and 5). Absent: Crossing. */
        map?: 'crossing' | 'hearthwood';
    };
    occupants: Occupant[];
    chunks: Buffer[];
    lastTurn: number;
    lastSeq: number[];
    pilotTicks: Record<string, Record<string, number>>;
    openUnclaimedAt1800: boolean;
    unscored: string | null;
    status: StoredRoomStatus;
    /** PvP: a passed remake voided the room (status abandoned; no verdict, no rewards, no rating). */
    void?: 'remake' | null;
    verdict?: {
        finalHash: string;
        outcome: string;
        ticks: number;
        winner: number;
        reason?: string;
        verified?: boolean;
        stats?: unknown[];
    } | null;
    owner: string;
    epoch: number;
    handoff: boolean;
    /** Members' resume token hashes by slot (a restore re-binds them). */
    resume: Record<string, string>;
    createdAt: Date;
    updatedAt: Date;
}

export interface StoredParty {
    _id: string;
    code: string;
    doc: Record<string, unknown>;
    updatedAt: Date;
}

export interface CheckpointMeta {
    lastTurn: number;
    lastSeq: number[];
    pilotTicks: Record<string, Record<string, number>>;
    openUnclaimedAt1800: boolean;
    unscored: string | null;
    handoff?: boolean;
}

export interface RoomStore {
    create(room: StoredRoom): Promise<void>;
    /** Append the log delta; false when the lease was lost (another instance owns the room). */
    append(
        id: string,
        epoch: number,
        prevTurn: number,
        chunk: Buffer,
        meta: CheckpointMeta,
        now: Date
    ): Promise<boolean>;
    finish(
        id: string,
        epoch: number,
        patch: Partial<Pick<StoredRoom, 'status' | 'verdict' | 'unscored' | 'handoff' | 'void'>>,
        now: Date
    ): Promise<boolean>;
    get(id: string): Promise<StoredRoom | null>;
    /** Claim one room for `owner` (epoch + 1); null when someone else got it first. */
    claim(id: string, epoch: number, owner: string, now: Date): Promise<StoredRoom | null>;
    /** Live rooms another instance handed off (or whose lease went stale) within the restore window. */
    restorable(owner: string, now: Date, staleMs: number, windowMs: number): Promise<StoredRoom[]>;
    /**
     * Mark abandoned every other live room that nobody holds: handed off, or not checkpointed for `staleMs`. A room
     * another running instance still checkpoints is left alone (two relays, or a relay and DigitalOcean, can share one
     * database during a rollout or a migration).
     */
    abandonLive(except: readonly string[], now: Date, staleMs?: number): Promise<number>;
    /** Scored party matches of an account since `since` (the daily cap, §6). */
    countEnded(accountId: string, since: Date): Promise<number>;
    saveParty(p: StoredParty): Promise<void>;
    getParty(id: string): Promise<StoredParty | null>;
    deleteParty(id: string): Promise<void>;
}

/** In-memory store (specs and the e2e relay harness). Same semantics as the Mongo one, including the epoch guard. */
export class MemoryRoomStore implements RoomStore {
    readonly rooms = new Map<string, StoredRoom>();
    readonly parties = new Map<string, StoredParty>();

    async create(room: StoredRoom): Promise<void> {
        if (this.rooms.has(room._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
        this.rooms.set(room._id, { ...room, chunks: [...room.chunks] });
    }

    async append(
        id: string,
        epoch: number,
        prevTurn: number,
        chunk: Buffer,
        meta: CheckpointMeta,
        now: Date
    ): Promise<boolean> {
        const r = this.rooms.get(id);
        if (!r || r.epoch !== epoch || r.lastTurn !== prevTurn) return false;
        r.chunks.push(chunk);
        r.lastTurn = meta.lastTurn;
        r.lastSeq = meta.lastSeq.slice();
        r.pilotTicks = JSON.parse(JSON.stringify(meta.pilotTicks));
        r.openUnclaimedAt1800 = meta.openUnclaimedAt1800;
        r.unscored = meta.unscored;
        if (meta.handoff !== undefined) r.handoff = meta.handoff;
        r.updatedAt = now;
        return true;
    }

    async finish(
        id: string,
        epoch: number,
        patch: Partial<Pick<StoredRoom, 'status' | 'verdict' | 'unscored' | 'handoff' | 'void'>>,
        now: Date
    ): Promise<boolean> {
        const r = this.rooms.get(id);
        if (!r || r.epoch !== epoch) return false;
        Object.assign(r, patch, { updatedAt: now });
        return true;
    }

    async get(id: string): Promise<StoredRoom | null> {
        const r = this.rooms.get(id);
        return r ? { ...r, chunks: [...r.chunks] } : null;
    }

    async claim(id: string, epoch: number, owner: string, now: Date): Promise<StoredRoom | null> {
        const r = this.rooms.get(id);
        if (!r || r.epoch !== epoch) return null;
        r.epoch = epoch + 1;
        r.owner = owner;
        r.handoff = false;
        r.updatedAt = now;
        return { ...r, chunks: [...r.chunks] };
    }

    async restorable(owner: string, now: Date, staleMs: number, windowMs: number): Promise<StoredRoom[]> {
        const t = now.getTime();
        return [...this.rooms.values()]
            .filter(
                r =>
                    r.status === 'live' &&
                    r.owner !== owner &&
                    (r.handoff || t - r.updatedAt.getTime() > staleMs) &&
                    t - r.updatedAt.getTime() < windowMs
            )
            .sort((a, b) => b.lastTurn - a.lastTurn)
            .map(r => ({ ...r, chunks: [...r.chunks] }));
    }

    async abandonLive(except: readonly string[], now: Date, staleMs = PARTY_LIMITS.staleLeaseMs): Promise<number> {
        let n = 0;
        for (const r of this.rooms.values()) {
            if (r.status !== 'live' || except.includes(r._id)) continue;
            if (!r.handoff && now.getTime() - r.updatedAt.getTime() <= staleMs) continue;
            r.status = 'abandoned';
            r.updatedAt = now;
            n++;
        }
        return n;
    }

    async countEnded(accountId: string, since: Date): Promise<number> {
        let n = 0;
        for (const r of this.rooms.values()) {
            if (r.status === 'ended' && r.updatedAt >= since && r.occupants.some(o => o.accountId === accountId)) n++;
        }
        return n;
    }

    async saveParty(p: StoredParty): Promise<void> {
        this.parties.set(p._id, p);
    }

    async getParty(id: string): Promise<StoredParty | null> {
        return this.parties.get(id) ?? null;
    }

    async deleteParty(id: string): Promise<void> {
        this.parties.delete(id);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Mongo

@Schema({ collection: 'pawlegendsrooms', timestamps: true })
export class PawlegendsRoom {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, index: true })
    party: string;

    @Prop({ required: true })
    simVersion: number;

    @Prop({ required: true })
    simHash: string;

    @Prop({ type: Object, required: true })
    config: StoredRoom['config'];

    @Prop({ type: [Object], default: [] })
    occupants: Occupant[];

    @Prop({ type: [Buffer], default: [] })
    chunks: Buffer[];

    @Prop({ default: 0 })
    lastTurn: number;

    @Prop({ type: [Number], default: [0, 0, 0] })
    lastSeq: number[];

    @Prop({ type: Object, default: {} })
    pilotTicks: Record<string, Record<string, number>>;

    @Prop({ default: false })
    openUnclaimedAt1800: boolean;

    @Prop({ type: String, default: null })
    unscored: string | null;

    @Prop({ required: true, default: 'live', index: true })
    status: StoredRoomStatus;

    @Prop({ type: Object, default: null })
    verdict: StoredRoom['verdict'];

    @Prop({ type: String, default: null })
    void: 'remake' | null;

    @Prop({ required: true })
    owner: string;

    @Prop({ required: true, default: 0 })
    epoch: number;

    @Prop({ default: false })
    handoff: boolean;

    @Prop({ type: Object, default: {} })
    resume: Record<string, string>;

    createdAt: Date;
    updatedAt: Date;
}
export const PawlegendsRoomSchema = SchemaFactory.createForClass(PawlegendsRoom);
PawlegendsRoomSchema.index({ 'occupants.accountId': 1, status: 1, updatedAt: -1 });
// ended and abandoned rooms expire after 30 days (live rooms carry no expiry: the partial filter skips them)
PawlegendsRoomSchema.index(
    { updatedAt: 1 },
    { expireAfterSeconds: 30 * 86400, partialFilterExpression: { status: { $in: ['ended', 'abandoned'] } } }
);

@Schema({ collection: 'pawlegendsparties', timestamps: true })
export class PawlegendsParty {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, index: true })
    code: string;

    @Prop({ type: Object, required: true })
    doc: Record<string, unknown>;

    updatedAt: Date;
}
export const PawlegendsPartySchema = SchemaFactory.createForClass(PawlegendsParty);
PawlegendsPartySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3 * 3600 });

export const PAWLEGENDS_PARTY_SCHEMAS = [
    { name: PawlegendsRoom.name, schema: PawlegendsRoomSchema },
    { name: PawlegendsParty.name, schema: PawlegendsPartySchema },
];

const lean = (r: any): StoredRoom | null =>
    r ? ({ ...r, chunks: (r.chunks ?? []).map((c: any) => Buffer.from(c.buffer ?? c)) } as StoredRoom) : null;

@Injectable()
export class MongoRoomStore implements RoomStore {
    constructor(
        @Optional() @InjectModel(PawlegendsRoom.name) private readonly rooms?: Model<PawlegendsRoom>,
        @Optional() @InjectModel(PawlegendsParty.name) private readonly partiesModel?: Model<PawlegendsParty>
    ) {}

    private get r(): Model<PawlegendsRoom> {
        if (!this.rooms) throw new Error('PawlegendsRoom model missing');
        return this.rooms;
    }

    async create(room: StoredRoom): Promise<void> {
        await this.r.create(room as any);
    }

    async append(
        id: string,
        epoch: number,
        prevTurn: number,
        chunk: Buffer,
        meta: CheckpointMeta,
        now: Date
    ): Promise<boolean> {
        const res = await this.r.updateOne(
            { _id: id, epoch, lastTurn: prevTurn },
            {
                $push: { chunks: chunk },
                $set: {
                    lastTurn: meta.lastTurn,
                    lastSeq: meta.lastSeq,
                    pilotTicks: meta.pilotTicks,
                    openUnclaimedAt1800: meta.openUnclaimedAt1800,
                    unscored: meta.unscored,
                    ...(meta.handoff !== undefined ? { handoff: meta.handoff } : {}),
                    updatedAt: now,
                },
            }
        );
        return res.modifiedCount === 1;
    }

    async finish(
        id: string,
        epoch: number,
        patch: Partial<Pick<StoredRoom, 'status' | 'verdict' | 'unscored' | 'handoff' | 'void'>>,
        now: Date
    ): Promise<boolean> {
        const res = await this.r.updateOne({ _id: id, epoch }, { $set: { ...patch, updatedAt: now } });
        return res.modifiedCount === 1;
    }

    async get(id: string): Promise<StoredRoom | null> {
        return lean(await this.r.findById(id).lean());
    }

    async claim(id: string, epoch: number, owner: string, now: Date): Promise<StoredRoom | null> {
        return lean(
            await this.r
                .findOneAndUpdate(
                    { _id: id, epoch },
                    { $set: { owner, epoch: epoch + 1, handoff: false, updatedAt: now } },
                    { new: true }
                )
                .lean()
        );
    }

    async restorable(owner: string, now: Date, staleMs: number, windowMs: number): Promise<StoredRoom[]> {
        const t = now.getTime();
        const rows = await this.r
            .find({
                status: 'live',
                owner: { $ne: owner },
                updatedAt: { $gt: new Date(t - windowMs) },
                $or: [{ handoff: true }, { updatedAt: { $lt: new Date(t - staleMs) } }],
            })
            .sort({ lastTurn: -1 })
            .lean();
        return rows.map(x => lean(x)!);
    }

    async abandonLive(except: readonly string[], now: Date, staleMs = PARTY_LIMITS.staleLeaseMs): Promise<number> {
        const res = await this.r.updateMany(
            {
                status: 'live',
                _id: { $nin: except as string[] },
                $or: [{ handoff: true }, { updatedAt: { $lt: new Date(now.getTime() - staleMs) } }],
            },
            { $set: { status: 'abandoned', updatedAt: now } }
        );
        return res.modifiedCount;
    }

    async countEnded(accountId: string, since: Date): Promise<number> {
        return this.r.countDocuments({ status: 'ended', 'occupants.accountId': accountId, updatedAt: { $gte: since } });
    }

    async saveParty(p: StoredParty): Promise<void> {
        if (!this.partiesModel) return;
        await this.partiesModel.updateOne(
            { _id: p._id },
            { $set: { code: p.code, doc: p.doc, updatedAt: p.updatedAt } },
            { upsert: true }
        );
    }

    async getParty(id: string): Promise<StoredParty | null> {
        if (!this.partiesModel) return null;
        return (await this.partiesModel.findById(id).lean()) as unknown as StoredParty | null;
    }

    async deleteParty(id: string): Promise<void> {
        await this.partiesModel?.deleteOne({ _id: id });
    }
}
