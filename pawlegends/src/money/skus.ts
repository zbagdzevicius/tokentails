/**
 * Store SKUs, display mirror (POC.md §8.1). The one real table is `backend/src/pawlegends/pawlegends.contracts.ts`
 * (`PAWLEGENDS_SKUS`): the host's purchase sheet and Stripe Checkout use the server price, which always wins. This
 * file only names the items and shows a price on the store cards. Keep the ids, items and lines in step with it
 * (`tests/unit/client-money.test.ts` pins the table).
 */

export const SKU_IDS = Object.freeze(['pl_starter', 'pl_founder', 'pl_founder_legend', 'pl_founder_legend_upgrade'] as const);
export type SkuId = (typeof SKU_IDS)[number];
export const isSku = (v: unknown): v is SkuId => typeof v === 'string' && (SKU_IDS as readonly string[]).includes(v);

export type Currency = 'usd' | 'eur';

/** Cosmetic item ids, as granted by the backend (`PAWLEGENDS_ITEMS`). */
export const ITEMS = Object.freeze({
  starterSkin: 'skin.clem.pink_bow',
  starterEmote: 'emote.starter',
  founderCoats: Object.freeze(['coat.founder.clem', 'coat.founder.sage', 'coat.founder.brutus', 'coat.founder.cacklejaw'] as const),
  founderFrame: 'frame.founder',
  founderTitle: 'title.founder',
  legendSkin: 'skin.clem.dawnblade',
  legendFrame: 'frame.legend',
});

const FOUNDER_ITEMS: readonly string[] = [...ITEMS.founderCoats, ITEMS.founderFrame, ITEMS.founderTitle];
const LEGEND_EXTRA: readonly string[] = [ITEMS.legendSkin, ITEMS.legendFrame];

/** Every item id a token may carry that this build can render. */
export const KNOWN_ITEMS: ReadonlySet<string> = new Set<string>([ITEMS.starterSkin, ITEMS.starterEmote, ...FOUNDER_ITEMS, ...LEGEND_EXTRA]);

export interface SkuDisplay {
  sku: SkuId;
  /** Card title. */
  name: string;
  /** Short card tag line. */
  tag: string;
  /** VAT-inclusive price in cents per currency (display only). */
  cents: Readonly<Record<Currency, number>>;
  items: readonly string[];
  deliveredNow: string;
  deliveredAtMvp: string;
  /** Hidden from the store grid; offered only to Founder owners. */
  upgrade?: boolean;
  /** Needs `pl_founder` owned (and no Founder Legend). */
  requiresFounder?: boolean;
  /** Bought once (starter, upgrade). */
  once?: boolean;
}

/** The MVP launch target every deferred line promises (POC.md §8.1). */
export const MVP_TARGET = '2027-04-30';

export const SKUS: Readonly<Record<SkuId, SkuDisplay>> = Object.freeze({
  pl_starter: {
    sku: 'pl_starter',
    name: 'Starter',
    tag: 'Pink Bow Clem',
    cents: { usd: 99, eur: 99 },
    items: [ITEMS.starterSkin, ITEMS.starterEmote],
    deliveredNow: '"Pink Bow Clem" Rare skin and the "Starter" emote',
    deliveredAtMvp: '3-day Pride Club trial (bonus)',
    once: true,
  },
  pl_founder: {
    sku: 'pl_founder',
    name: 'Founder',
    tag: 'Gold-trim coats for every hero',
    cents: { usd: 999, eur: 999 },
    items: FOUNDER_ITEMS,
    deliveredNow: 'Founder Epic coat for all 4 heroes, animated Founder frame, Founder title',
    deliveredAtMvp: '4 launch heroes of your choice, Season 1 Legends Pass, your name in the in-game credits',
  },
  pl_founder_legend: {
    sku: 'pl_founder_legend',
    name: 'Founder Legend',
    tag: 'Dawnblade Clem, first 500 only',
    cents: { usd: 2999, eur: 2999 },
    items: [...FOUNDER_ITEMS, ...LEGEND_EXTRA],
    deliveredNow: 'Everything in Founder, plus the "Dawnblade Clem" Legendary skin and the Legend frame',
    deliveredAtMvp: "Everything in Founder at full launch, plus all 8 launch heroes, Season 1 Legends Pass+, 1 month Pride Club, your name on the Founders' Banner",
  },
  pl_founder_legend_upgrade: {
    sku: 'pl_founder_legend_upgrade',
    name: 'Founder Legend upgrade',
    tag: 'For Founders: add Dawnblade Clem',
    cents: { usd: 2000, eur: 2000 },
    items: LEGEND_EXTRA,
    deliveredNow: 'The "Dawnblade Clem" Legendary skin and the Legend frame',
    deliveredAtMvp: 'Everything Founder Legend delivers at full launch',
    upgrade: true,
    requiresFounder: true,
    once: true,
  },
});

/** EUR when the browser time zone is in Europe (POC.md §8.1 "Currency"), else USD. Display only. */
export function currencyFor(timeZone: string | undefined | null): Currency {
  return typeof timeZone === 'string' && /^Europe\//.test(timeZone) ? 'eur' : 'usd';
}

export function browserCurrency(): Currency {
  try {
    return currencyFor(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return 'usd';
  }
}

/** "$0.99" / "€9.99". */
export function priceText(sku: SkuId, currency: Currency): string {
  const c = SKUS[sku].cents[currency];
  const v = `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
  return currency === 'eur' ? `€${v}` : `$${v}`;
}

/**
 * The SKUs a player may buy now, in store order, given what they own (SKU ids from the entitlement token).
 * Starter and the upgrade are once only; the upgrade replaces Founder Legend for Founder owners.
 */
export function buyable(owned: ReadonlySet<SkuId>): SkuId[] {
  const legend = owned.has('pl_founder_legend') || owned.has('pl_founder_legend_upgrade');
  const founder = owned.has('pl_founder') || owned.has('pl_founder_legend');
  const out: SkuId[] = [];
  if (!owned.has('pl_starter')) out.push('pl_starter');
  if (!founder) out.push('pl_founder');
  if (!legend) out.push(founder ? 'pl_founder_legend_upgrade' : 'pl_founder_legend');
  return out;
}
