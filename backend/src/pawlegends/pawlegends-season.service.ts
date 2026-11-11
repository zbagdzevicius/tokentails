import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Game, GameType } from 'src/game/game.schema';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    addYarn,
    allowedHeroesFor,
    championsView,
    ChampionsView,
    ensureFounders,
    FoundersEvidence,
    ownedChampions,
    unlockChampion,
    YarnGain,
} from './pawlegends-champion-store';
import {
    claimable,
    claimKey,
    CHAMPION_IDS,
    CURRENT_SEASON_ID,
    PASS_PLUS_SKU,
    PASS_SKU,
    PASS_SKUS,
    PASS_UPGRADE_SKU,
    PassRow,
    rewardAt,
    SEASON_PLUS_SKIPS,
    seasonDef,
    SeasonDef,
    seasonTier,
    seasonXpFor,
} from './pawlegends-catalog';
import { PAWLEGENDS_SKUS } from './pawlegends.contracts';
import { pawlegendsError } from './pawlegends.errors';
import { PawlegendsOwnedSource, PawlegendsPremium, PawlegendsStore } from './pawlegends.schema';

/*
 * Store ownership and the Legends Pass (docs/plans/moba/STORE-PASS.md). Everything here is cosmetic: it never reads
 * or writes a score, a Game row or the sim. Season XP is added only by the one score writer (`POST
 * /user/catbassadors/live`, pawlegends-live.ts and pawlegends-party-live.ts) after its Game row was created, so a
 * duplicate save (same replay digest, same party room and slot) never pays twice.
 *
 * - Ownership = `pawlegendsowned` rows without `revokedAt`: purchases (webhook grant), pass rewards (claims).
 * - A pass row is `pawlegendsseason/<accountId>:<seasonId>`: XP, premium ('none' | 'pass' | 'plus'), Pass+ skips,
 *   claimed rewards and the UTC day of the last first-win bonus.
 * - The premium state is always recomputed from the paid purchase rows, so a refund downgrades it (and the premium
 *   rewards claimed under it are revoked, so a pass cannot be bought, claimed out and refunded).
 */

type Models = Pick<PawlegendsStore, 'owned' | 'seasons' | 'purchases'>;

export const seasonDocId = (accountId: string, seasonId: string) => `${accountId}:${seasonId}`;
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export const PASS_ERRORS = {
    unknownSeason: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'Unknown season'),
    badTier: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'No reward on that tier'),
    notReached: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_TIER_LOCKED', 'That tier is not reached yet'),
    needsPass: () =>
        pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEEDS_PASS', 'The premium row needs the Legends Pass'),
};

/** Items the account owns now (not revoked). */
export async function ownedItemsOf(
    models: Pick<Models, 'owned'>,
    accountId: string | null | undefined
): Promise<string[]> {
    if (!accountId) return [];
    const rows = (await models.owned.find({ accountId: String(accountId) }).lean()) as any[];
    return [...new Set(rows.filter(r => !r.revokedAt).map(r => String(r.item)))].sort();
}

/** Grants items idempotently (one upsert per item; a revoked row is restored). */
export async function grantItems(
    models: Pick<Models, 'owned'>,
    accountId: string,
    items: readonly string[],
    source: PawlegendsOwnedSource,
    extra: { sessionId?: string; claim?: string } = {}
): Promise<void> {
    for (const item of items) {
        try {
            await models.owned.updateOne(
                { accountId, item },
                { $set: { source, ...extra }, $unset: { revokedAt: '' } },
                { upsert: true }
            );
        } catch (error) {
            // Two grants raced on the upsert: the other one wrote it.
            if (!isDuplicateKeyError(error)) throw error;
        }
    }
}

/** Revokes the items one Checkout Session granted. */
export async function revokeSession(models: Pick<Models, 'owned'>, sessionId: string, now: Date): Promise<void> {
    await models.owned.updateMany({ sessionId, revokedAt: { $exists: false } }, { $set: { revokedAt: now } });
}

/** The season row, created empty when missing. */
async function ensureSeason(models: Pick<Models, 'seasons'>, accountId: string, seasonId: string): Promise<any> {
    const _id = seasonDocId(accountId, seasonId);
    try {
        await models.seasons.updateOne(
            { _id },
            { $setOnInsert: { accountId, seasonId, xp: 0, premium: 'none', skips: 0, claimed: [] } },
            { upsert: true }
        );
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
    }
    return models.seasons.findOne({ _id }).lean();
}

