/**
 * Pawlegends switches (POC.md §11.4). The game is ON by default: no env is needed. The two flags are kill
 * switches only (`0`/`false`/`no`/`off` turns that part off), never `*_ENABLED` opt-ins.
 *
 * - `NEXT_PUBLIC_PAWLEGENDS`: an off value closes `/pawlegends` (the page sends players to `/game`).
 * - `NEXT_PUBLIC_PAWLEGENDS_PICKER`: an off value hides the PLAY picker card. The card is also hidden in app
 *   builds (GDD §9.8: web only in Phases 1 and 2) and whenever the page itself is off.
 *
 * The build is always same-origin (`client/public/pawlegends-game/`, committed by `npm run build:client` in
 * `pawlegends/`). Next inlines `NEXT_PUBLIC_*` at build time, so a change needs a redeploy. Pure functions with
 * the env as default arguments, so tests pass values in.
 */
import { flagNotOff } from "@/lib/flags";

/** `/pawlegends` is open (default on; an off value is the kill switch). */
export function pawlegendsEnabled(flag: string | undefined = process.env.NEXT_PUBLIC_PAWLEGENDS): boolean {
  return flagNotOff(flag);
}

/** The PLAY picker card: web builds only, on unless its own flag or the page flag is off. */
export function pawlegendsPickerEnabled(
  isApp: boolean,
  flag: string | undefined = process.env.NEXT_PUBLIC_PAWLEGENDS_PICKER,
  pageFlag: string | undefined = process.env.NEXT_PUBLIC_PAWLEGENDS
): boolean {
  return !isApp && flagNotOff(flag) && pawlegendsEnabled(pageFlag);
}

/** The same-origin build. Next serves no directory index, so the file is named. */
export const PAWLEGENDS_GAME_URL = "/pawlegends-game/index.html";
/** The iframe's src (POC.md §11.4). */
export const PAWLEGENDS_FRAME_SRC = `${PAWLEGENDS_GAME_URL}?embed=1`;
/**
 * The shape of a dare code (`pawlegends/src/share/dare.ts` `encodeDare`: seed.hero.trick.difficulty.seconds, base 36
 * where it says so). The game decodes and validates it fully; the host only refuses anything that is not that shape.
 */
const DARE_CODE = /^[0-9a-z]{1,7}\.[0-9]{1,2}\.[0-9]\.[0-2]\.[0-9a-z]{1,3}$/;
/** A party code (MULTIPLAYER.md §5.3): 6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, case-folded. */
const PARTY_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
/** The party code of a page URL (`?party=k7qx2m`, spaces and dashes ignored), or null. */
export function partyCodeOf(search: string): string | null {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get("party");
  } catch {
    return null;
  }
  const code = raw ? raw.toUpperCase().replace(/[\s-]/g, "") : "";
  return PARTY_CODE.test(code) ? code : null;
}
/**
 * The invite link the game shares (D12: Paw Legends' own domain, docs/plans/moba/NO-TOKENTAILS.md; `/?party=` goes on
 * to `/play` there). An older game build's tokentails.com link is still accepted.
 */
export const PAWLEGENDS_PARTY_LINK =
  /^https:\/\/(pawlegends\.app\/|tokentails\.com\/pawlegends)\?party=[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
/**
 * The iframe's src for this page URL (launch finding PUB-03). A shared dare link points at the host page
 * (`/pawlegends?dare=…`), but the game reads the dare from its own URL, so the host forwards a well-formed `dare`
 * and nothing else. A party invite (`/pawlegends?party=K7QX2M`, MULTIPLAYER.md §5.3) is forwarded the same way,
 * validated and upper-cased. Without either it is `PAWLEGENDS_FRAME_SRC`.
 */
export function pawlegendsFrameSrc(search: string): string {
  let dare: string | null = null;
  try {
    dare = new URLSearchParams(search).get("dare");
  } catch {
    return PAWLEGENDS_FRAME_SRC;
  }
  let src = dare && DARE_CODE.test(dare) ? `${PAWLEGENDS_FRAME_SRC}&dare=${dare}` : PAWLEGENDS_FRAME_SRC;
  const party = partyCodeOf(search);
  if (party) src += `&party=${party}`;
  // sim v22 (WR-BS-PLAN.md §5): `?mode=blitz|skirmish|classic` opens the PLAY screen on that tile; any other short word
  // is forwarded too, so the game can say "Update to play …" (an older game build falls back to Skirmish)
  const mode = modeOf(search);
  if (mode) src += `&mode=${mode}`;
  return src;
}

/** A well-formed `mode` of the page URL (lowercase letters, at most 16), or null. */
export function modeOf(search: string): string | null {
  try {
    const m = new URLSearchParams(search).get("mode")?.toLowerCase() ?? null;
    return m && /^[a-z]{1,16}$/.test(m) ? m : null;
  } catch {
    return null;
  }
}

/** The page URL without `party` (the host strips it once forwarded, so a reload does not rejoin an old party). */
export function withoutParty(href: string): string | null {
  try {
    const url = new URL(href);
    if (!url.searchParams.has("party")) return null;
    url.searchParams.delete("party");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
/** Where the kill switch goes (Paw Legends turned off on this deploy). Never linked from inside the game. */
export const PAWLEGENDS_EXIT_PATH = "/game";
/** Paw Legends' own domain (client/next.config.js: `/` is the landing there, `/<page>` each Paw Legends page). */
export const PAWLEGENDS_HOST = "pawlegends.app";
/**
 * The Paw Legends landing for this page host: `/` on pawlegends.app, `/pawlegends` elsewhere. The loading banners'
 * way out (NO-TOKENTAILS.md: never the Token Tails games hub).
 */
export function pawlegendsHomePath(hostname: string): string {
  const h = hostname.toLowerCase();
  return h === PAWLEGENDS_HOST || h === `www.${PAWLEGENDS_HOST}` ? "/" : "/pawlegends";
}
export const PAWLEGENDS_TERMS_PATH = "/pawlegends/terms";
/**
 * Paw Legends' own privacy notice (pages/pawlegends/privacy.tsx; it names the operator as the law requires). Web and
 * app link the same page (NO-TOKENTAILS.md, Your call 3).
 */
export const PAWLEGENDS_PRIVACY_URL = "https://pawlegends.app/privacy";
/**
 * The operator's general privacy policy, which also covers the shared account. Linked only from the Paw Legends privacy
 * notice itself, where the law needs it (NO-TOKENTAILS.md, Your call 3); never from the game.
 */
export const OPERATOR_PRIVACY_URL = "https://docs.tokentails.com/community-and-social-impact/privacy-policy";
/** Where players write for refunds, limits or to stop season news. */
export const PAWLEGENDS_CONTACT = "info@tokentails.com";
