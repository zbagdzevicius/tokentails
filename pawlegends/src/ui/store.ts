/**
 * Store panel (POC.md §8, web only). Opened from the lobby (title) and the results screen; never in pick, loading or
 * a match, never in app builds, and only when the host says the store is ready. Each card shows the item, what is
 * delivered now and at the full launch, and a Buy button that hands over to the host (money/checkoutBridge.ts): the
 * host shows its own sheet with the server price, the age question, the terms link and the consent box, then
 * Stripe Checkout on the web page. Prices here are display only.
 */
import { CheckoutBridge } from '../money/checkoutBridge';
import type { StoreSnapshot } from '../money/entitlements';
import { MVP_TARGET, SKUS, browserCurrency, buyable, priceText, type Currency, type SkuId } from '../money/skus';
import { icon } from './icons';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const LAUNCH = (() => {
  const d = new Date(`${MVP_TARGET}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
})();

/** One SKU card (also used by the offer card). */
export function skuCard(sku: SkuId, currency: Currency, opts: { compact?: boolean } = {}): string {
  const d = SKUS[sku];
  return `<div class="pl-sku ${opts.compact ? 'compact' : ''}" data-sku="${sku}">
    <div class="pl-sku-art sku-${sku}">${icon(sku === 'pl_starter' ? 'paw' : 'crown')}</div>
    <div class="pl-sku-body">
      <b class="name">${esc(d.name)}</b>
      <small class="tag">${esc(d.tag)}</small>
      ${opts.compact ? '' : `<p class="now"><i>Now</i> ${esc(d.deliveredNow)}</p><p class="later"><i>At full launch (target ${esc(LAUNCH)})</i> ${esc(d.deliveredAtMvp)}</p>`}
    </div>
    <button class="pl-btn small buy" data-buy="${sku}">${esc(priceText(sku, currency))}</button>
  </div>`;
}

export interface StoreOpts {
  snapshot: () => StoreSnapshot;
  checkout: CheckoutBridge;
  onClose(): void;
  onNotify?(): void;
  /** Analytics: Buy tapped. */
  onBuy?(sku: SkuId): void;
}

export function storePanel(parent: HTMLElement, o: StoreOpts): { el: HTMLElement; close(): void; refresh(): void } {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-store';
  const currency = browserCurrency();
  let line = '';
  const render = (): void => {
    const s = o.snapshot();
    const skus = buyable(s.skus);
    const owned = [...s.skus].map((k) => SKUS[k].name);
    const waiting = o.checkout.waiting();
    root.innerHTML = `<div class="card">
      <div class="head"><h2>Store</h2><button class="pl-btn ghost small" data-a="close" aria-label="Close">Close</button></div>
      ${skus.length ? `<div class="grid">${skus.map((k) => skuCard(k, currency)).join('')}</div>` : `<p class="all">You own everything in the store. Thank you!</p>`}
      ${owned.length ? `<p class="owned">${icon('crown')}<span>Owned: ${owned.map(esc).join(', ')}</span></p>` : ''}
      <p class="line" role="status">${esc(line)}</p>
      <p class="fine">Cosmetic only: nothing here changes a match. Checkout opens on the Token Tails web page.</p>
      ${s.notifyOpen ? `<button class="pl-btn ghost small" data-a="notify">Legends Pass: notify me</button>` : ''}
    </div>`;
    if (waiting) {
      const b = root.querySelector<HTMLButtonElement>(`[data-buy="${waiting}"]`);
      if (b) {
        b.disabled = true;
        b.textContent = 'Opening...';
      }
    }
  };
  render();
  const off = o.checkout.onResult((sku, ok) => {
    line = ok ? `${SKUS[sku].name}: thank you! Your items are ready.` : 'The purchase was not completed.';
    render();
  });
  const close = (): void => {
    off();
    root.remove();
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const buy = t.closest<HTMLElement>('[data-buy]')?.dataset.buy as SkuId | undefined;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (buy) {
      if (o.checkout.buy(buy)) {
        o.onBuy?.(buy);
        line = 'Finish on the purchase sheet.';
      } else line = 'The store is not available right now.';
      render();
    } else if (a === 'close' || t === root) {
      close();
      o.onClose();
    } else if (a === 'notify') o.onNotify?.();
  });
  parent.appendChild(root);
  return { el: root, close, refresh: render };
}