/** The premium state the account's paid pass purchases give (refunds under the presale terms keep it). */
export async function premiumOf(models: Pick<Models, 'purchases'>, accountId: string): Promise<PawlegendsPremium> {
    const rows = (await models.purchases
        .find({
            $and: [
                { accountId },
                { sku: { $in: PASS_SKUS } },
                { $or: [{ status: 'paid' }, { status: 'refunded', termsRefund: true }] },
            ],
        })
        .lean()) as any[];
    const skus = new Set(rows.map(r => String(r.sku)));
    if (skus.has(PASS_PLUS_SKU) || (skus.has(PASS_SKU) && skus.has(PASS_UPGRADE_SKU))) return 'plus';
    return skus.has(PASS_SKU) ? 'pass' : 'none';
}

/**
 * Sets the season row's premium and skips from the paid purchases. A downgrade revokes the rewards it no longer
 * covers and clears their claims (buying again lets them be claimed again): every premium reward when the premium is
 * 'none', and every reward (free and premium row) above the tier the XP and the remaining skips reach, so a refunded
 * Pass+ or upgrade takes back what only its 15 skips unlocked.
 */
export async function syncPremium(
    models: Models,
    accountId: string,
    now: Date,
    seasonId = CURRENT_SEASON_ID
): Promise<PawlegendsPremium> {
    const premium = await premiumOf(models, accountId);
    const row = await ensureSeason(models, accountId, seasonId);
    const skips = premium === 'plus' ? SEASON_PLUS_SKIPS : 0;
    const def = seasonDef(seasonId);
    const tier = def ? seasonTier(def, Number(row?.xp) || 0, skips) : Number.POSITIVE_INFINITY;
    const claimed: string[] = Array.isArray(row?.claimed) ? row.claimed.map(String) : [];
    const drop = claimed.filter(c => (premium === 'none' && c.startsWith('p:')) || Number(c.split(':')[1]) > tier);
    const _id = seasonDocId(accountId, seasonId);
    await models.seasons.updateOne(
        { _id },
        { $set: { premium, skips }, ...(drop.length ? { $pull: { claimed: { $in: drop } } } : {}) }
    );
    if (drop.length) {
        await models.owned.updateMany(
            { accountId, claim: { $in: drop.map(c => `${seasonId}:${c}`) }, revokedAt: { $exists: false } },
            { $set: { revokedAt: now } }
        );
    }
    if (premium === 'none') {
        // Also premium rewards whose claim was granted but not recorded (a crash between the two writes).
        await models.owned.updateMany(
            { accountId, claim: { $regex: `^${seasonId}:p:` }, revokedAt: { $exists: false } },
            { $set: { revokedAt: now } }
        );
    }
    return premium;
}

/**
 * The grant of a paid store or pass SKU (webhook): the items, then the pass row. Idempotent. A champion SKU grants the
 * champions its checkout hold listed (`items`: the ones not owned at checkout) and never takes over a champion row
 * the account already holds (a Yarn unlock stays a Yarn unlock, so this session's refund never revokes it).
 */
export async function grantPurchase(
    models: Models,
    accountId: string,
    sku: string,
    sessionId: string,
    now: Date,
    items?: readonly string[]
) {
    const def = PAWLEGENDS_SKUS[sku];
    if (!def?.kind || def.retired) return;
    if (def.kind === 'champion') {
        const grant = items?.length ? items.filter(i => def.items.includes(i)) : def.items;
        const live = new Set(await ownedItemsOf(models, accountId));
        await grantItems(
            models,
            accountId,
            grant.filter(i => !live.has(i)),
            'purchase',
            { sessionId }
        );
        return;
    }
    await grantItems(models, accountId, def.items, 'purchase', { sessionId });
    if (def.kind === 'pass') await syncPremium(models, accountId, now);
}

export interface SeasonXpGain {
    seasonId: string;
    xp: number;
    tier: number;
    /** The tier before this match (a tier-up toast when lower). */
    prevTier: number;
    gained: number;
    /** CHAMPION-STORE.md: the Yarn this match paid (absent when none was due or the Yarn store is not wired). */
    yarn?: YarnGain;
    /** CHAMPION-STORE.md §8.5: the solo save's hero was not the player's to pick; nothing was paid. */
    heroLocked?: true;
}

