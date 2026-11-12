/**
 * Store panel (docs/plans/moba/STORE-PASS.md §6, CHAMPION-STORE.md §10, web only). Opened from the lobby rail and the
 * results screen; never in pick, loading or a match, never in app builds, and only when the host says its checkout is
 * reachable. Laid out like Wild Rift's store: a top bar (back, STORE, the Yarn balance), a bottom tab bar (Featured ·
 * Champions · Coats · Frames & Titles, a gold chevron on the active one) and, on Champions, the side and role filters,
 * an Unowned toggle and a sort. Every tab is one vertically scrolling grid of the same tall framed cards (art, the
 * name on a dark gradient, a price bar, owned and equipped states; founder, Nov 12: "champ store should be vertically
 * scrollable ... same should be for coats, for frames & titles"): only the grid scrolls, the top bar, the filters and
 * the tabs stay put. A card opens a detail: a champion's big splash, kit and unlock buttons (Yarn, a Champion Pick,
 * the web price), or a coat, frame, set or pass with its preview and Buy or Equip. Buy hands over to the host
 * (money/checkoutBridge.ts): its own sheet with the server price, the email and the purchase button that is the
 * consent, then Stripe Checkout on the web page. Prices here are display only; the server price always wins.
 *
 * Pull only: nothing here pushes an offer card (one per session, §8.1 #4 and #5). Cosmetic only: no item changes a
 * match. No randomness: every item and every pass reward is shown before buying.
 *
 * `skuCard` and the safeguards line stay for the retired presale offer card (money/offer.ts).
 */
import { CheckoutBridge } from '../money/checkoutBridge';
import type { StoreSnapshot } from '../money/entitlements';
import { MVP_TARGET, SKUS, priceText, type Currency, type SkuId } from '../money/skus';
import { CATALOG_SKUS, CHAMPIONS, CHAMP_BUNDLE_SKUS, EFFECT_COATS, PASS_PLUS_SKU, PASS_SKU, PASS_UPGRADE_SKU, STORE_COATS, STORE_FRAMES, champSkuOf, championDef, coatSkuOf, frameSkuOf, isStarter, type CatalogFrame, type CatalogSku, type CoatRung } from '../money/catalog';
import { champStatus, localChampions, matchesFor, rotationEndText, unlockInfo, yarnText, type ChampionsState } from '../meta/champions';
import type { ChampTier } from '../money/catalog';
import type { HeroId, HeroRole } from '../data/heroes/types';
import { ROLE_NAME, ROLE_ORDER, isNewHero } from './champSelect/roles';
import { HERO_TEXT } from './heroText';
import { DIFFICULTY_NAME, HERO_DIFFICULTY } from './champBrowser/meta';
import { DEFAULT_FILTER, SORT_KEYS, SORT_LABEL, allCards, champCard, loadSort, newestHeroes, saveSort, splashAttrs, visibleCards, type ChampCard, type ChampFilter, type SideFilter, type SortKey } from './champStore/model';
import './champStore/champStore.css';
import { PAID_COATS } from '../render/cosmetics';
import { browserCurrency } from '../money/skus';
import { icon } from './icons';
import { SKU_LOOK } from '../render/portraits';
import { artImgAttrs, artLayers, skinArtId } from './art';
import { HERO_IDS } from '../data/heroes';
import { assetRev } from './assetRev';

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
const champsOf = (s: Partial<Pick<StoreSnapshot, 'champions'>>): ChampionsState => s.champions ?? localChampions();

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

/** The SKUs of a tab, in shelf order. */
export function tabSkus(tab: StoreTab): CatalogSku[] {
  if (tab === 'champions')
    return [
      ...CHAMP_BUNDLE_SKUS.map((sku) => CATALOG_SKUS.find((d) => d.sku === sku)!),
      ...CHAMPIONS.filter((c) => !isStarter(c.hero)).map((c) => CATALOG_SKUS.find((d) => d.sku === champSkuOf(c.hero))!),
    ];
  if (tab === 'coats') return [...EFFECT_COATS, ...STORE_COATS].map((c) => CATALOG_SKUS.find((d) => d.sku === coatSkuOf(c))!);
  if (tab === 'frames') return STORE_FRAMES.map((f) => CATALOG_SKUS.find((d) => d.sku === frameSkuOf(f))!);
  if (tab === 'sets') return CATALOG_SKUS.filter((d) => d.kind === 'bundle');
  return CATALOG_SKUS.filter((d) => d.kind === 'pass');
}

const RUNG_WORD: Readonly<Record<CoatRung, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });
/** What a coat's effect rung adds in a match (docs/plans/moba/CARD-SKINS.md §3). Looks only, never a number. */
const RUNG_ADDS: Readonly<Record<CoatRung, string>> = Object.freeze({
  COMMON: '',
  RARE: 'Rare effects: trails, ribbons and hits take the coat colour.',
  EPIC: 'Epic effects: coat-colour skill effects, element motifs on hits, a takedown stamp in the coat pattern.',
  LEGENDARY: 'Legendary effects: paw-print bursts, an element foil, a recall card glyph, a multi-kill card and a purr.',
});
const coatRungOf = (id: string | undefined): CoatRung | null => (id ? (PAID_COATS[id]?.rung ?? null) : null);
/** The store line for a coat: the pattern and what its rung adds. */
export function coatLine(id: string | null): string {
  const r = coatRungOf(id ?? undefined);
  return `A patterned coat for one hero.${r && RUNG_ADDS[r] ? ` ${RUNG_ADDS[r]}` : ''}`;
}

