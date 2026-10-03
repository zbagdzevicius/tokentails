import { Types } from 'mongoose';

/*
 * The rescue partners whose cats are sold in packs and featured in Meet your cat (plan G3). Moved
 * here from web3.controller.ts so the pack pool, GET /blessing/featured and the reserved cat names
 * read one list.
 */
export const PACK_SHELTER_IDS = Object.freeze({
    catfluencers: '675f4533cdb28696a94806fc',
    pinkPaw: '67b48fafd6c26c6cd40bfec6',
});

export type PackShelterKey = keyof typeof PACK_SHELTER_IDS;

/** Shelter ids as ObjectIds, for queries. A new array each call, so no caller can mutate the list. */
export function packShelterObjectIds(keys: PackShelterKey[] = ['catfluencers', 'pinkPaw']): Types.ObjectId[] {
    return keys.map(key => new Types.ObjectId(PACK_SHELTER_IDS[key]));
}

/** Featured cats come from the same two partners. */
export const FEATURED_SHELTER_KEYS: PackShelterKey[] = ['pinkPaw', 'catfluencers'];
