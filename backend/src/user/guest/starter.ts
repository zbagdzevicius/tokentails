import { Model, Types } from 'mongoose';
import { CatAbilityType, Tier } from 'src/cat/cat.schema';
import { StarterBreed } from 'src/shared-contracts/enums';
import { generateRandomNumber } from 'src/common/utils';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { ONBOARDING_VERSION } from '../user.schema';
import { GUEST_NAME } from './identity-config';

/*
 * Starter companions (F5.2 step 4, F5.5, G3 prerequisites). Every account gets exactly one cat with
 * `isStarter: true`, created idempotently on `{owner, isStarter: true}` (unique partial index
 * `starter_per_owner`). It replaces the hardcoded Cleocatra that `generateACat` gave new users.
 *
 * - New sign-ups and guests: breed SCOUT, not locked, so Meet your cat (G3, `POST /user/starter`)
 *   can still choose the breed and the name.
 * - `createUser` (portrait orders) and the manager `POST /user/profile`: created locked, with the
 *   legacy Cleocatra look, and no onboarding.
 */

/** Id of the template starter a transient guest sees before its guest document exists (F5.5). */
export const GUEST_STARTER_TEMPLATE_ID = 'guest-starter';

export const DEFAULT_STARTER_BREED = StarterBreed.SCOUT;

interface IStarterArt {
    name: string;
    type: CatAbilityType;
    spriteImg: string;
    catImg: string;
    resqueStory: string;
}

const SPRITES = 'https://tokentails.com/cats';
const GIFS = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets';

const art = (family: string, variant: string) => ({
    spriteImg: `${SPRITES}/${family.toLowerCase()}/sprites/${variant}.png`,
    catImg: `${GIFS}/${family}/${variant}/GROOMING.gif`,
});

/**
 * Default look per starter breed (decision #19 roster). Scout uses the RASCAL base sheet until its
 * commissioned backpack and bandana layer ships (G3 "Art"); G3 owns the final art and copy.
 */
export const STARTER_ART: Readonly<Record<StarterBreed, IStarterArt>> = Object.freeze({
    [StarterBreed.SCOUT]: {
        name: 'Scout',
        type: CatAbilityType.GRASS,
        // RASCAL base family (task 4a): the tabby from the altar, on the same 48 px frame grid as
        // the yellow sheet. Both files are already on the CDN. The backpack and bandana layer
        // (decision #24) is still to come.
        spriteImg: `${GIFS}/RASCAL/base.png`,
        catImg: `${GIFS}/RASCAL/base/GROOMING.gif`,
        resqueStory: 'The cat from the altar. Scout loves long walks and never forgets a friend.',
    },
    [StarterBreed.PINKIE]: {
        name: 'Pinkie',
        type: CatAbilityType.WATER,
        ...art('PINKIE', 'hearted-red'),
        resqueStory: 'A charming cat whose tail swishes create rainbows that make everyone smile.',
    },
    [StarterBreed.SHADOW]: {
        name: 'Shadow',
        type: CatAbilityType.DARK,
        ...art('BLACK', 'hat-cylinder-black'),
        resqueStory: 'Quiet, quick and always one step ahead in the dark.',
    },
    [StarterBreed.MISTY]: {
        name: 'Misty',
        type: CatAbilityType.WIND,
        ...art('GREY', 'hat-wizard-blue'),
        resqueStory: 'Misty drifts in like morning fog and curls up wherever it is warm.',
    },
    [StarterBreed.SUNNY]: {
        name: 'Sunny',
        type: CatAbilityType.FIRE,
        ...art('SIAMESE', 'wing-white'),
        resqueStory: 'Sunny chases every sunbeam and shares the warmth with everyone.',
    },
});

/** The legacy look of locked starters from createUser and the manager route. */
const LEGACY_LOCKED_STARTER: IStarterArt = {
    name: 'Cleocatra',
    type: CatAbilityType.WATER,
    spriteImg: 'https://tokentails.com/cats/pinkie/sprites/hearted-red.png',
    catImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red/GROOMING.gif',
    resqueStory:
        'A charming cat’s tail swishes create rainbows that make everyone smile, even on the rainiest of days.',
};

