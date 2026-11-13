import { CURRENT_SEASON_ID, seasonDef } from '../pawlegends-catalog';
import { grantItems } from '../pawlegends-season.service';
import { nextChestItem } from './clubs.contracts';

/*
 * What a club chest tier or a good-teammate chest tier pays (CLUBS-KUDOS.md §4): the next item of the current Legends
 * Pass free row the account does not own (earned items, drawn in the apps too), else Yarn. Deterministic, so nothing
 * random and no odds to show.
 */

type AnyModel = any;

export interface RewardModels {
    owned: AnyModel;
    yarn?: AnyModel | null;
}

/** The free-row items in tier order (the chest pool). */
export function chestPool(): string[] {
    return (seasonDef(CURRENT_SEASON_ID)?.free ?? []).map(r => r.item);
}

/** The display name of a pool item (`Honey Tabby coat`), or the id. */
export function rewardName(item: string): string {
    if (item.startsWith('yarn:')) return `${item.slice(5)} Yarn`;
    const r = (seasonDef(CURRENT_SEASON_ID)?.free ?? []).find(x => x.item === item);
    return r?.name ?? item;
}

async function ownedOf(models: RewardModels, accountId: string): Promise<string[]> {
    const rows = (await models.owned.find({ accountId }).lean()) as Array<{ item: string; revokedAt?: Date }>;
    return rows.filter(r => !r.revokedAt).map(r => String(r.item));
}

/** What the next chest would pay this account (for the card): an item id or `yarn:<n>`. */
export async function previewReward(models: RewardModels, accountId: string, yarn: number): Promise<string> {
    return nextChestItem(chestPool(), await ownedOf(models, accountId)) ?? `yarn:${yarn}`;
}

/** Pays one chest tier: grants the next unowned free-row item, else adds Yarn. Returns what it paid. */
export async function payChest(
    models: RewardModels,
    accountId: string,
    source: 'club' | 'kudos',
    yarn: number
): Promise<string> {
    const item = nextChestItem(chestPool(), await ownedOf(models, accountId));
    if (item) {
        await grantItems(models as any, accountId, [item], source);
        return item;
    }
    if (models.yarn) {
        await models.yarn.updateOne({ _id: accountId }, { $inc: { balance: yarn, earned: yarn } }, { upsert: true });
    }
    return `yarn:${yarn}`;
}
