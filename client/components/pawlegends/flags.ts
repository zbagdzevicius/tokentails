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
/**
 * The iframe's src for this page URL (launch finding PUB-03). A shared dare link points at the host page
 * (`/pawlegends?dare=…`), but the game reads the dare from its own URL, so the host forwards a well-formed `dare`
 * and nothing else. Without one it is `PAWLEGENDS_FRAME_SRC`.
 */
export function pawlegendsFrameSrc(search: string): string {
  let dare: string | null = null;
  try {
    dare = new URLSearchParams(search).get("dare");
  } catch {
    return PAWLEGENDS_FRAME_SRC;
  }
  return dare && DARE_CODE.test(dare) ? `${PAWLEGENDS_FRAME_SRC}&dare=${dare}` : PAWLEGENDS_FRAME_SRC;
}
/** Where the exit button and the kill switch go. */
export const PAWLEGENDS_EXIT_PATH = "/game";
export const PAWLEGENDS_TERMS_PATH = "/pawlegends/terms";
/** Token Tails privacy policy (same page as the site footer and `PRIVACY_URL` in the sign-in sheet). */
export const PAWLEGENDS_PRIVACY_URL = "https://docs.tokentails.com/community-and-social-impact/privacy-policy";
/** Where players write for refunds, limits or to stop season news. */
export const PAWLEGENDS_CONTACT = "info@tokentails.com";
