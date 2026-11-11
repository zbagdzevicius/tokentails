/*
 * Paw Legends store and Legends Pass catalogue (docs/plans/moba/STORE-PASS.md), GAME MIRROR. Two copies, same values:
 * `backend/src/pawlegends/pawlegends-catalog.ts` is the real one (Checkout prices, grants, season XP and claims); this is
 * the game's display mirror. `pawlegends/tests/unit/store-pass.test.ts` imports both and deep-compares them, so edit
 * both in the same commit. Pure data and math: no imports (the game test imports this file directly).
 *
 * Every item here is cosmetic only: the sim, the replay record and the hash never read it.
 */

/** Terms version of the cosmetics store and the Legends Pass checkout (`/pawlegends/terms`, store section). */
export const STORE_TERMS_VERSION = '2026-11-10';

export const ORIGINAL_HEROES = [
    'clem',
    'sage',
    'meatball',
    'pixel',
    'duchess',
    'stilts',
    'brutus',
    'cacklejaw',
    'nugget',
    'marshmallow',
    'bravo',
    'chili',
    'howler',
    'rocket',
    'frankie',
    'domino',
] as const;

export const HERO_LABEL: Readonly<Record<string, string>> = Object.freeze({
    clem: 'Clem',
    sage: 'Sage',
    meatball: 'Meatball',
    pixel: 'Pixel',
    duchess: 'Duchess',
    stilts: 'Stilts',
    brutus: 'Brutus',
    cacklejaw: 'Cacklejaw',
    nugget: 'Nugget',
    marshmallow: 'Marshmallow',
    bravo: 'Bravo',
    chili: 'Chili',
    howler: 'Howler',
    rocket: 'Rocket',
    frankie: 'Frankie',
    domino: 'Domino',
});

export interface CatalogCoat {
    id: string;
    hero: string;
    name: string;
}

/** One Common coat per original hero (patterned; the free Treat Track coats are palette-only). */
export const STORE_COATS: readonly CatalogCoat[] = Object.freeze([
    { id: 'coat.clem.store_calico', hero: 'clem', name: 'Patchwork Calico coat' },
    { id: 'coat.sage.store_silver_tabby', hero: 'sage', name: 'Silver Tabby coat' },
    { id: 'coat.meatball.store_siamese', hero: 'meatball', name: 'Siamese Point coat' },
    { id: 'coat.pixel.store_leopard', hero: 'pixel', name: 'Leopard coat' },
    { id: 'coat.duchess.store_blue_point', hero: 'duchess', name: 'Blue Point coat' },
    { id: 'coat.stilts.store_bengal', hero: 'stilts', name: 'Bengal Rosette coat' },
    { id: 'coat.brutus.store_brindle', hero: 'brutus', name: 'Brindle coat' },
    { id: 'coat.cacklejaw.store_starry', hero: 'cacklejaw', name: 'Starry Night coat' },
    { id: 'coat.nugget.store_merle', hero: 'nugget', name: 'Blue Merle coat' },
    { id: 'coat.marshmallow.store_tuxedo', hero: 'marshmallow', name: 'Tuxedo coat' },
    { id: 'coat.bravo.store_harlequin', hero: 'bravo', name: 'Harlequin coat' },
    { id: 'coat.chili.store_red_brindle', hero: 'chili', name: 'Red Brindle coat' },
    { id: 'coat.howler.store_sable', hero: 'howler', name: 'Sable Saddle coat' },
    { id: 'coat.rocket.store_tiger', hero: 'rocket', name: 'Tiger Brindle coat' },
    { id: 'coat.frankie.store_patchwork', hero: 'frankie', name: 'Patchwork coat' },
    { id: 'coat.domino.store_black_tie', hero: 'domino', name: 'Black Tie coat' },
]);

/** A coat's effect rung (docs/plans/moba/CARD-SKINS.md §5): fixed by the price band, never by play. */
export type CoatRung = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface EffectCoat extends CatalogCoat {
    /** The skin-effects rung the coat shows in a match (the game's skin-effect kit). Looks only. */
    rung: 'EPIC' | 'LEGENDARY';
}

