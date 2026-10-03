"use client";

import { Footer } from "@/layouts/Footer";
import { ImpactResult, loadImpactForPage } from "@/api/impact-api";
import { isAppBuild } from "@/components/claims/build";
import { SectionBoundary } from "@/components/errors/SectionBoundary";
import { HeistPill } from "@/components/landing/HeistPill";
import { ImpactGlobeSection } from "@/components/landing/ImpactGlobeSection";
import { landingCtaHref } from "@/components/landing/landingCta";
import { ProofSection } from "@/components/landing/ProofSection";
import {
  type CrewCtaState,
  TeamSection,
} from "@/components/landing/TeamSection";
import { SeoHead } from "@/components/seo/SeoHead";
import { GameplayReel, hasReelClips } from "@/components/reel/GameplayReel";
import { PixelButton } from "@/components/shared/PixelButton";
import { TailsCard } from "@/components/tailsCard/TailsCard";
import { cdnFile, isMobile } from "@/constants/utils";
import { hasSessionHint } from "@/context/auth/sessionHint";
import { useImpact } from "@/hooks/useImpact";
import { Socials } from "@/layouts/Socials";
import type { GetStaticProps } from "next";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export interface HomePageProps {
  /** The impact snapshot (CDN, then API, then the bundled baseline); null if none is usable. */
  impact?: ImpactResult | null;
}

/**
 * The player read for the crew CTA label (plan G3 tie-back). Browser only: Firebase stays out of the
 * server HTML and the first load, which always render the signed-out labels.
 */
const LandingPlayer = dynamic(
  () => import("@/components/landing/LandingPlayer"),
  { ssr: false }
);

/** Landing meta (plan G14): SeoHead with the 1200x630 card and the root canonical. */
export const LANDING_SEO = Object.freeze({
  title: "Token Tails - Play to Save",
  description: "Cozy pixel cat games: meet your cat and play, no sign-up needed.",
  path: "/",
});

/** Seconds between ISR rebuilds of the landing on web (plan 2.13 row 30). */
export const LANDING_REVALIDATE_SECONDS = 300;

/**
 * One fetch for the whole landing (plan 2.13 row 30): the CDN impact.json, with the API and the
 * bundled baseline as fallbacks. App builds (static export, no ISR) read the committed baseline.
 */
export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  const isApp = !!process.env.NEXT_PUBLIC_IS_APP;
  const impact = await loadImpactForPage(isApp);
  return isApp
    ? { props: { impact } }
    : { props: { impact }, revalidate: LANDING_REVALIDATE_SECONDS };
};

