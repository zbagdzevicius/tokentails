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
    /** A pull request from another relay (§5.4); cleared by the claim. */
    want?: RoomWant | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface StoredParty {
    _id: string;
    code: string;
    doc: Record<string, unknown>;
    updatedAt: Date;
    /** The relay (boot id) that holds the party; absent on rows written before live-match deploys. */
    owner?: string;
    /** A lobby party a draining relay handed over (LIVE-MATCH-DEPLOYS.md §4.1 step 5): the next serving relay claims it. */
    handoff?: boolean;
}

/** One relay process (LIVE-MATCH-DEPLOYS.md §4.4): the newest ready `serving` relay owns new rooms. */
export interface RelayRow {
    _id: string;
    /**
     * `standby`: ready, but no player has reached it yet (the load balancer may not route to it): it never makes another
     * relay drain. `serving` from its first socket on; `draining` once it drains.
     */
    state: 'standby' | 'serving' | 'draining';
    readyAt: Date;
    heartbeatAt: Date;
    simVersions: number[];
    /** Generations compare only within a pool (RelayOptions.pool); absent on rows of relays that predate pools. */
    pool?: string;
}

/** A pull request (§5.4): relay `by` holds a player of this room and asks its draining owner to hand it over now. */
export interface RoomWant {
    by: string;
    at: Date;
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
     * Mark abandoned every other live room nobody can restore any more: not written for `olderThanMs` (the restore
     * window), handed off or not. A room another running instance still checkpoints is left alone, and so is a handed-off
     * room inside the window (another relay carrying its sim bundle may still claim it).
     */
    abandonLive(except: readonly string[], now: Date, olderThanMs?: number): Promise<number>;
    /** Ask the owner of a live room to hand it over now (§5.4). False when the room is not live or not owned by `owner`. */
    want(id: string, owner: string, by: string, now: Date): Promise<boolean>;
    /** Ids of live rooms owned by `owner` that another relay asked for. */
    wanted(owner: string): Promise<string[]>;
    /** Upsert this relay's generation row (§4.4). */
    heartbeat(row: RelayRow): Promise<void>;
    /** Relay rows written since `since` (older rows belong to relays that are gone). */
    relays(since: Date): Promise<RelayRow[]>;
    /** The stored party whose members include this resume token hash (§5.4), or null. */
    partyByResume(hash: string, since: Date): Promise<StoredParty | null>;
    /** Lobby parties handed over by another relay, written since `since`. */
    handedParties(owner: string, since: Date): Promise<StoredParty[]>;
    /** Claim a handed-over party for `owner`; null when another relay got it first. */
    claimParty(id: string, owner: string, now: Date): Promise<StoredParty | null>;
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
    readonly relayRows = new Map<string, RelayRow>();

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
        r.want = null;
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

    async abandonLive(
        except: readonly string[],
        now: Date,
        olderThanMs = PARTY_LIMITS.restoreWithinMs
    ): Promise<number> {
        let n = 0;
        for (const r of this.rooms.values()) {
            if (r.status !== 'live' || except.includes(r._id)) continue;
            if (now.getTime() - r.updatedAt.getTime() < olderThanMs) continue;
            r.status = 'abandoned';
            r.updatedAt = now;
            n++;
        }
        return n;
    }

    async want(id: string, owner: string, by: string, now: Date): Promise<boolean> {
        const r = this.rooms.get(id);
        if (!r || r.status !== 'live' || r.owner !== owner) return false;
        r.want = { by, at: now };
        return true;
    }

    async wanted(owner: string): Promise<string[]> {
        return [...this.rooms.values()].filter(r => r.status === 'live' && r.owner === owner && r.want).map(r => r._id);
    }

    async heartbeat(row: RelayRow): Promise<void> {
        this.relayRows.set(row._id, { ...row, simVersions: [...row.simVersions] });
    }

    async relays(since: Date): Promise<RelayRow[]> {
        return [...this.relayRows.values()].filter(r => r.heartbeatAt >= since).map(r => ({ ...r }));
    }

    async partyByResume(hash: string, since: Date): Promise<StoredParty | null> {
        for (const p of this.parties.values()) {
            if (p.updatedAt < since) continue;
            const members = (p.doc.members ?? []) as { resume?: string }[];
            if (members.some(m => m.resume === hash)) return { ...p };
        }
        return null;
    }

    async handedParties(owner: string, since: Date): Promise<StoredParty[]> {
        return [...this.parties.values()]
            .filter(p => p.handoff && p.owner !== owner && p.updatedAt >= since)
            .map(p => ({ ...p }));
    }

    async claimParty(id: string, owner: string, now: Date): Promise<StoredParty | null> {
        const p = this.parties.get(id);
        if (!p || !p.handoff) return null;
        p.handoff = false;
        p.owner = owner;
        p.updatedAt = now;
        return { ...p };
    }

    async countEnded(accountId: string, since: Date): Promise<number> {
        let n = 0;
        for (const r of this.rooms.values()) {
            if (r.status === 'ended' && r.updatedAt >= since && r.occupants.some(o => o.accountId === accountId)) n++;
        }
        return n;
    }

    async saveParty(p: StoredParty): Promise<void> {
        this.parties.set(p._id, { ...p });
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

    @Prop({ type: Object, default: null })
    want: RoomWant | null;

    createdAt: Date;
    updatedAt: Date;
}
export const PawlegendsRoomSchema = SchemaFactory.createForClass(PawlegendsRoom);
PawlegendsRoomSchema.index({ 'occupants.accountId': 1, status: 1, updatedAt: -1 });
// the restore loop and the pull poll (LIVE-MATCH-DEPLOYS.md §5.3, §5.4) run every second on every relay
PawlegendsRoomSchema.index({ status: 1, owner: 1, updatedAt: -1 });
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