/**
 * Effect coats (CARD-SKINS.md §6.3): palette, fur pattern and a fixed Epic or Legendary effect rung. No new model
 * parts, so they sell below the GDD §8.5 bands ($9.99 / $19.99 stay for coats with accessories). Never in a set.
 */
export const EFFECT_COATS: readonly EffectCoat[] = Object.freeze([
    { id: 'coat.pixel.store_moonwhisker', hero: 'pixel', name: 'Moonwhisker coat', rung: 'EPIC' },
    { id: 'coat.marshmallow.store_frostbell', hero: 'marshmallow', name: 'Frostbell coat', rung: 'EPIC' },
    { id: 'coat.brutus.store_thunderpaw', hero: 'brutus', name: 'Thunderpaw coat', rung: 'LEGENDARY' },
    { id: 'coat.sage.store_bloomtail', hero: 'sage', name: 'Bloomtail coat', rung: 'LEGENDARY' },
] as EffectCoat[]);

/** Effect coat prices by rung. */
export const EFFECT_COAT_CENTS: Readonly<Record<EffectCoat['rung'], { usd: number; eur: number }>> = Object.freeze({
    EPIC: { usd: 799, eur: 799 },
    LEGENDARY: { usd: 1499, eur: 1499 },
});

export interface CatalogFrame {
    id: string;
    name: string;
    /** The title sold with the frame (titles are not sold alone). */
    title: { id: string; name: string };
}

export const STORE_FRAMES: readonly CatalogFrame[] = Object.freeze([
    { id: 'frame.store.goldpaw', name: 'Gold Paw frame', title: { id: 'title.store.goldpaw', name: 'Gold Paw' } },
    { id: 'frame.store.moonlit', name: 'Moonlit frame', title: { id: 'title.store.moonlit', name: 'Night Prowler' } },
    { id: 'frame.store.sunbeam', name: 'Sunbeam frame', title: { id: 'title.store.sunbeam', name: 'Sunbather' } },
    { id: 'frame.store.bone', name: 'Bone frame', title: { id: 'title.store.bone', name: 'Good Dog' } },
]);

export type CatalogKind = 'cosmetic' | 'bundle' | 'pass';
export type CatalogGroup = 'coats' | 'frames' | 'sets' | 'pass';

export interface CatalogSku {
    sku: string;
    kind: CatalogKind;
    group: CatalogGroup;
    label: string;
    /** VAT-inclusive, smallest currency unit (the server price always wins). */
    cents: { usd: number; eur: number };
    /** Items granted when paid (a pass SKU grants the premium row instead, plus `items` for Pass+). */
    items: string[];
    /** A bundle: the single SKUs it contains. Buyable only while none of their items is owned. */
    bundleOf?: string[];
    /** Pass SKUs: what the premium row becomes. */
    pass?: 'pass' | 'plus';
    /** Only for owners of this SKU (the Pass+ upgrade). */
    requires?: string;
    /** The hero a coat SKU dresses. */
    hero?: string;
}

const COAT_CENTS = { usd: 299, eur: 299 };
const FRAME_CENTS = { usd: 199, eur: 199 };
const SET_CENTS = { usd: 1499, eur: 1499 };

export const coatSkuOf = (coat: CatalogCoat): string => `pl_coat_${coat.hero}_${coat.id.split('.store_')[1]}`;
export const frameSkuOf = (frame: CatalogFrame): string => `pl_frame_${frame.id.slice('frame.store.'.length)}`;

const CAT_SET_HEROES = ['clem', 'sage', 'meatball', 'pixel', 'duchess', 'stilts'];
const DOG_SET_HEROES = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili'];

const coatSkus: CatalogSku[] = STORE_COATS.map(coat => ({
    sku: coatSkuOf(coat),
    kind: 'cosmetic',
    group: 'coats',
    label: `${HERO_LABEL[coat.hero]}: ${coat.name}`,
    cents: COAT_CENTS,
    items: [coat.id],
    hero: coat.hero,
}));

