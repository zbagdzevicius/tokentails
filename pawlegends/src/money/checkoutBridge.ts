/**
 * Buy flow, game side (integration plan §2): the game never handles money and sells nothing of its own. A "Meet
 * ‹name›" tap posts `open-cat{catalogId}`; the host opens its Token Tails cat checkout (card or crypto, with the
 * price, age band and spend cap on its own sheet) and answers `purchase-result{catalogId, ok}`, then a fresh
 * `roster` with the new cat. The game only tracks "waiting for the host" for the button state.
 *
 * Refused when the host checkout is closed (no host, app build) or the cat is not one the host featured or the
 * player owns. `purchase-intent{sku}` is retired: `buy` never posts it.
 */
import { cleanCatalogId, parsePurchaseResult, type Bridge, type HostMessage } from '../embed/bridge';
import type { Entitlements } from './entitlements';
import type { SkuId } from './skus';

/** How long a Meet button waits for the host before it is usable again (the sheet may be closed silently). */
export const INTENT_HOLD_MS = 8000;

/** @deprecated SKU listeners never fire (purchase results now name a cat). */
export type PurchaseListener = (sku: SkuId, ok: boolean) => void;
export type CatPurchaseListener = (catalogId: string, ok: boolean) => void;

export class CheckoutBridge {
  private pending: { catalogId: string; at: number } | null = null;
  private listeners: CatPurchaseListener[] = [];

  constructor(
    private readonly bridge: Pick<Bridge, 'post' | 'on'>,
    private readonly ent: Entitlements,
    private readonly now: () => number = () => Date.now(),
  ) {
    bridge.on((m: HostMessage) => {
      if (m.type !== 'purchase-result') return;
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

  /** @deprecated The `pl_*` store is retired: nothing is buyable from the game. */
  canBuy(_sku: SkuId): boolean {
    return false;
  }

  /** @deprecated Never posts `purchase-intent`; always false. */
  buy(_sku: SkuId): boolean {
    return false;
  }

  /** @deprecated SKU results no longer arrive; the listener is never called. */
  onResult(_fn: PurchaseListener): () => void {
    return () => undefined;
  }
}
