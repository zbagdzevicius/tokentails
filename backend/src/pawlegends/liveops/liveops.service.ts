import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { pawlegendsError } from '../pawlegends.errors';
import {
    eventsOf,
    goalAmount,
    LiveopsDefs,
    LiveopsEvent,
    LiveopsFeatured,
    LiveopsGift,
    LiveopsGoalDef,
    LiveopsNapDef,
    LiveopsVoteDef,
    napEarned,
    resolveDefs,
    utcDay,
    within,
} from './liveops.defaults';
import { CommunityGoalCtx, CommunityGoalSink, setCommunityGoalSink } from './liveops-live';
import { PawlegendsLiveops, PawlegendsLiveopsConfig, PawlegendsLiveopsCount } from './liveops.schema';

/*
 * Live ops (docs/plans/moba/LIVEOPS.md): the Events calendar, the featured mode, the community goal, Winter Nap and the
 * fan vote. `config()` is public and cached 30 s; the per-account routes are idempotent. The goal counter and the nap
 * days are written only by `recordMatch`, which only `/live` reaches (liveops-live.ts). Rewards are free palette coats.
 */

type AnyModel = any;
const CACHE_MS = 30_000;

export interface LiveopsConfigAnswer {
    v: 1;
    now: string;
    events: LiveopsEvent[];
    featuredMode: LiveopsFeatured | null;
    featuredQuests: string[];
    goal: (LiveopsGoalDef & { progress: number; reached: boolean }) | null;
    vote: (LiveopsVoteDef & { open: boolean; tallies: { a: number; b: number } }) | null;
    nap: (LiveopsNapDef & { open: boolean; today: string }) | null;
}

export interface LiveopsMeAnswer {
    goal: { id: string; claimed: boolean } | null;
    nap: { days: number; earned: number; claimed: number; playedToday: boolean } | null;
    vote: { id: string; choice: 'a' | 'b' | null } | null;
    /** Every coat live ops granted this account (the game adds them to its free coats). */
    items: string[];
}

interface AccountDoc {
    _id: string;
    napDays?: string[];
    napClaimed?: number;
    goals?: string[];
    votes?: Record<string, string>;
    items?: string[];
}

const isDuplicateKey = (e: unknown) => (e as { code?: unknown } | undefined)?.code === 11000;
export const liveopsNeedAccount = () =>
    pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Play a match first');

