/**
 * Offer rules, game side (POC.md §8.4, integration plan §2). There is no offer card any more: the "Meet ‹name›" card
 * for a Token Tails cat was removed 2026-11-12 (docs/plans/moba/NO-TOKENTAILS.md) and the local starter/founder
 * engine is retired. The legacy exports (`pickOffer`, `offerOf`, `markShown`, `endsText`, the starter/founder `Offer`)
 * stay so older callers compile; they never produce a card.
 */
import type { StoreSnapshot } from './entitlements';
import type { SkuId } from './skus';

export const OFFER_SCREENS = Object.freeze(['lobby', 'results'] as const);
export type OfferScreen = 'lobby' | 'results' | 'pick' | 'match' | 'loading';

// ----------------------------------------------------------------------------------------- retired (legacy)

/** @deprecated The `pl_*` offers are retired; kept so the old offer card compiles. */
export type OfferKind = 'starter' | 'founder';

/** @deprecated */
export interface Offer {
  kind: OfferKind;
  skus: SkuId[];
  endsAt: number | null;
}

/** @deprecated */
export interface OfferHistory {
  starterFirstShown?: number;
  founderLastShown?: number;
}

/** @deprecated */
export interface OfferInput {
  session: number;
  matches: number;
  firstWin: boolean;
  store: Pick<StoreSnapshot, 'storeOpen' | 'isApp' | 'skus'>;
  history: OfferHistory;
  screen: OfferScreen;
  shownThisSession: boolean;
  now: number;
  hostOffer?: Offer | null;
}

/** @deprecated The local starter/founder engine is retired: never a card. */
export function pickOffer(_i: OfferInput): Offer | null {
  return null;
}

/** @deprecated */
export function markShown(h: OfferHistory, _o: Offer, _now: number): OfferHistory {
  return h;
}

/**
 * @deprecated A host `offer` payload in the retired format: always null ("no starter/founder card"), so a caller
 * on the old path shows nothing. An older host's Meet payload is ignored (embed/integrate.ts).
 */
export function offerOf(v: unknown): Offer | null | undefined {
  return v === undefined ? undefined : null;
}

/** @deprecated */
export function endsText(_endsAt: number | null, _now: number): string {
  return '';
}
