import { createHash } from 'crypto';

/*
 * Lucky Treat (docs/plans/moba/GAPS research: Brawl Stars Starr Drops; founder call #3, default "build it"): a free
 * surprise chest after the first verified win of the UTC day. Everything about it lives in this one module (and its
 * one call in `progress.service.ts` `applyLuckyTreat`), so it can come out in one change if the founder says no.
 *
 * Rules (all enforced here, never by the client):
 * - earned only: drawn inside the `/live` save (`POST /user/catbassadors/live`), never by a progress route; nothing
 *   paid ever opens one and it is never sold;
 * - cosmetic only, from the existing free pools (Treat Track coats, palette loop coats, champion frames and titles);
 * - the odds are published (`LUCKY_ODDS`, shown before opening) and sum to 100 %;
 * - every 10th Lucky Treat is at least Rare (the floor);
 * - the under-16 band never draws: it gets the fixed Daily Treat (Treat XP, no randomness) instead;
 * - a tier whose items are all owned pays its fixed Treat XP instead (nothing is lost, nothing is random twice).
 *
 * The draw is seeded by the account, the day and the draw number, so a retried save draws the same thing.
 */

export type LuckyRarity = 'common' | 'rare' | 'epic';

/** Published odds, in percent (sum 100). */
export const LUCKY_ODDS: Readonly<Record<LuckyRarity, number>> = Object.freeze({ common: 62, rare: 28, epic: 10 });
export const LUCKY_RARITIES: readonly LuckyRarity[] = Object.freeze(['common', 'rare', 'epic'] as LuckyRarity[]);
/** Every LUCKY_FLOOR-th draw is at least Rare. */
export const LUCKY_FLOOR = 10;
/** Treat XP when a whole tier is owned. */
export const LUCKY_DUP_XP: Readonly<Record<LuckyRarity, number>> = Object.freeze({ common: 100, rare: 200, epic: 300 });
/** The under-16 band's fixed Daily Treat (no draw). */
export const DAILY_TREAT_XP = 150;

/** The originals that wear palette loop coats (client `meta/treats.ts` TRACK_ORIGINALS). */
const ORIGINALS = [
    'clem',
    'sage',
    'brutus',
    'cacklejaw',
    'meatball',
    'pixel',
    'duchess',
    'stilts',
    'nugget',
    'marshmallow',
    'bravo',
    'chili',
    'howler',
    'rocket',
    'frankie',
    'domino',
];
const PALETTES = ['peach', 'plum', 'moss', 'slate', 'honey', 'coral', 'ink', 'cocoa'];
const CHAMPS = ['lambo', 'aviete', 'bengas', 'gabe'];

/** Treat Track coats (client TREAT_REWARDS, kind coat), plus the Wave emote. */
const TRACK_COATS = [
    'coat.clem.marmalade',
    'coat.sage.midnight',
    'coat.brutus.biscuit',
    'coat.cacklejaw.spotted',
    'coat.clem.snowpaw',
    'coat.sage.sunrise',
    'coat.brutus.ember',
    'coat.cacklejaw.dusk',
    'coat.clem.lilac',
    'coat.sage.fern',
    'coat.brutus.storm',
    'coat.cacklejaw.frost',
    'coat.clem.marmalade.rose',
    'coat.sage.midnight.teal',
    'coat.brutus.ember.ash',
    'coat.cacklejaw.spotted.mint',
    'coat.clem.snowpaw.sky',
    'coat.meatball.butter',
    'coat.pixel.arctic',
    'coat.duchess.pearl',
    'coat.stilts.desert',
    'coat.meatball.smoky',
    'coat.pixel.cocoa',
    'coat.duchess.rosewater',
    'coat.stilts.silver',
    'coat.meatball.ginger',
    'coat.pixel.moonbeam',
    'coat.duchess.smoke',
    'coat.stilts.cinder',
    'coat.nugget.tricolour',
    'coat.marshmallow.cream',
    'coat.bravo.fawn',
    'coat.chili.black-tan',
    'coat.howler.red',
    'coat.nugget.fluffy',
    'coat.marshmallow.cocoa',
    'coat.bravo.opera',
    'coat.chili.long-hair',
    'coat.howler.agouti',
    'coat.nugget.bread',
    'coat.marshmallow.snowcone',
    'coat.bravo.understudy',
    'coat.chili.hot-sauce',
    'coat.howler.pied',
    'coat.rocket.fawn',
    'coat.frankie.chili',
    'coat.domino.liver',
    'coat.rocket.blue',
    'coat.frankie.dapple',
    'coat.domino.lemon',
    'coat.rocket.retired',
    'coat.frankie.corndog',
    'coat.domino.firehouse',
];

