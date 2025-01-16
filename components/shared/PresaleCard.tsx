import { useEffect, useMemo, useRef, useState } from "react";
import { Countdown } from "./Countdown";

import { getAddressTokens, getRaised } from "@/constants/api";
import { randomObjectFromArray } from "@/constants/utils";
import { useWeb3 } from "@/context/Web3Context";
import { CurrencyType } from "@/web3/contracts";
import dynamic from "next/dynamic";
import { PixelButton } from "./PixelButton";

const PaymentInputSelect = dynamic(
  () => import("@/components/shared/PaymentInputSelect"),
  { ssr: false }
);

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
  const [rocketProgress, setRocketProgress] = useState(0);
  const [rocketLaunched, setRocketLaunched] = useState(false);
  const [currentCat, setCurrentCat] = useState(sadCats[1]);
  const prevFundsRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const firePosition = isMobile ? 0 : 3.85;
  const [currentFunds, setCurrentFunds] = useState(0);
  const [price, setPrice] = useState<number>();
  const [boughtToken, setBoughtTokens] = useState<number>(0);

  const { currencyType, bnbRate, query, xlmRate, solRate, namespaceDetail } =
    useWeb3();

  const isEndDateReached = useMemo(() => {
    return (
      new Date().getTime() > new Date(Date.UTC(2025, 0, 1, 0, 0, 0)).getTime()
    );
  }, []);

  const finalTokenPrice = useMemo(() => {
    return 0.03;
    const startDate = new Date(Date.UTC(2024, 11, 8, 0, 0, 0));
    const endDate = new Date(Date.UTC(2024, 11, 20, 0, 0, 0));

    const totalFundraiseTime = endDate.getTime() - startDate.getTime();
    const currentDate = new Date();
    const elapsedTime = currentDate.getTime() - startDate.getTime();

    const progress = Math.min(Math.max(elapsedTime / totalFundraiseTime, 0), 1);

    const basePrice = 0.03;
    const discount = 0.28;
    const hasCoupon = query.code === "meow" ? true : false;
    const couponDiscount = 0.05;
    const initialPrice = basePrice * (1 - discount);

    const currentPrice = initialPrice + (basePrice - initialPrice) * progress;
    return currentPrice * (1 - (hasCoupon ? couponDiscount : 0));
  }, [query, isEndDateReached]);

  const amountOfTails = useMemo(() => {
    if (!price || !bnbRate || !xlmRate || !solRate) {
      return 0;
    }
    if (currencyType === CurrencyType.BNB) {
      return Math.floor((price / finalTokenPrice) * bnbRate);
    }
    if (currencyType === CurrencyType.XLM) {
      return Math.floor((price / finalTokenPrice) * xlmRate);
    }
    if (currencyType === CurrencyType.SOL) {
      return Math.floor((price / finalTokenPrice) * solRate);
    }

    return Math.floor(price / finalTokenPrice);
  }, [currencyType, finalTokenPrice, bnbRate, xlmRate, solRate, price]);

  useEffect(() => {
    getRaised().then((value) => setCurrentFunds(value));
  }, []);
  useEffect(() => {
    if (namespaceDetail.address) {
      getAddressTokens(namespaceDetail.address).then((value) =>
        setBoughtTokens(parseFloat(value))
      );
    }
  }, [namespaceDetail.address]);
  useEffect(() => {
    const sadKeys = Object.keys(sadCats);
    const randomKey = sadKeys[Math.floor(Math.random() * sadKeys.length)];
    setCurrentCat(sadCats[Number(randomKey)]);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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

  const handleLaunchClick = () => {
    setRocketLaunched(true);
    const progressValue = isMobile ? 82 : 58;

    setRocketProgress(progressValue);
  };

  return (
    <div className="h-full w-screen relative flex justify-center items-center">
      <div className="relative z-20 flex items-center justify-center flex-col rem:w-[320px] md:rem:w-[400px]">
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
          {!isEndDateReached && (
            <div className="text-center font-semibold font-secondary text-h5">
              ${currentFunds} Raised
            </div>
          )}
          <div className="font-secondary flex items-center gap-2 bg-purple-300 bg-opacity-75 rounded-full mb-1">
            <img className="w-5 h-5" src="/logo/coin.webp" />
            <div className="text-p5">TOKENS</div>
            <img className="w-5 h-5" src="/logo/coin.webp" />
          </div>
          <div className="flex gap-2">
            <div className="font-secondary flex items-center gap-1 bg-purple-300 bg-opacity-75 px-3 rounded-full mb-1">
              <div className="text-p5">
                Sold {parseInt((currentFunds / 0.027).toString())}
              </div>
            </div>
            <div className="font-secondary flex items-center gap-1 bg-purple-300 bg-opacity-75 px-3 rounded-full">
              <div className="text-p5">You own {boughtToken}</div>{" "}
            </div>
          </div>
          <div className="pb-2">
            <img
              className="w-20 h-auto"
              src={`/meme-cats/${randomObjectFromArray(
                Object.values(memeCats)
              )}`}
            />
          </div>
          {!isEndDateReached && (
            <div className="z-10 relative">
              <Countdown
                isDaysDisplayed
                isBig
                targetDate="2025-01-01T00:00:00"
              />
            </div>
          )}
          {isEndDateReached ? (
            <div className="bg-red-500 pt-2 w-fit -z-1 rounded-b-xl ">
              <div className="text-center text-white px-3 font-bold font-secondary text-p4 pt-1">
                PRESALE JUST ENDED
              </div>
              <div className="text-center text-white font-bold font-secondary text-p3 -mt-2">
                STAY TUNED
              </div>
            </div>
          ) : (
            <div className="bg-red-500 pt-2 w-fit -z-1 rounded-b-xl ">
              <div className="text-center text-white px-3 font-bold font-secondary text-p2 pt-1">
                TO THE MOON
              </div>
              <div className="text-center text-white font-bold font-secondary text-p4 -mt-2 px-4">
                LAST CHANCE TO GET $TAILS
              </div>
            </div>
          )}
        </div>
        {!isEndDateReached && (
          <div
            className="flex hover:brightness-110 relative items-center py-1 px-6 rounded-2xl mb-4 -mt-4 border-2 border-main-black"
            style={{
              backgroundImage: "url(/base/bg.gif)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <img
              className="h-10 w-auto absolute bottom-0 left-0 opacity-50"
              alt="cat"
              src={`/meme-cats/${currentCat}`}
            />
            <p className="relative text-center font-semibold font-secondary text-p3">
              1 $TAILS =
              <span
                className="
                         inline-block pl-1"
              >
                0.03
              </span>
            </p>
          </div>
        )}
        <div className="bottom-1 md:bottom-1 mt-2">
          <PaymentInputSelect
            amountOfTails={amountOfTails}
            price={price}
            setPrice={setPrice}
            disabled={isEndDateReached}
          />
        </div>
      </div>

      <img
        className="absolute top-0 md:right-0 md:top-0 mt-2 md:mr-10 md:mt-5 h-28 w-28 md:w-32 md:h-32 object-contain hover:animate-spin-slow hover:brightness-110"
        src="/icons/moon.png"
        alt="Moon"
      />
      <img
        className={`absolute pb-3 right-0 md:right-10 w-24 aspect-square md:w-48 object-contain hover:brightness-110 ${rocketLaunched && "animate-hover "
          }`}
        style={{
          bottom: `calc(${rocketProgress}% - 0rem)`,
          transition: "bottom 4s ease-in-out",
        }}
        src="/icons/rocket.png"
        alt="Rocket"
      />

      <img
        className={`absolute right-0 md:right-10 w-24 md:w-48 h-16 md:h-36 -z-10 object-contain rotate-180  hover:brightness-110`}
        style={{
          opacity: rocketLaunched ? 1 : 0,
          bottom: `calc(${rocketProgress}% - ${firePosition}rem)`,
          transition: "bottom 4s ease-in-out",
        }}
        src="/icons/fire-2.gif"
        alt="Rocket Fire"
      />

      {!rocketLaunched && (
        <div className="absolute -bottom-8 right-0 md:rem:right-[88px]">
          <PixelButton text="Launch" onClick={handleLaunchClick}></PixelButton>
        </div>
      )}
    </div>
  );
};

export const PresaleCard = () => {
  return <PresaleCardContent />;
};
