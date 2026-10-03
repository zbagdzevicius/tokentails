/**
 * Enums shared by the backend, client, CMS and Catnip Heist (plan F2).
 *
 * Framework-free: no imports, no decorators, and nothing newer than TypeScript 4.8 (the backend's
 * compiler), so no `satisfies` and no const type parameters. Edit this file, then run
 * `node scripts/sync-contracts.mjs` to refresh the generated copies.
 *
 * Uppercase enums keep the TypeScript `enum` form the packages already used, so `GameType.MATCH_3`
 * works as both a value and a type everywhere. Newer lowercase vocabularies are `as const` arrays plus
 * a union type, which also gives class-validator's `@IsIn` a ready list.
 */

/**
 * Frozen so no importer can mutate a list every module in the process shares (same pattern as
 * caps.ts). Typed as a plain array so Mongoose `enum:` and `isOneOf` accept it.
 */
const frozen = <T>(values: T[]): T[] => Object.freeze(values) as T[];

/**
 * Every game a `Game` row or client run can name. Only a subset saves scores: see `scoredGameTypes`
 * in `backend/src/game/game.schema.ts`. `CATNIP_HEIST` is listed so hosts and analytics can name the
 * Heist; it saves only through the replay-verified branch of `POST /user/catbassadors/live` (plan G2
 * layer 2), never through the plain scored-type path.
 */
export enum GameType {
    SHELTER = 'SHELTER',
    HOME = 'HOME',
    /** Retired. Kept for old `Game` rows. */
    PURRQUEST = 'PURRQUEST',
    /** Retired. Kept for old `Game` rows. */
    CATBASSADORS = 'CATBASSADORS',
    CATNIP_CHAOS = 'CATNIP_CHAOS',
    PIXEL_RESCUE = 'PIXEL_RESCUE',
    MATCH_3 = 'MATCH_3',
    CATNIP_HEIST = 'CATNIP_HEIST',
}

/** Where a game was played. Rows saved before this field existed have no value. */
export enum GamePlatform {
    WEB = 'web',
    IOS = 'ios',
    ANDROID = 'android',
}

/** How a run ended, as reported with a live save (plan F6). Matches the client's stop outcomes. */
export const LIVE_GAME_OUTCOMES = Object.freeze(['won', 'died', 'timeout', 'quit'] as const);
export type LiveGameOutcome = typeof LIVE_GAME_OUTCOMES[number];

/** The five starter cats offered by Meet your cat (plan G3, decision #19). */
export enum StarterBreed {
    SCOUT = 'SCOUT',
    PINKIE = 'PINKIE',
    SHADOW = 'SHADOW',
    MISTY = 'MISTY',
    SUNNY = 'SUNNY',
}
export const STARTER_BREEDS: StarterBreed[] = frozen([
    StarterBreed.SCOUT,
    StarterBreed.PINKIE,
    StarterBreed.SHADOW,
    StarterBreed.MISTY,
    StarterBreed.SUNNY,
]);

/** How a player came to own a cat (plan G3). */
export const CAT_ORIGINS = Object.freeze(['starter', 'pack', 'redeem', 'adopt', 'portrait'] as const);
export type CatOrigin = typeof CAT_ORIGINS[number];

/**
 * Payment order state. `LOCKED` exists only on the backend today; `FAILED_GRANT` marks a paid order
 * whose item grant failed and needs a retry or refund (plan G3).
 */
export enum OrderStatus {
    COMPLETE = 'COMPLETE',
    PENDING = 'PENDING',
    LOCKED = 'LOCKED',
    FAILED = 'FAILED',
    FAILED_GRANT = 'FAILED_GRANT',
}

/** Lifecycle of a funded Rescue Goal (plan G5). */
export enum RescueGoalStatus {
    OPEN = 'OPEN',
    FILLED = 'FILLED',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED',
}

/** Which surface asked for a server-paid shelter treat. */
export const DONATE_SOURCES = Object.freeze(['heist', 'page'] as const);
export type DonateSource = typeof DONATE_SOURCES[number];

/**
 * State of one server-paid shelter treat. `CONFIRMED` (receipt seen on chain) and `FAILED` are
 * written by the reconciliation work in plan F7.4; until then only `PENDING` and `SENT` are stored.
 */
export enum ShelterDonationStatus {
    PENDING = 'PENDING',
    SENT = 'SENT',
    CONFIRMED = 'CONFIRMED',
    FAILED = 'FAILED',
}

/** Whether a shelter is a real partner or a Token Tails house zone in the game (plan G13). */
export const SHELTER_ROLES = Object.freeze(['partner', 'house'] as const);
export type ShelterRole = typeof SHELTER_ROLES[number];

/** Partnership state shown on impact pages (plan F7). */
export const PARTNER_STATUSES = Object.freeze(['active', 'past', 'prospect'] as const);
export type PartnerStatus = typeof PARTNER_STATUSES[number];

/** Who currently holds funds raised for a shelter (plan F7). */
export const HANDOVER_STATUSES = Object.freeze(['held-by-token-tails', 'handed-over'] as const);
export type HandoverStatus = typeof HANDOVER_STATUSES[number];

/** A cat's element. */
export enum CatAbilityType {
    ICE = 'ICE',
    ELECTRIC = 'ELECTRIC',
    FIRE = 'FIRE',
    WIND = 'WIND',
    DARK = 'DARK',
    WATER = 'WATER',
    GRASS = 'GRASS',
    SAND = 'SAND',
    FAIRY = 'FAIRY',
    STELLAR = 'STELLAR',
}
export const CAT_ABILITY_TYPES: CatAbilityType[] = frozen([
    CatAbilityType.ICE,
    CatAbilityType.ELECTRIC,
    CatAbilityType.FIRE,
    CatAbilityType.WIND,
    CatAbilityType.DARK,
    CatAbilityType.WATER,
    CatAbilityType.GRASS,
    CatAbilityType.SAND,
    CatAbilityType.FAIRY,
    CatAbilityType.STELLAR,
]);

/** A cat's rarity. */
export enum Tier {
    COMMON = 'COMMON',
    RARE = 'RARE',
    EPIC = 'EPIC',
    LEGENDARY = 'LEGENDARY',
}

/** Where a shelter cat is on its way home. */
export enum BlessingStatus {
    WAITING = 'WAITING',
    RECOVERING = 'RECOVERING',
    ADOPTED = 'ADOPTED',
    HEAVEN = 'HEAVEN',
}
export const BLESSING_STATUSES: BlessingStatus[] = frozen([
    BlessingStatus.WAITING,
    BlessingStatus.RECOVERING,
    BlessingStatus.ADOPTED,
    BlessingStatus.HEAVEN,
]);

/** True when `value` is one of `values`. Narrows unknown input to a vocabulary's union. */
export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
    return typeof value === 'string' && (values as readonly string[]).indexOf(value) !== -1;
}