/** The cosmetic pool per rarity: existing free cosmetics only (the client renders every id already). */
export const LUCKY_POOL: Readonly<Record<LuckyRarity, readonly string[]>> = Object.freeze({
    common: Object.freeze(PALETTES.flatMap(p => ORIGINALS.map(h => `coat.${h}.loop.${p}`))),
    rare: Object.freeze(['emote.wave', ...TRACK_COATS]),
    epic: Object.freeze(CHAMPS.flatMap(h => [`frame.champ.${h}`, `title.champ.${h}`])),
});

export interface LuckyDraw {
    rarity: LuckyRarity;
    /** The cosmetic granted, or absent when the whole tier was owned (then `xp`). */
    item?: string;
    xp?: number;
    /** This draw was lifted by the every-10th floor. */
    floor?: true;
}

/** A uniform number in [0, 1) from the account, day and draw number (deterministic: a retry draws the same). */
export function luckyRoll(accountId: string, day: string, n: number, salt = 'r'): number {
    const h = createHash('sha256').update(`lucky:${salt}:${accountId}:${day}:${n}`).digest();
    return h.readUInt32BE(0) / 0x1_0000_0000;
}

/** The odds a draw uses: the published table, or (on a floor draw) Rare and up renormalised. Pure. */
export function luckyOddsFor(n: number): Record<LuckyRarity, number> {
    if (n > 0 && n % LUCKY_FLOOR === 0) {
        const up = LUCKY_ODDS.rare + LUCKY_ODDS.epic;
        return { common: 0, rare: (100 * LUCKY_ODDS.rare) / up, epic: (100 * LUCKY_ODDS.epic) / up };
    }
    return { ...LUCKY_ODDS };
}

/** Pick a rarity for a roll in [0, 1). Pure. */
export function rarityFor(roll: number, odds: Record<LuckyRarity, number>): LuckyRarity {
    let acc = 0;
    const x = roll * 100;
    for (const r of LUCKY_RARITIES) {
        acc += odds[r];
        if (x < acc) return r;
    }
    return 'epic';
}

/**
 * Draw the `n`-th Lucky Treat (1-based) for an account on a UTC day. `owned`: the cosmetics the account already has
 * (its progress blob's unlocks), never drawn again. Pure.
 */
export function drawLucky(accountId: string, day: string, n: number, owned: ReadonlySet<string>): LuckyDraw {
    const odds = luckyOddsFor(n);
    const rarity = rarityFor(luckyRoll(accountId, day, n), odds);
    const floor = odds.common === 0 ? ({ floor: true } as const) : {};
    const free = LUCKY_POOL[rarity].filter(id => !owned.has(id));
    if (!free.length) return { rarity, xp: LUCKY_DUP_XP[rarity], ...floor };
    const pick = free[Math.floor(luckyRoll(accountId, day, n, 'i') * free.length)];
    return { rarity, item: pick, ...floor };
}

/** The table the client shows before opening (GET/POST /pawlegends/progress `lucky.odds`). */
export function luckyOddsTable() {
    return {
        odds: LUCKY_RARITIES.map(r => ({
            rarity: r,
            pct: LUCKY_ODDS[r],
            items: LUCKY_POOL[r].length,
            dupXp: LUCKY_DUP_XP[r],
        })),
        floor: LUCKY_FLOOR,
        dailyTreatXp: DAILY_TREAT_XP,
    };
}
