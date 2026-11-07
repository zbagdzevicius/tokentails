import { isAppBuild } from "@/components/claims/build";
import { pawlegendsEnabled, PAWLEGENDS_EXIT_PATH } from "@/components/pawlegends/flags";
import { LegendsLanding } from "@/components/pawlegends/legends/LegendsLanding";
import { LEGENDS_FACTS } from "@/components/pawlegends/legends/facts";
import { LEGENDS_FONT } from "@/components/pawlegends/legends/markup";
import { countWord, liveRoster } from "@/components/pawlegends/landing/roster";
import { PAWLEGENDS_LEGENDS_PATH, PAWLEGENDS_PLAY_PATH, wantsGame } from "@/components/pawlegends/routes";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

const T = LEGENDS_FACTS.teamSize;

/**
 * `/legends` meta: the landing A/B arm B (components/pawlegends/landingVariant.ts). og:url is `/legends` itself, so a
 * shared `/legends` post sends its clicks to arm B, not to arm A. Like `/pawlegends` it stays `noindex` until the
 * trademark search passes (SeoHead then sends no canonical, and two noindex pages cannot split SEO), and it is never in
 * the sitemap (`client/next-sitemap.config.js`). Same share card as `/pawlegends` (`public/pawlegends/og.jpg`).
 */
export const LEGENDS_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE}: Cats vs Dogs - Token Tails`,
  description: `${PAWLEGENDS_TITLE} is a free ${T}v${T} cats vs dogs game by Token Tails. ${liveRoster().length} heroes; push the lanes solo or with up to ${countWord(LEGENDS_FACTS.partyMax - 1).toLowerCase()} friends against bots, right in your browser on desktop or phone.`,
  path: PAWLEGENDS_LEGENDS_PATH,
  image: Object.freeze({
    url: "/pawlegends/og.jpg",
    width: 1200,
    height: 630,
    alt: `${PAWLEGENDS_TITLE}: cat heroes swing at a dog pack by the bridge, mid-match.`,
  }),
});

/**
 * `/legends`: the scroll-lane-map landing; its play buttons go to `/pawlegends/play` with `lv=B`. It behaves like
 * `/pawlegends` otherwise: a URL with a game key goes on to the game (next.config.js does it on the server, this page
 * repeats it in the browser), the app goes straight to the game, and the kill switch sends players to `/game`.
 */
export default function LegendsLandingPage() {
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
      <SeoHead {...LEGENDS_SEO} noindex />
      <Head>
        <link rel="preload" href={LEGENDS_FONT} as="font" type="font/woff2" crossOrigin="anonymous" key="pll-fredoka" />
      </Head>
      <LegendsLanding />
    </>
  );
}
