import { HttpStatus } from '@nestjs/common';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    allowedChampions,
    catalogSku,
    CHAMP_BUNDLE_SKUS,
    championBundleCents,
    CHAMP_PICK_MILESTONES,
    CHAMP_PICK_TIERS,
    champItem,
    CHAMPION_IDS,
    champTier,
    champYarnPrice,
    FOUNDERS_BADGE,
    heroOfChampItem,
    isStarter,
    rotationEndsAt,
    rotationOf,
    rotationWeek,
    STARTERS,
    YARN,
    yarnFor,
} from './pawlegends-catalog';
import { pawlegendsError } from './pawlegends.errors';
import { PawlegendsOwnedSource, PawlegendsStore } from './pawlegends.schema';

/*
 * Champion ownership and Yarn (docs/plans/moba/CHAMPION-STORE.md). Meta data only: nothing here reads or writes a
 * score, a Game row or the sim. A player may pick a champion when it is a starter, in the week's free rotation, or
 * owned (`pawlegendsowned` row `champ.<hero>` without `revokedAt`: a web purchase, a Yarn unlock, a Champion Pick, the
 * Founders roster). Yarn is paid only by the one score writer's season hook (`PawlegendsSeasonService.addXp`), after
 * the Game row exists, once per save (`pawlegendsyarnlog` is unique per account and ref).
 */

type Models = Pick<PawlegendsStore, 'owned' | 'yarn' | 'yarnLog'>;

/** The release row: the champion store's release time T (the Founders roster cut-off). */
export const RELEASE_ID = 'meta:champions-release';

export const CHAMP_ERRORS = {
    unknown: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'Unknown champion'),
    free: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'That champion is a free starter'),
    owned: () => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_ALREADY_OWNED', 'You already have that champion'),
    yarn: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NOT_ENOUGH_YARN', 'Not enough Yarn yet'),
    noPick: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NO_PICK', 'No Champion Pick left'),
    pickTier: () =>
        pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'A Champion Pick unlocks Tier 1 or Tier 2'),
};

/** ISO week of a date: `2026-W47`. */
export function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const year = t.getUTCFullYear();
    const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The release time T, written once (the first call wins; later calls read it). */
export async function championReleaseAt(models: Pick<Models, 'yarn'>, now: Date): Promise<Date> {
    try {
        await models.yarn.updateOne({ _id: RELEASE_ID }, { $setOnInsert: { at: now } }, { upsert: true });
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
    }
    const row = (await models.yarn.findOne({ _id: RELEASE_ID }).lean()) as any;
    return row?.at ? new Date(row.at) : now;
}

async function ensureYarnRow(models: Pick<Models, 'yarn'>, accountId: string): Promise<any> {
    try {
        await models.yarn.updateOne(
            { _id: accountId },
            { $setOnInsert: { balance: 0, earned: 0, matches: 0, picks: 0, picksLeft: 0 } },
            { upsert: true }
        );
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
    }
    return models.yarn.findOne({ _id: accountId }).lean();
}

export interface OwnedChampion {
    hero: string;
    source: PawlegendsOwnedSource;
}

/** The champions an account owns now (not revoked), in CHAMPION_IDS order. */
export async function ownedChampions(
    models: Pick<Models, 'owned'>,
    accountId: string | null | undefined
): Promise<OwnedChampion[]> {
    if (!accountId) return [];
    const rows = (await models.owned.find({ accountId: String(accountId) }).lean()) as any[];
    const by = new Map<string, PawlegendsOwnedSource>();
    for (const r of rows) {
        const hero = !r.revokedAt ? heroOfChampItem(String(r.item)) : null;
        if (hero) by.set(hero, r.source);
    }
    return CHAMPION_IDS.filter(h => by.has(h)).map(hero => ({ hero, source: by.get(hero)! }));
}

/** The heroes an account may pick at a time: starters, that week's rotation, owned. */
export async function allowedHeroesFor(
    models: Pick<Models, 'owned'>,
    accountId: string | null | undefined,
    at: Date
): Promise<string[]> {
    const owned = await ownedChampions(models, accountId);
    return allowedChampions(
        owned.map(o => o.hero),
        rotationWeek(at.getTime())
    );
}

/** Whether a store or relay row proves this account finished a Paw Legends match before `before`. */
export type FoundersEvidence = (accountId: string, before: Date) => Promise<boolean>;

/**
 * One champion item granted for free (the Founders roster): a new row, or a revoked one restored. An existing live
 * row keeps its source and session (a later refund of a purchase made before still finds it).
 */
async function grantFree(
    models: Pick<Models, 'owned'>,
    accountId: string,
    item: string,
    source: PawlegendsOwnedSource
): Promise<void> {
    const row = (await models.owned.findOne({ accountId, item }).lean()) as any;
    if (row && !row.revokedAt) return;
    try {
        if (row) {
            await models.owned.updateOne(
                { accountId, item },
                { $set: { source }, $unset: { revokedAt: '', sessionId: '', claim: '' } }
            );
        } else {
            await models.owned.updateOne({ accountId, item }, { $setOnInsert: { source } }, { upsert: true });
        }
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
    }
}

