import { PixelButton } from "@/components/button/PixelButton";
import { Socials } from "@/components/footer/Socials";
import { useEffect, useState } from "react";

interface bannerProps {
  image: string;
  title: string;
}

const sponsorImage = [
  "/images/sponsor/microsoft-for-startups.webp",
  "/images/sponsor/social-shifters.webp",
  "/images/sponsor/stellar.webp",
  "/images/sponsor/immutable.webp",
  "/images/sponsor/brinc.webp",
  "/images/sponsor/skale.webp",
  "/images/sponsor/xdc.webp",
  "/images/sponsor/buidlers-tribe.webp",
  "/images/sponsor/crossfi.webp",
  "/images/sponsor/diamante.webp",
  "/images/sponsor/digitalocean.webp",
  "/images/sponsor/earn-alliance.webp",
  "/images/sponsor/unicorn-ultra.webp",
  "/images/sponsor/microsoft-for-startups.webp",
  "/images/sponsor/social-shifters.webp",
  "/images/sponsor/stellar.webp",
  "/images/sponsor/immutable.webp",
  "/images/sponsor/brinc.webp",
  "/images/sponsor/skale.webp",
  "/images/sponsor/xdc.webp",
  "/images/sponsor/buidlers-tribe.webp",
  "/images/sponsor/crossfi.webp",
  "/images/sponsor/diamante.webp",
  "/images/sponsor/digitalocean.webp",
  "/images/sponsor/earn-alliance.webp",
  "/images/sponsor/unicorn-ultra.webp",
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
  const [earlyCountdown, setEarlyCountdown] = useState("");

  useEffect(() => {
    // Set the date we're counting down to
    const earlyCountDownDate = new Date("Jul 19, 2024 18:30:00").getTime();

    function setCountdownStates() {
      // Get today's date and time
      const now = new Date().getTime();

      // Find the distance between now and the count down date
      const earlyDistance = earlyCountDownDate - now;

      // Time calculations for days, hours, minutes and seconds
      const earlyDays = Math.floor(earlyDistance / (1000 * 60 * 60 * 24));
      const earlyHours = Math.floor(
        (earlyDistance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const earlyMinutes = Math.floor(
        (earlyDistance % (1000 * 60 * 60)) / (1000 * 60)
      );
      const earlySeconds = Math.floor((earlyDistance % (1000 * 60)) / 1000);
      let earlyCountdownText =
        earlyDistance < 0
          ? "PLAY NOW"
          : earlyDays +
            "d " +
            earlyHours +
            "h " +
            earlyMinutes +
            "m " +
            earlySeconds +
            " s";

      setEarlyCountdown(earlyCountdownText);
    }
    // Update the count down every 1 second
    const x = setInterval(setCountdownStates, 1000);
    setCountdownStates();
    return () => clearInterval(x);
  }, [setEarlyCountdown]);

  return (
    <div className="mt-14 md:mt-4 flex justify-center items-center flex-col">
      <div className="relative w-full md:w-2/3 xl:w-1/2 px-10 max-lg:text-balance -mb-8 md:-mb-32">
        <img
          className="absolute top-0 left-0 "
          src="/images/home-page/firework.png"
          alt="fireworks"
          width={80}
          height={80}
        />
        <h1 className="text-center font-secondary uppercase tracking-tight text-h3 -mt-14 md:text-8xl">
          PLAY TO SAVE
        </h1>
      </div>
      <div className="relative w-full flex items-center justify-center max-w-[100vw] overflow-hidden">
        <div className="absolute left-0 right-0 top-0 bottom-0 slider transform z-10 rotate-12">
          <div className="slide-track inverse">
            {cats.map((banner, index) => (
              <div key={index} className="slide">
                <img
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
          <div className="relative pt-10 md:pt-20 px-8 flex items-center justify-center">
            <div className="relative w-full">
              <img
                src="/images/home-page/tamagotchi.webp"
                alt="Cats Background"
                className="absolute w-[600px] rem:pl-[50px] pb-5 h-[640px] md:relative z-[1] hidden md:block"
              />
              <img
                src="/images/home-page/cat-background.webp"
                alt="Cats Background"
                className="absolute md:hidden inset-0 h-full w-full z-[1]"
              />
              <video
                className="relative md:absolute inset-0 rounded-md md:-skew-x-[1deg] p-3 md:p-0 md:skew-y-[6deg] rem:w-[320px] rem:h-[320px] md:rem:w-[272px] md:rem:h-[272px] overflow-hidden m-auto z-[2]"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/videos/trailer-2024-09.mp4" />
              </video>
              <img
                src="/images/home-page/rocket-cat.webp"
                alt="Cat Hero"
                className="absolute -top-10 md:top-5 -right-0 md:-right-8 z-0 w-12 -rotate-45 md:rotate-0 md:w-36 overflow-hidden z-0"
              />
            </div>
            <img
              src="/images/home-page/crown.png"
              alt="crown"
              className="md:w-16 w-10 md:h-16 h-10 absolute md:top-12 right-0"
              width={100}
              height={100}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-2 md:gap-10 items-center mb-4 mt-4 md:-mt-32 relative z-10">
        <a href="/game" className="relative">
          <span className="relative z-10">
            <PixelButton text="PLAY ON" isBig subtext="BROWSER"></PixelButton>
          </span>

          <img
            src="/logo/coin.webp"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -left-6"
          />
          <img
            src="/logo/chest.webp"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -right-6"
          />
        </a>
        <div className="font-secondary text-p3 bg-gradient-to-r from-red-500 to-red-500 px-2 text-yellow-300 border-4 border-black rounded-full">OR</div>
        <a
          href="https://t.me/CatbassadorsBot?start=start"
          target="_blank"
          className="font-secondary relative"
        >
          <span className="relative z-10">
            <PixelButton text="PLAY ON" subtext="TELEGRAM" isBig></PixelButton>
          </span>

          <img
            src="/logo/boss-coin.png"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -right-6"
          />
          <img
            src="/logo/level.png"
            alt="coin"
            className="h-12 w-12 absolute bottom-0 top-0 -left-6"
          />
        </a>
      </div>
      <span className="relative z-10">
        <Socials />
      </span>
      {/* <Preregistration /> */}

      <div className="my-4"></div>
      <div className="slider relative bg-gradient-to-r from-green-300 to-purple-300">
        <div className="slide-track">
          {sponsorImage.map((sponsor, index) => (
            <div key={index} className="slide flex items-center">
              <img className="h-10 w-full" src={sponsor} />
            </div>
          ))}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 -top-3 px-4 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full font-secondary">
          PARTNERS
        </div>
      </div>
    </div>
  );
};
