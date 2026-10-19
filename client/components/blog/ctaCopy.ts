// The conversion cards of the blog (`cta` in an article's frontmatter and `<!-- cta:x -->` in its
// body). This file holds the cards every build may show; ctaCopy.web.ts holds the web-only ones
// (payments, coins and the payout ledger), which app builds never render.
import { WEB_CTAS } from "./ctaCopy.web";

export interface CtaArt {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface CtaDef {
  key: string;
  href: string;
  /** Plain `<a>`: pages served outside the Next router (static builds) or that need a full load. */
  hardLink?: boolean;
  eyebrow: string;
  title: string;
  body: string;
  button: string;
  art: CtaArt;
  /** Shown on the web only (copy-lint R10, plan F7.2): app builds skip the card. */
  webOnly: boolean;
}

const SHARED_CTAS: Record<string, CtaDef> = {
  heist: {
    key: "heist",
    href: "/heist",
    eyebrow: "Free · no sign-up",
    title: "Play Catnip Heist",
    // The treat's size and daily budget live on /heist (C-004, C-005), never printed here.
    body: "Guide two cats past Kibble Corp's guards, open the vault and free a captive cat. Win, tap, and Token Tails sends Pink Paw a small treat.",
    button: "Play Catnip Heist",
    // A real game screen with no dated text on it (the old title card said treats "open soon").
    art: { src: "/feed/heist-crew.webp", width: 1280, height: 720, alt: "Catnip Heist's Pick your crew screen: a grid of pixel cats, with two picked for the heist" },
    webOnly: false,
  },
  game: {
    key: "game",
    href: "/game",
    // The game shell needs a full page load (Phaser).
    hardLink: true,
    eyebrow: "Free · no sign-up",
    title: "Meet your cat",
    body: "A cozy pixel cat game in your browser: your Home, the Shelter, Purrsuit and Paw Match. No sign-up needed to start.",
    button: "Play now",
    art: { src: "/logo/og-v2-1200x630.jpg", width: 1200, height: 630, alt: "A white pixel cat waves from a moonlit temple stage" },
    webOnly: false,
  },
  swordcat: {
    key: "swordcat",
    href: "/swordcat",
    eyebrow: "Free adventure",
    title: "Play Pink Paw Knight",
    body: "Save lost kittens with Clem, a tiny knight cat with a pink bow. The kittens you meet are Pink Paw's own cats from Kaunas.",
    button: "Play Pink Paw Knight",
    art: { src: "/landing/pinkpaw-knight-trailer-poster-v1.jpg", width: 1280, height: 720, alt: "Clem, a tiny knight cat with a pink bow, in a moonlit forest" },
    webOnly: false,
  },
  impact: {
    key: "impact",
    href: "/impact",
    eyebrow: "Dated and sourced",
    title: "See the impact",
    // The figures themselves stay on /impact (L-disbursed), read live there.
    body: "What Token Tails has sent to Pink Paw so far, with every figure dated and linked to where it comes from.",
    button: "Open the impact page",
    art: { src: "/feed/impact.webp", width: 1280, height: 720, alt: "The Token Tails impact page: every public number with its date, its status and where to check it" },
    webOnly: false,
  },
};

export const CTAS: Record<string, CtaDef> = { ...SHARED_CTAS, ...WEB_CTAS };

/**
 * The closing card when the body already showed the article's own `cta` card: the next of these that
 * this build can show and the body has not shown, so a reader never meets the same card twice.
 */
export const END_FALLBACK: Readonly<Record<string, readonly string[]>> = {
  heist: ["game", "swordcat"],
  game: ["heist", "swordcat"],
  swordcat: ["heist", "game"],
  badcat: ["game", "heist"],
  rave: ["payouts", "heist"],
  give: ["rave", "payouts", "heist"],
  payouts: ["rave", "give", "heist"],
  packs: ["game", "heist"],
  impact: ["rave", "heist"],
};

/** Giving and cat-care readers who came for a free game get the $1 rave next, not another game. */
const GIVING_FALLBACK: Readonly<Record<string, readonly string[]>> = { heist: ["rave", "game"] };

/** The `cta` key of an article's closing card (null: nothing this build can show). */
export function endCtaKey(primary: string, inline: readonly string[], category: string, isApp: boolean): string | null {
  if (!inline.includes(primary) && ctaFor(primary, isApp)) return primary;
  const order = (category === "giving" || category === "cats" ? GIVING_FALLBACK[primary] : undefined) ?? END_FALLBACK[primary] ?? [];
  return order.find((key) => !inline.includes(key) && ctaFor(key, isApp)) ?? (ctaFor(primary, isApp) ? primary : null);
}

/** The card for `key` in this build, or null (unknown, or web only in an app build). */
export function ctaFor(key: string, isApp: boolean): CtaDef | null {
  const def = CTAS[key];
  if (!def || (isApp && def.webOnly)) return null;
  return def;
}
