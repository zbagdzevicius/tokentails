import { Types } from 'mongoose';
import { STOREFRONT_BLESSING_SELECT, STOREFRONT_SHELTER_SELECT, storefrontProjection } from 'src/cat/storefront';

/*
 * Pawlegends shelter champions (sim v9): four heroes inspired by real Pink Paw cats' Token Tails cards (licence for
 * the cats' names and photos, Oct 11). Every champion is free to play in every build; owning the card adds
 * cosmetics only (a badge, the Companion Kitten, the element chroma), so no route here checks an entitlement and
 * `/live` accepts every hero the vendored sim knows.
 *
 * `GET /pawlegends/champions` gives the host the cards: the storefront whitelist fields (never `owner`, codes or
 * user ids) and `forSale` from `ShelterCatSaleService.check`. It exists because `GET /cat/sale` caps each shelter at
 * 200 cats and Pink Paw is at that cap, so a champion's card may be missing there.
 *
 * The champion ids live in three places (docs/DEVELOPMENT.md): pawlegends/src/data/heroes/shelter.ts, this file,
 * and the host, which reads them from this route.
 */
export const PAWLEGENDS_CHAMPIONS = Object.freeze([
    { hero: 'lambo', catalogId: '6a30473c1d6649b19b03622b' },
    { hero: 'aviete', catalogId: '6965203d0a2c7b325b78f7e2' },
    { hero: 'bengas', catalogId: '6963fd97f5f542518922871b' },
    { hero: 'gabe', catalogId: '6992227d890a12f52a317e22' },
] as const);

/** Cached for 5 minutes per instance (the host asks once per visit). */
export const PAWLEGENDS_CHAMPIONS_TTL_MS = 5 * 60_000;

export interface PawlegendsChampionRow {
    hero: string;
    catalogId: string;
    forSale: boolean;
    /** The card with the storefront whitelist fields, or null when the catalog cat is gone. */
    cat: Record<string, unknown> | null;
}

export interface PawlegendsChampionsResponse {
    cats: PawlegendsChampionRow[];
}

/** The two reads the route needs, behind small interfaces so the spec can pass fakes. */
export interface ChampionCatSource {
    model: {
        find(
            filter: unknown,
            projection: unknown
        ): {
            populate(spec: unknown): { lean(): { exec(): Promise<unknown[]> } };
        };
    };
}
export interface ChampionSaleCheck {
    check(catId: unknown): Promise<{ ok: boolean }>;
}

let cache: { at: number; value: Promise<PawlegendsChampionsResponse> } | null = null;

/** Specs only. */
export function resetChampionsCache(): void {
    cache = null;
}

async function build(
    cats: ChampionCatSource,
    sale: ChampionSaleCheck | undefined
): Promise<PawlegendsChampionsResponse> {
    const ids = PAWLEGENDS_CHAMPIONS.map(c => new Types.ObjectId(c.catalogId));
    const rows = (await cats.model
        .find({ _id: { $in: ids } }, storefrontProjection())
        .populate([
            {
                path: 'blessing',
                select: STOREFRONT_BLESSING_SELECT,
                populate: [
                    { path: 'image', select: 'url' },
                    { path: 'catAvatar', select: 'url' },
                ],
            },
            { path: 'shelter', select: STOREFRONT_SHELTER_SELECT, populate: [{ path: 'image', select: 'url' }] },
        ])
        .lean()
        .exec()) as Record<string, unknown>[];
    const byId = new Map(rows.map(r => [String(r._id).toLowerCase(), r]));
    const out: PawlegendsChampionRow[] = [];
    for (const c of PAWLEGENDS_CHAMPIONS) {
        const cat = byId.get(c.catalogId) ?? null;
        const forSale = !!cat && !!sale && (await sale.check(c.catalogId)).ok;
        out.push({ hero: c.hero, catalogId: c.catalogId, forSale, cat });
    }
    return { cats: out };
}

/** The champions' cards, cached PAWLEGENDS_CHAMPIONS_TTL_MS; a failed build is never served from the cache. */
export function championCards(
    cats: ChampionCatSource,
    sale: ChampionSaleCheck | undefined,
    now: number = Date.now()
): Promise<PawlegendsChampionsResponse> {
    if (cache && now - cache.at < PAWLEGENDS_CHAMPIONS_TTL_MS) return cache.value;
    const value = build(cats, sale);
    cache = { at: now, value };
    value.catch(() => {
        if (cache?.value === value) cache = null;
    });
    return value;
}
