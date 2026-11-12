/**
 * Buy flow, game side (integration plan §2): the game never handles money. Paw Legends sells only its own store and
 * pass items (the Token Tails cat checkout, `open-cat`, was removed 2026-11-12: docs/plans/moba/NO-TOKENTAILS.md).
 *
 * Store and Legends Pass (docs/plans/moba/STORE-PASS.md §3): `buy(sku)` posts `purchase-intent{sku}` for the
 * catalogue SKUs only (money/catalog.ts; the retired `pl_*` presale SKUs never), on the web only. The host shows its
 * own sheet (sign-in, server price, age band, consent) and Stripe Checkout, then answers `purchase-result{sku, ok}`
 * and a fresh `store{items, season}`. The game never sees a price it charges or any payment detail.
 */
import { parseSkuPurchaseResult, type Bridge, type HostMessage } from '../embed/bridge';
import type { Entitlements } from './entitlements';
import { catalogSku } from './catalog';

/** How long a buy button waits for the host before it is usable again (the sheet may be closed silently). */
export const INTENT_HOLD_MS = 8000;

/** A store or pass purchase finished on the host (ok false: cancelled or refused). */
export type PurchaseListener = (sku: string, ok: boolean) => void;

export class CheckoutBridge {
  private pendingSku: { sku: string; at: number } | null = null;
  private skuListeners: PurchaseListener[] = [];

  constructor(
    private readonly bridge: Pick<Bridge, 'post' | 'on'>,
    private readonly ent: Entitlements,
    private readonly now: () => number = () => Date.now(),
  ) {
    bridge.on((m: HostMessage) => {
      if (m.type !== 'purchase-result') return;
      const k = parseSkuPurchaseResult(m);
      if (!k) return;
      if (this.pendingSku?.sku === k.sku) this.pendingSku = null;
      for (const l of this.skuListeners) l(k.sku, k.ok);
    });
  }

  /** The store SKU waiting for the host, if any (cleared after INTENT_HOLD_MS). */
  waitingSku(): string | null {
    if (this.pendingSku && this.now() - this.pendingSku.at > INTENT_HOLD_MS) this.pendingSku = null;
    return this.pendingSku?.sku ?? null;
  }

  /** A catalogue SKU while the host store is open (web, embedded; never an app build or a retired `pl_*` SKU). */
  canBuy(sku: string): boolean {
    return this.ent.snapshot().storeOpen && !!catalogSku(sku);
  }

  /** Ask the host to sell `sku`. False when refused or the host is not there. */
  buy(sku: string): boolean {
    if (!this.canBuy(sku) || this.waitingSku()) return false;
    if (!this.bridge.post('purchase-intent', { sku })) return false;
    this.pendingSku = { sku, at: this.now() };
    return true;
  }

  onResult(fn: PurchaseListener): () => void {
    this.skuListeners.push(fn);
    return () => {
      this.skuListeners = this.skuListeners.filter((l) => l !== fn);
    };
  }
}