/**
 * GDD §8.1 #7 (never take away what a player got for free): an account with a finished match before the release T
 * keeps every champion as the Founders roster (all 20 plus the badge). Lazy and idempotent: checked once per account
 * (`foundersChecked`), from `GET /pawlegends/me` and the relay's allowed set. True when the account has the roster.
 */
export async function ensureFounders(
    models: Models,
    accountId: string,
    evidence: FoundersEvidence | undefined,
    now: Date
): Promise<boolean> {
    if (!accountId || accountId === RELEASE_ID) return false;
    const row = await ensureYarnRow(models, accountId);
    const hasBadge = async () =>
        !!(await models.owned.findOne({ accountId, item: FOUNDERS_BADGE, revokedAt: { $exists: false } }).lean());
    if (row?.foundersChecked || !evidence) return hasBadge();
    const at = await championReleaseAt(models, now);
    if (await evidence(accountId, at)) await grantFoundersRoster(models, accountId);
    await models.yarn.updateOne({ _id: accountId }, { $set: { foundersChecked: true } });
    return hasBadge();
}

/** The Founders roster grant itself (the migration and the lazy check): every champion and the badge. Idempotent. */
export async function grantFoundersRoster(models: Pick<Models, 'owned'>, accountId: string): Promise<void> {
    for (const hero of CHAMPION_IDS) await grantFree(models, accountId, champItem(hero), 'founders');
    await grantFree(models, accountId, FOUNDERS_BADGE, 'founders');
}

export interface YarnGain {
    gained: number;
    balance: number;
    /** Verified matches counted for the milestones. */
    matches: number;
    /** The weekly chest paid with this match. */
    chest: number;
    /** Champion Picks this match earned (a milestone). */
    newPicks: number;
    picksLeft: number;
}

/**
 * Yarn for one verified match, once per `ref` (the save's replay digest). Counts the match for the welcome
 * milestones and the weekly chest. `gained` 0 and no count for a capped match.
 */
export async function addYarn(
    models: Models,
    accountId: string,
    m: { ref: string; won: boolean; forfeit: boolean; takedowns: number; firstWinToday: boolean },
    now: Date
): Promise<YarnGain | null> {
    if (!accountId || !m.ref) return null;
    await ensureYarnRow(models, accountId);
    const gained = yarnFor(m);
    try {
        await models.yarnLog.create({ accountId, ref: `match:${m.ref}`, amount: gained });
    } catch (error) {
        if (isDuplicateKeyError(error)) return null;
        throw error;
    }
    let row = (await models.yarn
        .findOneAndUpdate({ _id: accountId }, { $inc: { balance: gained, earned: gained, matches: 1 } }, { new: true })
        .lean()) as any;
    // the weekly chest: YARN.weeklyChestMatches paid matches in one ISO week, once a week
    const wk = isoWeek(now);
    const counted =
        ((await models.yarn
            .findOneAndUpdate({ _id: accountId, week: wk }, { $inc: { weekMatches: 1 } }, { new: true })
            .lean()) as any) ??
        ((await models.yarn
            .findOneAndUpdate(
                { _id: accountId, week: { $ne: wk } },
                { $set: { week: wk, weekMatches: 1 } },
                { new: true }
            )
            .lean()) as any);
    let chest = 0;
    if ((Number(counted?.weekMatches) || 0) >= YARN.weeklyChestMatches) {
        const paid = await models.yarn
            .findOneAndUpdate(
                { _id: accountId, chestWeek: { $ne: wk } },
                { $set: { chestWeek: wk }, $inc: { balance: YARN.weeklyChest, earned: YARN.weeklyChest } },
                { new: true }
            )
            .lean();
        if (paid) {
            chest = YARN.weeklyChest;
            try {
                await models.yarnLog.create({ accountId, ref: `week:${wk}`, amount: chest });
            } catch (error) {
                if (!isDuplicateKeyError(error)) throw error;
            }
        }
    }
    // welcome milestones: one Champion Pick at each of CHAMP_PICK_MILESTONES verified matches
    const matches = Number(row?.matches) || 0;
    const target = CHAMP_PICK_MILESTONES.filter(n => matches >= n).length;
    const before = Number(row?.picks) || 0;
    let newPicks = 0;
    if (target > before) {
        const won = await models.yarn
            .findOneAndUpdate(
                { _id: accountId, picks: before },
                { $set: { picks: target }, $inc: { picksLeft: target - before } },
                { new: true }
            )
            .lean();
        if (won) newPicks = target - before;
    }
    row = (await models.yarn.findOne({ _id: accountId }).lean()) as any;
    return {
        gained: gained + chest,
        balance: Number(row?.balance) || 0,
        matches,
        chest,
        newPicks,
        picksLeft: Number(row?.picksLeft) || 0,
    };
}

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Unlocks a champion with Yarn (`via: 'yarn'`) or a Champion Pick (`via: 'pick'`, Tier 1 or 2 only). One ledger row
 * per account and champion (`unlock:<hero>`) is the claim, so a retry or a second tap never spends twice; the spend
 * itself is one conditional update that never goes below zero. Answers the champion's state after it.
 */
