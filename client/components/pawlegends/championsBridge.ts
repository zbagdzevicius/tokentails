/**
 * The game's `champions {cats[]}` (sim v9): the four shelter champions' Token Tails cards, from the public
 * `GET /pawlegends/champions` (the storefront fields plus `forSale` from the server's direct-purchase check; the
 * storefront itself caps Pink Paw at 200 cats, so it may not list them).
 *
 * Every champion is free to play in every build: a card only adds cosmetics (a badge, the Companion Kitten, the
 * element chroma). Here a card counts as for sale only when the server says so, the client mirror agrees
 * (`isCatForSale`) and the player holds no copy (`ownsCopy`). App builds send none for sale (the bridge strips
 * it again). Never packs, never random.
 *
 * No React: the response and the owned cats come in, so the rules are unit-tested.
 */
import type { ICat } from "@/models/cats";
import { isCatForSale, ownsCopy } from "@/components/shelter/catSale";
import { artUrlOf, isCatalogId, PAWLEGENDS_CHAMPIONS_LIMIT, type PawlegendsChampionCard } from "./bridge";

export interface ChampionsPick {
  cards: PawlegendsChampionCard[];
  /** The champion cards for sale, by catalog id (the purchase sheet renders them). */
  byId: Map<string, ICat>;
}

export const NO_CHAMPIONS: ChampionsPick = Object.freeze({ cards: [], byId: new Map() }) as ChampionsPick;

/** `GET /pawlegends/champions` → the `champions` message and the sheet's cats. Bad rows are skipped. */
export function championsOf(body: unknown, owned: ICat[] | undefined, isApp: boolean): ChampionsPick {
  const rows = body && typeof body === "object" && Array.isArray((body as { cats?: unknown }).cats) ? ((body as { cats: unknown[] }).cats) : [];
  const cards: PawlegendsChampionCard[] = [];
  const byId = new Map<string, ICat>();
  for (const raw of rows.slice(0, PAWLEGENDS_CHAMPIONS_LIMIT)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { catalogId?: unknown; forSale?: unknown; cat?: unknown };
    const catalogId = typeof row.catalogId === "string" ? row.catalogId.toLowerCase() : "";
    if (!isCatalogId(catalogId) || cards.some((c) => c.catalogId === catalogId)) continue;
    const cat = row.cat && typeof row.cat === "object" ? (row.cat as ICat) : null;
    const forSale = !isApp && row.forSale === true && !!cat && isCatForSale(cat) && !ownsCopy(owned, cat);
    const card: PawlegendsChampionCard = { catalogId, forSale };
    const art = artUrlOf(cat?.catImg);
    if (art) card.catImg = art;
    cards.push(card);
    if (forSale && cat) byId.set(catalogId, cat);
  }
  return { cards, byId };
}
