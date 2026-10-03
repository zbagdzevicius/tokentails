/**
 * What the `/heist` host tells the Heist in its `session` message (plan G2 layer 1): whether an
 * account is signed in, the account's server progress, and the safe-area insets.
 */
import { HEIST_LEVELS, HEIST_STAR_MASK } from "@/shared-contracts/caps";
import type { HeistInsets, HeistProgress } from "@/shared-contracts/heist-bridge";

/** The profile fields `/live` maintains for the Heist (index `i` is `HEIST_LEVELS[i]`). */
export interface HeistProfileFields {
  heistScore?: unknown;
  heistStars?: unknown;
}

const slot = (values: unknown, index: number): number => {
  if (!Array.isArray(values)) return 0;
  const value = Number(values[index]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

/**
 * Server progress from a profile: a level is won when it has the win star or a best score (only won
 * runs are saved). Levels without either are left out. Null when the profile has no Heist fields.
 */
export function progressFromProfile(profile: HeistProfileFields | null | undefined): HeistProgress | null {
  if (!profile || (!Array.isArray(profile.heistScore) && !Array.isArray(profile.heistStars))) return null;
  const levels: HeistProgress["levels"] = {};
  HEIST_LEVELS.forEach((id, index) => {
    const bestScore = slot(profile.heistScore, index);
    const stars = slot(profile.heistStars, index) & HEIST_STAR_MASK;
    if (!bestScore && !stars) return;
    levels[id] = { won: bestScore > 0 || (stars & 1) === 1, bestScore, stars };
  });
  return { levels };
}

export const NO_INSETS: HeistInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The page's safe-area insets in CSS px, measured with a probe element whose padding is
 * `env(safe-area-inset-*)` (the iframe cannot read them: inside it they are 0).
 */
export function readSafeAreaInsets(doc: Document | null = typeof document === "undefined" ? null : document): HeistInsets {
  if (!doc?.body || typeof getComputedStyle !== "function") return NO_INSETS;
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);" +
    "padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)";
  doc.body.appendChild(probe);
  try {
    const style = getComputedStyle(probe);
    const px = (value: string) => {
      const n = parseFloat(value);
      return Number.isFinite(n) ? Math.round(n) : 0;
    };
    return {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    };
  } finally {
    probe.remove();
  }
}

/** Query parameters forwarded to the embedded Heist. QA ones only in development and E2E builds. */
export function heistFrameSrc(hostSearch: string, allowQa: boolean, hostHash = ""): string {
  const params = new URLSearchParams();
  params.set("embed", "1");
  // `/heist?payouts` or `/heist#payouts` opens the in-game "Sent to shelters" modal on load.
  const payouts = new URLSearchParams(hostSearch).get("payouts");
  if ((payouts !== null && payouts !== "0" && payouts !== "false") || /^#payouts$/i.test(hostHash)) {
    params.set("payouts", "1");
  }
  if (allowQa) {
    const host = new URLSearchParams(hostSearch);
    if (host.get("qa") === "1") {
      params.set("qa", "1");
      for (const key of ["replay", "level", "speed", "shadows"]) {
        const value = host.get(key);
        if (value && /^[\w.-]{1,32}$/.test(value)) params.set(key, value);
      }
    }
  }
  return `${HEIST_FRAME_PATH}?${params.toString()}`;
}

/** The Heist's static build (plan F12). */
export const HEIST_FRAME_PATH = "/heist-game/index.html";

/** Where `exit` and the back link go: the game shell, where the picker lives. */
export const HEIST_EXIT_PATH = "/game";

/** Where the player came from, for `heist_open {from}`: `?from=` (picker, landing), else `direct`. */
export function openedFrom(search: string): string {
  const from = new URLSearchParams(search).get("from");
  return from && /^[a-z][a-z0-9_-]{0,23}$/.test(from) ? from : "direct";
}

/** `/heist` page meta (SeoHead; `catnip-heist/index.html` keeps its own for direct loads). */
export const HEIST_TITLE = "Catnip Heist - Token Tails";
// claim:fiction the in-game story (crates, guard dogs and the shelter cat are the level), the same
// description catnip-heist/index.html carries
export const HEIST_DESCRIPTION =
  "Catnip Heist: sneak two cats past Kibble Corp's guard dogs, rescue the catnip crates and free a shelter cat. A free stealth game from Token Tails, no sign-up needed.";

/** The `/heist` share image: the Heist's title screen, 1200x630 (served from the app origin). */
export const HEIST_OG_IMAGE = {
  url: "/game-select/heist-og.jpg",
  width: 1200,
  height: 630,
  alt: "Catnip Heist title screen: two cats sneak past KibbleCorp's guard dogs",
};