    @Prop({ type: String, default: null })
    owner: string | null;

    @Prop({ default: false })
    handoff: boolean;

    updatedAt: Date;
}
export const PawlegendsPartySchema = SchemaFactory.createForClass(PawlegendsParty);
PawlegendsPartySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3 * 3600 });
// a resume token this relay does not know is looked up here (LIVE-MATCH-DEPLOYS.md §5.4)
PawlegendsPartySchema.index({ 'doc.members.resume': 1 });
PawlegendsPartySchema.index({ handoff: 1, updatedAt: -1 });

/** One row per relay process (LIVE-MATCH-DEPLOYS.md §4.4); a row not refreshed for an hour expires. */
@Schema({ collection: 'pawlegendsrelays' })
export class PawlegendsRelay {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true })
    state: 'standby' | 'serving' | 'draining';

    @Prop({ required: true })
    readyAt: Date;

    @Prop({ required: true })
    heartbeatAt: Date;

    @Prop({ type: [Number], default: [] })
    simVersions: number[];

    @Prop({ type: String, default: null })
    pool: string | null;
}
export const PawlegendsRelaySchema = SchemaFactory.createForClass(PawlegendsRelay);
PawlegendsRelaySchema.index({ heartbeatAt: 1 }, { expireAfterSeconds: 3600 });

export const PAWLEGENDS_PARTY_SCHEMAS = [
    { name: PawlegendsRoom.name, schema: PawlegendsRoomSchema },
    { name: PawlegendsParty.name, schema: PawlegendsPartySchema },
    { name: PawlegendsRelay.name, schema: PawlegendsRelaySchema },
];

const lean = (r: any): StoredRoom | null =>
    r ? ({ ...r, chunks: (r.chunks ?? []).map((c: any) => Buffer.from(c.buffer ?? c)) } as StoredRoom) : null;

@Injectable()
export class MongoRoomStore implements RoomStore {
    constructor(
        @Optional() @InjectModel(PawlegendsRoom.name) private readonly rooms?: Model<PawlegendsRoom>,
        @Optional() @InjectModel(PawlegendsParty.name) private readonly partiesModel?: Model<PawlegendsParty>,
        @Optional() @InjectModel(PawlegendsRelay.name) private readonly relayModel?: Model<PawlegendsRelay>
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
                    { $set: { owner, epoch: epoch + 1, handoff: false, want: null, updatedAt: now } },
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

    async abandonLive(
        except: readonly string[],
        now: Date,
        olderThanMs = PARTY_LIMITS.restoreWithinMs
    ): Promise<number> {
        const res = await this.r.updateMany(
            {
                status: 'live',
                _id: { $nin: except as string[] },
                updatedAt: { $lte: new Date(now.getTime() - olderThanMs) },
            },
            { $set: { status: 'abandoned', updatedAt: now } }
        );
        return res.modifiedCount;
    }

    async want(id: string, owner: string, by: string, now: Date): Promise<boolean> {
        // never touches updatedAt: a want must not keep a stale room looking fresh
        const res = await this.r.updateOne({ _id: id, status: 'live', owner }, { $set: { want: { by, at: now } } });
        return res.matchedCount === 1;
    }

    async wanted(owner: string): Promise<string[]> {
        const rows = await this.r.find({ status: 'live', owner, want: { $ne: null } }, { _id: 1 }).lean();
        return rows.map(r => String(r._id));
    }

    async heartbeat(row: RelayRow): Promise<void> {
        if (!this.relayModel) return;
        await this.relayModel.updateOne(
            { _id: row._id },
            {
                $set: {
                    state: row.state,
                    readyAt: row.readyAt,
                    heartbeatAt: row.heartbeatAt,
                    simVersions: row.simVersions,
                    pool: row.pool ?? null,
                },
            },
            { upsert: true }
        );
    }

    async relays(since: Date): Promise<RelayRow[]> {
        if (!this.relayModel) return [];
        return (await this.relayModel.find({ heartbeatAt: { $gte: since } }).lean()) as unknown as RelayRow[];
    }

    async partyByResume(hash: string, since: Date): Promise<StoredParty | null> {
        if (!this.partiesModel) return null;
        return (await this.partiesModel
            .findOne({ 'doc.members.resume': hash, updatedAt: { $gte: since } })
            .lean()) as unknown as StoredParty | null;
    }

    async handedParties(owner: string, since: Date): Promise<StoredParty[]> {
        if (!this.partiesModel) return [];
        return (await this.partiesModel
            .find({ handoff: true, owner: { $ne: owner }, updatedAt: { $gte: since } })
            .lean()) as unknown as StoredParty[];
    }

    async claimParty(id: string, owner: string, now: Date): Promise<StoredParty | null> {
        if (!this.partiesModel) return null;
        return (await this.partiesModel
            .findOneAndUpdate(
                { _id: id, handoff: true },
                { $set: { handoff: false, owner, updatedAt: now } },
                { new: true }
            )
            .lean()) as unknown as StoredParty | null;
    }

    async countEnded(accountId: string, since: Date): Promise<number> {
        return this.r.countDocuments({ status: 'ended', 'occupants.accountId': accountId, updatedAt: { $gte: since } });
    }

    async saveParty(p: StoredParty): Promise<void> {
        if (!this.partiesModel) return;
        await this.partiesModel.updateOne(
            { _id: p._id },
            {
                $set: {
                    code: p.code,
                    doc: p.doc,
                    updatedAt: p.updatedAt,
                    ...(p.owner !== undefined ? { owner: p.owner } : {}),
                    handoff: !!p.handoff,
                },
            },
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
