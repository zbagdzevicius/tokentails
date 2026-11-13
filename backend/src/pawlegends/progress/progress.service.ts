import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PawlegendsStore } from '../pawlegends.schema';
import { drawLucky, DAILY_TREAT_XP, luckyOddsTable, LuckyRarity } from './lucky';
import { MASTERY_HERO, masteryView } from './mastery';
import { emptyBlob, mergeBlobs, ProgressBlob, sanitizeBlob } from './progress-merge';
import { PawlegendsProgress, PawlegendsProgressDocument } from './progress.schema';
import { WELCOME_DAYS, WELCOME_PATH, welcomeGrant } from './welcome';

/*
 * Account progress, the Lucky Treat, the Welcome Path and champion mastery (gap plan P2 `rewards-cloud`).
 *
 * Two doors, and only two:
 * - `sync` (`POST /pawlegends/progress`): the client's cosmetic-progress blob, max-merged so progress only goes up. It
 *   never draws, never counts a match, never grants anything;
 * - `applyLive`, called once by the `/live` save (`pawlegends-live.ts`, `pawlegends-party-live.ts`) after its Game row
 *   exists (so a duplicate save never pays twice): mastery, the Welcome Path day and, on a win, `applyLuckyTreat`.
 *   Cosmetic only, and it never fails the save.
 */

export interface ProgressGrant {
    /** `lucky:<day>`, `treat:<day>` (the under-16 Daily Treat) or `welcome:<n>`. */
    id: string;
    kind: 'lucky' | 'treat' | 'welcome';
    day: string;
    item?: string;
    xp?: number;
    rarity?: LuckyRarity;
    floor?: boolean;
    /** Lucky: the draw number; welcome: the day of the path. */
    n?: number;
    at: string;
}

export interface ProgressDoc {
    _id: string;
    blob?: unknown;
    rev?: number;
    luckyDay?: string;
    luckyN?: number;
    welcomeDays?: string[];
    mastery?: unknown;
    grants?: unknown[];
}

/** The storage calls the service makes (Mongo below; specs use an in-memory one). Each is one atomic write. */
export interface ProgressRepo {
    find(id: string): Promise<ProgressDoc | null>;
    /** Create the row if missing (never changes an existing one). */
    ensure(id: string): Promise<void>;
    /** Replace the blob when `rev` still matches (then rev + 1); false on a lost race. */
    casBlob(id: string, rev: number, blob: ProgressBlob): Promise<boolean>;
    /** The day's Lucky Treat claim: the new draw count, or null when today was claimed already. */
    claimLucky(id: string, day: string): Promise<number | null>;
    /** The day's Welcome Path claim: the day number (1..7), or null (today counted, or the path is done). */
    claimWelcome(id: string, day: string): Promise<number | null>;
    pushGrant(id: string, grant: ProgressGrant): Promise<void>;
    incMastery(id: string, hero: string, won: boolean): Promise<void>;
    /** The store's age band for the account (`pawlegendsbuyers` `account:<id>`), null when unknown. */
    ageBand(id: string): Promise<string | null>;
}

