import { PawlegendsHost } from "@/components/pawlegends/PawlegendsHost";
import { lockPageZoom, PAWLEGENDS_VIEWPORT } from "@/components/pawlegends/noZoom";
import { installTabGuard } from "@/components/pawlegends/tabGuard";
import { PAWLEGENDS_PLAY_PATH } from "@/components/pawlegends/routes";
import { PAWLEGENDS_SUBTITLE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import Head from "next/head";
import { useEffect } from "react";

/**
 * `/play` meta (the game; `/` is the landing page, pages/index.tsx). Always `noindex` and out of the sitemap
 * (`next-sitemap.config.js`): search results point at the landing. LAUNCH.md a.8 step 1
 * lifts the landing's `noindex` only. "Seven-minute" is the one
 * length phrase, from the 2,000-seed balance gate median (LAUNCH.md c.6); the game's own meta uses it too.
 * The share card (launch finding PUB-06) is a 1200 x 630 match frame, `public/pawlegends/og.jpg`, so launch
 * and dare links preview the game.
 */
export const PAWLEGENDS_SEO = Object.freeze({
  // NO-TOKENTAILS.md: the share card and tab name Paw Legends, not the site
  siteName: PAWLEGENDS_TITLE,
  title: PAWLEGENDS_TITLE,
  description: `${PAWLEGENDS_SUBTITLE}. Seven-minute matches in your browser, no download.`,
  path: PAWLEGENDS_PLAY_PATH,
  image: Object.freeze({
    url: "/pawlegends/og.jpg",
    width: 1200,
    height: 630,
    alt: `${PAWLEGENDS_TITLE}: cat heroes swing at a dog pack by the bridge, mid-match.`,
  }),
});

export interface PawlegendsPlayPageProps {
  /** Where the game build is served (`flags.ts` `PAWLEGENDS_GAME_BASE`, `/pawlegends-game/`, by default). */
  gameBase?: string;
  /**
   * A hidden preview page (pages/preview/): a small corner badge with this text, and `noindex, nofollow` instead of
   * `/play`'s `noindex, follow`.
   */
  preview?: string;
}

/**
 * `/play` (POC.md §11.4): the Pawlegends three.js build, full-bleed in a same-origin iframe. Auth is `optional`: an
 * existing session is reused, none is created; the game only learns whether the player is signed in. The hidden
 * preview pages render the same page with another `gameBase`.
 */
export function PawlegendsPlayPage({ gameBase, preview }: PawlegendsPlayPageProps) {
  // No page zoom around the game iframe (components/pawlegends/noZoom.ts); restored when the page unmounts.
  useEffect(() => lockPageZoom(), []);
  // Tab is a game key, never focus traversal over the host page (components/pawlegends/tabGuard.ts).
  useEffect(() => installTabGuard(), []);
  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead {...PAWLEGENDS_SEO} noindex />
      <Head>
        {/* Same key as _app's tag, so next/head keeps this one on this page only. */}
        <meta name="viewport" content={PAWLEGENDS_VIEWPORT} key="viewport" />
        {/* Same key as SeoHead's robots tag: the later one wins, so a preview is noindex and nofollow. */}
        {preview ? <meta name="robots" content="noindex,nofollow" key="robots" /> : null}
      </Head>
      <PawlegendsHost gameBase={gameBase} />
      {preview ? (
        <div
          data-testid="pawlegends-preview-badge"
          className="pointer-events-none fixed bottom-2 left-2 z-[60] rounded bg-tt-night-950/80 px-2 py-1 font-sans text-[11px] font-bold text-tt-gold-400"
        >
          {preview}
        </div>
      ) : null}
    </FirebaseAuthProvider>
  );
}
