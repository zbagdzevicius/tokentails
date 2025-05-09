import { PixelButton } from "@/components/shared/PixelButton";
import { Socials } from "@/layouts/Socials";
import { useEffect, useState } from "react";
import { Countdown } from "../shared/Countdown";

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
    <div className="flex items-center flex-col w-full h-full relative">
      <h1 className="md:mt-12 xl:mt-16 text-balance text-center font-primary uppercase z-0 tracking-tight rem:text-[80px] rem:leading-[60px] md:text-h1 lg:text-[142px] xl:text-[176px] 2xl:text-[210px] 3xl:text-[280px]">
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          YOU
        </span>{" "}
        CAN SAVE A{" CAT"}
      </h1>

      <div className="absolute bottom-20 m-auto justify-center w-[800px] xl:w-[920px] 3xl:w-[1200px] hidden md:flex">
        <span className="absolute left-0 mt-20 z-30">
          <Socials isVertical />
        </span>
        <img
          className="w-full h-[400px] xl:h-[450px] 3xl:h-[600px] z-10"
          src="devices/macbook.webp"
        />

        <video
          className="absolute w-[650px] xl:w-[750px] 3xl:w-[980px] top-2 bottom-4 object-cover h-auto"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/token-tails-trailer.mp4" />
        </video>
      </div>

      <div className="absolute bottom-20 m-auto justify-center w-[90%] md:hidden">
        <span className="absolute left-0 mt-20">
          <Socials isVertical />
        </span>
        <img
          className="w-full rem:h-[492px] z-10 relative"
          src="devices/iphone-trimmed.webp"
        />

        <video
          className="absolute w-full px-3 pt-1 rounded-t-[40px] top-2 bottom-0 object-cover h-auto z-0"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/token-tails-trailer-mobile.mp4" />
        </video>
      </div>

      <div className="w-full h-24 -mb-6 z-10 absolute bottom-16 md:bottom-20">
        <div className="slide">
          <div className="slide-track inverse">
            {[...cats, ...cats, ...cats].map((banner, index) => (
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
      </div>

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