const RUNG_LABEL: Readonly<Record<EffectCoat['rung'], string>> = { EPIC: 'Epic', LEGENDARY: 'Legendary' };

const effectCoatSkus: CatalogSku[] = EFFECT_COATS.map(coat => ({
    sku: coatSkuOf(coat),
    kind: 'cosmetic',
    group: 'coats',
    label: `${HERO_LABEL[coat.hero]}: ${coat.name} (${RUNG_LABEL[coat.rung]} effects)`,
    cents: EFFECT_COAT_CENTS[coat.rung],
    items: [coat.id],
    hero: coat.hero,
}));

const frameSkus: CatalogSku[] = STORE_FRAMES.map(frame => ({
    sku: frameSkuOf(frame),
    kind: 'cosmetic',
    group: 'frames',
    label: `${frame.name} + "${frame.title.name}" title`,
    cents: FRAME_CENTS,
    items: [frame.id, frame.title.id],
}));

const setSku = (sku: string, label: string, heroes: string[], frameId: string): CatalogSku => {
    const coats = STORE_COATS.filter(c => heroes.includes(c.hero));
    const frame = STORE_FRAMES.find(f => f.id === frameId)!;
    const bundleOf = [...coats.map(coatSkuOf), frameSkuOf(frame)];
    return {
        sku,
        kind: 'bundle',
        group: 'sets',
        label,
        cents: SET_CENTS,
        items: [...coats.map(c => c.id), frame.id, frame.title.id],
        bundleOf,
    };
};

export const SEASON_PLUS_SKIPS = 15;

export const PASS_SKU = 'pl_pass_s1';
export const PASS_PLUS_SKU = 'pl_pass_plus_s1';
export const PASS_UPGRADE_SKU = 'pl_pass_plus_upgrade_s1';
export const PASS_SKUS = [PASS_SKU, PASS_PLUS_SKU, PASS_UPGRADE_SKU];

/** The exclusive Epic coat of Legends Pass+ (Season 1). */
export const S1_PLUS_COAT = 'coat.duchess.s1_eclipse';

export const CATALOG_SKUS: readonly CatalogSku[] = Object.freeze([
    ...coatSkus,
    ...effectCoatSkus,
    ...frameSkus,
    setSku('pl_set_cats_s1', 'Cat Squad set: 6 cat coats + Moonlit frame', CAT_SET_HEROES, 'frame.store.moonlit'),
    setSku('pl_set_dogs_s1', 'Dog Pack set: 6 dog coats + Bone frame', DOG_SET_HEROES, 'frame.store.bone'),
    {
        sku: PASS_SKU,
        kind: 'pass',
        group: 'pass',
        label: 'Legends Pass: Season 1',
        cents: { usd: 799, eur: 799 },
        items: [],
        pass: 'pass',
    },
    {
        sku: PASS_PLUS_SKU,
        kind: 'pass',
        group: 'pass',
        label: 'Legends Pass+: Season 1',
        cents: { usd: 1999, eur: 1999 },
        items: [S1_PLUS_COAT],
        pass: 'plus',
    },
    {
        sku: PASS_UPGRADE_SKU,
        kind: 'pass',
        group: 'pass',
        label: 'Legends Pass+ upgrade: Season 1',
        cents: { usd: 1200, eur: 1200 },
        items: [S1_PLUS_COAT],
        pass: 'plus',
        requires: PASS_SKU,
    },
] as CatalogSku[]);

export const catalogSku = (sku: unknown): CatalogSku | undefined =>
    typeof sku === 'string' ? CATALOG_SKUS.find(s => s.sku === sku) : undefined;

/**
 * SKUs that cannot both be held by one account: the SKU itself, the sets that contain it (or, for a set, its
 * singles), and the pass SKUs that overlap (Pass and Pass+, Pass+ and the upgrade).
 */
