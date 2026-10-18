/**
 * Pawlegends host events (the `/pawlegends` page, docs/plans/moba integration plan section 4).
 *
 * A client-only extension of the event catalog like `./growth-events`: these names are not in
 * `shared/analytics-core.ts` (which syncs into `catnip-heist/`). `analytics.track` accepts them because
 * `AnalyticsEvent` in `./events` is the union of the core events, the growth events and these.
 *
 * No property carries personal data: no cat name, user id or email. `catalogId` is a public catalog cat (the
 * storefront's `GET /cat/sale` id), never an owned copy or a person.
 */
export const PAWLEGENDS_EVENTS = {
  OPEN: "pawlegends_open",
  SAVE: "pawlegends_save",
  SIGNIN_PROMPT: "pawlegends_signin_prompt",
  GUEST_CLAIM: "pawlegends_guest_claim",
  MEET_OPEN: "pawlegends_meet_open",
  CAT_PURCHASE: "pawlegends_cat_purchase",
} as const;

export type PawlegendsEventName = (typeof PAWLEGENDS_EVENTS)[keyof typeof PAWLEGENDS_EVENTS];

export interface PawlegendsEventProperties {
  pawlegends_open: { from: string };
  pawlegends_save: { status: "saving" | "saved" | "queued" | "failed" | "rejected"; catnipPaid: number };
  pawlegends_signin_prompt: { reason: "save-progress" | "claim-rewards" | "purchase" };
  pawlegends_guest_claim: { count: number; choice: "add" | "decline" };
  pawlegends_meet_open: { catalogId: string; from: "offer" | "featured" | "roster" };
  pawlegends_cat_purchase: { ok: boolean };
}

export type PawlegendsEvent = {
  [K in PawlegendsEventName]: { name: K; properties: PawlegendsEventProperties[K] };
}[PawlegendsEventName];

/** Typed constructor, so call sites never spell a name or shape by hand. */
export function buildPawlegendsEvent<K extends PawlegendsEventName>(
  name: K,
  properties: PawlegendsEventProperties[K]
): { name: K; properties: PawlegendsEventProperties[K] } {
  return { name, properties };
}
