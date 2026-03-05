"use client";

import { INITIAL_PARTNERSHIPS, PixelGlobe } from "@/components/globe/Globe";
import { Fireflies } from "@/components/shared/Fireflies";
import { PixelButton } from "@/components/shared/PixelButton";
import { TailsCard } from "@/components/tailsCard/TailsCard";
import { cdnFile, isMobile } from "@/constants/utils";
import { Socials } from "@/layouts/Socials";
import Head from "next/head";
import { useEffect, useState } from "react";

const CANVAS_VIDEO_URL =
  "https://tokentails.fra1.cdn.digitaloceanspaces.com/pet.mp4";

export default function newPage() {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mobile = isMobile();
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
            <a href="game" className="max-sm:order-2">
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

        {/* CTA SECTION */}
        <section className="relative min-h-screen w-full overflow-hidden">
          <img
            src={cdnFile("landing/card-bg.webp")}
            className="w-full h-full object-cover pixelated inset-0 absolute"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/55" />

          <div className="relative z-30 px-4 md:px-8 lg:px-16 py-10 md:py-16 lg:py-20">
            <div className="max-w-[1400px] mx-auto">
              <div className="rounded-2xl border-4 border-yellow-300/70 bg-black/35 backdrop-blur-[2px] p-4 md:p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_auto] items-center gap-4 md:gap-6">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-xl border-2 border-yellow-300 bg-yellow-300/20 px-3 py-1 font-primary text-p6 md:text-p5 text-yellow-100 uppercase tracking-wide">
                      <img
                        src={cdnFile("icons/check.webp")}
                        alt="mission icon"
                        className="h-4 w-4 object-contain"
                      />
                      Rescue Mission Hub
                    </div>
                    <div className="mt-2">
                      <span className="text-p2 md:text-h5 xl:text-h2 2xl:text-[120px] font-bold uppercase drop-shadow-lg font-primary text-white leading-none">
                        LEGENDS <span className="glow text-yellow-300">NEED</span>{" "}
                        <span className="text-yellow-300">HEROES</span>
                      </span>
                    </div>
                    <p className="mt-2 md:mt-3 text-p5 md:text-p4 text-yellow-50/90 max-w-2xl">
                      Collect cards, immortalize real pets, and convert play
                      into real-world shelter impact.
                    </p>
                  </div>
                  <img
                    src={cdnFile("tail/cat-promo.webp")}
                    className="w-28 md:w-36 lg:w-48 justify-self-center lg:justify-self-end drop-shadow-[0_8px_0_rgba(0,0,0,0.25)]"
                    alt="Token Tails mascot"
                  />
                </div>

                <div className="mt-5 md:mt-7 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-stretch">
                  <div className="rounded-2xl border-4 border-yellow-300 bg-gradient-to-b from-yellow-200/95 to-orange-200/95 p-4 md:p-5 h-full flex flex-col">
                    <h2 className="text-p2 md:text-h5 font-primary text-yellow-900 uppercase leading-none">
                      COLLECT REAL IMPACT
                    </h2>
                    <p className="mt-2 text-p5 md:text-p4 text-yellow-900/90 max-w-lg">
                      Every pack expands your collection and strengthens
                      progression rewards tied to rescue outcomes.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 font-primary text-p5 text-yellow-900">
                      <span className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-2 py-1">
                        + More collectibles
                      </span>
                      <span className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-2 py-1">
                        + Better unlock paths
                      </span>
                    </div>
                    <div className="mt-4">
                      <PixelButton
                        text="BUY PACKS"
                        onClick={() => {
                          window.location.assign("/packs");
                        }}
                      />
                    </div>
                    <div className="mt-1 flex-1 flex items-end justify-center lg:justify-start min-h-[210px] md:min-h-[240px]">
                      <TailsCard
                        cardStyle={{
                          width: "clamp(260px, 31vw, 390px)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border-4 border-yellow-300 bg-gradient-to-b from-pink-200/95 to-yellow-200/95 p-4 md:p-5 h-full flex flex-col">
                    <h2 className="text-p2 md:text-h5 font-primary text-yellow-900 uppercase leading-none">
                      IMMORTALIZE YOUR PET
                    </h2>
                    <p className="mt-2 text-p5 md:text-p4 text-yellow-900/90 max-w-lg">
                      Turn your real pet into premium portrait art and bring it
                      into the Token Tails universe.
                    </p>
                    <div className="mt-4">
                      <PixelButton
                        text="ORDER PET PORTRAIT"
                        onClick={() => {
                          window.location.assign("/portrait");
                        }}
                      />
                    </div>
                    <div className="mt-3 flex-1 flex items-end min-h-[210px] md:min-h-[240px]">
                      <div className="grid grid-cols-[1.15fr_1fr] gap-2.5 md:gap-3 w-full max-w-[520px] mx-auto lg:mx-0">
                        <div className="rounded-md overflow-hidden border-2 border-yellow-900 shadow-[0_6px_0_rgba(120,53,15,0.25)] bg-black">
                          <video
                            src={CANVAS_VIDEO_URL}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            poster={cdnFile("portrait/commander-2.webp")}
                            className="w-full h-full object-cover aspect-[4/5]"
                          />
                        </div>
                        <div className="grid grid-rows-2 gap-2.5 md:gap-3">
                          <div className="rounded-md overflow-hidden border-2 border-yellow-900 shadow-[0_6px_0_rgba(120,53,15,0.2)]">
                            <img
                              src={cdnFile("portrait/monarch.webp")}
                              alt="Royal pet portrait"
                              className="w-full h-full object-cover aspect-[4/5]"
                            />
                          </div>
                          <div className="rounded-md overflow-hidden border-2 border-yellow-900 shadow-[0_6px_0_rgba(120,53,15,0.2)]">
                            <img
                              src={cdnFile("portrait/highness.webp")}
                              alt="Royal cat portrait"
                              className="w-full h-full object-cover aspect-[4/5]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 md:mt-6 rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-300/95 via-orange-300/95 to-pink-300/95 px-4 py-3 text-center">
                  <span className="text-p2 md:text-h5 xl:text-h3 font-bold uppercase font-primary text-yellow-900 leading-none">
                    CATS <span className="glow text-white">NEED</span> YOU
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

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
      </div>
    </>
  );
}