export function conflictsOf(sku: string): string[] {
    const def = catalogSku(sku);
    if (!def) return [sku];
    if (sku === PASS_SKU) return [PASS_SKU, PASS_PLUS_SKU];
    if (sku === PASS_PLUS_SKU) return [PASS_SKU, PASS_PLUS_SKU, PASS_UPGRADE_SKU];
    if (sku === PASS_UPGRADE_SKU) return [PASS_PLUS_SKU, PASS_UPGRADE_SKU];
    if (def.bundleOf) return [sku, ...def.bundleOf];
    return [sku, ...CATALOG_SKUS.filter(s => s.bundleOf?.includes(sku)).map(s => s.sku)];
}

// ---------------------------------------------------------------------------------------------------------------
// Legends Pass seasons

export interface SeasonReward {
    tier: number;
    item: string;
    name: string;
    hero?: string;
}

export interface SeasonDef {
    id: string;
    name: string;
    /** ISO dates. "Never expires": a season stays claimable after it ends, and XP keeps counting until the next one. */
    startsAt: string;
    endsAt: string;
    tiers: number;
    xpPerTier: number;
    /** Free row: a reward every third tier. */
    free: SeasonReward[];
    /** Premium row: a reward on every tier. */
    premium: SeasonReward[];
}

const coat = (tier: number, hero: string, key: string, name: string): SeasonReward => ({
    tier,
    item: `coat.${hero}.s1_${key}`,
    name,
    hero,
});
const thing = (tier: number, item: string, name: string): SeasonReward => ({ tier, item, name });

export const SEASONS: readonly SeasonDef[] = Object.freeze([
    {
        id: 's1',
        name: 'Season 1: First Paws',
        startsAt: '2026-11-10T00:00:00.000Z',
        endsAt: '2027-01-05T00:00:00.000Z',
        tiers: 30,
        xpPerTier: 400,
        free: [
            coat(3, 'clem', 'honey_tabby', 'Honey Tabby coat'),
            thing(6, 'title.s1.rookie', 'Rookie Legend title'),
            coat(9, 'brutus', 'mud', 'Mud Puddle coat'),
            thing(12, 'frame.s1.sprout', 'Sprout frame'),
            coat(15, 'sage', 'meadow', 'Meadow coat'),
            coat(18, 'nugget', 'toast', 'Toast coat'),
            thing(21, 'title.s1.trailblazer', 'Trailblazer title'),
            coat(24, 'pixel', 'mint', 'Mint Chip coat'),
            thing(27, 'frame.s1.harvest', 'Harvest frame'),
            coat(30, 'chili', 'paprika', 'Paprika coat'),
        ],
        premium: [
            coat(1, 'meatball', 'caramel', 'Caramel Swirl coat'),
            coat(2, 'cacklejaw', 'embers', 'Ember Spots coat'),
            coat(3, 'duchess', 'lavender', 'Lavender Point coat'),
            coat(4, 'marshmallow', 'strawberry', 'Strawberry Swirl coat'),
            thing(5, 'title.s1.pathfinder', 'Pathfinder title'),
            coat(6, 'stilts', 'savanna', 'Savanna coat'),
            coat(7, 'bravo', 'opening_night', 'Opening Night coat'),
            thing(8, 'frame.s1.lantern', 'Lantern frame'),
            coat(9, 'clem', 'tortie', 'Tortoiseshell coat'),
            coat(10, 'howler', 'timber', 'Timber coat'),
            coat(11, 'sage', 'autumn', 'Autumn Tabby coat'),
            thing(12, 'title.s1.night_owl', 'Night Owl title'),
            coat(13, 'rocket', 'comet', 'Comet coat'),
            coat(14, 'pixel', 'galaxy', 'Galaxy coat'),
            coat(15, 'frankie', 'mustard', 'Mustard coat'),
            thing(16, 'frame.s1.starfall', 'Starfall frame'),
            coat(17, 'meatball', 'cinnamon', 'Cinnamon Roll coat'),
            coat(18, 'domino', 'ink', 'Ink Blot coat'),
            coat(19, 'duchess', 'velvet', 'Velvet coat'),
            thing(20, 'title.s1.champion', 'Season Champion title'),
            coat(21, 'nugget', 'waffle', 'Waffle coat'),
            coat(22, 'stilts', 'snow_leopard', 'Snow Leopard coat'),
            coat(23, 'brutus', 'royal', 'Royal Guard coat'),
            thing(24, 'frame.s1.aurora', 'Aurora frame'),
            coat(25, 'chili', 'jalapeno', 'Jalapeno coat'),
            coat(26, 'clem', 'starlight', 'Starlight coat'),
            thing(27, 'title.s1.legend', 'Season One Legend title'),
            coat(28, 'cacklejaw', 'aurora', 'Aurora coat'),
            thing(29, 'frame.s1.crown', 'Crown frame'),
            coat(30, 'clem', 'sunforged', 'Sunforged coat'),
        ],
    },
]);