/** What addSeasonXp also tells the score hook (never sent to the client). */
interface SeasonXpResult extends SeasonXpGain {
    firstWinToday: boolean;
    capped: boolean;
}

export interface SeasonXpMatch {
    won: boolean;
    forfeit: boolean;
    /** Kills plus assists of the player's slot (0 when the verdict has no stats). */
    takedowns: number;
    /** A party match over the daily cap counts as a match and pays no XP. */
    capped?: boolean;
    /**
     * Solo saves (the client picks the seed and can re-sim offline): the match's length in real time, in ms. XP is
     * paid at most SOLO_DAILY_XP_MATCHES times a UTC day, and only when at least SOLO_REAL_TIME_SHARE of this length
     * passed since the last paid solo match, so replays made faster than real play pay nothing.
     */
    soloMs?: number;
    /** CHAMPION-STORE.md: the save's unique ref (its replay digest): Yarn is paid once per ref. */
    ref?: string;
    /** A solo save's hero: checked against the heroes the account could pick when the match started. */
    hero?: string;
}

/** Solo matches that pay Season XP per UTC day (the party writer's PARTY_DAILY_CAP is the same number). */
export const SOLO_DAILY_XP_MATCHES = 30;
/** Share of a solo match's length that must have passed since the last paid solo match. */
export const SOLO_REAL_TIME_SHARE = 0.8;

/**
 * The atomic solo gate: one paid match more today (the counter resets on a new UTC day) and a real-time gap since the
 * last paid one (`xpAt`). False when either fails, or when a concurrent save took it.
 */
async function claimSoloSlot(
    models: Pick<Models, 'seasons'>,
    _id: string,
    soloMs: number,
    now: Date
): Promise<boolean> {
    const day = utcDay(now);
    const cutoff = new Date(now.getTime() - Math.max(0, soloMs) * SOLO_REAL_TIME_SHARE);
    const gap = { $or: [{ xpAt: { $exists: false } }, { xpAt: { $lte: cutoff } }] };
    const sameDay = await models.seasons
        .findOneAndUpdate(
            { $and: [{ _id, xpDay: day, xpMatches: { $lt: SOLO_DAILY_XP_MATCHES } }, gap] },
            { $inc: { xpMatches: 1 }, $set: { xpAt: now } },
            { new: true }
        )
        .lean();
    if (sameDay) return true;
    const newDay = await models.seasons
        .findOneAndUpdate(
            { $and: [{ _id, xpDay: { $ne: day } }, gap] },
            { $set: { xpDay: day, xpMatches: 1, xpAt: now } },
            { new: true }
        )
        .lean();
    return !!newDay;
}

/**
 * Season XP for one verified match (called by the score writers after the Game row exists). The first win of the UTC
 * day is an atomic claim on `winDay`, so two wins saved at once pay the bonus once.
 */
export async function addSeasonXp(
    models: Pick<Models, 'seasons'>,
    accountId: string,
    m: SeasonXpMatch,
    now: Date,
    seasonId = CURRENT_SEASON_ID
): Promise<SeasonXpResult | null> {
    const def = seasonDef(seasonId);
    if (!def || !accountId) return null;
    const _id = seasonDocId(accountId, seasonId);
    const before = await ensureSeason(models, accountId, seasonId);
    const prevTier = seasonTier(def, Number(before?.xp) || 0, Number(before?.skips) || 0);
    const capped = m.capped || (m.soloMs !== undefined && !(await claimSoloSlot(models, _id, m.soloMs, now)));
    if (capped)
        return {
            seasonId,
            xp: Number(before?.xp) || 0,
            tier: prevTier,
            prevTier,
            gained: 0,
            firstWinToday: false,
            capped: true,
        };
    let firstWinToday = false;
    if (m.won && !m.forfeit) {
        const day = utcDay(now);
        const claimed = await models.seasons
            .findOneAndUpdate({ _id, winDay: { $ne: day } }, { $set: { winDay: day } }, { new: true })
            .lean();
        firstWinToday = !!claimed;
    }
    const gained = seasonXpFor({ won: m.won, forfeit: m.forfeit, takedowns: m.takedowns, firstWinToday });
    const after = (await models.seasons
        .findOneAndUpdate({ _id }, { $inc: { xp: gained }, $set: { updatedAt: now } }, { new: true })
        .lean()) as any;
    const xp = Number(after?.xp) || 0;
    return {
        seasonId,
        xp,
        tier: seasonTier(def, xp, Number(after?.skips) || 0),
        prevTier,
        gained,
        firstWinToday,
        capped: false,
    };
}

