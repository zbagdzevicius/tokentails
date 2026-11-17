import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Cat } from 'src/cat/cat.schema';
import { User } from 'src/user/user.schema';
import { pawlegendsError } from '../pawlegends.errors';
import { CURRENT_SEASON_ID } from '../pawlegends-catalog';
import { displayNames } from '../social/display-name';
import { pairId, parsePlayerCode } from '../social/social.contracts';
import { PawlegendsBlock, PawlegendsFriend, PawlegendsSocial } from '../social/social.schema';
import {
    buildRow,
    HISTORY_KEEP,
    HISTORY_PAGE,
    isGroup,
    isVisibility,
    matchView,
    rowView,
    seasonAt,
    statsId,
    statsInc,
    statsView,
    type BuildInput,
    type HistoryGroup,
    type HistoryMatchView,
    type HistoryRowDoc,
    type HistoryRowView,
    type HistoryVisibility,
    type SeasonStatsDoc,
    type SeasonStatsView,
} from './history.model';
import { PawlegendsHistoryPrefs, PawlegendsMatchHistory, PawlegendsMatchStats } from './history.schema';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md): the Wild Rift style list, the match detail and the season stats,
 * for the player and for a friend (by player code). Written only through `record`, which the `/live` save calls once
 * after its Game row exists; it never fails that save. Public since Nov 17 (the founder: "match history is fully
 * publicly available, so toggle is redundant"): any registered player reads any player's history by code; a stored
 * choice from before is ignored. Blocks still read as "no player".
 */

export const HISTORY_ERRORS = {
    needAccount: () =>
        pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', "Sign in to see other players' history"),
    invalid: (m: string) => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_HISTORY_INVALID', m),
    notFound: () => pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_HISTORY_NOT_FOUND', 'No such match'),
    noPlayer: () => pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_SOCIAL_NOT_FOUND', 'No player with this code'),
    hidden: () =>
        pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_HISTORY_PRIVATE', 'This player keeps their history private'),
};

const OBJECT_ID = /^[a-f0-9]{24}$/;

/** The storage the history needs (Mongo below; the spec uses an in-memory one). */
export interface HistoryStore {
    /** Insert one row; false when (accountId, matchId) exists already. Returns the stored row's id. */
    insert(row: HistoryRowDoc): Promise<boolean>;
    /** Newest first; `before` is a row id. */
    page(accountId: string, group: HistoryGroup | null, before: string | null, limit: number): Promise<HistoryRowDoc[]>;
    get(accountId: string, id: string): Promise<HistoryRowDoc | null>;
    /** Delete the account's rows past the newest `keep`. */
    prune(accountId: string, keep: number): Promise<void>;
    incStats(id: string, accountId: string, inc: Record<string, number>): Promise<void>;
    stats(id: string): Promise<SeasonStatsDoc | null>;
    visibility(accountId: string): Promise<HistoryVisibility | null>;
    setVisibility(accountId: string, v: HistoryVisibility): Promise<void>;
    purge(accountId: string): Promise<void>;
}

/** Who is who: player codes, friendships, blocks and display names (read only). */
export interface HistoryPeople {
    byCode(code: string): Promise<string | null>;
    friends(a: string, b: string): Promise<boolean>;
    blockedEither(a: string, b: string): Promise<boolean>;
    names(ids: readonly string[]): Promise<Map<string, string>>;
}

export interface HistoryPageView {
    /** The owner: their display name and whether it is the caller. */
    owner: { name: string; self: boolean };
    rows: HistoryRowView[];
    /** The id to pass as `before` for the next page, or null at the end. */
    next: string | null;
    /** First page only: this season's numbers. */
    stats?: SeasonStatsView;
    /** Own history only: who may see it. */
    visibility?: HistoryVisibility;
}

export class MatchHistoryCore {
    constructor(
        readonly store: HistoryStore,
        readonly people: HistoryPeople,
        private readonly clock: () => Date = () => new Date(),
        private readonly log: Pick<Logger, 'warn'> = new Logger('PawlegendsHistory')
    ) {}

    /** Store one match for one account (the `/live` save, after its Game row). Never throws. */
    async record(input: BuildInput): Promise<boolean> {
        try {
            const row = buildRow(input);
            if (!row) return false;
            const fresh = await this.store.insert(row);
            if (!fresh) return false;
            await this.store.incStats(statsId(row.accountId, row.season), row.accountId, statsInc(row));
            await this.store.prune(row.accountId, HISTORY_KEEP);
            return true;
        } catch (error) {
            this.log.warn(`pawlegends history write failed: ${(error as Error)?.message ?? 'unknown'}`);
            return false;
        }
    }

    /** The account whose history is asked for (`code` absent: the caller), checked against its owner's choice. */
    private async owner(viewer: string, code: unknown, registered: boolean): Promise<{ id: string; self: boolean }> {
        if (code === undefined || code === null || code === '') return { id: viewer, self: true };
        const parsed = parsePlayerCode(code);
        if (!parsed) throw HISTORY_ERRORS.invalid('code');
        const id = await this.people.byCode(parsed);
        if (!id) throw HISTORY_ERRORS.noPlayer();
        if (id === viewer) return { id, self: true };
        if (!registered) throw HISTORY_ERRORS.needAccount();
        // a block reads as "no player": the blocked side learns nothing more. Otherwise public (no privacy choice)
        if (await this.people.blockedEither(viewer, id)) throw HISTORY_ERRORS.noPlayer();
        return { id, self: false };
    }

    async list(
        viewer: string,
        q: { code?: unknown; mode?: unknown; before?: unknown },
        registered: boolean
    ): Promise<HistoryPageView> {
        const group = q.mode === undefined || q.mode === null || q.mode === '' || q.mode === 'all' ? null : q.mode;
        if (group !== null && !isGroup(group)) throw HISTORY_ERRORS.invalid('mode');
        const before = q.before === undefined || q.before === null || q.before === '' ? null : q.before;
        if (before !== null && (typeof before !== 'string' || !OBJECT_ID.test(before)))
            throw HISTORY_ERRORS.invalid('before');
        const who = await this.owner(viewer, q.code, registered);
        const rows = await this.store.page(who.id, group, before as string | null, HISTORY_PAGE + 1);
        const more = rows.length > HISTORY_PAGE;
        const shown = rows.slice(0, HISTORY_PAGE);
        const name = (await this.people.names([who.id])).get(who.id) ?? '';
        const out: HistoryPageView = {
            owner: { name, self: who.self },
            rows: shown.map(r => rowView(r, who.self)),
            next: more && shown.length ? String(shown[shown.length - 1]._id) : null,
        };
        if (before === null) {
            const season = seasonAt(this.clock()) || CURRENT_SEASON_ID;
            out.stats = statsView(season, await this.store.stats(statsId(who.id, season)));
        }
        return out;
    }

    async match(viewer: string, q: { code?: unknown; id?: unknown }, registered: boolean): Promise<HistoryMatchView> {
        if (typeof q.id !== 'string' || !OBJECT_ID.test(q.id)) throw HISTORY_ERRORS.invalid('id');
        const who = await this.owner(viewer, q.code, registered);
        const row = await this.store.get(who.id, q.id);
        if (!row) throw HISTORY_ERRORS.notFound();
        const ids = (row.players ?? []).map(p => p.u).filter((u): u is string => !!u);
        return matchView(row, who.self, await this.people.names(ids));
    }

    /**
     * Older builds still send their privacy choice: it is accepted and dropped (history is public since Nov 17), and
     * the answer says so. Nothing is stored.
     */
    async setVisibility(viewer: string, v: unknown): Promise<{ visibility: HistoryVisibility }> {
        void viewer;
        if (!isVisibility(v)) throw HISTORY_ERRORS.invalid('visibility');
        return { visibility: 'everyone' };
    }

    async purge(accountId: string): Promise<void> {
        await this.store.purge(String(accountId));
    }
}

type AnyModel = any;

/** The Mongo store. */
export function mongoHistoryStore(m: { rows: AnyModel; stats: AnyModel; prefs: AnyModel }): HistoryStore {
    return {
        async insert(row) {
            try {
                await m.rows.create(row);
                return true;
            } catch (error) {
                if ((error as { code?: unknown })?.code === 11000) return false;
                throw error;
            }
        },
        async page(accountId, group, before, limit) {
            const filter: Record<string, unknown> = { accountId };
            if (group) filter.group = group;
            if (before) filter._id = { $lt: new Types.ObjectId(before) };
            return m.rows.find(filter).sort({ _id: -1 }).limit(limit).lean();
        },
        async get(accountId, id) {
            return m.rows.findOne({ _id: new Types.ObjectId(id), accountId }).lean();
        },
        async prune(accountId, keep) {
            const old = (await m.rows
                .find({ accountId })
                .sort({ _id: -1 })
                .skip(keep)
                .select({ _id: 1 })
                .lean()) as Array<{ _id: unknown }>;
            if (old.length) await m.rows.deleteMany({ _id: { $in: old.map(r => r._id) } });
        },
        async incStats(id, accountId, inc) {
            await m.stats.updateOne({ _id: id }, { $inc: inc, $setOnInsert: { accountId } }, { upsert: true });
        },
        async stats(id) {
            return m.stats.findById(id).lean();
        },
        async visibility(accountId) {
            const doc = (await m.prefs.findById(accountId).lean()) as { history?: unknown } | null;
            return isVisibility(doc?.history) ? doc!.history : null;
        },
        async setVisibility(accountId, v) {
            await m.prefs.updateOne({ _id: accountId }, { $set: { history: v } }, { upsert: true });
        },
        async purge(accountId) {
            await m.rows.deleteMany({ accountId });
            await m.stats.deleteMany({ accountId });
            await m.prefs.deleteOne({ _id: accountId });
            // other players' rows keep the match, with this seat shown without a name
            await m.rows.updateMany(
                { 'players.u': accountId },
                { $set: { 'players.$[p].u': null } },
                { arrayFilters: [{ 'p.u': accountId }] }
            );
        },
    };
}

@Injectable()
export class MatchHistoryService extends MatchHistoryCore {
    constructor(
        @InjectModel(PawlegendsMatchHistory.name) rows: AnyModel,
        @InjectModel(PawlegendsMatchStats.name) stats: AnyModel,
        @InjectModel(PawlegendsHistoryPrefs.name) prefs: AnyModel,
        @InjectModel(PawlegendsSocial.name) social: AnyModel,
        @InjectModel(PawlegendsFriend.name) friends: AnyModel,
        @InjectModel(PawlegendsBlock.name) blocks: AnyModel,
        @InjectModel(User.name) users: AnyModel,
        @Optional() @InjectModel(Cat.name) cats?: AnyModel
    ) {
        super(mongoHistoryStore({ rows, stats, prefs }), {
            async byCode(code) {
                const p = (await social.findOne({ code }).select({ _id: 1 }).lean()) as { _id: unknown } | null;
                if (!p) return null;
                // a deleted account has no history to show
                const u = await users
                    .findOne({ _id: p._id, deletedAt: { $exists: false } })
                    .select({ _id: 1 })
                    .lean();
                return u ? String(p._id) : null;
            },
            async friends(a, b) {
                const e = (await friends.findById(pairId(a, b)).lean()) as { state?: string } | null;
                return e?.state === 'accepted';
            },
            async blockedEither(a, b) {
                return (await blocks.countDocuments({ _id: { $in: [`${a}:${b}`, `${b}:${a}`] } })) > 0;
            },
            names: ids => displayNames({ social, cats: cats ?? null }, ids),
        });
    }
}
