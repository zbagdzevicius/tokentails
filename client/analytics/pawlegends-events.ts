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
  BRIDGE_TIMEOUT: "pawlegends_bridge_timeout",
} as const;

export type PawlegendsEventName = (typeof PAWLEGENDS_EVENTS)[keyof typeof PAWLEGENDS_EVENTS];

export interface PawlegendsEventProperties {
  pawlegends_open: { from: string };
  /**
   * `code` is the backend's error code (`PAWLEGENDS_OUTCOME_MISMATCH` or `PAWLEGENDS_SIM_VERSION` mean the game and
   * backend sims drifted apart), null on a save that worked or got no answer; `httpStatus` is 0 without an answer.
   * The rejected + failed share per hour is a launch alert (docs/plans/moba/LAUNCH.md a.8 step 4).
   */
  pawlegends_save: {
    status: "saving" | "saved" | "queued" | "failed" | "rejected";
    catnipPaid: number;
    code: string | null;
    httpStatus: number;
  };
  pawlegends_signin_prompt: { reason: "save-progress" | "claim-rewards" | "purchase" };
  pawlegends_guest_claim: { count: number; choice: "add" | "decline" };
  pawlegends_meet_open: { catalogId: string; from: "offer" | "featured" | "roster" | "champion" };
  pawlegends_cat_purchase: { ok: boolean };
  /**
   * The game frame never answered `hello` within `waitedMs` (the "taking too long to load" panel; launch finding R1).
   * `reloads` counts the player's Reload presses before it on this page.
   */
  pawlegends_bridge_timeout: { waitedMs: number; reloads: number };
}

/**
 * The game's own events, relayed over the bridge (`analytics {event, props}`, launch finding PUB-02) and sent by the host
 * with the site's policy and anonymous id. Same names as the standalone game sends (`pawlegends/src/analytics/posthog.ts`
 * AnalyticsEvent, minus `app_error`: crashes come as `client-error`), so one PostHog insight reads both; the relayed rows
 * carry `embed: true`. Props are flat numbers, booleans and short token strings only (hero, difficulty, tier, sku,
 * catalog id); `parsePawlegendsMessage` drops anything else.
 */
export const PAWLEGENDS_GAME_EVENTS = [
  "title_view",
  "match_start",
  "match_end",
  "second_match",
  "rematch_click",
  "talent_pick",
  "tip_done",
  "dare_open",
  "store_open",
  "offer_shown",
  "offer_click",
  "checkout_start",
  "item_seen_in_match",
  "notify_signup",
  "quality_tier",
  "perf_sample",
] as const;

export type PawlegendsGameEventName = (typeof PAWLEGENDS_GAME_EVENTS)[number];
export type PawlegendsGameProps = Record<string, string | number | boolean>;

export type PawlegendsEvent =
  | {
      [K in PawlegendsEventName]: { name: K; properties: PawlegendsEventProperties[K] };
    }[PawlegendsEventName]
  | { name: PawlegendsGameEventName; properties: PawlegendsGameProps };

/** An error code as an event property: the backend's UPPER_SNAKE codes only, anything else is "OTHER". */
export const pawlegendsSaveCode = (code: string | null | undefined): string | null =>
  code == null ? null : /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "OTHER";

/** Typed constructor, so call sites never spell a name or shape by hand. */
export function buildPawlegendsEvent<K extends PawlegendsEventName>(
  name: K,
  properties: PawlegendsEventProperties[K]
): { name: K; properties: PawlegendsEventProperties[K] } {
  return { name, properties };
}