export interface PawlegendsSeasonView {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    tiers: number;
    xpPerTier: number;
    xp: number;
    tier: number;
    premium: PawlegendsPremium;
    skips: number;
    claimed: string[];
    /** Rewards reached and not claimed yet. */
    claimable: number;
}

export interface PawlegendsMe {
    items: string[];
    season: PawlegendsSeasonView;
    /** CHAMPION-STORE.md §11: owned champions, starters, the week's rotation and the Yarn balance. */
    champions: ChampionsView;
}

/** A Yarn model stand-in that finds nothing (specs that build the store without the champion models). */
const nullYarn = { findOne: () => ({ lean: async () => null }) };

const view = (def: SeasonDef, row: any): PawlegendsSeasonView => {
    const s = {
        xp: Number(row?.xp) || 0,
        skips: Number(row?.skips) || 0,
        premium: (['pass', 'plus'].includes(row?.premium) ? row.premium : 'none') as PawlegendsPremium,
        claimed: Array.isArray(row?.claimed) ? row.claimed.map(String) : [],
    };
    return {
        id: def.id,
        name: def.name,
        startsAt: def.startsAt,
        endsAt: def.endsAt,
        tiers: def.tiers,
        xpPerTier: def.xpPerTier,
        ...s,
        tier: seasonTier(def, s.xp, s.skips),
        claimable: claimable(def, s).length,
    };
};

@Injectable()
export class PawlegendsSeasonService {
    private readonly logger = new Logger(PawlegendsSeasonService.name);
    now: () => Date = () => new Date();
    /**
     * CHAMPION-STORE.md §7: whether the account finished a Paw Legends match before the champion store's release
     * (its Game rows: solo and party saves). Specs replace it.
     */
    foundersEvidence: FoundersEvidence | undefined;

    constructor(private readonly store: PawlegendsStore, @Optional() @InjectModel(Game.name) games?: Model<any>) {
        this.foundersEvidence = games
            ? async (accountId, before) =>
                  Types.ObjectId.isValid(accountId) &&
                  !!(await games
                      .findOne(
                          {
                              user: new Types.ObjectId(accountId),
                              type: GameType.PAWLEGENDS,
                              createdAt: { $lt: before },
                          },
                          { _id: 1 }
                      )
                      .lean())
            : undefined;
    }

    /** The champion store's models are wired (production; older specs build the store without them). */
    private get champStore(): boolean {
        return !!this.store.yarn && !!this.store.yarnLog;
    }

    ownedItems(accountId: string): Promise<string[]> {
        return ownedItemsOf(this.store, accountId);
    }

    /** GET /pawlegends/me: owned items, the current season's pass row and the champions. */
    async me(accountId: string): Promise<PawlegendsMe> {
        const def = seasonDef(CURRENT_SEASON_ID)!;
        const row = await ensureSeason(this.store, accountId, def.id);
        const champions = await this.champions(accountId);
        return { items: await this.ownedItems(accountId), season: view(def, row), champions };
    }

    /** The champions view (the Founders roster checked first, once per account). */
    async champions(accountId: string | null): Promise<ChampionsView> {
        const now = this.now();
        if (!this.champStore) return championsView({ ...this.store, yarn: nullYarn } as never, accountId, now);
        const founders = accountId ? await ensureFounders(this.store, accountId, this.foundersEvidence, now) : false;
        return championsView(this.store, accountId, now, founders);
    }

    /**
     * The heroes an account may pick at `at` (the relay's allowed set, the solo save's check): starters, that week's
     * rotation and the owned champions (the Founders roster checked first).
     */
    async allowedHeroes(accountId: string | null, at: Date = this.now()): Promise<string[]> {
        if (accountId && this.champStore)
            await ensureFounders(this.store, accountId, this.foundersEvidence, this.now());
        return allowedHeroesFor(this.store, accountId, at);
    }

    /** The champions an account owns (the relay's cache), the Founders roster checked first. */
    async ownedHeroes(accountId: string): Promise<string[]> {
        if (!this.champStore) return [];
        await ensureFounders(this.store, accountId, this.foundersEvidence, this.now());
        return (await ownedChampions(this.store, accountId)).map(o => o.hero);
    }

