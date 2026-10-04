import { Injectable, NotFoundException } from '@nestjs/common';
import { CatRepository } from 'src/cat/cat.repository';
import { PINK_PAW_SLUG, PinkPawGalleryCat, pinkPawGallery } from 'src/shared-contracts/pink-paw';
import { ShelterRepository } from '../shelter.repository';

/**
 * GET /shelter/:slug/gallery: every showable cat of a showcase shelter, for the gallery on
 * /shelter-payouts and /impact and the Heist's payouts modal. Unlike GET /cat/sale (at most 200
 * cats per shelter, newest first), nothing is cut, so the tab counts are the shelter's totals.
 *
 * Each cat is reduced to its id, name, status and two https image URLs by the same shared
 * selection the pages use (shared/pink-paw.ts): never an owner, a code or anything added later.
 */

/** Shelters with a public gallery (the showcase shelter). Any other slug is 404. */
export const GALLERY_SHELTER_SLUGS: readonly string[] = [PINK_PAW_SLUG];

/** Safety bound per response, far above any shelter's list today (Pink Paw has a few hundred). */
export const GALLERY_MAX_CATS = 5000;

/** Matches the storefront's cache: a cat's status changes rarely. */
export const GALLERY_CACHE_TTL_MS = 45_000;

export interface PublicShelterGallery {
    slug: string;
    atShelter: PinkPawGalleryCat[];
    adopted: PinkPawGalleryCat[];
    /** True when GALLERY_MAX_CATS cut the list (never expected; the pages then hide the counts). */
    truncated: boolean;
    generatedAt: string;
}

@Injectable()
export class ShelterGalleryService {
    private cache = new Map<string, { expiresAt: number; value: Promise<PublicShelterGallery> }>();

    constructor(private cats: CatRepository, private shelters: ShelterRepository) {}

    gallery(slug: string, now: () => number = Date.now): Promise<PublicShelterGallery> {
        if (!GALLERY_SHELTER_SLUGS.includes(slug)) {
            return Promise.reject(new NotFoundException('No gallery for this shelter'));
        }
        const hit = this.cache.get(slug);
        if (hit && hit.expiresAt > now()) return hit.value;
        const value = this.build(slug, now);
        this.cache.set(slug, { expiresAt: now() + GALLERY_CACHE_TTL_MS, value });
        // A failed build is never served from the cache.
        value.catch(() => {
            if (this.cache.get(slug)?.value === value) this.cache.delete(slug);
        });
        return value;
    }

    private async build(slug: string, now: () => number): Promise<PublicShelterGallery> {
        const shelter = await this.shelters.model.findOne({ slug }, { _id: 1 }).lean();
        if (!shelter) throw new NotFoundException('No gallery for this shelter');
        // The catalogue cat of each blessing (unowned; a purchase copies it to the buyer).
        const rows = await this.cats.model
            .find(
                { shelter: (shelter as { _id: unknown })._id, blessing: { $exists: true }, owner: { $exists: false } },
                { _id: 1, name: 1, blessing: 1 }
            )
            .sort({ _id: -1 })
            .limit(GALLERY_MAX_CATS + 1)
            .populate({
                path: 'blessing',
                select: 'name status image catAvatar',
                populate: [
                    { path: 'image', select: 'url' },
                    { path: 'catAvatar', select: 'url' },
                ],
            })
            .lean()
            .exec();
        const list = Array.isArray(rows) ? rows : [];
        const truncated = list.length > GALLERY_MAX_CATS;
        const { atShelter, adopted } = pinkPawGallery(JSON.parse(JSON.stringify(list.slice(0, GALLERY_MAX_CATS))));
        return { slug, atShelter, adopted, truncated, generatedAt: new Date(now()).toISOString() };
    }
}
