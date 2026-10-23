/**
 * Offer card (POC.md §8.4): at most one per session, only on the lobby (title) or the results screen, never in
 * session 1 or an app build (money/offer.ts decides). A small dismissible card in the corner; Buy goes to the host
 * like the store does. The starter window is genuine: the end time is the first show + 48 h, not a fake timer.
 */
import type { CheckoutBridge } from '../money/checkoutBridge';
import { endsText, type Offer } from '../money/offer';
import { browserCurrency, type SkuId } from '../money/skus';
import { skuCard } from './store';

export interface OfferCardOpts {
  offer: Offer;
  checkout: CheckoutBridge;
  now: () => number;
  onClick?(sku: SkuId): void;
  onClose?(): void;
  /** "Details": open the full store cards (what is delivered now and at full launch). */
  onDetails?(): void;
}

export function offerCard(parent: HTMLElement, o: OfferCardOpts): { el: HTMLElement; close(): void } {
  const root = document.createElement('div');
  root.className = `pl-offer kind-${o.offer.kind}`;
  root.dataset.offer = o.offer.kind;
  const currency = browserCurrency();
  const head = o.offer.kind === 'starter' ? 'Starter pack' : 'Become a Founder';
  const ends = endsText(o.offer.endsAt, o.now());
  root.innerHTML = `<button class="x" data-a="close" aria-label="Close">✕</button>
    <b class="head">${head}</b>${ends ? `<small class="ends">${ends}</small>` : ''}
    <div class="row">${o.offer.skus.map((k) => skuCard(k, currency, { compact: true })).join('')}</div>
    ${o.onDetails ? `<button class="pl-btn ghost small details" data-a="details">Details</button>` : ''}`;
  const close = (): void => root.remove();
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const sku = t.closest<HTMLElement>('[data-buy]')?.dataset.buy as SkuId | undefined;
    if (sku) {
      o.onClick?.(sku);
      if (o.checkout.buy(sku)) close();
    } else if (t.closest('[data-a="details"]')) {
      close();
      o.onClose?.();
      o.onDetails?.();
    } else if (t.closest('[data-a="close"]')) {
      close();
      o.onClose?.();
    }
  });
  parent.appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));
  return { el: root, close };
}