    /** True when `hero` is a champion the account could not pick at `at`. A hero the catalog does not know is free. */
    async heroLocked(accountId: string, hero: string, at: Date): Promise<boolean> {
        if (!CHAMPION_IDS.includes(hero)) return false;
        return !(await this.allowedHeroes(accountId, at)).includes(hero);
    }

    /** POST /pawlegends/champions/unlock: a Yarn unlock or a Champion Pick, then the champions view. */
    async unlock(
        accountId: string,
        body: Record<string, unknown>
    ): Promise<{ hero: string; champions: ChampionsView }> {
        await ensureFounders(this.store, accountId, this.foundersEvidence, this.now());
        const r = await unlockChampion(this.store, accountId, body);
        return { hero: r.hero, champions: await this.champions(accountId) };
    }

    /**
     * The `/live` hook: never fails the save (the Game row and catnip are the score; XP and Yarn are meta tracks). A
     * solo save whose hero the account could not pick pays nothing (CHAMPION-STORE.md §8.5). Yarn follows Season XP's
     * limits: nothing for a capped match, once per save ref.
     */
    async addXp(accountId: string, m: SeasonXpMatch): Promise<SeasonXpGain | null> {
        const id = String(accountId);
        try {
            const now = this.now();
            if (m.hero && this.champStore) {
                const startedAt = new Date(now.getTime() - Math.max(0, m.soloMs ?? 0));
                if (await this.heroLocked(id, m.hero, startedAt)) {
                    const def = seasonDef(CURRENT_SEASON_ID)!;
                    const row = await ensureSeason(this.store, id, def.id);
                    const tier = seasonTier(def, Number(row?.xp) || 0, Number(row?.skips) || 0);
                    return {
                        seasonId: def.id,
                        xp: Number(row?.xp) || 0,
                        tier,
                        prevTier: tier,
                        gained: 0,
                        heroLocked: true,
                    };
                }
            }
            const r = await addSeasonXp(this.store, id, m, now);
            if (!r) return null;
            const { firstWinToday, capped, ...gain } = r;
            if (!capped && m.ref && this.champStore) {
                try {
                    const yarn = await addYarn(
                        this.store,
                        id,
                        { ref: m.ref, won: m.won, forfeit: m.forfeit, takedowns: m.takedowns, firstWinToday },
                        now
                    );
                    if (yarn) return { ...gain, yarn };
                } catch (error) {
                    this.logger.warn(`yarn failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
                }
            }
            return gain;
        } catch (error) {
            this.logger.warn(`season xp failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
            return null;
        }
    }

    /**
     * POST /pawlegends/pass/claim: one reward (`row` + `tier`) or every claimable one (`all`). The item is granted
     * first, then the claim recorded, so a crash in between is healed by claiming again. Idempotent: a claimed tier
     * answers no new items. The premium row needs the pass (guests can claim the free row only).
     */
    async claim(
        accountId: string,
        body: { seasonId?: unknown; row?: unknown; tier?: unknown; all?: unknown }
    ): Promise<{ items: string[]; me: PawlegendsMe }> {
        const def = seasonDef(body?.seasonId ?? CURRENT_SEASON_ID);
        if (!def) throw PASS_ERRORS.unknownSeason();
        const row = await ensureSeason(this.store, accountId, def.id);
        const state = view(def, row);
        const open = claimable(def, state);
        let picks = open;
        if (body?.all !== true) {
            const r = body?.row === 'f' || body?.row === 'p' ? (body.row as PassRow) : null;
            const tier = Number(body?.tier);
            if (!r || !Number.isInteger(tier) || !rewardAt(def, r, tier)) throw PASS_ERRORS.badTier();
            if (state.claimed.includes(claimKey(r, tier))) return { items: [], me: await this.me(accountId) };
            if (r === 'p' && state.premium === 'none') throw PASS_ERRORS.needsPass();
            if (tier > state.tier) throw PASS_ERRORS.notReached();
            picks = open.filter(p => p.row === r && p.tier === tier);
        }
        const items: string[] = [];
        for (const p of picks) {
            await grantItems(this.store, accountId, [p.item], 'pass', { claim: `${def.id}:${p.row}:${p.tier}` });
            await this.store.seasons.updateOne(
                { _id: seasonDocId(accountId, def.id) },
                { $addToSet: { claimed: claimKey(p.row, p.tier) } }
            );
            items.push(p.item);
        }
        return { items, me: await this.me(accountId) };
    }
}

/** Champion rows a player got for free (CHAMPION-STORE.md §7): they never carry a purchase's session. */
const FREE_CHAMP_SOURCES: readonly string[] = ['founders', 'yarn', 'milestone'];

/**
 * Guest → account merge (pawlegends-merge.ts): the guest's owned rows, season rows and Yarn move to the account.
 * Idempotent: owned rows are upserted on the target then deleted from the guest; season XP is the larger of the two
 * (`$max`, safe to replay), claims are unioned, and the guest row is deleted last. Premium stays the target's
 * (guests cannot buy). A champion the guest got for free (the Founders roster, Yarn, a Champion Pick) drops the
 * target's purchase session, so a refund of the target's purchase never takes it away. The guest's Yarn balance,
 * matches and Champion Picks add to the account's once (the guest's Yarn row is the claim, deleted after), and the
 * account's Founders check runs again: the guest's Game rows moved to it before this step (GDD §8.1 #7).
 */
export async function mergeStoreProgress(
    models: Pick<Models, 'owned' | 'seasons'> & { yarn?: PawlegendsStore['yarn'] },
    guestId: string,
    targetId: string
) {
    if (!guestId || !targetId || guestId === targetId) return;
    const owned = (await models.owned.find({ accountId: guestId }).lean()) as any[];
    for (const row of owned) {
        if (row.revokedAt) continue;
        const free = FREE_CHAMP_SOURCES.includes(row.source);
        await grantItems(models, targetId, [row.item], row.source, {
            ...(row.sessionId ? { sessionId: row.sessionId } : {}),
            ...(row.claim ? { claim: row.claim } : {}),
        });
        if (free)
            await models.owned.updateOne(
                { accountId: targetId, item: row.item },
                { $unset: { sessionId: '', claim: '' } }
            );
    }
    await models.owned.deleteMany({ accountId: guestId });
    if (models.yarn) await mergeYarn(models.yarn, guestId, targetId);
    const seasons = (await models.seasons.find({ accountId: guestId }).lean()) as any[];
    for (const g of seasons) {
        const seasonId = String(g.seasonId);
        await ensureSeason(models, targetId, seasonId);
        const claimed = (Array.isArray(g.claimed) ? g.claimed : []).filter((c: string) => c.startsWith('f:'));
        const _id = seasonDocId(targetId, seasonId);
        await models.seasons.updateOne({ _id }, { $max: { xp: Number(g.xp) || 0 } });
        for (const c of claimed) await models.seasons.updateOne({ _id }, { $addToSet: { claimed: c } });
        await models.seasons.deleteMany({ _id: g._id });
    }
}

/**
 * The guest's Yarn row into the account's (CHAMPION-STORE.md §7, guest merge): balance, earned, matches, picks and
 * Champion Picks left add up, the paid-for champions are unioned. Once: the guest row is taken (`findOneAndDelete`)
 * before the account's `$inc`. The account's `foundersChecked` is cleared so the Founders check runs again over the
 * Game rows the merge moved to it.
 */
async function mergeYarn(yarn: PawlegendsStore['yarn'], guestId: string, targetId: string): Promise<void> {
    const g = (await yarn.findOne({ _id: guestId }).lean()) as any;
    // the guest row is the claim: only the call that deletes it adds its Yarn (a replayed merge adds nothing)
    const taken = g ? Number((await yarn.deleteOne({ _id: guestId }))?.deletedCount) === 1 : false;
    try {
        await yarn.updateOne({ _id: targetId }, { $setOnInsert: { picksUsed: 0 } }, { upsert: true });
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
    }
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    if (taken) {
        await yarn.updateOne(
            { _id: targetId },
            {
                $inc: {
                    balance: n(g.balance),
                    earned: n(g.earned),
                    matches: n(g.matches),
                    picks: n(g.picks),
                    picksLeft: n(g.picksLeft),
                },
            }
        );
        for (const hero of Array.isArray(g.unlocked) ? g.unlocked.map(String) : [])
            await yarn.updateOne({ _id: targetId }, { $addToSet: { unlocked: hero } });
    }
    await yarn.updateOne({ _id: targetId }, { $unset: { foundersChecked: '' } });
}
