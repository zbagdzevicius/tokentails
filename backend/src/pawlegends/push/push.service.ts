import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { pawlegendsError } from '../pawlegends.errors';
import { LiveopsService } from '../liveops/liveops.service';
import { pushVapid } from './push-env';
import { setPushSink, PushSink } from './push-sink';
import {
    afterSend,
    decide,
    endpointAllowed,
    keyOk,
    localHour,
    NAP_LOCAL_HOUR,
    parseCategories,
    parseTz,
    PUSH_CATEGORIES,
    PUSH_RULES,
    PUSH_SUBS_PER_ACCOUNT,
    PushCategory,
    PushMessage,
    safePath,
} from './push.rules';
import { PawlegendsPushState, PawlegendsPushSub } from './push.schema';
import { PushFetch, PushOutcome, sendWebPush } from './web-push';

/*
 * Push notifications (docs/plans/moba/SHARE-PUSH.md §2): web push to pawlegends.app's service worker. The player turns
 * them on in the game (after a win, never on the first launch) and turns each category off in Settings. Sends obey
 * quiet hours (22:00-09:00 device time), a per-category gap and a daily cap per device (push.rules.ts). Without the
 * VAPID keys (`PAWLEGENDS_VAPID_PUBLIC_KEY`, `PAWLEGENDS_VAPID_PRIVATE_KEY`) the key route answers `{key: null}`, the
 * game hides the opt-in, and nothing is sent. Nothing here is a score or a reward.
 */

type AnyModel = any;
const MAX_FAILS = 5;
const BROADCAST_BATCH = 200;
/** An event announced at most this long after it started (a deploy never announces old events). */
const EVENT_FRESH_MS = 2 * 3600_000;

export const PUSH_ERRORS = {
    needAccount: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Play a match first'),
    invalid: (m: string) => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_PUSH_INVALID', m),
    off: () => pawlegendsError(HttpStatus.SERVICE_UNAVAILABLE, 'PAWLEGENDS_PUSH_OFF', 'Notifications are not set up'),
};

export const subId = (endpoint: string): string => createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

interface SubRow {
    _id: string;
    acc: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    cats: string[];
    tz: number;
    recent?: number[];
    last?: Partial<Record<PushCategory, number>>;
    fails?: number;
}

const defaultFetch: PushFetch = async (url, init) => {
    const f = (globalThis as { fetch?: (u: string, i: unknown) => Promise<{ status: number }> }).fetch;
    if (f) return f(url, init);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nf = require('node-fetch');
    return (nf.default ?? nf)(url, init);
};

