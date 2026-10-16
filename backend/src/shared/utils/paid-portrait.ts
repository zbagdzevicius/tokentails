import { ImageRepository } from 'src/image/image.repository';
import { PaidPortraitImage, publishPaidPortrait } from './ai-portrait';
import { privateKeyOf } from './private-url';

/*
 * The one rule every paid-portrait delivery path follows (KI-08, CR1-01, CR1-03): the Stripe webhook, the
 * card confirm (POST /web3/confirm-payment), the Stellar confirm (POST /web3/confirm) and the
 * GET /image/:id publish retry. Kept apart from ai-portrait.ts so specs that mock that module (AI client,
 * S3) still run this rule against their `publishPaidPortrait` mock.
 */

export interface PaidPortraitDelivery {
    /** Public, or null. Never an `s3private://` URL. */
    url: string | null;
    /** True when this caller sends the order email and creates the blessing cat. */
    deliver: boolean;
    /** Set when publishing threw: nothing is delivered; GET /image/:id retries once the order is COMPLETE. */
    error?: unknown;
}

/**
 * The URL a paid portrait is delivered with, and whether this caller delivers it.
 * - An `aiUrl` that is already public (an older image, or a repeat purchase of a published one): delivered
 *   as is.
 * - A private `/portrait` 4K: published first (`publishPaidPortrait`); `deliver` only for the call that
 *   switched `aiUrl` from private to public, so when the webhook or a confirm and the GET retry publish
 *   at the same time, exactly one of them delivers.
 * - Any other private URL (a `/yourcat` original): never handed out.
 */
export async function deliverPaidPortraitUrl(
    image: PaidPortraitImage | null | undefined,
    imageRepository: ImageRepository
): Promise<PaidPortraitDelivery> {
    if (!image?.aiUrl) {
        return { url: null, deliver: false };
    }
    if (privateKeyOf(image.aiUrl) === null) {
        return { url: image.aiUrl, deliver: true };
    }
    if (image.source !== 'portrait') {
        return { url: null, deliver: false };
    }
    const outcome: { publishedNow?: boolean } = {};
    let url: string | null;
    try {
        url = await publishPaidPortrait(image, imageRepository, outcome);
    } catch (error) {
        return { url: null, deliver: false, error };
    }
    if (!url || privateKeyOf(url) !== null) {
        return { url: null, deliver: false };
    }
    // `publishedNow` is false only when another caller switched `aiUrl` to public first.
    return { url, deliver: outcome.publishedNow !== false };
}