export interface StoreOpts {
  snapshot: () => StoreSnapshot;
  /** The host's terms page (/pawlegends/terms), or null outside a host. */
  termsUrl?: string | null;
  checkout: CheckoutBridge;
  onClose(): void;
  onNotify?(): void;
  /** Analytics: Buy tapped. */
  onBuy?(sku: string): void;
  /** The face of `hero` wearing `coat` (ui/art.ts: the skin's painted face once loaded, else the hero's), or null. */
  preview?(hero: string, coat: string | null): string | null;
  /** Equip an owned item (a coat on its hero, a frame and its title). */
  onEquip?(def: CatalogSku): void;
  /** Open the Legends Pass screen. */
  onPass?(): void;
  /** The tab to open on (default Champions). */
  tab?: StoreTab;
  /** Open on this champion's detail (Home's champion browser BUY / UNLOCK); Back shows the Champions grid. */
  hero?: HeroId;
  /** The player's champions (the app's rule: host state, else starters and the rotation). Default: the snapshot's. */
  champs?(): ChampionsState;
  /**
   * App builds: no price, no buy button, no bundle, no cosmetics (STORE-PASS.md "Native app", CHAMPION-STORE.md §9).
   * Only Yarn unlocks and Champion Picks. Default: the snapshot's `isApp`.
   */
  isApp?: boolean;
  /** CHAMPION-STORE.md §8.6: unlock with Yarn or a Champion Pick (the host answers a fresh `store`). */
  onUnlock?(hero: HeroId, via: 'yarn' | 'pick'): void;
  /** Open the champion browser (skills and lore) for `hero` over the store. */
  onInfo?(hero: HeroId, within: HTMLElement): void;
  /** The cosmetic items the player wears now (coats on their heroes, the frame and title): the Equipped state. */
  equipped?(): ReadonlySet<string>;
}

/** The bottom tab bar (Wild Rift's FEATURED · CHAMPION · SKIN · ITEMS): the views each tab lights. */
const BOTTOM_TABS: readonly { id: StoreTab; label: string; also: StoreTab[] }[] = Object.freeze([
  { id: 'featured', label: 'Featured', also: ['pass'] },
  { id: 'champions', label: 'Champions', also: [] },
  { id: 'coats', label: 'Coats', also: ['sets'] },
  { id: 'frames', label: 'Frames & Titles', also: [] },
]);
/** The tabs an app build shows: champions only (Yarn), nothing that is sold. */
const APP_TABS: readonly StoreTab[] = Object.freeze(['featured', 'champions'] as StoreTab[]);

/** The store line of a champion SKU: who it unlocks, and the Yarn way (earned by playing) next to the price. */
export function champLine(def: CatalogSku, s: Partial<Pick<StoreSnapshot, 'champions'>>): string {
  if (def.bundleOf) {
    const have = champsOwned(def, s);
    const n = def.items.length;
    return have > 0 && have < n ? `You own ${have} of these: you pay for the other ${n - have}.` : `Unlocks ${n} champions for every mode.`;
  }
  const hero = def.hero ?? '';
  const info = unlockInfo(hero, champsOf(s));
  return `Unlocks ${championDef(hero)?.name ?? hero} for every mode.${info.yarn ? ` Or earn it: ${yarnText(info.yarn)} Yarn from playing.` : ''}`;
}

const BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" class="cst-ico"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" class="cst-ico"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
/** A grid card is 112 to about 220 px wide (the splash's srcset picks 360 or 720 by it). */
const CARD_SIZES = '(min-width: 1200px) 220px, 160px';
const SIDE_WORD: Readonly<Record<SideFilter, string>> = Object.freeze({ all: 'All', cat: 'Cats', dog: 'Dogs' });
const TIER_WORD: Readonly<Record<ChampTier, string>> = Object.freeze({ t1: 'Classic', t2: 'Standard', t3: 'Advanced', launch: 'Launch' });
/** Bundle cover art: one champion of the bundle's side (both for the all-champions bundle). */
const BUNDLE_ART: Readonly<Record<string, string[]>> = Object.freeze({ pl_champs_cats_s1: ['duchess'], pl_champs_dogs_s1: ['domino'], pl_champs_all_s1: ['aviete', 'cacklejaw'] });

