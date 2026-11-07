/**
 * `/pawlegends` is the landing page and `/pawlegends/play` the game (docs/CLIENT.md "Pawlegends"). Links that need
 * the game carry one of `playQueryKeys` (party invites `?party=`, dares `?dare=`, Stripe `?checkout=`, the account
 * emails `?restore=` / `?notify=`, and `?from=` from the PLAY picker and the home hub), so a `/pawlegends` URL with
 * any of them goes on to the game with its query: `next.config.js` redirects on the server (it reads routes.json),
 * and the landing repeats the check in the browser for the app export and client-side navigation.
 * Marketing links (`?utm_*`) stay on the landing. `/legends` (the landing A/B arm B) follows the same rules, so a
 * campaign link to either arm must tag itself with `utm_*`, never `from`: `/legends?from=x` skips the landing and opens
 * the game without the `lv` arm tag.
 */
import routes from "./routes.json";

export const PAWLEGENDS_LANDING_PATH: string = routes.landingPath;
/** `/legends`: the scroll-lane-map landing, A/B arm B (landingVariant.ts). */
export const PAWLEGENDS_LEGENDS_PATH: string = routes.legendsPath;
export const PAWLEGENDS_PLAY_PATH: string = routes.playPath;
export const PAWLEGENDS_PLAY_QUERY_KEYS: readonly string[] = Object.freeze([...routes.playQueryKeys]);

type Query = Record<string, string | string[] | undefined>;

/** True when this landing URL's query belongs to the game. */
export function wantsGame(query: Query): boolean {
  return PAWLEGENDS_PLAY_QUERY_KEYS.some((k) => query[k] !== undefined);
}

/** A game link from the landing; `from` feeds the existing `pawlegends_open {from}` event (`^[a-z0-9_-]{1,24}$`). */
export function playHref(from: string): string {
  return `${PAWLEGENDS_PLAY_PATH}?from=${encodeURIComponent(from)}`;
}
