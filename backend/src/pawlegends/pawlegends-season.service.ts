import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    claimable,
    claimKey,
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
 * Sets the season row's premium and skips from the paid purchases. A downgrade to 'none' revokes the premium rewards
 * claimed under it and clears their claims (buying again lets them be claimed again).
 */
export async function syncPremium(
    models: Models,
    accountId: string,
    now: Date,
    seasonId = CURRENT_SEASON_ID
): Promise<PawlegendsPremium> {
    const premium = await premiumOf(models, accountId);
    const row = await ensureSeason(models, accountId, seasonId);
    const update: Record<string, unknown> = { premium, skips: premium === 'plus' ? SEASON_PLUS_SKIPS : 0 };
    if (premium === 'none') {
        update.claimed = (Array.isArray(row?.claimed) ? row.claimed : []).filter((c: string) => !c.startsWith('p:'));
        await models.owned.updateMany(
            { accountId, claim: { $regex: `^${seasonId}:p:` }, revokedAt: { $exists: false } },
            { $set: { revokedAt: now } }
        );
    }
    await models.seasons.updateOne({ _id: seasonDocId(accountId, seasonId) }, { $set: update });
    return premium;
}

/** The grant of a paid store or pass SKU (webhook): the items, then the pass row. Idempotent. */
export async function grantPurchase(models: Models, accountId: string, sku: string, sessionId: string, now: Date) {
    const def = PAWLEGENDS_SKUS[sku];
    if (!def?.kind || def.retired) return;
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
}

export interface SeasonXpMatch {
    won: boolean;
    forfeit: boolean;
    /** Kills plus assists of the player's slot (0 when the verdict has no stats). */
    takedowns: number;
    /** A party match over the daily cap counts as a match and pays no XP. */
    capped?: boolean;
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
): Promise<SeasonXpGain | null> {
    const def = seasonDef(seasonId);
    if (!def || !accountId) return null;
    const _id = seasonDocId(accountId, seasonId);
    const before = await ensureSeason(models, accountId, seasonId);
    const prevTier = seasonTier(def, Number(before?.xp) || 0, Number(before?.skips) || 0);
    if (m.capped) return { seasonId, xp: Number(before?.xp) || 0, tier: prevTier, prevTier, gained: 0 };
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
    return { seasonId, xp, tier: seasonTier(def, xp, Number(after?.skips) || 0), prevTier, gained };
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
}

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

    constructor(private readonly store: PawlegendsStore) {}

    ownedItems(accountId: string): Promise<string[]> {
        return ownedItemsOf(this.store, accountId);
    }

    /** GET /pawlegends/me: owned items and the current season's pass row. */
    async me(accountId: string): Promise<PawlegendsMe> {
        const def = seasonDef(CURRENT_SEASON_ID)!;
        const row = await ensureSeason(this.store, accountId, def.id);
        return { items: await this.ownedItems(accountId), season: view(def, row) };
    }

    /** The `/live` hook: never fails the save (the Game row and catnip are the score; XP is a cosmetic track). */
    async addXp(accountId: string, m: SeasonXpMatch): Promise<SeasonXpGain | null> {
        try {
            return await addSeasonXp(this.store, String(accountId), m, this.now());
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

/**
 * Guest → account merge (pawlegends-merge.ts): the guest's owned rows and season rows move to the account.
 * Idempotent: owned rows are upserted on the target then deleted from the guest; season XP is the larger of the two
 * (`$max`, safe to replay), claims are unioned, and the guest row is deleted last. Premium stays the target's
 * (guests cannot buy).
 */
export async function mergeStoreProgress(models: Pick<Models, 'owned' | 'seasons'>, guestId: string, targetId: string) {
    if (!guestId || !targetId || guestId === targetId) return;
    const owned = (await models.owned.find({ accountId: guestId }).lean()) as any[];
    for (const row of owned) {
        if (row.revokedAt) continue;
        await grantItems(models, targetId, [row.item], row.source, {
            ...(row.sessionId ? { sessionId: row.sessionId } : {}),
            ...(row.claim ? { claim: row.claim } : {}),
        });
    }
    await models.owned.deleteMany({ accountId: guestId });
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
