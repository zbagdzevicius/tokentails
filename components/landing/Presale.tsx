import { CandyCaneProgress } from "@/components/shared/CandyCaneProgress";
import { ChristmasTree } from "@/components/shared/ChristmasTree";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { PresaleCard } from "../shared/PresaleCard";
import { useState, useEffect } from "react";
import { SuccesPaymentModal } from "../shared/SuccesPaymentModal";
import { useWeb3 } from "@/context/Web3Context";

export const Presale = () => {
  const [isCountdownOver, setIsCountdownOver] = useState(false);
  const { isTransactionSucces, setIsTransactionSucces } = useWeb3()
  const handleCountdownEnd = () => {
    setIsCountdownOver(true);
  };

  useEffect(() => {
    if (isTransactionSucces) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isTransactionSucces]);

  return (
    <>
      {isTransactionSucces && (
        <SuccesPaymentModal close={() => setIsTransactionSucces(false)} />
      )}
      <div className="container py-4 h-full flex flex-col items-center justify-center overflow-visible">
        {!isCountdownOver ? (
          <div className="flex flex-col items-center">
            <h2 className="font-secondary uppercase tracking-tight text-h3 md:text-h2 text-balance">
              PRESALE IS COMING
            </h2>
            <div className="hover:brightness-110 relative z-10 animate-hover">
              <img className="w-48 -mb-4" src="/images/cats-hub/christmas-cat.webp" />
              <Countdown
                targetDate={new Date("2024-12-04T00:00:00Z")}
                isBig
                isDaysDisplayed
                onEnd={handleCountdownEnd}
              />
            </div>
            <div className="-mb-24 w-full">
              <ChristmasTree />
            </div>
            <CandyCaneProgress />
            <div className="flex gap-24">
              <a href="/game" className="relative">
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
                  src="/logo/boss-coin.png"
                  alt="coin"
                  className="h-12 w-12 absolute bottom-0 top-0 -right-6"
                />
                <img
                  src="/logo/level.png"
                  alt="coin"
                  className="h-12 w-12 absolute bottom-0 top-0 -left-6"
                />
                <span className="relative z-10">
                  <PixelButton text="PLAY ON" subtext="TG" isBig></PixelButton>
                </span>
              </a>
            </div>
          </div>
        ) : (
          <PresaleCard currentFunds={0} />
        )}
      </div>
    </>
  );
};
