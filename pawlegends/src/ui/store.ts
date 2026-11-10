/**
 * Store panel (docs/plans/moba/STORE-PASS.md §6, web only). Opened from the lobby rail and the results screen; never
 * in pick, loading or a match, never in app builds, and only when the host says its checkout is reachable. One
 * non-scrolling screen: a fixed header (tabs Coats · Frames · Sets · Pass), a preview, the item grid (the one scroll
 * region, with a visible thumb, a bottom fade and a "▾ more" chip) and a fixed buy bar. Buy hands over to the host
 * (money/checkoutBridge.ts): its own sheet with the server price, the age question, the terms link and the consent
 * box, then Stripe Checkout on the web page. Prices here are display only; the server price always wins.
 *
 * Pull only: nothing here pushes an offer card (one per session, §8.1 #4 and #5). Cosmetic only: no item changes a
 * match. No randomness: every item and every pass reward is shown before buying.
 *
 * `skuCard` and the safeguards line stay for the retired presale offer card (money/offer.ts).
 */
import { CheckoutBridge } from '../money/checkoutBridge';
import type { StoreSnapshot } from '../money/entitlements';
import { MVP_TARGET, SKUS, priceText, type Currency, type SkuId } from '../money/skus';
import { CATALOG_SKUS, PASS_PLUS_SKU, PASS_SKU, PASS_UPGRADE_SKU, STORE_COATS, STORE_FRAMES, coatSkuOf, frameSkuOf, type CatalogSku } from '../money/catalog';
import { browserCurrency } from '../money/skus';
import { icon } from './icons';
import { portraitUrl, SKU_LOOK } from '../render/portraits';

/** Plain words for the planned extras the pack lines name (they are not on sale yet). */
const GLOSSARY: readonly [RegExp, string][] = [
  [/Pride Club/, 'Pride Club: a planned monthly membership, not on sale yet.'],
  [/Legends Pass\+/, 'Legends Pass+: the planned season pass with extra rewards.'],
  [/Legends Pass(?!\+)/, 'Legends Pass: the planned season pass (free and paid tracks).'],
];

export function glossaryFor(text: string): string[] {
  return GLOSSARY.filter(([re]) => re.test(text)).map(([, line]) => line);
}

