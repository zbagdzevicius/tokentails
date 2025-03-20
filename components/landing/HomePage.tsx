import { PixelButton } from "@/components/shared/PixelButton";
import { Socials } from "@/layouts/Socials";
import { useEffect, useState } from "react";

interface bannerProps {
  image: string;
  title: string;
}

const sponsorImage = [
  "/images/sponsor/microsoft-for-startups.webp",
  "/images/sponsor/social-shifters.webp",
  "/images/sponsor/diamante.webp",
  "/images/sponsor/gametech.png",
  "/images/sponsor/eu.webp",
  "/images/sponsor/stellar.webp",
  "/images/sponsor/immutable.webp",
  "/images/sponsor/brinc.webp",
  "/images/sponsor/blockgames.webp",
  "/images/sponsor/skale.webp",
  "/images/sponsor/onepiece.png",
  "/images/sponsor/xdc.webp",
  "/images/sponsor/buidlers-tribe.webp",
  "/images/sponsor/crossfi.webp",
  "/images/sponsor/digitalocean.webp",
  "/images/sponsor/earn-alliance.webp",
  "/images/sponsor/unicorn-ultra.webp",
  "/images/sponsor/iexec.webp",
  "/images/sponsor/h7.webp",
  "/images/sponsor/mexc.webp",
];

const cats: bannerProps[] = [
  {
    image: "/cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/grey/Playing-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-lamiendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/grey/Running-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-corriendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-lamiendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/grey/Walking-Clothed-Grey.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-corriendo-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/yellow/Jump-Hat-Yellow.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-caminando-ropa.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Jump-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Licking-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Loaf-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Playing-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/black/Sitting-Hat-Black.gif",
    title: "Play logo",
  },
  {
    image: "/cats/yellow/Idle-Hat-Yellow.gif",
    title: "Play logo",
  },
  {
    image: "/cats/pinkie/pink-respirando-ropa.gif",
    title: "Play logo",
  },
];
export const HomePage = () => {
  return (
    <div className="mt-14 md:mt-4 flex justify-center items-center flex-col w-full">
      <h1 className="text-center font-primary uppercase tracking-tight text-h3 -mt-20 md:text-h1 xl:text-[200px] whitespace-nowrap -mb-8 md:-mb-32">
        PLAY TO SAVE CATS
      </h1>
      <div className="relative z-20 w-full flex items-center justify-center max-w-[100vw] overflow-hidden">
        <div className="absolute left-0 right-0 top-0 bottom-0 slider transform z-10 rotate-12">
          <div className="slide-track inverse">
            {cats.map((banner, index) => (
              <div key={index} className="slide">
                <img
                  draggable={false}
                  src={banner.image}
                  alt={banner.title}
                  width={100}
                  height={100}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 h-fit flex items-center justify-center">
          <div className="relative pt-2 md:pt-20 md:px-8 flex items-center justify-center">
            <div className="relative w-full hover:brightness-110">
              <img
                draggable={false}
                src="/images/home-page/tamagotchi.webp"
                alt="Cats Background"
                className="rem:w-[340px] sm:rem:w-[600px] sm:rem:pl-[50px] pt-1 lg:pb-5 rem:h-[400px] sm:rem:h-[640px] relative z-[1] block"
              />
              <video
                className="absolute inset-0 rounded-md -skew-x-[2deg] sm:-skew-x-[1deg] -translate-x-4 sm:translate-x-0 translate-y-2 sm:translate-y-0 skew-y-[6deg] rem:w-[172px] sm:rem:w-[272px] rem:h-[172px] sm:rem:h-[272px] overflow-hidden m-auto z-[2]"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/trailer-2024-09.mp4" />
              </video>
              <img
                draggable={false}
                src="/images/home-page/rocket-cat.webp"
                alt="Cat Hero"
                className="absolute top-16 md:top-5 -right-2 md:-right-8 w-16 -rotate-45 md:rotate-0 md:w-36 overflow-hidden z-0"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-16 md:gap-20 items-center mb-4 -mt-24 md:-mt-40 -skew-x-[1deg] md:-skew-x-[1deg] skew-y-[5deg] relative z-30 ">
        <a href="/game" className="relative">
          <img
            draggable={false}
            src="/logo/coin.webp"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -left-6"
          />
          <img
            draggable={false}
            src="/logo/chest.webp"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -right-6"
          />
          <span className="relative z-10">
            <PixelButton text="PLAY" isBig subtext="HERE"></PixelButton>
          </span>
        </a>

        <a
          href="https://t.me/CatbassadorsBot?start=start"
          target="_blank"
          className="font-secondary relative"
        >
          <img
            draggable={false}
            src="/logo/boss-coin.png"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -right-6"
          />
          <img
            draggable={false}
            src="/logo/level.png"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -left-6"
          />
          <span className="relative z-10">
            <PixelButton text="PLAY ON" subtext="TG" isBig></PixelButton>
          </span>
        </a>
      </div>
      <span className="relative z-30 -skew-x-[1deg] md:-skew-x-[1deg] skew-y-[5deg]">
        <Socials />
      </span>

      <div className="slider absolute z-10 bottom-0 bg-gradient-to-r from-blue-300 to-purple-300">
        <div className="slide-track">
          {sponsorImage.map((sponsor, index) => (
            <div key={index} className="slide flex items-center">
              <img draggable={false} className="h-10 w-auto" src={sponsor} />
            </div>
          ))}
        </div>
        <div className="absolute left-4 -top-3 px-4 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full font-secondary">
          PARTNERS
        </div>
        <div className="absolute right-4 -top-3 px-4 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full font-secondary">
          PARTNERS
        </div>
      </div>
    </div>
  );
};