export async function unlockChampion(
    models: Models,
    accountId: string,
    body: { hero?: unknown; requestId?: unknown; via?: unknown }
): Promise<{ hero: string; unlocked: boolean; via: 'yarn' | 'pick' }> {
    const hero = typeof body?.hero === 'string' ? body.hero : '';
    const via = body?.via === 'pick' ? 'pick' : 'yarn';
    if (!CHAMPION_IDS.includes(hero)) throw CHAMP_ERRORS.unknown();
    if (isStarter(hero)) throw CHAMP_ERRORS.free();
    if (body?.requestId !== undefined && !(typeof body.requestId === 'string' && REQUEST_ID.test(body.requestId)))
        throw pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_INVALID', 'requestId is not valid');
    const owned = await ownedChampions(models, accountId);
    if (owned.some(o => o.hero === hero)) {
        const prior = (await models.yarnLog.findOne({ accountId, ref: `unlock:${hero}` }).lean()) as any;
        // a retry of the unlock that already went through answers the same; anything else is already owned
        if (prior) return { hero, unlocked: true, via: prior.amount === 0 ? 'pick' : 'yarn' };
        throw CHAMP_ERRORS.owned();
    }
    const tier = champTier(hero);
    if (via === 'pick' && !(tier && CHAMP_PICK_TIERS.includes(tier))) throw CHAMP_ERRORS.pickTier();
    const price = via === 'pick' ? 0 : champYarnPrice(hero)!;
    await ensureYarnRow(models, accountId);
    const ref = `unlock:${hero}`;
    try {
        await models.yarnLog.create({ accountId, ref, amount: -price, hero, done: false });
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        // a concurrent or earlier unlock of the same champion holds the claim: a finished one is granted again
        // (idempotent, heals a grant that failed after the spend); one still spending answers "not yet"
        const prior = (await models.yarnLog.findOne({ accountId, ref }).lean()) as any;
        const priorVia = prior?.amount === 0 ? 'pick' : 'yarn';
        if (prior?.done) await grantUnlock(models, accountId, hero, priorVia === 'pick' ? 'milestone' : 'yarn');
        return { hero, unlocked: !!prior?.done, via: priorVia };
    }
    const spent =
        via === 'pick'
            ? await models.yarn
                  .findOneAndUpdate(
                      { _id: accountId, picksLeft: { $gt: 0 } },
                      { $inc: { picksLeft: -1 } },
                      { new: true }
                  )
                  .lean()
            : await models.yarn
                  .findOneAndUpdate(
                      { _id: accountId, balance: { $gte: price } },
                      { $inc: { balance: -price } },
                      { new: true }
                  )
                  .lean();
    if (!spent) {
        await models.yarnLog.deleteMany({ accountId, ref });
        throw via === 'pick' ? CHAMP_ERRORS.noPick() : CHAMP_ERRORS.yarn();
    }
    await models.yarnLog.updateOne({ accountId, ref }, { $set: { done: true } });
    await grantUnlock(models, accountId, hero, via === 'pick' ? 'milestone' : 'yarn');
    return { hero, unlocked: true, via };
}

async function grantUnlock(
    models: Pick<Models, 'owned'>,
    accountId: string,
    hero: string,
    source: 'yarn' | 'milestone'
) {
    await grantFree(models, accountId, champItem(hero), source);
}

export interface ChampionsView {
    owned: OwnedChampion[];
    founders: boolean;
    starters: string[];
    rotation: { week: number; heroes: string[]; endsAt: string };
    yarn: { balance: number; matches: number; picksLeft: number; nextPickAt: number | null };
    /** The champion bundles' prices for this account (prorated over owned champions; null when all are owned). */
    bundles: { sku: string; cents: { usd: number; eur: number } | null }[];
}

/** `GET /pawlegends/me` → `champions`: owned champions, the Founders flag, starters, this week's rotation, Yarn. */
export async function championsView(
    models: Models,
    accountId: string | null,
    now: Date,
    founders = false
): Promise<ChampionsView> {
    const week = rotationWeek(now.getTime());
    const row = accountId ? ((await models.yarn.findOne({ _id: accountId }).lean()) as any) : null;
    const matches = Number(row?.matches) || 0;
    const owned = await ownedChampions(models, accountId);
    const items = new Set(owned.map(o => champItem(o.hero)));
    const bundles = CHAMP_BUNDLE_SKUS.map(sku => {
        const def = catalogSku(sku)!;
        const usd = championBundleCents(def, items, 'usd');
        const eur = championBundleCents(def, items, 'eur');
        return { sku, cents: usd === null || eur === null ? null : { usd, eur } };
    });
    return {
        owned,
        founders,
        starters: [...STARTERS],
        rotation: { week, heroes: rotationOf(week), endsAt: rotationEndsAt(week) },
        yarn: {
            balance: Number(row?.balance) || 0,
            matches,
            picksLeft: Number(row?.picksLeft) || 0,
            nextPickAt: CHAMP_PICK_MILESTONES.find(n => n > matches) ?? null,
        },
        bundles,
    };
}
