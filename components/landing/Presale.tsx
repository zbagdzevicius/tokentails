import { CandyCaneProgress } from "@/components/shared/CandyCaneProgress";
import { ChristmasTree } from "@/components/shared/ChristmasTree";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";

export const Presale = () => {
  return (
    <div className="container h-full flex flex-col items-center justify-center overflow-visible">
      <div className="flex flex-col items-center">
        <h2 className="font-secondary uppercase tracking-tight text-h3 md:text-h2 text-balance mb-4 text-green-900">
          PRESALE IS COMING
        </h2>
        <div className="animate-colormax">
          <Countdown
            targetDate={new Date("2024-12-08")}
            isBig
            isDaysDisplayed
          />
        </div>
        <div className="-mb-24 w-full">
          <ChristmasTree />
        </div>
        <CandyCaneProgress />
        <div className="flex gap-24">
          <a href="/game" className="relative">
            <span className="relative z-10">
              <PixelButton text="PLAY" isBig subtext="HERE"></PixelButton>
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
          <a
            href="https://t.me/CatbassadorsBot?start=start"
            target="_blank"
            className="font-secondary relative"
          >
            <span className="relative z-10">
              <PixelButton text="PLAY ON" subtext="TG" isBig></PixelButton>
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
      </div>
      {/* <PresaleCard /> */}
      {/* <NumberIncrementer number={10000} /> */}
      {/* <AboutUs /> */}
      {/* <Countdown/> */}
    </div>
  );
};
