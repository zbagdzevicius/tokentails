import { Socials } from "@/components/footer/Socials";
import Preregistration from "../preregistration/Preregistration";
import { useEffect, useState } from "react";
import { PixelButton } from "@/components/button/PixelButton";

interface bannerProps {
  image: string;
  title: string;
}

const sponsorImage = [
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/kommunitas.webp",
    name: "kommunitas",
  },
  {
    image: "/images/sponsor/dao.webp",
    name: "dao",
  },
  {
    image: "/images/sponsor/skale.webp",
    name: "skale",
  },
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/kommunitas.webp",
    name: "kommunitas",
  },
  {
    image: "/images/sponsor/dao.webp",
    name: "dao",
  },
  {
    image: "/images/sponsor/skale.webp",
    name: "skale",
  },
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/kommunitas.webp",
    name: "kommunitas",
  },
  {
    image: "/images/sponsor/dao.webp",
    name: "dao",
  },
  {
    image: "/images/sponsor/skale.webp",
    name: "skale",
  },
  {
    image: "/images/sponsor/stellar.webp",
    name: "Stellar",
  },
  {
    image: "/images/sponsor/u2u.png",
    name: "u2u",
  },
  {
    image: "/images/sponsor/kommunitas.webp",
    name: "kommunitas",
  },
  {
    image: "/images/sponsor/dao.webp",
    name: "dao",
  },
  {
    image: "/images/sponsor/roblox.png",
    name: "Roblox",
  },
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
    <div className="mt-4 flex justify-center items-center flex-col">
      <div className="relative w-full lg:w-2/3 xl:w-1/2 pt-16 px-10 max-lg:text-balance md:-mb-16">
        <img
          className="absolute top-0 left-0 "
          src="/images/home-page/firework.png"
          alt="fireworks"
          width={80}
          height={80}
        />
        <h1 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
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
        <div className="relative z-10 h-fit flex items-center justify-center pb-10 max-lg:pb-7">
          <div className="relative pt-20 max-lg:pt-10 px-8 flex items-center justify-center">
            <div className="relative w-full">
              <img
                src="/images/home-page/cat-background.webp"
                alt="Cats Background"
                className="w-full h-full"
              />
              <video
                className="absolute inset-0 w-full h-full object-cover z-3 md:p-2.5 p-1.5"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="https://tokentails.fra1.cdn.digitaloceanspaces.com/token-tails-intro.webm" />
              </video>
              <img
                src="/images/home-page/cats-top.webp"
                alt="Cat Hero"
                className="absolute -top-12 lg:-top-16 right-0 w-1/4 object-cover overflow-hidden"
                width={500}
                height={500}
              />
            </div>
            <img
              src="/images/home-page/crown.png"
              alt="crown"
              className="w-16 max-lg:w-10 h-16 max-lg:h-10 absolute top-0 right-0"
              width={100}
              height={100}
            />
          </div>
          <a href="/game" className="absolute bottom-0 md:bottom-4">
            <PixelButton
              text="PLAY IN BROWSER"
              isBig
              subtext="AND EARN COINS"
              onClick={() => {}}
            ></PixelButton>
          </a>
        </div>
      </div>
      <div className="font-secondary text-p3 md:-mt-2">OR</div>
      <a
        href="https://t.me/CatbassadorsBot"
        target="_blank"
        className="font-secondary text-p1 mb-4"
      >
        <PixelButton text="PLAY TELEGRAM GAME" subtext="TO WIN AIRDROP" isBig onClick={() => {}}></PixelButton>
      </a>
      <Socials />
      {/* <Preregistration /> */}

      <div className="my-4"></div>
      <div className="slider relative bg-gradient-to-r from-green-300 to-purple-300">
        <div className="slide-track">
          {sponsorImage.map((sponsor, index) => (
            <div key={index} className="slide flex items-center invert">
              <img className="h-8" src={sponsor.image} alt={sponsor.name} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
