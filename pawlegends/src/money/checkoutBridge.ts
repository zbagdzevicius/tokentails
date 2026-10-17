/**
 * Buy flow, game side (POC.md §8.2 step 1): the game never handles money. Tapping Buy posts
 * `purchase-intent{sku}` to the host, which shows its purchase sheet and runs Stripe Checkout on the web page. The
 * host answers `purchase-result{sku, ok}` (and later a fresh `entitlements{token}`), so the game only tracks
 * "waiting for the host" for the button state. Refused when the store is closed (no host, app build, store not
 * ready) or the player already owns a once-only SKU.
 */
import type { Bridge, HostMessage } from '../embed/bridge';
import type { Entitlements } from './entitlements';
import { SKUS, buyable, isSku, type SkuId } from './skus';

/** How long a Buy button waits for the host before it is usable again (the sheet may be closed silently). */
export const INTENT_HOLD_MS = 8000;

export type PurchaseListener = (sku: SkuId, ok: boolean) => void;

export class CheckoutBridge {
  private pending: { sku: SkuId; at: number } | null = null;
  private listeners: PurchaseListener[] = [];

  constructor(
    private readonly bridge: Pick<Bridge, 'post' | 'on'>,
    private readonly ent: Entitlements,
    private readonly now: () => number = () => Date.now(),
  ) {
    bridge.on((m: HostMessage) => {
      if (m.type !== 'purchase-result' || !isSku(m.sku)) return;
      const ok = m.ok === true;
      if (this.pending?.sku === m.sku) this.pending = null;
      for (const l of this.listeners) l(m.sku, ok);
    });
  }

  /** The SKU waiting for the host, if any (cleared after INTENT_HOLD_MS). */
  waiting(): SkuId | null {
    if (this.pending && this.now() - this.pending.at > INTENT_HOLD_MS) this.pending = null;
    return this.pending?.sku ?? null;
  }

  /** May this SKU be bought from the game now? */
  canBuy(sku: SkuId): boolean {
    const s = this.ent.snapshot();
    return s.storeOpen && buyable(s.skus).includes(sku) && !(SKUS[sku].requiresFounder && !s.skus.has('pl_founder'));
  }

  /** Ask the host to start checkout. False when refused or the host is not there. */
  buy(sku: SkuId): boolean {
    if (!this.canBuy(sku) || this.waiting()) return false;
    if (!this.bridge.post('purchase-intent', { sku })) return false;
    this.pending = { sku, at: this.now() };
    return true;
  }

  onResult(fn: PurchaseListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}
