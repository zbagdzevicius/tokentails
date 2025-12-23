import { PixelGlobe } from "@/components/globe/Globe";
import { Fireflies } from "@/components/shared/Fireflies";
import { PixelButton } from "@/components/shared/PixelButton";
import { Socials } from "@/layouts/Socials";

export default function newPage() {
  return (
    <div className="relative">
      <section className="sticky top-0 h-screen w-screen">
        <span className="absolute inset-0 z-20 animate-appear">
          <img src="/landing/hero-top.webp" className="w-full " />
        </span>
        <img
          src="/landing/hero-bg.webp"
          className="w-full h-full pixelated object-cover absolute inset-0 animate-hoverSlow"
        />
        <img
          src="/landing/hero-grounds.webp"
          className="w-full h-full pixelated object-cover absolute inset-0"
        />
        <img
          src="/landing/electric.gif"
          className="w-[1000px] md:w-[500px] pixelated jusitfy-center absolute top-0 left-1/2 -translate-x-1/2 opacity-50 rotate-90 hue-rotate-180"
        />
        <img
          src="/landing/hero-cat.webp"
          className="w-full h-full pixelated object-cover absolute inset-0 animate-appear brightness-75"
        />
        <span className="absolute max-sm:bottom-2 sm:top-2 z-40 max-sm:left-1/2 max-sm:-translate-x-1/2 sm:right-2">
          <Socials />
        </span>

        <div className="absolute z-50 bottom-16 sm:bottom-12 lg:bottom-14 xl:bottom-16 2xl:bottom-20 3xl:bottom-32 left-1/2 -translate-x-1/2 animate-appear flex flex-col sm:flex-row justify-center items-center">
          <div className="mr-24 max-md:mr-8 max-sm:mr-0 max-sm:mb-2">
            <img
              src="/icons/social/app-store.webp"
              className="w-48 hover:scale-110 min-w-48 max-lg:w-32 max-lg:min-w-32 transition-all duration-300"
            />
          </div>
          <a href="/game">
            <PixelButton text="PLAY" isBig subtext="GAME" />
          </a>
          <div className="ml-24 max-md:ml-8 max-sm:ml-0 max-sm:mt-2">
            <img
              src="/icons/social/play-store.webp"
              className="w-48 min-w-48 hover:scale-110 transition-all duration-300 max-lg:w-32 max-lg:min-w-32"
            />
          </div>
        </div>
      </section>

      <section className="sticky top-0 h-screen w-screen glow-box">
        <img
          src="/landing/sky-3.webp"
          className="w-full h-full object-cover pixelated inset-0 absolute"
        />
        <img
          src="/landing/card.png"
          className="w-full object-cover inset-0 absolute"
        />
      </section>

      <section className="sticky top-0 h-screen w-screen glow-box">
        {/* <img
          src="/landing/sky-1.png"
          className="w-full h-full object-cover pixelated"
        /> */}
        <img
          src="/landing/globe.png"
          className="w-full h-full object-cover   inset-0 absolute"
        />
        <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center z-30">
          <PixelGlobe />
        </div>
        {/* Left side: 12 COUNTRIES ONBOARDED */}
        <div className="absolute pt-20 left-4 lg:left-16 top-1/2 -translate-y-1/2 z-40 flex flex-col items-start">
          <span className="lg:text-[200px] text-[100px] font-bold text-yellow-300 drop-shadow-lg font-primary glow lg:-mb-4">
            12
          </span>
          <span className="text-p1 lg:text-[68px] uppercase font-semibold tracking-wide font-primary -mt-12 text-yellow-50 opacity-90">
            COUNTRIES
          </span>
        </div>
        {/* Right side: 800+ cats saved */}
        <div className="absolute pb-64  right-4 lg:right-16 top-1/2 -translate-y-1/2 z-40 flex flex-col items-end ">
          <span className="lg:text-[200px] text-[100px] font-bold text-yellow-300 drop-shadow-lg font-primary glow lg:-mb-4">
            800+
          </span>
          <span className="text-p1 lg:text-[68px] uppercase font-semibold tracking-wide font-primary -mt-12 text-yellow-50 opacity-90">
            cats saved
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
  );
}
