import { Game } from "@/components/game/Game";
import { trackLandingArrival } from "@/components/landing/landingCta";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { GameProvider } from "@/context/GameContext";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

/** `/game` meta (plan G14). The canonical is the bare path: `?ref=`, `?meet=` and `?from=` never reach it. */
export const GAME_SEO = Object.freeze({
  title: "Token Tails - Play to Save",
  description:
    "Play cozy cat games with your own pixel cat. No sign-up needed.",
  path: "/game",
});

/**
 * `landing_cta {from}` (Task 6b review #1): the landing CTAs link to `/game?from=landing_<cta>`,
 * and the event is sent here, once the game page has loaded, where analytics keeps running. `from`
 * is then dropped from the address bar (other params stay) once the router is ready: a
 * replaceState before hydration ends would be undone by Next's own query update.
 */
export function LandingArrival() {
  const router = useRouter();
  const sent = useRef(false);
  useEffect(() => {
    if (!router?.isReady || sent.current || router.query.from === undefined) return;
    sent.current = true;
    trackLandingArrival(window.location.search);
    const { from: _from, ...rest } = router.query;
    void _from;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false });
  }, [router]);
  return null;
}

export default function game() {
  return (
    <FirebaseAuthProvider authMode="guest">
      <SeoHead {...GAME_SEO} />
      <LandingArrival />
      <GameProvider>
        <Game />
      </GameProvider>
    </FirebaseAuthProvider>
  );
}
