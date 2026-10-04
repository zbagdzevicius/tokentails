import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { BlessingStatus, rescueBlessingFilter } from 'src/blessing/blessing.schema';
import { CatRepository } from 'src/cat/cat.repository';
import { CatService } from 'src/cat/cat.service';
import { ShelterRepository } from './shelter.repository';

/**
 * Shelter cats sold one by one (founder, 2026-10-04): any unowned rescue cat of `GET /cat/sale`, at
 * the basic tier, for `getShelterCatPriceCents()` ($5, never less). Buying grants the buyer a copy,
 * the same way a pack does, so one shelter cat can find many players. Higher tiers come only from packs.
 *
 * A cat is for sale when it is a catalogue cat (no owner) with a rescue blessing that is not ADOPTED or
 * HEAVEN (the pack pool's rule), and it is not a player's starter.
 */

export interface ShelterCatForSale {
    catId: string;
    name: string;
    shelter: {
        _id: string;
        name: string;
        slug: string;
        handoverStatus?: string | null;
        publicWallet?: string | null;
    } | null;
}

export type ShelterCatCheck =
    | { ok: true; cat: ShelterCatForSale }
    | { ok: false; reason: 'BAD_ID' | 'NOT_FOR_SALE' | 'ALREADY_OWNED' };

/** The blessing statuses whose cat can no longer be bought. */
export const NOT_FOR_SALE_STATUSES: readonly string[] = [BlessingStatus.ADOPTED, BlessingStatus.HEAVEN];

@Injectable()
export class ShelterCatSaleService {
    constructor(
        private catRepository: CatRepository,
        private blessingRepository: BlessingRepository,
        private shelterRepository: ShelterRepository,
        private catService: CatService
    ) {}

    /**
     * Checks that `catId` is a shelter cat on sale and that `userId` (when given) does not already own a
     * copy. Reads only; never changes a cat.
     */
    async check(catId: unknown, userId?: string | Types.ObjectId): Promise<ShelterCatCheck> {
        if (typeof catId !== 'string' || !/^[0-9a-f]{24}$/i.test(catId)) {
            return { ok: false, reason: 'BAD_ID' };
        }
        const cat: any = await this.catRepository.model
            .findOne(
                { _id: new Types.ObjectId(catId) },
                { _id: 1, name: 1, owner: 1, blessing: 1, shelter: 1, isStarter: 1, isGuestStarter: 1, sourceCat: 1 }
            )
            .lean();
        if (!cat || cat.owner || !cat.blessing || cat.isStarter || cat.isGuestStarter) {
            return { ok: false, reason: 'NOT_FOR_SALE' };
        }
        const blessing: any = await this.blessingRepository.model
            .findOne({ $and: [{ _id: cat.blessing }, rescueBlessingFilter()] }, { _id: 1, status: 1, shelter: 1 })
            .lean();
        if (!blessing || NOT_FOR_SALE_STATUSES.includes(String(blessing.status))) {
            return { ok: false, reason: 'NOT_FOR_SALE' };
        }
        const shelterId = cat.shelter || blessing.shelter;
        const shelter: any = shelterId
            ? await this.shelterRepository.model
                  .findOne({ _id: shelterId }, { _id: 1, name: 1, slug: 1, handoverStatus: 1, publicWallet: 1 })
                  .lean()
            : null;
        if (userId && (await this.catService.ownsCopyOf(userId, cat))) {
            return { ok: false, reason: 'ALREADY_OWNED' };
        }
        return {
            ok: true,
            cat: {
                catId: String(cat._id),
                name: String(cat.name || ''),
                shelter: shelter
                    ? {
                          _id: String(shelter._id),
                          name: String(shelter.name || ''),
                          slug: String(shelter.slug || ''),
                          handoverStatus: shelter.handoverStatus ?? null,
                          publicWallet: shelter.publicWallet ?? null,
                      }
                    : null,
            },
        };
    }
}
