/**
 * Paw Legends host constants (POC.md §11.4). No switches: the game is always on (no feature flags).
 *
 * The build is always same-origin (`pawlegends-web/public/pawlegends-game/`, committed by `npm run build:client` in
 * `pawlegends/`). Pure functions, so tests pass values in.
 */

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
 * to `/play`). An older game build's link to the previous host page is still accepted.
 */
export const PAWLEGENDS_PARTY_LINK =
  /^https:\/\/(pawlegends\.app\/|tokentails\.com\/pawlegends)\?party=[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
/**
 * The iframe's src for this page URL (launch finding PUB-03). A shared dare link points at the host page
 * (`/?dare=…`, which goes on to `/play`), but the game reads the dare from its own URL, so the host forwards a well-formed `dare`
 * and nothing else. A party invite (`/?party=K7QX2M`, MULTIPLAYER.md §5.3) is forwarded the same way,
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

/**
 * Force update (docs/plans/moba/FORCE-UPDATE.md §5.1): the frame's src for a fresh start on the latest build. `?v=`
 * makes the game's index.html a new URL (no cached copy of the old one anywhere); a one-time dare or party is not
 * forwarded again.
 */
export function pawlegendsFrameSrcFor(version: string | null): string {
  return version && /^[0-9a-z]{4,40}$/.test(version) ? `${PAWLEGENDS_FRAME_SRC}&v=${version}` : `${PAWLEGENDS_FRAME_SRC}&v=${Date.now().toString(36)}`;
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
/** Paw Legends' own domain (this app's production host; next.config.js sends www to it). */
export const PAWLEGENDS_HOST = "pawlegends.app";
export const PAWLEGENDS_TERMS_PATH = "/terms";
/**
 * Paw Legends' own privacy notice (pages/privacy.tsx; it names the operator as the law requires). Web and
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