/** Spending safeguards shown in the store (POC.md §8.5): VAT, age, the 30-day caps. */
export function safeguardsLine(currency: Currency): string {
  const c = currency === 'eur' ? '€' : '$';
  return `Prices include VAT. Under 16 can't buy. Spending limit ${c}30 (age 16 to 17) or ${c}200 (18+) per 30 days.`;
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
  // a real preview of the look the pack is named after (rendered by the game), the icon only as a fallback
  const pic = portraitUrl('clem', SKU_LOOK[sku]);
  const art = pic
    ? `<div class="pl-sku-art pic sku-${sku}" style="background-image:url(${pic})" role="img" aria-label="${esc(d.tag)}"></div>`
    : `<div class="pl-sku-art sku-${sku}">${icon(sku === 'pl_starter' ? 'paw' : 'crown')}</div>`;
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

export type StoreTab = 'coats' | 'frames' | 'sets' | 'pass';

/** "$2.99" / "€2.99" for a catalogue SKU (display only). */
export function catalogPrice(def: Pick<CatalogSku, 'cents'>, currency: Currency): string {
  const c = def.cents[currency];
  const v = `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
  return currency === 'eur' ? `€${v}` : `$${v}`;
}

export type ItemState = 'buy' | 'owned' | 'partly' | 'locked';

/**
 * A catalogue SKU's state for this player: owned (every item owned), partly (a set with some items owned: the singles
 * are sold instead, no prorated price), locked (the Pass+ upgrade without the Pass, or Pass when Pass+ is owned), or buy.
 */
export function itemState(def: CatalogSku, s: Pick<StoreSnapshot, 'items' | 'season'>): ItemState {
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
  if (tab === 'coats') return STORE_COATS.map((c) => CATALOG_SKUS.find((d) => d.sku === coatSkuOf(c))!);
  if (tab === 'frames') return STORE_FRAMES.map((f) => CATALOG_SKUS.find((d) => d.sku === frameSkuOf(f))!);
  if (tab === 'sets') return CATALOG_SKUS.filter((d) => d.kind === 'bundle');
  return CATALOG_SKUS.filter((d) => d.kind === 'pass');
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
  /** A portrait of `hero` wearing `coat` (baked by the app), or null. */
  preview?(hero: string, coat: string | null): string | null;
  /** Equip an owned item (a coat on its hero, a frame and its title). */
  onEquip?(def: CatalogSku): void;
  /** Open the Legends Pass screen. */
  onPass?(): void;
  /** The tab to open on. */
  tab?: StoreTab;
}

const TAB_LABEL: Readonly<Record<StoreTab, string>> = Object.freeze({ coats: 'Coats', frames: 'Frames', sets: 'Sets', pass: 'Pass' });

export function storePanel(parent: HTMLElement, o: StoreOpts): { el: HTMLElement; close(): void; refresh(): void } {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-store pl-shop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Store');
  const currency = browserCurrency();
  let tab: StoreTab = o.tab ?? 'coats';
  let selected: string = tabSkus(tab)[0].sku;
  let line = '';
  let gridScroll = 0;
  const render = (): void => {
    const s = o.snapshot();
    const skus = tabSkus(tab);
    if (!skus.some((d) => d.sku === selected)) selected = skus[0].sku;
    const sel = skus.find((d) => d.sku === selected)!;
    const st = itemState(sel, s);
    const waiting = o.checkout.waitingSku();
    const coat = sel.items.find((i) => i.startsWith('coat.')) ?? null;
    const hero = sel.hero ?? (coat ? coat.split('.')[1] : 'clem');
    const pic = o.preview?.(hero, coat) ?? null;
    const frame = sel.items.find((i) => i.startsWith('frame.'));
    const tile = (d: CatalogSku): string => {
      const ds = itemState(d, s);
      const tag = ds === 'owned' ? 'Owned' : ds === 'partly' ? 'Own some' : ds === 'locked' ? (d.sku === PASS_UPGRADE_SKU ? 'Pass owners' : 'Upgrade instead') : catalogPrice(d, currency);
      return `<button type="button" class="shop-tile ${d.sku === selected ? 'on' : ''} st-${ds}" data-sel="${d.sku}" aria-pressed="${d.sku === selected}"><b>${esc(d.label)}</b><small>${esc(tag)}</small></button>`;
    };
    const action =
      st === 'owned'
        ? sel.kind === 'pass'
          ? `<button class="pl-btn small" data-a="pass">Open the pass</button>`
          : `<button class="pl-btn small" data-equip="${sel.sku}">Owned · Equip</button>`
        : st === 'partly'
          ? `<span class="why">You own some of these: buy the singles.</span>`
          : st === 'locked'
            ? `<span class="why">${sel.sku === PASS_UPGRADE_SKU ? 'For Legends Pass owners.' : 'You have the Pass: get the Pass+ upgrade.'}</span>`
            : `<button class="pl-btn small buy" data-buy="${sel.sku}"${waiting ? ' disabled' : ''}>${waiting === sel.sku ? 'Opening...' : `Buy ${esc(catalogPrice(sel, currency))}`}</button>`;
    const what =
      sel.kind === 'pass'
        ? sel.sku === PASS_SKU
          ? 'Premium row: 30 rewards (coats, frames, titles). Every premium reward you already reached unlocks at once. Never expires.'
          : 'Premium row, 15 tier skips and the exclusive Eclipse coat. Never expires.'
        : sel.kind === 'bundle'
          ? `${sel.items.filter((i) => i.startsWith('coat.')).length} coats, a frame and its title.`
          : frame
            ? 'A profile frame and its title.'
            : 'A patterned coat for one hero.';
    root.innerHTML = `<div class="card">
      <div class="head"><h2>Store</h2><div class="tabs" role="tablist">${(Object.keys(TAB_LABEL) as StoreTab[])
        .map((t) => `<button type="button" role="tab" class="chip ${t === tab ? 'on' : ''}" data-tab="${t}" aria-selected="${t === tab}">${TAB_LABEL[t]}</button>`)
        .join('')}</div><button class="pl-btn ghost small" data-a="close" aria-label="Close">Close</button></div>
      <div class="shop-body">
        <div class="shop-preview">${pic ? `<div class="pl-portrait shop-pic" style="background-image:url(${pic})"${frame ? ` data-frame="${esc(frame)}"` : ''} role="img" aria-label="${esc(sel.label)}"></div>` : `<div class="shop-pic none"${frame ? ` data-frame="${esc(frame)}"` : ''}>${icon('paw')}</div>`}<b>${esc(sel.label)}</b><small>${esc(what)}</small></div>
        <div class="shop-scroll"><div class="shop-grid" role="list">${skus.map(tile).join('')}</div><span class="more" aria-hidden="true">▾ more</span></div>
      </div>
      <div class="shop-bar">${action}<p class="line" role="status">${esc(line)}</p></div>
      <p class="fine">Cosmetic only: nothing here changes a match. Checkout opens on the Token Tails web page.</p>
      <p class="fine safe">${esc(safeguardsLine(currency))}${o.termsUrl ? ` <a href="${esc(o.termsUrl)}" target="_blank" rel="noopener">Terms and refunds</a>` : ''}</p>
    </div>`;
    const sc = root.querySelector<HTMLElement>('.shop-scroll');
    const grid = root.querySelector<HTMLElement>('.shop-grid');
    if (sc && grid) {
      grid.scrollTop = gridScroll;
      const more = (): void => {
        sc.classList.toggle('end', grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 4);
      };
      grid.addEventListener('scroll', () => {
        gridScroll = grid.scrollTop;
        more();
      });
      more();
    }
  };
  render();
  const off = o.checkout.onResult((sku, ok) => {
    notePurchase(ok);
    const def = CATALOG_SKUS.find((d) => d.sku === sku);
    line = ok ? `${def?.label ?? 'Your item'}: thank you! It is on its way.` : 'The purchase was not completed.';
    render();
  });
  const close = (): void => {
    off();
    root.remove();
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as StoreTab | undefined;
    const sel = t.closest<HTMLElement>('[data-sel]')?.dataset.sel;
    const buy = t.closest<HTMLElement>('[data-buy]')?.dataset.buy;
    const eq = t.closest<HTMLElement>('[data-equip]')?.dataset.equip;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (tb) {
      tab = tb;
      gridScroll = 0;
      selected = tabSkus(tab)[0].sku;
      line = '';
    } else if (sel) {
      selected = sel;
      line = '';
    } else if (buy) {
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