export default function HomePage({ impact: initial = null }: HomePageProps) {
  // Web renders the ISR data as is; app builds refresh their baked snapshot when online.
  // getStaticProps always passes a snapshot (the baseline at worst), so the web never fetches here.
  const { impact } = useImpact({ initial, refetch: isAppBuild() });
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [player, setPlayer] = useState<CrewCtaState>({ signedIn: false });
  // Firebase loads only for a browser that has had a session (read after mount: hydration-safe).
  const [readPlayer, setReadPlayer] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mobile = isMobile();
      // Device detection must run after mount to keep SSR output hydration-safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDesktop(!mobile);
      setReadPlayer(hasSessionHint());

      if (mobile) {
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
        const isAndroidDevice = /android/.test(userAgent);
        setIsIOS(isIOSDevice);
        setIsAndroid(isAndroidDevice);
      }
    }
  }, []);
  return (
    <>
      <SeoHead {...LANDING_SEO} />
      {/* It only picks the crew CTA label: if Firebase fails to load, the signed-out label stays. */}
      {readPlayer && (
        <SectionBoundary name="player">
          <LandingPlayer onChange={setPlayer} />
        </SectionBoundary>
      )}
      <div className="relative bg-tt-night-900">
        <SectionBoundary name="hero" fallback={<HeroFallback />}>
          <section className="relative h-screen w-full">
            <span className="absolute inset-0 z-20 animate-appear">
              <img src={cdnFile("landing/hero-top.webp")} className="w-full " />
            </span>
            <img
              src={cdnFile("landing/hero-bg.webp")}
              className="w-full h-full pixelated object-cover absolute inset-0 animate-hoverSlow"
            />
            <img
              src={cdnFile("landing/electric.gif")}
              className="w-[1000px] md:w-[500px] pixelated jusitfy-center absolute top-0 left-1/2 -translate-x-1/2 opacity-50 rotate-90 hue-rotate-180"
            />
            <img
              src={cdnFile("landing/hero-cat-with-ground.webp")}
              className="w-full h-full pixelated object-cover absolute inset-0 animate-opacity"
            />
            {/* Fades into the proof section's matching top fade, so the two backgrounds meet cleanly. */}
            <div className="absolute inset-x-0 bottom-0 z-[45] h-32 md:h-48 bg-gradient-to-b from-transparent to-tt-night-900 pointer-events-none" />
            <span className="absolute max-sm:top-32 sm:top-2 z-40 max-sm:left-1/2 max-sm:-translate-x-1/2 sm:right-2">
              <Socials />
            </span>

            {/* Phones: PLAY GAME first, the store badge under it, so neither sits on the hero cat. */}
            <div className="absolute z-50 bottom-16 sm:bottom-12 lg:bottom-14 xl:bottom-16 2xl:bottom-20 3xl:bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 md:gap-4 w-max max-w-[calc(100vw-2rem)]">
              <div className="flex flex-col sm:flex-row justify-center items-center">
                {(isDesktop || isIOS) && (
                  <a
                    target="_blank"
                    href="https://apps.apple.com/app/id6745582489"
                    className="mr-24 max-md:mr-8 max-sm:mr-0 max-sm:mt-3 max-sm:order-3"
                  >
                    <img
                      src={cdnFile("icons/social/app-store.webp")}
                      className="w-48 hover:scale-110 min-w-48 max-lg:w-32 max-lg:min-w-32 transition-all duration-300"
                    />
                  </a>
                )}
                {/* Plain anchor on purpose: the game shell needs a full page load. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href={landingCtaHref("hero")}
                  aria-label="PLAY GAME"
                  className="max-sm:order-2"
                  data-testid="hero-cta"
                >
                  <PixelButton as="span" text="PLAY" size="lg" subtext="GAME" />
                </a>
                {(isDesktop || isAndroid) && (
                  <a
                    target="_blank"
                    href="https://play.google.com/store/apps/details?id=com.tokentails.app"
                    className="ml-24 max-md:ml-8 max-sm:ml-0 max-sm:mt-3 max-sm:order-3"
                  >
                    <img
                      src={cdnFile("icons/social/play-store.webp")}
                      className="w-48 min-w-48 hover:scale-110 transition-all duration-300 max-lg:w-32 max-lg:min-w-32"
                    />
                  </a>
                )}
              </div>
              <HeistPill />
            </div>
          </section>
        </SectionBoundary>

        {/* G7 landing reel: mounted only once the capture driver has written clips to the manifest. */}
        {hasReelClips && (
          <SectionBoundary name="reel">
            <GameplayReel />
          </SectionBoundary>
        )}

        <SectionBoundary name="proof">
          <ProofSection impact={impact} />
        </SectionBoundary>

        <SectionBoundary name="globe">
          <ImpactGlobeSection impact={impact} />
        </SectionBoundary>

        {/* SAMPLE CARD: closing CTA into the game */}
        <SectionBoundary name="rescue-hub">
          <section
            className="relative w-full overflow-hidden"
            data-testid="rescue-hub"
          >
            <img
              src={cdnFile("landing/card-bg.webp")}
              className="w-full h-full object-cover pixelated inset-0 absolute"
              alt=""
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/55" />
            <div className="absolute inset-x-0 top-0 h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent pointer-events-none" />
            {/* Fades into the team section's matching top fade, so the two backgrounds meet cleanly. */}
            <div className="absolute inset-x-0 bottom-0 h-32 md:h-48 bg-gradient-to-b from-transparent to-tt-night-900 pointer-events-none" />

            <div className="relative z-30 px-4 md:px-8 lg:px-16 py-12 md:py-16 lg:py-24 flex justify-center">
              {/* Plain anchor on purpose: the game shell needs a full page load. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href={landingCtaHref("sample_card")}
                aria-label="Play the Token Tails game"
                className="flex justify-center transition-transform duration-300 hover:scale-[1.03]"
              >
                <TailsCard
                  cardStyle={{
                    width: "clamp(260px, 30vw, 400px)",
                  }}
                />
              </a>
            </div>
          </section>
        </SectionBoundary>

        <SectionBoundary name="team">
          <TeamSection cta={player} />
        </SectionBoundary>

        {/* The same night footer as /impact and the payout pages. */}
        <Footer tone="night" />
      </div>
    </>
  );
}

/** Shown if the hero crashes: the page keeps one way into the game. */
const HeroFallback = () => (
  <section className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 bg-tt-night-900 px-4 text-center">
    <p className="font-primary text-h5 uppercase text-tt-cream">
      Your cat awaits
    </p>
    {/* Plain anchor on purpose: the game shell needs a full page load. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a href={landingCtaHref("hero_fallback")}>
      <PixelButton as="span" text="PLAY" size="lg" subtext="GAME" />
    </a>
  </section>
);
