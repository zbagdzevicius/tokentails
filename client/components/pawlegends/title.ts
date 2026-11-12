/**
 * The Pawlegends display name on tokentails.com (POC.md §2). The page meta, the host (iframe title,
 * loading and error lines), the PLAY picker card, the terms page and the tests all read these constants.
 * The name is a working title until the trademark search passes (GDD §1), so the page stays `noindex`.
 */
export const PAWLEGENDS_TITLE = "Pawlegends";
export const PAWLEGENDS_SUBTITLE = "3v3 cats vs dogs, you and your team against bots";

/**
 * The Pawlegends share card (NO-TOKENTAILS.md): every Pawlegends page uses it, so no page falls back to the site's
 * default card.
 */
export const PAWLEGENDS_OG_IMAGE = Object.freeze({
  url: "/pawlegends/og.jpg",
  width: 1200,
  height: 630,
  alt: `${PAWLEGENDS_TITLE}: cat heroes swing at a dog pack by the bridge, mid-match.`,
});
