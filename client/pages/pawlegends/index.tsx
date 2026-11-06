import { isAppBuild } from "@/components/claims/build";
import { pawlegendsEnabled, PAWLEGENDS_EXIT_PATH } from "@/components/pawlegends/flags";
import { LANDING_FONT } from "@/components/pawlegends/landing/markup";
import { PawlegendsLanding } from "@/components/pawlegends/landing/PawlegendsLanding";
import { liveRoster } from "@/components/pawlegends/landing/roster";
import { PAWLEGENDS_LANDING_PATH, PAWLEGENDS_PLAY_PATH, wantsGame } from "@/components/pawlegends/routes";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

/**
 * `/pawlegends` meta: the landing page. `noindex` until the trademark search passes (POC.md §11.4) and left out of
 * the sitemap (`client/next-sitemap.config.js`); LAUNCH.md a.8 step 1 lifts both for this page only (the game at
 * `/pawlegends/play` and the terms stay out). Same share card as the game (`public/pawlegends/og.jpg`).
 */
export const PAWLEGENDS_LANDING_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE}: Cats vs Dogs - Token Tails`,
  description: `${PAWLEGENDS_TITLE} is a free 3v3 cats vs dogs game by Token Tails. ${liveRoster().length} heroes; play solo or with up to two friends against bots, right in your browser on desktop or phone.`,
  path: PAWLEGENDS_LANDING_PATH,
  image: Object.freeze({
    url: "/pawlegends/og.jpg",
    width: 1200,
    height: 630,
    alt: `${PAWLEGENDS_TITLE}: cat heroes swing at a dog pack by the bridge, mid-match.`,
  }),
});

/**
 * `/pawlegends`: the landing page; the game is `/pawlegends/play`. A URL that carries a game key (`?party=`,
 * `?dare=`, `?checkout=`, ...; components/pawlegends/routes.ts) is redirected there by next.config.js; this page
 * repeats the check in the browser (app export, client-side navigation). The app never shows the landing: it goes
 * straight to the game. The kill switch sends players to `/game`, as the game page does.
 */
export default function PawlegendsLandingPage() {
  const router = useRouter();
  const enabled = pawlegendsEnabled();
  const toGame = enabled && (isAppBuild() || (router.isReady && wantsGame(router.query)));
  useEffect(() => {
    if (!enabled) {
      void router.replace(PAWLEGENDS_EXIT_PATH);
      return;
    }
    if (toGame) void router.replace({ pathname: PAWLEGENDS_PLAY_PATH, query: router.query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, toGame]);
  if (!enabled || toGame) return null;
  return (
    <>
      <SeoHead {...PAWLEGENDS_LANDING_SEO} noindex />
      <Head>
        <link rel="preload" href={LANDING_FONT} as="font" type="font/woff2" crossOrigin="anonymous" key="pll-fredoka" />
      </Head>
      <PawlegendsLanding />
    </>
  );
}
