"use client";

import { INITIAL_PARTNERSHIPS, PixelGlobe } from "@/components/globe/Globe";
import { ProofSection } from "@/components/landing/ProofSection";
import { Fireflies } from "@/components/shared/Fireflies";
import { PixelButton } from "@/components/shared/PixelButton";
import { TailsCard } from "@/components/tailsCard/TailsCard";
import { cdnFile, isMobile } from "@/constants/utils";
import { Socials } from "@/layouts/Socials";
import Head from "next/head";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mobile = isMobile();
      // Device detection must run after mount to keep SSR output hydration-safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDesktop(!mobile);

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
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
        <meta
          property="og:title"
          content="Token Tails - Play to Save"
          key="title"
        />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <meta
          property="og:description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <meta
          property="og:url"
          content={`${process.env.NEXT_PUBLIC_DOMAIN}/`}
        />
        <link rel="canonical" href={`${process.env.NEXT_PUBLIC_DOMAIN}/`} />
        <link rel="shortcut icon" href={cdnFile("logo/coin.webp")} />
      </Head>
      <div className="relative">
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
          <span className="absolute max-sm:top-32 sm:top-2 z-40 max-sm:left-1/2 max-sm:-translate-x-1/2 sm:right-2">
            <Socials />
          </span>

          <div className="absolute z-50 bottom-32 sm:bottom-12 lg:bottom-14 xl:bottom-16 2xl:bottom-20 3xl:bottom-32 left-1/2 -translate-x-1/2 flex flex-col sm:flex-row justify-center items-center">
            {(isDesktop || isIOS) && (
              <a
                target="_blank"
                href="https://apps.apple.com/app/id6745582489"
                className="mr-24 max-md:mr-8 max-sm:mr-0 max-sm:mb-2 max-sm:order-1"
              >
                <img
                  src={cdnFile("icons/social/app-store.webp")}
                  className="w-48 hover:scale-110 min-w-48 max-lg:w-32 max-lg:min-w-32 transition-all duration-300"
                />
              </a>
            )}
            {/* Plain anchor on purpose: the game shell needs a full page load. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/game" className="max-sm:order-2">
              <PixelButton text="PLAY" isBig subtext="GAME" />
            </a>
            {(isDesktop || isAndroid) && (
              <a
                target="_blank"
                href="https://play.google.com/store/apps/details?id=com.tokentails.app"
                className="ml-24 max-md:ml-8 max-sm:ml-0 max-sm:mb-2 max-sm:order-1"
              >
                <img
                  src={cdnFile("icons/social/play-store.webp")}
                  className="w-48 min-w-48 hover:scale-110 transition-all duration-300 max-lg:w-32 max-lg:min-w-32"
                />
              </a>
            )}
          </div>
        </section>


        <ProofSection />

        <section className="relative min-h-screen w-full glow-box">
          <img
            src={cdnFile("landing/globe.webp")}
            className="w-full h-full object-cover   inset-0 absolute"
          />
          <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center z-30 overflow-hidden">
            <PixelGlobe />
          </div>
          {/* Left side: 12 COUNTRIES ONBOARDED */}
          <div className="absolute md:pt-20 left-4 lg:left-16 md:top-1/2 md:-translate-y-1/2 z-40 flex flex-col items-start">
            <span className="lg:text-[200px] text-[100px] font-bold text-yellow-300 drop-shadow-lg font-primary glow lg:-mb-4">
              {INITIAL_PARTNERSHIPS.length}
            </span>
            <span className="text-p3 md:text-p1 lg:text-[68px] uppercase font-semibold tracking-wide font-primary -mt-8 md:-mt-12 text-yellow-50 opacity-90">
              COUNTRIES
            </span>
          </div>
          {/* Right side: 800+ cats saved */}
          <div className="absolute pb-64 right-4 lg:right-16 md:top-1/2 md:-translate-y-1/2 z-40 flex flex-col items-end ">
            <span className="lg:text-[200px] text-[100px] font-bold text-yellow-300 drop-shadow-lg font-primary glow lg:-mb-4">
              800+
            </span>
            <span className="text-p3 md:text-p1 lg:text-[68px] uppercase font-semibold tracking-wide font-primary -mt-8 md:-mt-12 text-yellow-50 opacity-90">
              strays saved
            </span>
          </div>
          {/* Bottom: OWN REAL-WORLD IMPACT */}
          <div className="absolute bottom-8 md:bottom-12 lg:bottom-16 left-1/2 -translate-x-1/2 z-40">
            <span className="text-p1 md:text-h4 xl:text-h1 2xl:text-[142px] 3xl:text-[196px] font-bold text- uppercase drop-shadow-lg font-primary whitespace-nowrap text-white">
              OWN <span className="glow text-yellow-300">REAL-WORLD</span>{" "}
              <span className="text-yellow-300">IMPACT</span>
            </span>
          </div>
          <Fireflies />
        </section>

        {/* SAMPLE CARD: closing CTA into the game */}
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

          <div className="relative z-30 px-4 md:px-8 lg:px-16 py-12 md:py-16 lg:py-24 flex justify-center">
            {/* Plain anchor on purpose: the game shell needs a full page load. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/game"
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
      </div>
    </>
  );
}