export const CURRENT_SEASON_ID = 's1';
export const seasonDef = (id: unknown): SeasonDef | undefined =>
    typeof id === 'string' ? SEASONS.find(s => s.id === id) : undefined;

/** The display names of pass-only titles and frames (the coat names live in the rewards too). */
export const SEASON_ITEM_NAMES: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(
        SEASONS.flatMap(s => [...s.free, ...s.premium]).map(r => [r.item, r.name.replace(/ title$/, '')])
    )
);

/** Season XP per verified match (the Treat Track numbers, meta/treats.ts TREAT_XP, on the server). */
export const SEASON_XP = Object.freeze({
    win: 100,
    loss: 60,
    forfeit: 20,
    perTakedown: 10,
    maxTakedowns: 15,
    firstWinOfDay: 150,
});

export function seasonXpFor(m: { won: boolean; forfeit: boolean; takedowns: number; firstWinToday: boolean }): number {
    const base = m.forfeit ? SEASON_XP.forfeit : m.won ? SEASON_XP.win : SEASON_XP.loss;
    const t = Math.max(0, Math.min(SEASON_XP.maxTakedowns, Math.floor(Number(m.takedowns) || 0)));
    return (
        base + (m.forfeit ? 0 : t * SEASON_XP.perTakedown) + (m.won && m.firstWinToday ? SEASON_XP.firstWinOfDay : 0)
    );
}

/** The tier reached: XP tiers plus Pass+ skips, at most the season's last tier. */
export function seasonTier(def: SeasonDef, xp: number, skips = 0): number {
    const t = Math.floor(Math.max(0, xp) / def.xpPerTier) + Math.max(0, skips);
    return Math.min(def.tiers, t);
}

export type PassRow = 'f' | 'p';
export const claimKey = (row: PassRow, tier: number): string => `${row}:${tier}`;

/** The reward of a row and tier, or undefined (the free row has a reward every third tier only). */
export const rewardAt = (def: SeasonDef, row: PassRow, tier: number): SeasonReward | undefined =>
    (row === 'f' ? def.free : def.premium).find(r => r.tier === tier);

/** Claimable now: reached, not claimed, and (premium row) the pass is owned. */
export function claimable(
    def: SeasonDef,
    s: { xp: number; skips: number; premium: 'none' | 'pass' | 'plus'; claimed: readonly string[] }
): { row: PassRow; tier: number; item: string }[] {
    const tier = seasonTier(def, s.xp, s.skips);
    const out: { row: PassRow; tier: number; item: string }[] = [];
    for (const r of def.free)
        if (r.tier <= tier && !s.claimed.includes(claimKey('f', r.tier)))
            out.push({ row: 'f', tier: r.tier, item: r.item });
    if (s.premium !== 'none') {
        for (const r of def.premium)
            if (r.tier <= tier && !s.claimed.includes(claimKey('p', r.tier)))
                out.push({ row: 'p', tier: r.tier, item: r.item });
    }
    return out;
}