export const GRANTS_KEPT = 40;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function mongoProgressRepo(
    model: Model<PawlegendsProgressDocument>,
    buyers: { findOne(f: Record<string, unknown>): any }
): ProgressRepo {
    return {
        find: async id => (await model.findOne({ _id: id }).lean()) as ProgressDoc | null,
        ensure: async id => {
            try {
                await model.updateOne(
                    { _id: id },
                    { $setOnInsert: { blob: {}, rev: 0, luckyN: 0, welcomeDays: [], mastery: {}, grants: [] } },
                    { upsert: true }
                );
            } catch (e) {
                // two first syncs raced: the other one created it
                if ((e as { code?: unknown })?.code !== 11000) throw e;
            }
        },
        casBlob: async (id, rev, blob) =>
            (await model.updateOne({ _id: id, rev }, { $set: { blob }, $inc: { rev: 1 } })).modifiedCount === 1,
        claimLucky: async (id, day) => {
            const d = await model
                .findOneAndUpdate(
                    { _id: id, luckyDay: { $ne: day } },
                    { $set: { luckyDay: day }, $inc: { luckyN: 1 } },
                    { new: true }
                )
                .lean();
            return d ? Number((d as ProgressDoc).luckyN) || 1 : null;
        },
        claimWelcome: async (id, day) => {
            const d = await model
                .findOneAndUpdate(
                    { _id: id, welcomeDays: { $ne: day }, [`welcomeDays.${WELCOME_DAYS - 1}`]: { $exists: false } },
                    { $push: { welcomeDays: day } },
                    { new: true }
                )
                .lean();
            return d ? ((d as ProgressDoc).welcomeDays ?? []).length : null;
        },
        pushGrant: async (id, grant) => {
            await model.updateOne({ _id: id }, { $push: { grants: { $each: [grant], $slice: -GRANTS_KEPT } } });
        },
        incMastery: async (id, hero, won) => {
            await model.updateOne(
                { _id: id },
                { $inc: { [`mastery.${hero}.m`]: 1, [`mastery.${hero}.w`]: won ? 1 : 0 } }
            );
        },
        ageBand: async id => {
            const row = await buyers.findOne({ key: `account:${id}` }).lean();
            return typeof row?.ageBand === 'string' ? row.ageBand : null;
        },
    };
}

/** What `/live` tells the progress service about one verified save. */
export interface LiveProgressMatch {
    won: boolean;
    /** The player's hero (the replay's, or the party room's pick for the slot). */
    hero?: string | null;
}

export interface LiveProgressResult {
    mastery: boolean;
    welcome: number | null;
    lucky: ProgressGrant | null;
}

const isGrant = (g: unknown): g is ProgressGrant =>
    !!g &&
    typeof g === 'object' &&
    typeof (g as ProgressGrant).id === 'string' &&
    typeof (g as ProgressGrant).kind === 'string';

@Injectable()
export class PawlegendsProgressService {
    private readonly logger = new Logger('PawlegendsProgress');
    repo: ProgressRepo;
    now: () => Date = () => new Date();

    constructor(
        @InjectModel(PawlegendsProgress.name) model: Model<PawlegendsProgressDocument>,
        store: PawlegendsStore
    ) {
        this.repo = mongoProgressRepo(model, store.buyers);
    }

    /** Specs: a service over any repo and clock. */
    static forRepo(repo: ProgressRepo, now?: () => Date): PawlegendsProgressService {
        const s = Object.create(PawlegendsProgressService.prototype) as PawlegendsProgressService;
        Object.assign(s, { logger: new Logger('PawlegendsProgress'), repo, now: now ?? (() => new Date()) });
        return s;
    }

    /** `GET /pawlegends/progress`: the stored blob and the server-side parts. Writes nothing. */
    async view(accountId: string) {
        const [doc, band] = await Promise.all([
            this.repo.find(accountId),
            this.repo.ageBand(accountId).catch(() => null),
        ]);
        return this.viewOf(doc, band);
    }

    /** `POST /pawlegends/progress`: max-merge the client's blob into the stored one; answers the view. Never draws. */
    async sync(accountId: string, raw: unknown) {
        const incoming = sanitizeBlob(raw);
        await this.repo.ensure(accountId);
        for (let i = 0; i < 4; i++) {
            const doc = await this.repo.find(accountId);
            const merged = mergeBlobs(sanitizeBlob(doc?.blob), incoming);
            if (await this.repo.casBlob(accountId, Number(doc?.rev) || 0, merged)) {
                const band = await this.repo.ageBand(accountId).catch(() => null);
                return this.viewOf({ ...(doc as ProgressDoc), blob: merged, rev: (Number(doc?.rev) || 0) + 1 }, band);
            }
        }
        // four lost races in a row: answer what is stored; the client syncs again later
        return this.view(accountId);
    }