@Injectable()
export class LiveopsService implements CommunityGoalSink, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger('PawlegendsLiveops');
    private cache: { atMs: number; value: LiveopsConfigAnswer; defs: LiveopsDefs } | null = null;

    constructor(
        @InjectModel(PawlegendsLiveopsConfig.name) private readonly configs: AnyModel,
        @InjectModel(PawlegendsLiveopsCount.name) private readonly counts: AnyModel,
        @InjectModel(PawlegendsLiveops.name) private readonly accounts: AnyModel,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    onModuleInit(): void {
        setCommunityGoalSink(this);
    }

    onModuleDestroy(): void {
        setCommunityGoalSink(null);
    }

    private now(): Date {
        return this.clock?.now() ?? new Date();
    }

    private async defs(now: Date): Promise<LiveopsDefs> {
        let doc: Record<string, unknown> | null = null;
        try {
            doc = (await this.configs.findById('live').lean()) as Record<string, unknown> | null;
        } catch (e) {
            this.logger.warn(`config doc unreadable, using the code defaults: ${(e as Error)?.message}`);
        }
        return resolveDefs(doc, now);
    }

    private async counters(ids: string[]): Promise<Map<string, number>> {
        const rows = (await this.counts.find({ _id: { $in: ids } }).lean()) as Array<{ _id: string; n?: number }>;
        return new Map(rows.map(r => [r._id, Math.max(0, Math.floor(r.n ?? 0))]));
    }

    /** `GET /pawlegends/config`: cached 30 s per process (the counters move only with matches). */
    async config(): Promise<LiveopsConfigAnswer> {
        const now = this.now();
        if (this.cache && now.getTime() - this.cache.atMs < CACHE_MS && now.getTime() >= this.cache.atMs)
            return this.cache.value;
        const defs = await this.defs(now);
        const ids = [
            ...(defs.goal ? [`goal:${defs.goal.id}`] : []),
            ...(defs.vote ? [`vote:${defs.vote.id}:a`, `vote:${defs.vote.id}:b`] : []),
        ];
        const n = ids.length ? await this.counters(ids) : new Map<string, number>();
        const progress = defs.goal ? n.get(`goal:${defs.goal.id}`) ?? 0 : 0;
        const value: LiveopsConfigAnswer = {
            v: 1,
            now: now.toISOString(),
            events: eventsOf(defs, now),
            featuredMode: defs.featuredMode,
            featuredQuests: defs.featuredQuests,
            goal: defs.goal ? { ...defs.goal, progress, reached: progress >= defs.goal.target } : null,
            vote: defs.vote
                ? {
                      ...defs.vote,
                      open: within(defs.vote, now),
                      tallies: { a: n.get(`vote:${defs.vote.id}:a`) ?? 0, b: n.get(`vote:${defs.vote.id}:b`) ?? 0 },
                  }
                : null,
            nap: defs.nap ? { ...defs.nap, open: within(defs.nap, now), today: utcDay(now) } : null,
        };
        this.cache = { atMs: now.getTime(), value, defs };
        return value;
    }

    /** Tests: forget the cached answer. */
    resetCache(): void {
        this.cache = null;
    }

    /**
     * The `/live` hook (applyCommunityGoal): the goal counter grows by this verified match's share while the goal runs,
     * and the Winter Nap log gets today's UTC day while the nap runs. Called once per saved match.
     */
    async recordMatch(ctx: CommunityGoalCtx): Promise<void> {
        const now = ctx.now;
        const defs = this.cache && now.getTime() - this.cache.atMs < CACHE_MS ? this.cache.defs : await this.defs(now);
        if (defs.goal && within(defs.goal, now)) {
            const add = goalAmount(defs.goal.metric, ctx);
            if (add > 0)
                await this.counts.updateOne({ _id: `goal:${defs.goal.id}` }, { $inc: { n: add } }, { upsert: true });
        }
        if (defs.nap && within(defs.nap, now) && ctx.accountId) {
            await this.accounts.updateOne(
                { _id: String(ctx.accountId) },
                { $addToSet: { napDays: utcDay(now) } },
                { upsert: true }
            );
        }
    }

    private async account(id: string): Promise<AccountDoc | null> {
        return ((await this.accounts.findById(id).lean()) as AccountDoc | null) ?? null;
    }

    /** `GET /pawlegends/config/me`. */
    async me(accountId: string): Promise<LiveopsMeAnswer> {
        const cfg = await this.config();
        const doc = await this.account(accountId);
        return this.meOf(cfg, doc);
    }

    private meOf(cfg: LiveopsConfigAnswer, doc: AccountDoc | null): LiveopsMeAnswer {
        const days = doc?.napDays ?? [];
        const choice = cfg.vote ? doc?.votes?.[cfg.vote.id] : undefined;
        return {
            goal: cfg.goal ? { id: cfg.goal.id, claimed: (doc?.goals ?? []).includes(cfg.goal.id) } : null,
            nap: cfg.nap
                ? {
                      days: days.length,
                      earned: napEarned(cfg.nap, days),
                      claimed: Math.max(0, Math.floor(doc?.napClaimed ?? 0)),
                      playedToday: days.includes(utcDay(this.now())),
                  }
                : null,
            vote: cfg.vote ? { id: cfg.vote.id, choice: choice === 'a' || choice === 'b' ? choice : null } : null,
            items: [...new Set(doc?.items ?? [])],
        };
    }

    /**
     * `POST /pawlegends/config/goal/claim`: once the shared counter reached the target, every account (guests too)
     * claims the goal's coat. Idempotent: a second claim answers the same state and grants nothing.
     */
    async claimGoal(accountId: string): Promise<LiveopsMeAnswer & { granted: string[] }> {
        this.resetCache();
        const cfg = await this.config();
        const goal = cfg.goal;
        if (!goal) throw pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_NO_GOAL', 'No community goal right now');
        if (!goal.reached)
            throw pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_GOAL_NOT_REACHED', 'The goal is not reached yet');
        let granted: string[] = [];
        try {
            const r = await this.accounts.updateOne(
                { _id: accountId, goals: { $ne: goal.id } },
                { $addToSet: { goals: goal.id, items: goal.rewardItem } },
                { upsert: true }
            );
            if ((r?.modifiedCount ?? 0) > 0 || (r?.upsertedCount ?? 0) > 0) granted = [goal.rewardItem];
        } catch (e) {
            if (!isDuplicateKey(e)) throw e;
        }
        return { ...this.meOf(cfg, await this.account(accountId)), granted };
    }

    /**
     * `POST /pawlegends/config/nap/claim`: opens every Winter Nap gift earned and not yet claimed. A compare-and-set on
     * `napClaimed`, so two claims at once grant once. Earned days never go away (no reset for a missed day).
     */
    async claimNap(accountId: string): Promise<LiveopsMeAnswer & { granted: string[] }> {
        const cfg = await this.config();
        const nap = cfg.nap;
        if (!nap) throw pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_NO_NAP', 'Winter Nap is not on');
        let granted: LiveopsGift[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
            const doc = await this.account(accountId);
            const earned = napEarned(nap, doc?.napDays ?? []);
            const claimed = Math.max(0, Math.floor(doc?.napClaimed ?? 0));
            if (!doc || earned <= claimed) break;
            const gifts = nap.gifts.slice(claimed, earned);
            const r = await this.accounts.updateOne(
                { _id: accountId, napClaimed: doc.napClaimed === undefined ? { $exists: false } : claimed },
                { $set: { napClaimed: earned }, $addToSet: { items: { $each: gifts.map(g => g.item) } } }
            );
            if ((r?.modifiedCount ?? 0) > 0) {
                granted = gifts;
                break;
            }
        }
        return { ...this.meOf(cfg, await this.account(accountId)), granted: granted.map(g => g.item) };
    }

    /** `POST /pawlegends/config/vote {option}`: one vote per account on the current vote, while it is open. */
    async vote(
        accountId: string,
        option: unknown
    ): Promise<LiveopsMeAnswer & { counted: boolean; tallies: { a: number; b: number } }> {
        const cfg = await this.config();
        const vote = cfg.vote;
        if (!vote || !vote.open)
            throw pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_VOTE_CLOSED', 'There is no vote open');
        if (option !== 'a' && option !== 'b')
            throw pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'option is a or b');
        const path = `votes.${vote.id}`;
        let counted = false;
        try {
            const r = await this.accounts.updateOne(
                { _id: accountId, [path]: { $exists: false } },
                { $set: { [path]: option } },
                { upsert: true }
            );
            counted = (r?.modifiedCount ?? 0) > 0 || (r?.upsertedCount ?? 0) > 0;
        } catch (e) {
            if (!isDuplicateKey(e)) throw e;
        }
        if (counted) {
            await this.counts.updateOne({ _id: `vote:${vote.id}:${option}` }, { $inc: { n: 1 } }, { upsert: true });
            this.resetCache();
        }
        const fresh = counted ? await this.config() : cfg;
        return {
            ...this.meOf(fresh, await this.account(accountId)),
            counted,
            tallies: fresh.vote?.tallies ?? { a: 0, b: 0 },
        };
    }
}