export function storePanel(parent: HTMLElement, o: StoreOpts): { el: HTMLElement; close(): void; refresh(): void } {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-store pl-shop cst';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Store');
  const base = String(import.meta.env.BASE_URL ?? './');
  root.style.setProperty('--cst-bg', `url("${absUrl(`${base}assets/splash/backdrop-1600.webp`)}")`);
  const currency = browserCurrency();
  const app = (): boolean => o.isApp ?? o.snapshot().isApp;
  const champs = (): ChampionsState => o.champs?.() ?? champsOf(o.snapshot());
  const low = (): boolean => document.documentElement.dataset.quality === 'low';
  let tab: StoreTab = o.tab ?? 'champions';
  if (app() && !APP_TABS.includes(tab)) tab = 'champions';
  let filter: ChampFilter = { ...DEFAULT_FILTER, sort: loadSort() };
  /** The open detail: a champion, a champion bundle SKU, or a cosmetic or pass SKU (`sel`). */
  let detail: { hero?: HeroId; sku?: string; sel?: string } | null = null;
  let detailFrom: string | null = null;
  if (o.hero && championDef(o.hero)) {
    tab = 'champions';
    detail = { hero: o.hero };
    detailFrom = `card:${o.hero}`;
  }
  let line = '';
  /** The grid's scrollTop, kept across re-renders of the same tab. */
  let gridScroll = 0;
  const money = (): boolean => !app();

  // ------------------------------------------------------------------------------------------- champion cards
  const priceBar = (c: ChampCard): string => {
    if (c.status === 'starter') return `<span class="cst-have">${CHECK_SVG}Starter</span>`;
    if (c.hidden) return `<span class="cst-have locked">${LOCK_SVG}Locked</span>`;
    const yarn = c.yarn !== null ? `<span class="cst-yarn"><img src="${base}assets/splash/yarn.svg" alt="" width="16" height="16">${yarnText(c.yarn)}</span>` : '';
    const cash = money() && c.cents ? `<span class="cst-cash">${esc(catalogPrice({ cents: c.cents }, currency))}</span>` : '';
    if (c.status === 'owned') return `<span class="cst-have">${CHECK_SVG}Owned</span><span class="cst-dim">${yarn}</span>`;
    return `${c.toGo > 0 ? LOCK_SVG : ''}${yarn}${cash ? `<i class="cst-sep" aria-hidden="true">/</i>${cash}` : ''}`;
  };
  const cardLabel = (c: ChampCard): string => {
    const bits = [c.name, ROLE_NAME[c.role] ?? c.role];
    if (c.status === 'starter') bits.push('Starter, owned');
    else if (c.status === 'owned') bits.push('Owned');
    else if (c.hidden) bits.push('Locked');
    else {
      if (c.status === 'free') bits.push('Free this week');
      if (c.yarn !== null) bits.push(`${yarnText(c.yarn)} Yarn${c.toGo > 0 ? `, ${yarnText(c.toGo)} to go` : ''}`);
      if (money() && c.cents) bits.push(catalogPrice({ cents: c.cents }, currency));
    }
    return bits.join(', ');
  };
  const roleImg = (r: HeroRole, cls = 'cst-role'): string => `<img class="${cls}" src="${base}assets/splash/roles/${r}.svg" alt="" width="16" height="16">`;
  const champCardHtml = (c: ChampCard, sizes = CARD_SIZES): string => {
    const ribbons = [
      c.status === 'free' ? '<i class="cst-rib free">Free this week</i>' : '',
      c.status === 'starter' ? '<i class="cst-rib starter">Starter</i>' : '',
      isNewHero(c.hero) ? '<i class="cst-rib new">New</i>' : '',
    ].join('');
    const st = c.hidden ? 'locked' : c.status;
    const poor = c.unlockable && c.toGo > 0 && c.status !== 'owned' ? ' poor' : '';
    return `<button type="button" class="cst-card st-${st}${poor}" data-hero="${c.hero}" data-tier="${c.tier ?? 'starter'}" data-k="card:${c.hero}" aria-label="${esc(cardLabel(c))}">
      <img class="cst-art" alt="" loading="lazy" decoding="async" draggable="false" ${splashAttrs(base, c.hero, low(), sizes)}>
      <span class="cst-ribs">${ribbons}</span>
      <span class="cst-foot"><b class="cst-name">${esc(c.name)}</b><span class="cst-meta">${roleImg(c.role)}${esc(ROLE_NAME[c.role] ?? c.role)}</span><span class="cst-price">${priceBar(c)}</span></span>
    </button>`;
  };

  const bundleCardHtml = (def: CatalogSku): string => {
    const s = o.snapshot();
    const own = itemState(def, s) === 'owned';
    const art = (BUNDLE_ART[def.sku] ?? ['clem']).map((h) => `<img class="cst-art" alt="" loading="lazy" decoding="async" draggable="false" ${splashAttrs(base, h, true, CARD_SIZES)}>`).join('');
    const price = own ? `<span class="cst-have">${CHECK_SVG}Owned</span>` : `<span class="cst-cash">${esc(catalogPrice({ cents: priceFor(def, s) }, currency))}</span>`;
    return `<button type="button" class="cst-card cst-bundle${own ? ' st-owned' : ''}" data-bundle="${def.sku}" data-tier="bundle" data-k="bundle:${def.sku}" aria-label="${esc(`${def.label}, ${own ? 'Owned' : catalogPrice({ cents: priceFor(def, s) }, currency)}`)}">
      <span class="cst-arts n${art.length > 1 ? 2 : 1}">${art}</span>
      <span class="cst-ribs"><i class="cst-rib bundle">Bundle</i></span>
      <span class="cst-foot"><b class="cst-name">${esc(def.label.replace(/:.*$/, ''))}</b><span class="cst-meta">${def.items.length} champions</span><span class="cst-price">${price}</span></span>
    </button>`;
  };

  const yarnChip = (): string => {
    const c = champs();
    const picks = c.yarn.picksLeft > 0 ? `<span class="cst-chip pick" title="Champion Picks: unlock a Classic or Standard champion">${c.yarn.picksLeft} Champion Pick${c.yarn.picksLeft === 1 ? '' : 's'}</span>` : '';
    return `${picks}<span class="cst-chip" title="Yarn: earned by playing, never sold" aria-label="${yarnText(c.yarn.balance)} Yarn"><img src="${base}assets/splash/yarn.svg" alt="" width="22" height="22"><b>${yarnText(c.yarn.balance)}</b></span>`;
  };

  // ---------------------------------------------------------------------------------------------- views
  /** Cats / Dogs, in the top bar where Wild Rift has its cart and gift toggle (champions view only). */
  const sideSegs = (): string =>
    `<div class="cst-segs" role="group" aria-label="Side">${(['all', 'cat', 'dog'] as SideFilter[])
      .map((sd) => `<button type="button" class="cst-seg${filter.side === sd ? ' on' : ''}" data-side="${sd}" data-k="side:${sd}" aria-pressed="${filter.side === sd}">${SIDE_WORD[sd]}</button>`)
      .join('')}</div>`;
  /** Coats / Sets, in the top bar like the side filter (frees a row for the shelf on short phones). */
  const coatSegs = (): string =>
    `<div class="cst-segs" role="group" aria-label="Coats">${(['coats', 'sets'] as StoreTab[])
      .map((t) => `<button type="button" class="cst-seg${t === tab ? ' on' : ''}" data-tab="${t}" data-k="tab:${t}" aria-pressed="${t === tab}">${t === 'coats' ? 'Coats' : 'Sets'}</button>`)
      .join('')}</div>`;
  const championsView = (): string => {
    const cards = visibleCards(allCards(champs(), app()), filter);
    const roles = ROLE_ORDER.map(
      (r) => `<button type="button" class="cst-rolebtn${filter.role === r ? ' on' : ''}" data-role="${r}" data-k="role:${r}" aria-pressed="${filter.role === r}" aria-label="${esc(ROLE_NAME[r] ?? r)}" title="${esc(ROLE_NAME[r] ?? r)}">${roleImg(r, 'cst-roleico')}</button>`,
    ).join('');
    const sorts = SORT_KEYS.map((k) => `<option value="${k}"${filter.sort === k ? ' selected' : ''}>${k === 'default' ? 'Default Sorting' : `Sort: ${SORT_LABEL[k]}`}</option>`).join('');
    const grid = cards.length
      ? cards.map((c) => champCardHtml(c)).join('')
      : `<p class="cst-empty">${filter.unowned ? 'You own every champion here.' : 'No champion matches.'}</p>`;
    return `<div class="cst-filters">
        <div class="cst-roles" role="group" aria-label="Role">${roles}</div>
        <label class="cst-toggle" data-k="unowned"><input type="checkbox" data-a="unowned"${filter.unowned ? ' checked' : ''}><span>Unowned</span></label>
        <label class="cst-sort"><span class="sr">Sort</span><select data-a="sort" data-k="sort" aria-label="Sort">${sorts}</select></label>
      </div>
      <div class="cst-box"><div class="cst-grid" data-scroll="grid" role="group" aria-label="Champions">${grid}</div></div>`;
  };

  const featuredView = (): string => {
    const c = champs();
    const cards = allCards(c, app());
    const by = (h: string): ChampCard | undefined => cards.find((x) => x.hero === h);
    const free = c.rotation.heroes.map(by).filter((x): x is ChampCard => !!x);
    const fresh = newestHeroes(3)
      .map(by)
      .filter((x): x is ChampCard => !!x);
    const sec = (title: string, body: string, k: string): string => (body ? `<section class="cst-sec" data-sec="${k}"><h3>${title}</h3><div class="cst-row">${body}</div></section>` : '');
    const bundles = money() ? CHAMP_BUNDLE_SKUS.map((sku) => CATALOG_SKUS.find((d) => d.sku === sku)).filter((d): d is CatalogSku => !!d) : [];
    const pass = money()
      ? `<button type="button" class="cst-card cst-passcard" data-tab="pass" data-k="tab:pass" aria-label="Legends Pass"><span class="cst-passart" aria-hidden="true">${icon('crown')}</span><span class="cst-foot"><b class="cst-name">Legends Pass</b><span class="cst-meta">Season rewards</span><span class="cst-price"><span class="cst-cash">Open</span></span></span></button>`
      : '';
    // one vertical scroll: the sections stacked, each a row of the grid's cards that wraps
    return `<div class="cst-box"><div class="cst-grid cst-stack" data-scroll="grid">
      ${sec(`Free this week <small>${esc(rotationEndText(c))}</small>`, free.map((x) => champCardHtml(x)).join(''), 'free')}
      ${sec('Champion bundles', bundles.map(bundleCardHtml).join(''), 'bundles')}
      ${sec('New champions', fresh.map((x) => champCardHtml(x)).join(''), 'new')}
      ${sec('Legends Pass', pass, 'pass')}
    </div></div>`;
  };

  // ------------------------------------------------------------------------------------------ cosmetic cards
  /** Coats, sets, frames and the pass in the champions' card pattern: one vertical grid, a detail on tap. */
  const coatOf = (def: CatalogSku): string | null => def.items.find((i) => i.startsWith('coat.')) ?? null;
  const frameOf = (def: CatalogSku): CatalogFrame | null => {
    const id = def.items.find((i) => i.startsWith('frame.'));
    return (id && STORE_FRAMES.find((f) => f.id === id)) || null;
  };
  const heroOfCoat = (coat: string): string => coat.split('.')[1] ?? 'clem';
  const heroName = (h: string): string => championDef(h)?.name ?? h.charAt(0).toUpperCase() + h.slice(1);
  /** Worn now: a coat on its hero, or a frame (its title goes with it). Sets and the pass have no Equipped state. */
  const isEquipped = (def: CatalogSku): boolean => {
    if (def.kind !== 'cosmetic') return false;
    const eq = o.equipped?.();
    if (!eq) return false;
    const keys = def.items.filter((i) => !i.startsWith('title.'));
    return keys.length > 0 && keys.every((i) => eq.has(i));
  };
  /** The card colour: a coat's rung, else the kind. */
  const cosTier = (def: CatalogSku): string => {
    if (def.kind === 'pass') return 'pass';
    if (def.kind === 'bundle') return 'bundle';
    if (def.group === 'frames') return 'frame';
    return (coatRungOf(coatOf(def) ?? undefined) ?? 'RARE').toLowerCase();
  };
  const cosName = (def: CatalogSku): string => {
    // the card says "Thunderpaw" (the hero is on the next line, "coat" is the tab); the detail keeps the full label
    if (def.group === 'coats') return def.label.replace(/^[^:]*:\s*/, '').replace(/\s*\([^)]*effects\)$/, '').replace(/ coat$/, '');
    if (def.group === 'frames') return frameOf(def)?.name ?? def.label;
    return def.label.replace(/:.*$/, '');
  };
  const cosMeta = (def: CatalogSku): string => {
    if (def.kind === 'pass') return 'Season 1';
    if (def.kind === 'bundle') return `${def.items.filter((i) => i.startsWith('coat.')).length} coats, a frame and its title`;
    const f = frameOf(def);
    if (f) return `"${f.title.name}" title`;
    return heroName(def.hero ?? heroOfCoat(coatOf(def) ?? ''));
  };
  /**
   * A coat's painted art: the brand-book skin splash (pawlegends.app, lazy; the hero's splash when it fails to load),
   * else the hero's splash. No 3D render.
   */
  const coatImg = (coat: string, sizes: string): string => {
    const h = heroOfCoat(coat);
    const look = { coat };
    return skinArtId(look) && (HERO_IDS as readonly string[]).includes(h)
      ? `<img class="cst-art cst-skin" alt="" loading="lazy" decoding="async" draggable="false" data-coat="${esc(coat)}" ${artImgAttrs(h as HeroId, look, { low: low(), sizes })}>`
      : `<img class="cst-art" alt="" loading="lazy" decoding="async" draggable="false" data-coat="${esc(coat)}" ${splashAttrs(base, h, low(), sizes)}>`;
  };
  const cosArt = (def: CatalogSku, sizes = CARD_SIZES): string => {
    if (def.kind === 'pass') return `<span class="cst-passart pic" style="background-image:url('${esc(`${base}assets/lobby/promo-pass.webp${assetRev()}`)}')" aria-hidden="true"></span>`;
    const f = frameOf(def);
    if (def.kind === 'cosmetic' && f) {
      const pic = o.preview?.('clem', null) ?? null;
      return `<span class="cst-frameart" data-frame="${esc(f.id)}" aria-hidden="true"><span class="cst-ring"${pic ? ` style="background-image:url(${pic})"` : ''}>${pic ? '' : icon('paw')}</span><b class="cst-plate">${esc(f.title.name)}</b></span>`;
    }
    const coats = def.items.filter((i) => i.startsWith('coat.')).slice(0, def.kind === 'bundle' ? 2 : 1);
    return `<span class="cst-arts cst-cosarts n${coats.length > 1 ? 2 : 1}">${coats.map((c) => coatImg(c, sizes)).join('')}</span>`;
  };
  const cosPrice = (def: CatalogSku, ds: ItemState, eq: boolean): string => {
    if (ds === 'owned') return def.kind === 'pass' ? `<span class="cst-have">${CHECK_SVG}Owned</span>` : `<span class="cst-have">${CHECK_SVG}${eq ? 'Equipped' : 'Owned'}</span>`;
    if (ds === 'partly') return `<span class="cst-have locked">Own some</span>`;
    if (ds === 'locked') return `<span class="cst-have locked">${LOCK_SVG}${def.sku === PASS_UPGRADE_SKU ? 'Pass owners' : 'Upgrade instead'}</span>`;
    const r = def.group === 'coats' ? coatRungOf(coatOf(def) ?? undefined) : null;
    return `<span class="cst-cash">${esc(`${r && r !== 'COMMON' ? `${RUNG_WORD[r]} · ` : ''}${catalogPrice({ cents: priceFor(def, o.snapshot()) }, currency)}`)}</span>`;
  };
  const cosCardHtml = (def: CatalogSku): string => {
    const s = o.snapshot();
    const ds = itemState(def, s);
    const eq = ds === 'owned' && isEquipped(def);
    const r = def.group === 'coats' ? coatRungOf(coatOf(def) ?? undefined) : null;
    const ribbons = [
      r === 'EPIC' || r === 'LEGENDARY' ? `<i class="cst-rib rung-${r.toLowerCase()}">${RUNG_WORD[r]}</i>` : '',
      def.kind === 'bundle' ? '<i class="cst-rib bundle">Set</i>' : '',
      eq ? '<i class="cst-rib starter">Equipped</i>' : '',
    ].join('');
    const state = ds === 'owned' ? (eq ? 'Equipped' : 'Owned') : ds === 'partly' ? 'You own some of these' : ds === 'locked' ? 'Not available' : catalogPrice({ cents: priceFor(def, s) }, currency);
    return `<button type="button" class="cst-card cst-cos st-${ds}${eq ? ' st-equipped' : ''}" data-sel="${def.sku}" data-k="sel:${def.sku}" data-tier="${cosTier(def)}"${r ? ` data-rung="${r}"` : ''} aria-label="${esc(`${def.label}, ${state}`)}">
      ${cosArt(def)}
      <span class="cst-ribs">${ribbons}</span>
      <span class="cst-foot"><b class="cst-name">${esc(cosName(def))}</b><span class="cst-meta">${esc(cosMeta(def))}</span><span class="cst-price">${cosPrice(def, ds, eq)}</span></span>
    </button>`;
  };
  const fineHtml = (): string =>
    `<p class="fine safe">${esc(safeguardsLine(currency))}${o.termsUrl ? ` <a href="${esc(o.termsUrl)}" target="_blank" rel="noopener">Terms and refunds</a>` : ''}</p>`;
  /** Coats, Sets, Frames & Titles and the pass: one vertical grid of cards, the fine print at its end. */
  const cosmeticsView = (): string => {
    const skus = tabSkus(tab);
    const label = tab === 'coats' ? 'Coats' : tab === 'sets' ? 'Sets' : tab === 'frames' ? 'Frames and titles' : 'Legends Pass';
    return `<div class="cst-box"><div class="cst-grid" data-scroll="grid" role="group" aria-label="${label}">${skus.map(cosCardHtml).join('')}
      <div class="cst-fine"><p class="fine">Cosmetic only: nothing here changes a match. Checkout opens on a secure web page.</p>${fineHtml()}</div>
    </div></div>`;
  };

  // --------------------------------------------------------------------------------------------- detail
  const detailHtml = (): string => {
    if (!detail) return '';
    const s = o.snapshot();
    const fine = money() ? fineHtml() : '';
    const waiting = o.checkout.waitingSku();
    if (detail.sel) {
      // a coat, a set, a frame and its title, or a pass SKU: the preview, what it is, and Buy, Equip or Open the pass
      const def = CATALOG_SKUS.find((d) => d.sku === detail!.sel);
      if (!def) return '';
      const st = itemState(def, s);
      const eq = st === 'owned' && isEquipped(def);
      const coat = coatOf(def);
      const r = def.group === 'coats' ? coatRungOf(coat ?? undefined) : null;
      const action =
        st === 'owned'
          ? def.kind === 'pass'
            ? `<button type="button" class="pl-btn small" data-a="pass" data-k="pass">Open the pass</button>`
            : def.kind === 'bundle'
              ? `<span class="cst-have">${CHECK_SVG}Owned: equip each coat on its hero.</span><button type="button" class="pl-btn ghost small" data-equip="${def.sku}" data-k="equip">Wear the frame</button>`
              : `<button type="button" class="pl-btn small${eq ? ' ghost' : ''}" data-equip="${def.sku}" data-k="equip">${eq ? `${CHECK_SVG}Equipped` : 'Owned · Equip'}</button>`
          : st === 'partly'
            ? `<span class="why">You own some of these: buy the singles.</span>`
            : st === 'locked'
              ? `<span class="why">${def.sku === PASS_UPGRADE_SKU ? 'For Legends Pass owners.' : 'You have the Pass: get the Pass+ upgrade.'}</span>`
              : `<button type="button" class="pl-btn small buy" data-buy="${def.sku}" data-k="buy:${def.sku}"${waiting ? ' disabled' : ''}>${waiting === def.sku ? 'Opening...' : `Buy ${esc(catalogPrice({ cents: priceFor(def, s) }, currency))}`}</button>`;
      const what =
        def.kind === 'pass'
          ? def.sku === PASS_SKU
            ? 'Premium row: 30 rewards (coats, frames, titles). Every premium reward you already reached unlocks at once. Never expires.'
            : def.sku === PASS_PLUS_SKU
              ? 'Premium row, 15 tier skips and the exclusive Eclipse coat. Never expires.'
              : 'For Legends Pass owners: 15 tier skips and the Eclipse coat, at the price difference.'
          : def.kind === 'bundle'
            ? `${def.items.filter((i) => i.startsWith('coat.')).length} coats, a frame and its title.`
            : frameOf(def)
              ? `A profile frame and its title, "${frameOf(def)!.title.name}".`
              : coatLine(coat);
      const list = def.kind === 'bundle' ? `<p class="cst-list">${esc(def.items.filter((i) => i.startsWith('coat.')).map((c) => heroName(heroOfCoat(c))).join(', '))}</p>` : '';
      const tags = [r ? RUNG_WORD[r] : '', def.group === 'coats' ? `Coat for ${heroName(def.hero ?? heroOfCoat(coat ?? ''))}` : def.kind === 'bundle' ? 'Set' : def.kind === 'pass' ? 'Season 1' : 'Frame and title'].filter(Boolean).join(' · ');
      return `<div class="cst-detail" role="dialog" aria-modal="true" aria-label="${esc(def.label)}"><div class="cst-dpanel cst-dcos" data-tier="${cosTier(def)}">
        <div class="cst-dart">${cosArt(def, '(min-height: 700px) 420px, 240px')}</div>
        <div class="cst-dinfo">
          <button type="button" class="cst-x" data-a="detail-close" aria-label="Close">${X_SVG}</button>
          <h3>${esc(cosName(def))}</h3>
          <p class="cst-tags">${esc(tags)}</p>
          <p class="cst-blurb">${esc(what)}</p>
          ${list}
          <div class="cst-acts">${action}</div>
          <p class="fine">Cosmetic only: nothing here changes a match. Checkout opens on a secure web page.</p>
          ${st === 'buy' ? fine : ''}
        </div></div></div>`;
    }
    if (detail.sku) {
      const def = CATALOG_SKUS.find((d) => d.sku === detail!.sku);
      if (!def) return '';
      const own = itemState(def, s) === 'owned';
      const heroes = def.items.map((i) => i.slice('champ.'.length));
      const names = heroes.map((h) => championDef(h)?.name ?? h).join(', ');
      const art = (BUNDLE_ART[def.sku] ?? ['clem'])[0];
      const buy = own
        ? `<span class="cst-have">${CHECK_SVG}Owned: pick them in any mode.</span>`
        : `<button type="button" class="pl-btn small buy" data-buy="${def.sku}"${waiting ? ' disabled' : ''}>${waiting === def.sku ? 'Opening...' : `Buy ${esc(catalogPrice({ cents: priceFor(def, s) }, currency))}`}</button>`;
      return `<div class="cst-detail" role="dialog" aria-modal="true" aria-label="${esc(def.label)}"><div class="cst-dpanel" data-tier="bundle">
        <div class="cst-dart"><img alt="" decoding="async" ${splashAttrs(base, art, low(), '(min-height: 700px) 420px, 240px')}></div>
        <div class="cst-dinfo">
          <button type="button" class="cst-x" data-a="detail-close" aria-label="Close">${X_SVG}</button>
          <h3>${esc(def.label)}</h3>
          <p class="cst-blurb">${esc(champLine(def, s))}</p>
          <p class="cst-list">${esc(names)}</p>
          <div class="cst-acts">${buy}</div>
          <p class="fine">A champion is the same in a match whether bought or earned with Yarn. Checkout opens on a secure web page.</p>
          ${fine}
        </div></div></div>`;
    }
    const hero = detail.hero!;
    const c = champCard(hero, champs(), app());
    if (!c) return '';
    const t = HERO_TEXT[hero];
    const diff = HERO_DIFFICULTY[hero] ?? 2;
    const stars = `<span class="cst-stars" aria-label="Difficulty ${DIFFICULTY_NAME[diff]}">${[1, 2, 3].map((i) => `<i class="${i <= diff ? 'on' : ''}"></i>`).join('')}<small>${DIFFICULTY_NAME[diff]}</small></span>`;
    const skills = t
      ? `<ul class="cst-skills">
          <li><span class="k">P</span>${icon('paw')}<b>${esc(t.passive.name)}</b><small>${esc(t.passive.text)}</small></li>
          ${t.abilities.map((a, i) => `<li><span class="k">${'QWER'[i]}</span>${icon(a.icon)}<b>${esc(a.name)}</b><small>${esc(a.text)}</small></li>`).join('')}
        </ul>`
      : '';
    const status =
      c.status === 'starter'
        ? `<span class="cst-have">${CHECK_SVG}Starter: yours from the start</span>`
        : c.status === 'owned'
          ? `<span class="cst-have">${CHECK_SVG}Owned: pick it in any mode</span>`
          : c.status === 'free'
            ? `<span class="cst-rot">Free this week · ${esc(rotationEndText(champs()).replace(/^Free until /, 'until '))}</span>`
            : c.hidden
              ? `<span class="cst-have locked">${LOCK_SVG}Locked</span>`
              : `<span class="cst-rot off">Free in a coming week's rotation. Practice it any time in champion select.</span>`;
    const acts: string[] = [];
    if (c.unlockable && c.yarn !== null) {
      acts.push(
        c.toGo === 0
          ? `<button type="button" class="pl-btn small" data-unlock="yarn" data-k="unlock:yarn" data-testid="store-unlock">Unlock · <img src="${base}assets/splash/yarn.svg" alt="" width="18" height="18"> ${yarnText(c.yarn)} Yarn</button>`
          : `<span class="cst-togo" data-testid="store-togo">${LOCK_SVG}${yarnText(c.toGo)} Yarn to go (about ${matchesFor(c.toGo)} matches)</span>`,
      );
      if (c.pick) acts.push(`<button type="button" class="pl-btn small" data-unlock="pick" data-k="unlock:pick" data-testid="store-pick">Use a Champion Pick</button>`);
      if (money() && c.cents) {
        const sku = champSkuOf(hero);
        acts.push(`<button type="button" class="pl-btn ghost small buy" data-buy="${sku}" data-k="buy:${sku}"${waiting ? ' disabled' : ''}>${waiting === sku ? 'Opening...' : `Buy ${esc(catalogPrice({ cents: c.cents }, currency))}`}</button>`);
      }
    }
    acts.push(`<button type="button" class="pl-btn ghost small" data-a="info" data-k="info">Skills &amp; lore</button>`);
    return `<div class="cst-detail" role="dialog" aria-modal="true" aria-label="${esc(c.name)}"><div class="cst-dpanel" data-tier="${c.tier ?? 'starter'}" data-hero="${hero}">
      <div class="cst-dart"><img alt="${esc(`${c.name} splash art`)}" decoding="async" ${splashAttrs(base, hero, low(), '(min-height: 700px) 420px, 240px')}></div>
      <div class="cst-dinfo">
        <button type="button" class="cst-x" data-a="detail-close" aria-label="Close">${X_SVG}</button>
        <h3>${esc(c.name)}</h3>
        <p class="cst-tags">${roleImg(c.role)}${esc(ROLE_NAME[c.role] ?? c.role)} · ${c.side === 'cat' ? 'Cat' : 'Dog'}${c.tier ? ` · ${TIER_WORD[c.tier]}` : ''} ${stars}</p>
        <p class="cst-status">${status}</p>
        ${t ? `<p class="cst-blurb">${esc(t.blurb)}</p>` : ''}
        ${skills}
        <div class="cst-acts">${acts.join('')}</div>
        ${money() && c.unlockable ? '<p class="fine">A champion is the same in a match whether bought or earned with Yarn.</p>' : ''}
        ${money() && c.unlockable ? fine : ''}
      </div></div></div>`;
  };

  // --------------------------------------------------------------------------------------------- render
  /** The markup last drawn. */
  let lastHtml = '';
  const render = (): void => {
    // an unlock the host confirmed (a fresh `store`): say so once the champion shows as owned
    if (line === 'Unlocking...' && detail?.hero && champStatus(detail.hero, champs(), app()) === 'owned') line = `${championDef(detail.hero)?.name ?? 'Champion'} unlocked. Pick it in any mode.`;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && root.contains(active) ? (active.dataset.k ?? active.closest<HTMLElement>('[data-k]')?.dataset.k ?? null) : null;
    const focusInDetail = !!active?.closest('.cst-detail');
    const tabs = BOTTOM_TABS.filter((b) => !app() || APP_TABS.includes(b.id))
      .map((b) => {
        const on = b.id === tab || b.also.includes(tab);
        return `<button type="button" role="tab" class="cst-tab${on ? ' on' : ''}" data-tab="${b.id}" data-k="tab:${b.id}" aria-selected="${on}">${esc(b.label)}</button>`;
      })
      .join('');
    const view = tab === 'champions' ? championsView() : tab === 'featured' ? featuredView() : cosmeticsView();
    const inert = detail ? ' inert' : '';
    const html = `<div class="card cst-frame">
      <header class="cst-top"${inert}>
        <button type="button" class="cst-back" data-a="close" data-k="close" aria-label="Back">${BACK_SVG}</button>
        <h2>Store</h2>
        ${tab === 'champions' ? sideSegs() : tab === 'coats' || tab === 'sets' ? coatSegs() : ''}
        <div class="cst-wallet">${yarnChip()}</div>
      </header>
      <div class="cst-main" data-view="${tab}"${inert}>${view}</div>
      <p class="line cst-line" role="status">${esc(line)}</p>
      <nav class="cst-tabs" role="tablist" aria-label="Store sections"${inert}>${tabs}</nav>
      ${detailHtml()}
    </div>`;
    // a refresh that changes nothing (the host resends its state) keeps the DOM: no lost tap, focus or scroll
    if (html === lastHtml && !detailFocus) return;
    lastHtml = html;
    root.innerHTML = html;
    // the one scroll region: the grid scrolls up and down (the wheel and touch natively); the fade at its foot
    // shows while more is below
    const grid = root.querySelector<HTMLElement>('[data-scroll="grid"]');
    if (grid) {
      grid.scrollTop = gridScroll;
      const box = grid.parentElement as HTMLElement;
      const end = (): void => {
        box.classList.toggle('end', grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 4);
      };
      grid.addEventListener('scroll', () => {
        gridScroll = grid.scrollTop;
        end();
      }, { passive: true });
      end();
    }
    // a detail that opens takes focus (its close button); one that closes gives it back to its card
    const want = detailFocus ?? (detail ? (focusKey && focusInDetail ? focusKey : 'detail-close') : focusKey);
    detailFocus = null;
    if (want) {
      const el = want === 'detail-close' ? root.querySelector<HTMLElement>('.cst-detail [data-a="detail-close"]') : root.querySelector<HTMLElement>(`[data-k="${CSS.escape(want)}"]`);
      (el?.matches('label') ? el.querySelector<HTMLElement>('input') : el)?.focus({ preventScroll: true });
    }
  };
  /** The control to focus after the next render (a detail opened or closed). */
  let detailFocus: string | null = null;

  const setTab = (t: StoreTab): void => {
    if (app() && !APP_TABS.includes(t)) return;
    tab = t;
    gridScroll = 0;
    detail = null;
    line = '';
  };
  const openDetail = (d: { hero?: HeroId; sku?: string; sel?: string }, from: string): void => {
    detail = d;
    detailFrom = from;
    line = '';
  };
  const closeDetail = (): void => {
    detail = null;
    detailFocus = detailFrom;
    detailFrom = null;
  };

  render();
  const off = o.checkout.onResult((sku, ok) => {
    notePurchase(ok);
    const def = CATALOG_SKUS.find((d) => d.sku === sku);
    line = ok ? `${def?.label ?? 'Your item'}: thank you! It is on its way.` : 'The purchase was not completed.';
    render();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !root.isConnected) return;
    // the champion browser over the store closes itself first (it stops the key)
    e.preventDefault();
    if (detail) {
      closeDetail();
      render();
    } else {
      close();
      o.onClose();
    }
  };
  document.addEventListener('keydown', onKey);
  const close = (): void => {
    off();
    document.removeEventListener('keydown', onKey);
    root.remove();
  };
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.dataset.a === 'unowned') filter = { ...filter, unowned: (t as HTMLInputElement).checked };
    else if (t.dataset.a === 'sort') {
      const k = (SORT_KEYS as readonly string[]).includes(t.value) ? (t.value as SortKey) : 'default';
      filter = { ...filter, sort: k };
      saveSort(k);
    } else return;
    gridScroll = 0;
    render();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('label.cst-toggle, select')) return; // the change event handles these
    const tb = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as StoreTab | undefined;
    const sel = t.closest<HTMLElement>('[data-sel]')?.dataset.sel;
    const buy = t.closest<HTMLElement>('[data-buy]')?.dataset.buy;
    const eq = t.closest<HTMLElement>('[data-equip]')?.dataset.equip;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const side = t.closest<HTMLElement>('[data-side]')?.dataset.side as SideFilter | undefined;
    const role = t.closest<HTMLElement>('[data-role]')?.dataset.role as HeroRole | undefined;
    const card = t.closest<HTMLElement>('.cst-card[data-hero]')?.dataset.hero as HeroId | undefined;
    const bundle = t.closest<HTMLElement>('[data-bundle]')?.dataset.bundle;
    const unlock = t.closest<HTMLElement>('[data-unlock]')?.dataset.unlock as 'yarn' | 'pick' | undefined;
    if (detail && t.classList.contains('cst-detail')) {
      closeDetail();
    } else if (tb) setTab(tb);
    else if (side) {
      filter = { ...filter, side };
      gridScroll = 0;
    } else if (role) {
      filter = { ...filter, role: filter.role === role ? null : role };
      gridScroll = 0;
    } else if (card && !detail) {
      openDetail({ hero: card }, `card:${card}`);
    } else if (bundle && !detail && money()) {
      openDetail({ sku: bundle }, `bundle:${bundle}`);
    } else if (unlock && detail?.hero) {
      o.onUnlock?.(detail.hero, unlock);
      line = o.onUnlock ? 'Unlocking...' : 'Unlocking is not available right now.';
    } else if (sel && !detail) {
      openDetail({ sel }, `sel:${sel}`);
    } else if (buy) {
      if (!money()) return;
      if (o.checkout.buy(buy)) {
        o.onBuy?.(buy);
        line = 'Finish on the purchase sheet.';
      } else line = 'The store is not available right now.';
    } else if (eq) {
      const def = CATALOG_SKUS.find((d) => d.sku === eq);
      if (def) {
        o.onEquip?.(def);
        line = 'Equipped.';
      }
    } else if (a === 'detail-close') {
      closeDetail();
    } else if (a === 'info' && detail?.hero) {
      o.onInfo?.(detail.hero, root);
      return;
    } else if (a === 'pass') {
      close();
      o.onClose();
      o.onPass?.();
      return;
    } else if (a === 'close' || t === root) {
      close();
      o.onClose();
      return;
    } else if (a === 'notify') {
      o.onNotify?.();
      return;
    } else return;
    render();
  });
  parent.appendChild(root);
  return { el: root, close, refresh: render };
}

const absUrl = (p: string): string => {
  try {
    return new URL(p, document.baseURI).href;
  } catch {
    return p;
  }
};
