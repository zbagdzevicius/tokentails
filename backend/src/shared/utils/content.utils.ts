import slugify from 'slugify';
import { Tier } from 'src/cat/cat.schema';
import { PackType } from 'src/web3/order.schema';

export function getSlug(content: string): string {
    return slugify(content.slice(0, 250), {
        replacement: '-', // replace spaces with replacement character, defaults to `-`
        remove: undefined, // remove characters that match regex, defaults to `undefined`
        lower: true, // convert to lower case, defaults to `false`
        strict: true, // strip special characters except replacement, defaults to `false`
        trim: true, // trim leading and trailing replacement chars, defaults to `true`
    });
}

export const getCardTier = (tier: Tier): Tier => tier;

/**
 * Returns a tier based on pack type probability distribution
 *
 * Starter Pack ($5): 90% common / 9% rare / 1% epic
 * Influencer Pack ($25): 75% common / 21% rare / 3.5% epic / 0.5% legendary
 * Legendary Pack ($350): 30% legendary / 50% epic / 20% rare
 */
export function getPackCardTier(packType: PackType): Tier {
    const random = Math.random() * 100; // 0-100

    switch (packType) {
        case PackType.STARTER:
            // 90% common / 9% rare / 1% epic
            if (random < 90) {
                return Tier.COMMON;
            } else if (random < 99) {
                return Tier.RARE;
            } else {
                return Tier.EPIC;
            }

        case PackType.INFLUENCER:
            // 75% common / 21% rare / 3.5% epic / 0.5% legendary
            if (random < 75) {
                return Tier.COMMON;
            } else if (random < 96) {
                return Tier.RARE;
            } else if (random < 99.5) {
                return Tier.EPIC;
            } else {
                return Tier.LEGENDARY;
            }

        case PackType.LEGENDARY:
            // 30% legendary / 50% epic / 20% rare
            if (random < 30) {
                return Tier.LEGENDARY;
            } else if (random < 80) {
                return Tier.EPIC;
            } else {
                return Tier.RARE;
            }

        default:
            // Fallback to common if unknown pack type
            return Tier.COMMON;
    }
}
