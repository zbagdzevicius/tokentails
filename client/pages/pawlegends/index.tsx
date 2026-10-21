import { pawlegendsEnabled, PAWLEGENDS_EXIT_PATH } from "@/components/pawlegends/flags";
import { PawlegendsHost } from "@/components/pawlegends/PawlegendsHost";
import { lockPageZoom, PAWLEGENDS_VIEWPORT } from "@/components/pawlegends/noZoom";
import { PAWLEGENDS_SUBTITLE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

/**
 * `/pawlegends` meta. `noindex` until the trademark search passes (POC.md §11.4); left out of the sitemap
 * (`client/next-sitemap.config.js`). LAUNCH.md a.8 step 1 lifts both in the same change. "Seven-minute" is the one
 * length phrase, from the 2,000-seed balance gate median (LAUNCH.md c.6); the game's own meta uses it too.
 * The share card (launch finding PUB-06) is a 1200 x 630 match frame, `public/pawlegends/og.jpg`, so launch
 * and dare links preview the game, not the generic Token Tails card.
 */
export const PAWLEGENDS_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE} - Token Tails`,
  description: `${PAWLEGENDS_SUBTITLE}. Seven-minute matches in your browser, no download.`,
  path: "/pawlegends",
  image: Object.freeze({
    url: "/pawlegends/og.jpg",
    width: 1200,
    height: 630,
    alt: `${PAWLEGENDS_TITLE}: cat heroes swing at a dog pack by the bridge, mid-match.`,
  }),
});

/** Kill switch on: a client-side redirect to the lobby (no `getServerSideProps`, so the app export works). */
const BackToGame = () => {
  const router = useRouter();
  useEffect(() => {
    void router.replace(PAWLEGENDS_EXIT_PATH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/**
 * `/pawlegends` (POC.md §11.4): the Pawlegends three.js build in the Token Tails shell, a copy of `/swordcat`.
 * On by default; `NEXT_PUBLIC_PAWLEGENDS=0` (or false/no/off) is the kill switch. Auth is `optional`: an
 * existing session is reused, none is created; the game only learns whether the player is signed in.
 */
export default function PawlegendsPage() {
  const enabled = pawlegendsEnabled();
  // No page zoom around the game iframe (components/pawlegends/noZoom.ts); restored when the page unmounts.
  useEffect(() => (enabled ? lockPageZoom() : undefined), [enabled]);
  if (!enabled) return <BackToGame />;
  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead {...PAWLEGENDS_SEO} noindex />
      <Head>
        {/* Same key as _app's tag, so next/head keeps this one on this page only. */}
        <meta name="viewport" content={PAWLEGENDS_VIEWPORT} key="viewport" />
      </Head>
      <PawlegendsHost />
    </FirebaseAuthProvider>
  );
}
