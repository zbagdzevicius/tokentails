/**
 * Buy flow, game side (integration plan §2): the game never handles money and sells nothing of its own. A "Meet
 * ‹name›" tap posts `open-cat{catalogId}`; the host opens its Token Tails cat checkout (card or crypto, with the
 * price, age band and spend cap on its own sheet) and answers `purchase-result{catalogId, ok}`, then a fresh
 * `roster` with the new cat. The game only tracks "waiting for the host" for the button state.
 *
 * Refused when the host checkout is closed (no host, app build) or the cat is not one the host featured or the
 * player owns.
 *
 * Store and Legends Pass (docs/plans/moba/STORE-PASS.md §3): `buy(sku)` posts `purchase-intent{sku}` for the
 * catalogue SKUs only (money/catalog.ts; the retired `pl_*` presale SKUs never), on the web only. The host shows its
 * own sheet (sign-in, server price, age band, consent) and Stripe Checkout, then answers `purchase-result{sku, ok}`
 * and a fresh `store{items, season}`. The game never sees a price it charges or any payment detail.
 */
import { cleanCatalogId, parsePurchaseResult, parseSkuPurchaseResult, type Bridge, type HostMessage } from '../embed/bridge';
import type { Entitlements } from './entitlements';
import { catalogSku } from './catalog';

/** How long a Meet button waits for the host before it is usable again (the sheet may be closed silently). */
export const INTENT_HOLD_MS = 8000;

/** A store or pass purchase finished on the host (ok false: cancelled or refused). */
export type PurchaseListener = (sku: string, ok: boolean) => void;
export type CatPurchaseListener = (catalogId: string, ok: boolean) => void;

export class CheckoutBridge {
  private pending: { catalogId: string; at: number } | null = null;
  private pendingSku: { sku: string; at: number } | null = null;
  private listeners: CatPurchaseListener[] = [];
  private skuListeners: PurchaseListener[] = [];

  constructor(
    private readonly bridge: Pick<Bridge, 'post' | 'on'>,
    private readonly ent: Entitlements,
    private readonly now: () => number = () => Date.now(),
  ) {
    bridge.on((m: HostMessage) => {
      if (m.type !== 'purchase-result') return;
      const k = parseSkuPurchaseResult(m);
      if (k) {
        if (this.pendingSku?.sku === k.sku) this.pendingSku = null;
        for (const l of this.skuListeners) l(k.sku, k.ok);
        return;
      }
      const r = parsePurchaseResult(m);
      if (!r) return;
      if (this.pending?.catalogId === r.catalogId) this.pending = null;
      for (const l of this.listeners) l(r.catalogId, r.ok);
    });
  }

  /** The cat waiting for the host, if any (cleared after INTENT_HOLD_MS). */
  waiting(): string | null {
    if (this.pending && this.now() - this.pending.at > INTENT_HOLD_MS) this.pending = null;
    return this.pending?.catalogId ?? null;
  }

  /** May the game ask the host about this cat now? `allowed` = the ids the host featured or the roster holds. */
  canOpen(catalogId: string, allowed: readonly string[]): boolean {
    return this.ent.snapshot().catCheckout && !!cleanCatalogId(catalogId) && allowed.includes(catalogId);
  }

  /** Ask the host to open its cat sheet. False when refused or the host is not there. */
  openCat(catalogId: string, allowed: readonly string[]): boolean {
    if (!this.canOpen(catalogId, allowed) || this.waiting()) return false;
    if (!this.bridge.post('open-cat', { catalogId })) return false;
    this.pending = { catalogId, at: this.now() };
    return true;
  }

  onCatResult(fn: CatPurchaseListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
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