export interface IStarterOptions {
    /** A guest's starter: excluded from public lists until promotion; no token id. */
    guest?: boolean;
    /** Committed already (createUser, manager route): Meet your cat never changes it. */
    locked?: boolean;
    breed?: StarterBreed;
    now?: Date;
}

/** Fields written on insert only (`$setOnInsert`). `owner` and `isStarter` come from the filter. */
export function starterCatInsert({ guest = false, locked = false, breed, now = new Date() }: IStarterOptions = {}) {
    const chosenBreed = breed || (locked ? StarterBreed.PINKIE : DEFAULT_STARTER_BREED);
    const look = locked && !breed ? LEGACY_LOCKED_STARTER : STARTER_ART[chosenBreed];
    return {
        name: look.name,
        resqueStory: look.resqueStory,
        type: look.type,
        tier: Tier.COMMON,
        status: { EAT: 0 },
        spriteImg: look.spriteImg,
        catImg: look.catImg,
        isBlueprint: false,
        starterBreed: chosenBreed,
        origin: 'starter',
        createdAt: now,
        ...(guest ? { isGuestStarter: true } : { tokenId: generateRandomNumber() }),
        ...(locked ? { starterLockedAt: now } : {}),
    };
}

type AnyModel = Model<any>;

/**
 * Creates the owner's starter once, whatever the number of parallel calls, links it into
 * `user.cats`, and points `user.cat` at it when `user.cat` is missing or dangling (self-heal).
 */
export async function ensureStarterCat(
    cats: AnyModel,
    users: AnyModel,
    ownerId: Types.ObjectId,
    options: IStarterOptions = {}
): Promise<{ _id: Types.ObjectId } & Record<string, unknown>> {
    const filter = { owner: ownerId, isStarter: true };
    let cat: any;
    try {
        cat = await cats
            .findOneAndUpdate(filter, { $setOnInsert: starterCatInsert(options) }, { upsert: true, new: true })
            .lean();
    } catch (error) {
        // Two parallel upserts: the unique partial index let one insert; the other reads it.
        if (!isDuplicateKeyError(error)) {
            throw error;
        }
        cat = await cats.findOne(filter).lean();
    }
    if (!cat?._id) {
        throw new Error('starter cat could not be created');
    }

    await users.updateOne({ _id: ownerId }, { $addToSet: { cats: cat._id } });
    await users.updateOne(
        { _id: ownerId, $or: [{ cat: { $exists: false } }, { cat: null }] },
        { $set: { cat: cat._id } }
    );

    // Self-heal: user.cat points at a cat that no longer exists.
    const user: any = await users.findOne({ _id: ownerId }, { cat: 1 }).lean();
    if (user?.cat && user.cat.toString() !== cat._id.toString()) {
        const exists = await cats.exists({ _id: user.cat });
        if (!exists) {
            await users.updateOne({ _id: ownerId, cat: user.cat }, { $set: { cat: cat._id } });
        }
    }
    return cat;
}

/**
 * The request user of an anonymous Firebase user without a guest document (F5.2 step 1, F5.5). It is
 * never written. `onboarding: pending` makes Meet your cat show to guests (G3); the template cat lets
 * menus render before `POST /user/guest/session` creates the real guest starter.
 */
export function transientGuestProfile(uid: string) {
    const look = STARTER_ART[DEFAULT_STARTER_BREED];
    return {
        isGuest: true,
        transient: true,
        firebaseUid: uid,
        name: GUEST_NAME,
        onboarding: { state: 'pending' as const, version: ONBOARDING_VERSION },
        tails: 0,
        pendingTails: 0,
        catnipCount: 0,
        catnipChaos: [] as number[],
        match3: [] as number[],
        match3Score: [] as number[],
        seasonEvent: [] as number[],
        quests: [] as string[],
        cat: {
            _id: GUEST_STARTER_TEMPLATE_ID,
            isStarter: true,
            isGuestStarter: true,
            starterBreed: DEFAULT_STARTER_BREED,
            name: look.name,
            type: look.type,
            tier: Tier.COMMON,
            spriteImg: look.spriteImg,
            catImg: look.catImg,
            resqueStory: look.resqueStory,
            status: { EAT: 0 },
        },
        cats: [] as unknown[],
    };
}