    /**
     * The `/live` hook (one call per verified save, after its Game row exists). Mastery for the hero, the Welcome
     * Path's day of play, and on a win the day's Lucky Treat. Logged, never thrown: a failure here never fails a save.
     */
    async applyLive(accountId: string, m: LiveProgressMatch): Promise<LiveProgressResult> {
        const out: LiveProgressResult = { mastery: false, welcome: null, lucky: null };
        try {
            const day = utcDay(this.now());
            await this.repo.ensure(accountId);
            if (m.hero && MASTERY_HERO.test(m.hero)) {
                await this.repo.incMastery(accountId, m.hero, m.won);
                out.mastery = true;
            }
            const owned = await this.ownedOf(accountId);
            const wd = await this.repo.claimWelcome(accountId, day);
            if (wd !== null) {
                const g = welcomeGrant(wd, owned);
                if (g) {
                    await this.repo.pushGrant(accountId, {
                        id: `welcome:${wd}`,
                        kind: 'welcome',
                        day,
                        n: wd,
                        ...g,
                        at: this.now().toISOString(),
                    });
                    if (g.item) owned.add(g.item);
                    out.welcome = wd;
                }
            }
            if (m.won) out.lucky = await this.applyLuckyTreat(accountId, day, owned);
        } catch (error) {
            this.logger.warn(`pawlegends progress live hook failed: ${(error as Error)?.message ?? error}`);
        }
        return out;
    }

    /**
     * The Lucky Treat (lucky.ts; founder call #3's default): the first verified win of the UTC day claims the day once,
     * then draws from the published odds, or pays the fixed Daily Treat to the under-16 band. Only `applyLive` calls it.
     */
    private async applyLuckyTreat(accountId: string, day: string, owned: Set<string>): Promise<ProgressGrant | null> {
        const n = await this.repo.claimLucky(accountId, day);
        if (n === null) return null;
        const at = this.now().toISOString();
        const band = await this.repo.ageBand(accountId).catch(() => null);
        const grant: ProgressGrant =
            band === 'under16'
                ? { id: `treat:${day}`, kind: 'treat', day, xp: DAILY_TREAT_XP, at }
                : (() => {
                      const d = drawLucky(accountId, day, n, owned);
                      return {
                          id: `lucky:${day}`,
                          kind: 'lucky' as const,
                          day,
                          n,
                          rarity: d.rarity,
                          ...(d.item ? { item: d.item } : { xp: d.xp }),
                          ...(d.floor ? { floor: true } : {}),
                          at,
                      };
                  })();
        await this.repo.pushGrant(accountId, grant);
        return grant;
    }

    /** What the account owns for the draw: its blob's unlocks plus the items of grants it has not applied yet. */
    private async ownedOf(accountId: string): Promise<Set<string>> {
        const doc = await this.repo.find(accountId);
        const owned = new Set(sanitizeBlob(doc?.blob).unlocks);
        for (const g of (doc?.grants ?? []).filter(isGrant)) if (g.item) owned.add(g.item);
        return owned;
    }

    private viewOf(doc: ProgressDoc | null, band: string | null) {
        const blob = doc ? sanitizeBlob(doc.blob) : emptyBlob();
        const days = (doc?.welcomeDays ?? []).filter(d => typeof d === 'string');
        const today = utcDay(this.now());
        return {
            rev: Number(doc?.rev) || 0,
            today,
            blob,
            grants: (doc?.grants ?? []).filter(isGrant).slice(-GRANTS_KEPT),
            lucky: {
                ...luckyOddsTable(),
                n: Number(doc?.luckyN) || 0,
                day: doc?.luckyDay ?? null,
                eligible: band !== 'under16',
            },
            welcome: { days: days.length, today: days.includes(today), path: WELCOME_PATH },
            mastery: masteryView(doc?.mastery),
        };
    }
}
