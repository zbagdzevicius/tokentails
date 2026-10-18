/**
 * Offer rules, game side (POC.md §8.4, integration plan §2). There is one offer: the "Meet ‹name›" card for an
 * unowned direct-purchase Token Tails cat. The host's server engine (`GET /pawlegends/offer`) decides *whether* and
 * *which* cat; this mirror only decides whether the game may show it now. The local starter/founder engine is
 * retired: without a host answer there is no card.
 *
 * Never: in session 1, outside the lobby (title) and results screens, in app builds, without the host checkout, for
 * a cat the player already owns or the host did not feature, or twice in a page session.
 *
 * The legacy exports (`pickOffer`, `offerOf`, `markShown`, `endsText`, the starter/founder `Offer`) stay so older
 * callers compile; they never produce a card.
 */
import type { MeetOffer } from '../embed/bridge';
import type { StoreSnapshot } from './entitlements';
import type { SkuId } from './skus';

export const OFFER_SCREENS = Object.freeze(['lobby', 'results'] as const);
export type OfferScreen = 'lobby' | 'results' | 'pick' | 'match' | 'loading';

export interface MeetInput {
  session: number;
  screen: OfferScreen;
  store: Pick<StoreSnapshot, 'catCheckout' | 'isApp'>;
  /** A card was already shown in this page session. */
  shownThisSession: boolean;
  /** The host's server answer (undefined = none sent yet, null = none). */
  hostOffer: MeetOffer | null | undefined;
  /** Catalog ids from the last `featured` list. */
  featured: readonly string[];
  /** Catalog ids the player owns (roster). */
  owned: readonly string[];
}

/** Pure: the Meet offer to show now, or null. */
export function pickMeet(i: MeetInput): MeetOffer | null {
  if (i.store.isApp || !i.store.catCheckout) return null;
  if (i.session < 2 || i.shownThisSession) return null;
  if (!(OFFER_SCREENS as readonly string[]).includes(i.screen)) return null;
  const o = i.hostOffer;
  if (!o || o.kind !== 'meet') return null;
  if (!i.featured.includes(o.catalogId) || i.owned.includes(o.catalogId)) return null;
  return o;
}

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

/** @deprecated The local starter/founder engine is retired: never a card (the Meet card is `pickMeet`). */
export function pickOffer(_i: OfferInput): Offer | null {
  return null;
}

/** @deprecated */
export function markShown(h: OfferHistory, _o: Offer, _now: number): OfferHistory {
  return h;
}

/**
 * @deprecated A host `offer` payload in the retired format: always null ("no starter/founder card"), so a caller
 * on the old path shows nothing. The Meet payload is read by `parseOffer` in embed/bridge.ts.
 */
export function offerOf(v: unknown): Offer | null | undefined {
  return v === undefined ? undefined : null;
}

/** @deprecated */
export function endsText(_endsAt: number | null, _now: number): string {
  return '';
}
