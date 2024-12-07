import { useWeb3, Web3Provider } from "@/context/Web3Context";
import Web3ModalProvider from "@/context/web3";
import { useEffect, useMemo, useRef, useState } from "react";
import { Countdown } from "./Countdown";
import { NumberIncrementer } from "./NumberIncrementer";
import { PaymentInputSelect } from "./PaymentInputSelect";
const TARGET_VALUE = 600000;

const memeCats: Record<number, string> = {
  1: "meme-1.gif",
  2: "meme-2.png",
  3: "meme-3.png",
  4: "meme-4.png",
  5: "meme-5.png",
  6: "meme-6.gif",
  7: "meme-7.gif",
  8: "meme-8.png",
  9: "meme-9.png",
  10: "meme-10.png",
  11: "meme-11.png",
  12: "meme-12.png",
  13: "meme-13.png",
  14: "meme-14.gif",
  15: "meme-15.png",
  16: "meme-16.png",
  17: "meme-17.png",
  18: "meme-18.png",
  19: "meme-19.png",
  20: "meme-20.png",
  21: "meme-21.gif",
  22: "meme-22.gif",
  23: "meme-23.gif",
  24: "meme-24.gif",
  25: "meme-25.png",
  26: "meme-26.png",
  27: "meme-27.png",
  28: "meme-28.png",
  29: "meme-29.png",
  30: "meme-30.gif",
  31: "meme-31.gif",
  32: "meme-32.png",
  33: "meme-33.png",
  34: "meme-34.gif",
  35: "meme-35.png",
  36: "meme-36.png",
  37: "meme-37.png",
  38: "meme-38.png",
  39: "meme-39.png",
  40: "meme-40.png",
  41: "meme-41.png",
  42: "meme-42.png",
  43: "meme-43.png",
  44: "meme-44.png",
  45: "meme-45.png",
  46: "meme-46.gif",
  47: "meme-47.png",
  48: "meme-48.gif",
  49: "meme-49.png",
  50: "meme-50.png",
  51: "meme-51.png",
  52: "meme-52.png",
  53: "meme-53.png",
  54: "meme-54.png",
  55: "meme-55.png",
  56: "meme-56.png",
  57: "meme-57.png",
  58: "meme-58.png",
  59: "meme-59.png",
  60: "meme-60.png",
};

const sadCats: Record<number, string> = {
  1: "meme-1.gif",
  2: "meme-23.gif",
  3: "meme-21.gif",
};

const happyCats: Record<number, string> = {
  1: "meme-40.gif",
  2: "meme-14.gif",
  3: "meme-7.gif",
};

