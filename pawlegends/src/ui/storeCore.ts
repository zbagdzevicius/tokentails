/**
 * The store's small shared part (gaps4 first-load JS): prices, item states, the purchase flag and the retired presale
 * SKU card. The title's offer card, the Legends Pass panel and the store read it; the store panel itself (ui/store.ts,
 * its CSS and its card art) loads only when a player opens it.
 */
import type { StoreSnapshot } from '../money/entitlements';
import { MVP_TARGET, SKUS, priceText, type Currency, type SkuId } from '../money/skus';
import { PASS_PLUS_SKU, PASS_SKU, type CatalogSku } from '../money/catalog';
import { champStatus, localChampions, type ChampionsState } from '../meta/champions';
import { SKU_LOOK } from '../render/portraits';
import { artLayers } from './art';

/** Plain words for the planned extras the pack lines name (they are not on sale yet). */
const GLOSSARY: readonly [RegExp, string][] = [
  [/Pride Club/, 'Pride Club: a planned monthly membership, not on sale yet.'],
  [/Legends Pass\+/, 'Legends Pass+: the planned season pass with extra rewards.'],
  [/Legends Pass(?!\+)/, 'Legends Pass: the planned season pass (free and paid tracks).'],
];

export function glossaryFor(text: string): string[] {
  return GLOSSARY.filter(([re]) => re.test(text)).map(([, line]) => line);
}

/**
 * Spending safeguards shown in the store (POC.md §8.5): VAT and the 30-day cap. The sheets no longer ask the age
 * (founder, Nov 12): the server holds an unknown buyer to the 16-17 cap and keeps a stored 18+ answer's cap.
 */
export function safeguardsLine(currency: Currency): string {
  const c = currency === 'eur' ? '€' : '$';
  return `Prices include VAT. Spending limit ${c}30 per 30 days (${c}200 if you told us earlier you are 18 or older).`;
}

/** Purchases made in this page session: the store then hides the upsell (no "€20 more" right after a purchase). */
let boughtThisSession = false;
export const purchasedThisSession = (): boolean => boughtThisSession;
export function notePurchase(ok: boolean): void {
  if (ok) boughtThisSession = true;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const LAUNCH = (() => {
  const d = new Date(`${MVP_TARGET}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
})();

/** One SKU card (also used by the offer card). */
export function skuCard(sku: SkuId, currency: Currency, opts: { compact?: boolean } = {}): string {
  const d = SKUS[sku];
  // the painted art of the look the pack is named after (the skin's splash over Clem's own)
  const art = `<div class="pl-sku-art pic sku-${sku}" style="background-image:${artLayers('clem', SKU_LOOK[sku], 360)}" role="img" aria-label="${esc(d.tag)}"></div>`;
  const gloss = opts.compact ? [] : glossaryFor(d.deliveredAtMvp);
  return `<div class="pl-sku ${opts.compact ? 'compact' : ''}" data-sku="${sku}">
    ${art}
    <div class="pl-sku-body">
      <b class="name">${esc(d.name)}</b>
      <small class="tag">${esc(d.tag)}</small>
      ${
        opts.compact
          ? `<p class="now"><i>Now</i> ${esc(d.deliveredNow)}</p>`
          : `<p class="now"><i>Now</i> ${esc(d.deliveredNow)}</p><p class="later"><i>At full launch (target ${esc(LAUNCH)})</i> ${esc(d.deliveredAtMvp)}</p>${gloss.map((g) => `<p class="gloss">${esc(g)}</p>`).join('')}`
      }
    </div>
    <button class="pl-btn small buy" data-buy="${sku}">${esc(priceText(sku, currency))}</button>
  </div>`;
}

export type StoreTab = 'featured' | 'champions' | 'coats' | 'frames' | 'sets' | 'pass';

/** "$2.99" / "€2.99" for a catalogue SKU (display only). */
export function catalogPrice(def: Pick<CatalogSku, 'cents'>, currency: Currency): string {
  const c = def.cents[currency];
  const v = `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
  return currency === 'eur' ? `€${v}` : `$${v}`;
}

export type ItemState = 'buy' | 'owned' | 'partly' | 'locked';

/** The champions state the store reads (the host's, else starters and the rotation). */
export const champsOf = (s: Partial<Pick<StoreSnapshot, 'champions'>>): ChampionsState => s.champions ?? localChampions();

/** Champions in a champion SKU the player owns (starters count; the store runs on the web only). */
export function champsOwned(def: CatalogSku, s: Partial<Pick<StoreSnapshot, 'champions'>>): number {
  const c = champsOf(s);
  return def.items.filter((i) => {
    const st = champStatus(i.slice('champ.'.length), c);
    return st === 'owned' || st === 'starter';
  }).length;
}

/** What a catalogue SKU costs this player: a champion bundle's prorated price (the server's), else the list price. */
export function priceFor(def: CatalogSku, s: Partial<Pick<StoreSnapshot, 'champions'>>): CatalogSku['cents'] {
  if (def.kind !== 'champion' || !def.bundleOf) return def.cents;
  return s.champions?.bundles.find((b) => b.sku === def.sku)?.cents ?? def.cents;
}

/**
 * A catalogue SKU's state for this player: owned (every item owned), partly (a set with some items owned: the singles
 * are sold instead, no prorated price), locked (the Pass+ upgrade without the Pass, or Pass when Pass+ is owned), or buy.
 */
export function itemState(def: CatalogSku, s: Pick<StoreSnapshot, 'items' | 'season'> & Partial<Pick<StoreSnapshot, 'champions'>>): ItemState {
  // champions (CHAMPION-STORE.md §5): owned when every champion in it is; a bundle over some is sold prorated
  if (def.kind === 'champion') return champsOwned(def, s) === def.items.length ? 'owned' : 'buy';
  const premium = s.season?.premium ?? 'none';
  if (def.kind === 'pass') {
    if (def.sku === PASS_SKU) return premium === 'none' ? 'buy' : 'owned';
    if (def.sku === PASS_PLUS_SKU) return premium === 'plus' ? 'owned' : premium === 'pass' ? 'locked' : 'buy';
    return premium === 'plus' ? 'owned' : premium === 'pass' ? 'buy' : 'locked';
  }
  const have = def.items.filter((i) => s.items.has(i)).length;
  if (have === def.items.length) return 'owned';
  if (def.kind === 'bundle' && have > 0) return 'partly';
  return 'buy';
}