@Injectable()
export class PushService implements PushSink, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger('PawlegendsPush');
    /** Tests replace it. */
    fetchImpl: PushFetch = defaultFetch;

    constructor(
        @InjectModel(PawlegendsPushSub.name) readonly subs: AnyModel,
        @InjectModel(PawlegendsPushState.name) readonly state: AnyModel,
        @Optional() private readonly liveops?: LiveopsService,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    onModuleInit(): void {
        setPushSink(this);
    }

    onModuleDestroy(): void {
        setPushSink(null);
    }

    now(): Date {
        return this.clock?.now() ?? new Date();
    }

    /** `GET /pawlegends/push/key`: the VAPID public key (the browser's applicationServerKey), or null when unset. */
    key(): { key: string | null; cats: readonly string[] } {
        return { key: pushVapid()?.publicKey ?? null, cats: PUSH_CATEGORIES };
    }

    /** `POST /pawlegends/push/subscribe {endpoint, p256dh, auth, cats, tz}`: save (or move to this account) one device. */
    async subscribe(acc: string, body: Record<string, unknown>) {
        if (!pushVapid()) throw PUSH_ERRORS.off();
        const endpoint = body?.endpoint;
        if (!endpointAllowed(endpoint)) throw PUSH_ERRORS.invalid('endpoint is not a known push service');
        if (!keyOk(body?.p256dh, 65, 65) || !keyOk(body?.auth, 16, 32)) throw PUSH_ERRORS.invalid('bad keys');
        const cats = body?.cats === undefined ? [...PUSH_CATEGORIES] : parseCategories(body.cats);
        const tz = parseTz(body?.tz);
        const _id = subId(endpoint);
        await this.subs.updateOne(
            { _id },
            {
                $set: { acc, endpoint, p256dh: body.p256dh, auth: body.auth, cats, tz, fails: 0 },
                $setOnInsert: { recent: [], last: {} },
            },
            { upsert: true }
        );
        // at most PUSH_SUBS_PER_ACCOUNT devices: the oldest go
        const mine = (await this.subs.find({ acc }).sort({ updatedAt: -1 }).select({ _id: 1 }).lean()) as Array<{
            _id: string;
        }>;
        if (mine.length > PUSH_SUBS_PER_ACCOUNT)
            await this.subs.deleteMany({ _id: { $in: mine.slice(PUSH_SUBS_PER_ACCOUNT).map(r => r._id) } });
        return { on: true, cats, tz };
    }

    /** `POST /pawlegends/push/prefs {endpoint, cats, tz}`: the categories of this device. */
    async prefs(acc: string, body: Record<string, unknown>) {
        const endpoint = body?.endpoint;
        if (!endpointAllowed(endpoint)) throw PUSH_ERRORS.invalid('endpoint is not a known push service');
        const cats = parseCategories(body?.cats);
        const set: Record<string, unknown> = { cats };
        if (body?.tz !== undefined) set.tz = parseTz(body.tz);
        const r = await this.subs.updateOne({ _id: subId(endpoint), acc }, { $set: set });
        return { on: (r?.matchedCount ?? 0) > 0, cats };
    }

    /** `POST /pawlegends/push/unsubscribe {endpoint}`: forget this device. */
    async unsubscribe(acc: string, body: Record<string, unknown>) {
        const endpoint = body?.endpoint;
        if (typeof endpoint !== 'string' || endpoint.length > 1000) throw PUSH_ERRORS.invalid('endpoint');
        await this.subs.deleteOne({ _id: subId(endpoint), acc });
        return { on: false };
    }

    // -------------------------------------------------------------------------------------------- sending

    /** Send to one device when its rules allow; updates its send log (or deletes it when the service says gone). */
    async sendTo(sub: SubRow, msg: PushMessage): Promise<PushOutcome | 'skipped'> {
        const keys = pushVapid();
        if (!keys) return 'skipped';
        const now = this.now();
        const verdict = decide({ cats: sub.cats ?? [], tz: sub.tz ?? 0, state: sub, cat: msg.cat, now });
        if (verdict !== 'send') return 'skipped';
        // claim the slot first (two instances never both send): only if the log is still what was read
        const next = afterSend(sub, msg.cat, now);
        const claimed = await this.subs.updateOne(
            { _id: sub._id, [`last.${msg.cat}`]: sub.last?.[msg.cat] ?? { $exists: false } },
            { $set: { recent: next.recent, [`last.${msg.cat}`]: next.last[msg.cat] } }
        );
        if ((claimed?.modifiedCount ?? 0) === 0) return 'skipped';
        const rule = PUSH_RULES[msg.cat];
        const out = await sendWebPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            {
                t: msg.title.slice(0, 60),
                b: msg.body.slice(0, 140),
                u: safePath(msg.path),
                g: msg.tag.slice(0, 32),
                c: msg.cat,
            },
            keys,
            { ttlSec: rule.ttlSec, urgency: rule.urgency, topic: msg.tag, fetch: this.fetchImpl }
        );
        if (out === 'gone' || (out === 'failed' && (sub.fails ?? 0) + 1 >= MAX_FAILS))
            await this.subs.deleteOne({ _id: sub._id });
        else if (out === 'failed') await this.subs.updateOne({ _id: sub._id }, { $inc: { fails: 1 } });
        else if (sub.fails) await this.subs.updateOne({ _id: sub._id }, { $set: { fails: 0 } });
        this.logger.log(`pl_push ${JSON.stringify({ cat: msg.cat, out })}`);
        return out;
    }

    /** PushSink: every device of these accounts with the category on. */
    async notify(accountIds: readonly string[], msg: PushMessage): Promise<void> {
        if (!pushVapid() || !accountIds.length) return;
        const rows = (await this.subs
            .find({ acc: { $in: [...new Set(accountIds.map(String))].slice(0, 100) }, cats: msg.cat })
            .lean()) as SubRow[];
        for (const r of rows) await this.sendTo(r, msg).catch(() => undefined);
    }

    /** PushSink: every device with the category on (ranked opening, a new event), in batches. */
    async broadcast(msg: PushMessage): Promise<void> {
        if (!pushVapid()) return;
        let after = '';
        for (;;) {
            const rows = (await this.subs
                .find({ cats: msg.cat, ...(after ? { _id: { $gt: after } } : {}) })
                .sort({ _id: 1 })
                .limit(BROADCAST_BATCH)
                .lean()) as SubRow[];
            if (!rows.length) return;
            for (const r of rows) await this.sendTo(r, msg).catch(() => undefined);
            after = rows[rows.length - 1]._id;
            if (rows.length < BROADCAST_BATCH) return;
        }
    }

    // -------------------------------------------------------------------------------------------- scheduled

    private async leased(jobName: string, ttlMs: number, run: () => Promise<unknown>): Promise<void> {
        try {
            const jobRuns = this.subs?.db?.collection?.(JOB_RUNS_COLLECTION);
            if (!jobRuns) return;
            await runLeased({
                jobRuns,
                jobName,
                ttlMs,
                run,
                logger: { log: () => undefined, error: (m: string) => this.logger.warn(m) },
            });
        } catch (error) {
            this.logger.warn(`${jobName} failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
        }
    }

    /** Every 5 minutes: announce a live-ops event (featured mode, community goal, Winter Nap, fan vote) that just began. */
    @Cron('0 */5 * * * *')
    async eventsTick(): Promise<void> {
        if (!pushVapid() || !this.liveops) return;
        await this.leased('pawlegends-push-events', 4 * 60_000, () => this.announceEvents());
    }

    async announceEvents(): Promise<string[]> {
        if (!this.liveops) return [];
        const now = this.now();
        const cfg = await this.liveops.config();
        const doc = (await this.state.findById('events').lean()) as { seen?: string[] } | null;
        const seen = new Set(doc?.seen ?? []);
        const fresh = cfg.events.filter(e => {
            const start = Date.parse(e.startsAt);
            return (
                !seen.has(e.id) &&
                start <= now.getTime() &&
                now.getTime() - start < EVENT_FRESH_MS &&
                Date.parse(e.endsAt) > now.getTime()
            );
        });
        for (const e of fresh) {
            // mark first: a crash in between loses an announcement, never sends one twice
            const r = await this.state
                .updateOne({ _id: 'events', seen: { $ne: e.id } }, { $addToSet: { seen: e.id } }, { upsert: true })
                .catch((err: unknown) => {
                    if ((err as { code?: unknown })?.code === 11000) return { modifiedCount: 0 };
                    throw err;
                });
            if ((r?.modifiedCount ?? 0) === 0 && (r?.upsertedCount ?? 0) === 0) continue;
            await this.broadcast({
                cat: e.kind === 'nap' ? 'nap' : 'event',
                title: e.kind === 'nap' ? 'Winter Nap has begun' : 'New in Paw Legends',
                body: `${e.title}. ${e.sub}`.slice(0, 140),
                path: '/play',
                tag: `ev-${e.id}`.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '-'),
            });
        }
        // keep the list short: only events still in the config
        const live = new Set(cfg.events.map(e => e.id));
        const keep = [...seen, ...fresh.map(e => e.id)].filter(id => live.has(id));
        if (keep.length !== seen.size)
            await this.state.updateOne({ _id: 'events' }, { $set: { seen: keep } }, { upsert: true });
        return fresh.map(e => e.id);
    }

    /** Hourly: Winter Nap, at 18:00 device time: a gift waiting to be opened, or today's gift still to earn. */
    @Cron('0 2 * * * *')
    async napTick(): Promise<void> {
        if (!pushVapid() || !this.liveops) return;
        await this.leased('pawlegends-push-nap', 50 * 60_000, () => this.remindNap());
    }

    async remindNap(): Promise<number> {
        if (!this.liveops) return 0;
        const now = this.now();
        const cfg = await this.liveops.config();
        if (!cfg.nap?.open) return 0;
        let sent = 0;
        let after = '';
        for (;;) {
            const rows = (await this.subs
                .find({ cats: 'nap', ...(after ? { _id: { $gt: after } } : {}) })
                .sort({ _id: 1 })
                .limit(BROADCAST_BATCH)
                .lean()) as SubRow[];
            if (!rows.length) break;
            after = rows[rows.length - 1]._id;
            for (const r of rows) {
                if (localHour(now, r.tz ?? 0) !== NAP_LOCAL_HOUR) continue;
                const me = await this.liveops.me(r.acc).catch(() => null);
                const nap = me?.nap;
                if (!nap) continue;
                const waiting = nap.earned > nap.claimed;
                const toEarn = !nap.playedToday && nap.earned < cfg.nap.gifts.length;
                if (!waiting && !toEarn) continue;
                const out = await this.sendTo(r, {
                    cat: 'nap',
                    title: waiting ? 'A Winter Nap gift is waiting' : 'Your next Winter Nap gift',
                    body: waiting ? 'Open it on the Events tab.' : 'Play one match today to earn it.',
                    path: '/play',
                    tag: 'nap',
                }).catch(() => 'failed' as const);
                if (out === 'sent') sent++;
            }
            if (rows.length < BROADCAST_BATCH) break;
        }
        return sent;
    }
}