export const PresaleCardContent = () => {
  const { finalTokenPrice, currentFunds } = useWeb3();
  const [fillPercentage, setFillPercentage] = useState(0);
  const stepIndex = useMemo(() => {
    const percentage = (currentFunds / TARGET_VALUE) * 100;
    if (percentage >= 0 && percentage <= 100) {
      setFillPercentage(Math.max(0, Math.min(percentage, 100)));
    }

    return Math.min(Math.floor((currentFunds / TARGET_VALUE) * 60), 59);
  }, [currentFunds]);
  const [currentCat, setCurrentCat] = useState(sadCats[1]);
  const prevFundsRef = useRef<number | null>(null);

  useEffect(() => {
    const sadKeys = Object.keys(sadCats);
    const randomKey = sadKeys[Math.floor(Math.random() * sadKeys.length)];
    setCurrentCat(sadCats[Number(randomKey)]);
  }, []);

  useEffect(() => {
    if (
      prevFundsRef.current !== null &&
      prevFundsRef.current !== currentFunds
    ) {
      const happyKeys = Object.keys(happyCats);
      const randomKey = happyKeys[Math.floor(Math.random() * happyKeys.length)];
      setCurrentCat(happyCats[Number(randomKey)]);
    }
    prevFundsRef.current = currentFunds;
  }, [currentFunds]);

  return (
    <div className="h-screen w-screen relative flex justify-center items-center">
      <div className="relative z-20 flex items-center justify-center flex-col rem:w-[320px] md:rem:w-[400px] rem:h-[350px] md:rem:h-[450px]">
        <div
          className="flex hover:brightness-110 flex-col items-center p-1 md:p-4 pb-6 rounded-3xl border-4 border-main-black"
          style={{
            backgroundImage: "url(/base/bg.gif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <p className="text-center font-semibold font-secondary text-p1 flex gap-4">
            <img
              src={`/logo/coin.webp`}
              alt="Selected currency"
              className="w-12 h-12"
            />
            $TAILS PRESALE
            <img
              src={`/logo/coin.webp`}
              alt="Selected currency"
              className="w-12 h-12"
            />
          </p>
          <p className="text-center font-semibold font-secondary text-h5">
            ${currentFunds} Raised
          </p>
          <div className="pb-2">
            <img
              className="w-20 h-auto"
              src={`/meme-cats/${Object.values(memeCats)?.[stepIndex]}`}
            />
          </div>
          <div className="z-10 relative">
            <Countdown
              isDaysDisplayed
              isBig
              targetDate={"2024-12-20T00:00:00"}
            />
          </div>
          <div className="bg-red-500 pt-2 w-fit -z-1 rounded-b-xl ">
            <div className="text-center text-white px-3 font-bold font-secondary text-p2 pt-1">
              LAST CHANCE TO BUY!
            </div>
            <div className="text-center text-white font-bold font-secondary text-p4 -mt-2">
              PRICE INCREASES TWICE A DAY
            </div>
          </div>
        </div>
        <div
          className="flex hover:brightness-110 relative items-center md:gap-3 pt-6 pb-2 pl-6 pr-8 rounded-2xl mb-4 -mt-4 border-2 border-main-black"
          style={{
            backgroundImage: "url(/base/bg.gif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <img
            className="w-16 h-auto absolute bottom-0 left-0 opacity-50"
            alt="cat"
            src={`/meme-cats/${currentCat}`}
          />
          <p className="relative text-center font-semibold font-secondary text-p2">
            1 $TAILS =
            <span
              className="
                         inline-block pl-1"
            >
              <span className="absolute right-0 text-p3 whitespace-nowrap pl-1 -translate-y-4 translate-x-4">
                &#36;{finalTokenPrice?.toFixed(4)}
              </span>
              <span className="text-p3 md:text-p4 line-through text-red-500">
                &#36;0.03
              </span>
            </span>
          </p>
        </div>
        <div className="bottom-1 md:bottom-1">
          <PaymentInputSelect />
        </div>
      </div>

      <img
        className="absolute top-0 md:right-0 md:top-0 mt-2 md:mr-10 md:mt-5 h-28 w-28 md:w-32 md:h-32 object-contain hover:animate-spin-slow hover:brightness-110"
        src="/icons/moon.png"
        alt="Moon"
      />
      <img
        className="absolute right-10 w-32 aspect-square md:w-48 object-contain animate-hover hover:brightness-110"
        style={{
          bottom: `calc(${fillPercentage}% /1.7 + 5rem)`,
          transition: "bottom 1s ease-in-out",
        }}
        src="/icons/rocket.png"
        alt="Rocket"
      />
      <img
        className={`absolute right-10 w-32 md:w-48 h-20 md:h-28 -z-10 object-contain rotate-180 hover:brightness-110`}
        style={{
          bottom: `calc(${fillPercentage}%/1.7 )`,
          transition: "bottom 1s ease-in-out, opacity 0.5s ease",
        }}
        src="/icons/fire-2.gif"
        alt="Rocket Fire"
      />
    </div>
  );
};

interface IPresaleCard {
  currentFunds: number;
}

export const PresaleCard = ({ currentFunds }: IPresaleCard) => {
  return <PresaleCardContent />;
};
