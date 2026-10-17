/**
 * Offer card rules, game side (POC.md §8.4). The backend engine (`pawlegends-offer.service.ts`) is the authority
 * and also enforces the spend cap at checkout; this mirror decides whether the game may show a card at all and
 * which one, from the same inputs (session count, completed matches, first win, owned SKUs and cats):
 *
 *   1. session >= 2, first win done, starter not owned, never shown or its 48 h window still open → Starter
 *   2. completed matches >= 3, no Founder owned, not shown in the last 7 days → Founder and Founder Legend
 *
 * Never: in session 1, outside the lobby (title) and results screens, in app builds, without an open store. At most
 * one card per session. A host that runs the server engine may send `offer{offer}` (additive bridge message); its
 * answer then picks the card, and every "never" rule above still applies.
 */
import type { StoreSnapshot } from './entitlements';
import type { SkuId } from './skus';

export const STARTER_WINDOW_MS = 48 * 3600 * 1000;
export const FOUNDER_GAP_MS = 7 * 24 * 3600 * 1000;
export const OFFER_SCREENS = Object.freeze(['lobby', 'results'] as const);
export type OfferScreen = 'lobby' | 'results' | 'pick' | 'match' | 'loading';

export type OfferKind = 'starter' | 'founder';

export interface Offer {
  kind: OfferKind;
  skus: SkuId[];
  /** End of a genuine window (starter: 48 h from the first show), or null. */
  endsAt: number | null;
}

export interface OfferHistory {
  /** When the starter card was first shown (its 48 h window starts then). */
  starterFirstShown?: number;
  /** When the founder card was last shown. */
  founderLastShown?: number;
}

export interface OfferInput {
  session: number;
  matches: number;
  firstWin: boolean;
  store: Pick<StoreSnapshot, 'storeOpen' | 'isApp' | 'skus'>;
  history: OfferHistory;
  screen: OfferScreen;
  /** A card was already shown in this page session. */
  shownThisSession: boolean;
  now: number;
  /** The host's server answer, when it sent one (undefined = none sent). */
  hostOffer?: Offer | null;
}

/** Pure: the card to show now, or null. */
export function pickOffer(i: OfferInput): Offer | null {
  if (i.store.isApp || !i.store.storeOpen) return null;
  if (i.session < 2 || i.shownThisSession) return null;
  if (!(OFFER_SCREENS as readonly string[]).includes(i.screen)) return null;
  const owned = i.store.skus;
  const ownsFounder = owned.has('pl_founder') || owned.has('pl_founder_legend');
  if (i.hostOffer !== undefined) {
    const o = i.hostOffer;
    if (!o) return null;
    // Never offer what is owned, whatever the host says.
    if (o.kind === 'starter' && owned.has('pl_starter')) return null;
    if (o.kind === 'founder' && ownsFounder) return null;
    return o;
  }
  const first = i.history.starterFirstShown;
  if (i.firstWin && !owned.has('pl_starter') && (first === undefined || i.now - first < STARTER_WINDOW_MS)) {
    return { kind: 'starter', skus: ['pl_starter'], endsAt: (first ?? i.now) + STARTER_WINDOW_MS };
  }
  const last = i.history.founderLastShown;
  if (i.matches >= 3 && !ownsFounder && (last === undefined || i.now - last >= FOUNDER_GAP_MS)) {
    return { kind: 'founder', skus: ['pl_founder', 'pl_founder_legend'], endsAt: null };
  }
  return null;
}

/** The history after showing `o` at `now`. */
export function markShown(h: OfferHistory, o: Offer, now: number): OfferHistory {
  if (o.kind === 'starter') return { ...h, starterFirstShown: h.starterFirstShown ?? now };
  return { ...h, founderLastShown: now };
}

/** A host `offer` message payload as an Offer, or null (none) / undefined (malformed: ignore). */
export function offerOf(v: unknown): Offer | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o.kind === 'starter') return { kind: 'starter', skus: ['pl_starter'], endsAt: typeof o.endsAt === 'number' ? o.endsAt : null };
  if (o.kind === 'founder') return { kind: 'founder', skus: ['pl_founder', 'pl_founder_legend'], endsAt: null };
  return undefined;
}

/** "Ends in 47 h" / "Ends in 12 min" for a genuine window. */
export function endsText(endsAt: number | null, now: number): string {
  if (endsAt === null) return '';
  const ms = Math.max(0, endsAt - now);
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `Ends in ${h} h` : `Ends in ${Math.max(1, Math.ceil(ms / 60000))} min`;
}
