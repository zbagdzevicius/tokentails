import { useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { SocialImages } from "./Team";
import { bgStyle, cdnFile } from "@/constants/utils";

export const Airdrop = () => {
  const [showEligibilityCriteria, setShowEligibilityCriteria] = useState(false);
  return (
    <div className="container flex flex-col py-8 justify-center items-center">
      <div className="flex flex-col justify-center items-center gap-4 mb-8">
        <h2 className="text-center font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1">
          UNLOCK REWARDS
        </h2>
        <div className="flex flex-col md:flex-row gap-4 md:gap-2 lg:gap-12 text-p3 font-primary">
          <div
            className="flex flex-col items-center p-4 rounded-2xl min-w-64 md:min-w-52 lg:min-w-64"
            style={bgStyle("4")}
          >
            <img
              className="h-12"
              draggable={false}
              src={cdnFile("logo/logo.webp")}
            />
            <span className="text-p2 text-center">$TAILS TOKEN AIRDROP</span>
            <span>
              <span className="text-red-700">600k USD</span> in{" "}
              <span className="text-red-700">$TAILS</span>
            </span>
          </div>
          <div
            className="flex flex-col items-center p-4 rounded-2xl min-w-64 md:min-w-52 lg:min-w-64"
            style={bgStyle("6")}
          >
            <img
              className="w-12 h-12"
              draggable={false}
              src={cdnFile("logo/heart.webp")}
            />
            <span className="text-p2 text-center">CATS HEROES AWARDS</span>
            <span>
              <span className="text-red-700">200k USD</span> in{" "}
              <span className="text-red-700">$TAILS</span>
            </span>
          </div>
          <div
            className="flex flex-col items-center p-4 rounded-2xl min-w-64 md:min-w-52 lg:min-w-64"
            style={bgStyle("4")}
          >
            <img
              className="w-36 h-36 pixelated -mt-14 -mb-10"
              draggable={false}
              src={cdnFile("cats/pinkie/pink-lamiendo-ropa.gif")}
            />
            <span className="text-p2 text-center">MEGA NFT REWARDS</span>
            <span>
              worth
              <span className="text-red-700 ml-1">$200k USD</span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row w-full items-center sm:gap-8">
        <div className="sm:w-1/2 flex justify-end">
          <img
            className="w-48 md:w-96 animate-hover hover:brightness-125"
            src={cdnFile("images/cats-hub/airdrop.webp")}
          />
        </div>
        <div className="sm:w-1/2">
          <ul className="font-secondary font-bold text-p3 lg:text-p2 flex flex-col items-start gap-2">
            {!showEligibilityCriteria && (
              <PixelButton
                text="SHOW ELIGIBILITY CRITERIA"
                onClick={() => setShowEligibilityCriteria(true)}
              />
            )}
            {showEligibilityCriteria && (
              <div className="flex flex-col gap-2 items-start">
                <a
                  href="https://x.com/tokentails"
                  target="_blank"
                  className="flex items-center gap-2 justify-center"
                >
                  <img
                    draggable={false}
                    className="w-8 lg:w-12"
                    src={SocialImages.X}
                  />
                  <PixelButton text="FOLLOWED ON X" />
                </a>
                <a
                  href="https://t.me/+ofyPNIfNX5w4ZjM8"
                  target="_blank"
                  className="flex items-center gap-2 justify-center"
                >
                  <img
                    draggable={false}
                    className="w-8 lg:w-12"
                    src={SocialImages.TELEGRAM}
                  />
                  <PixelButton text="JOINED TELEGRAM" />
                </a>
                <li className="flex items-center gap-2 justify-center">
                  <img
                    draggable={false}
                    className="w-8 lg:w-12"
                    src={cdnFile("logo/rocket.png")}
                  />
                  <PixelButton text="REACHED 10 DAYS STREAK" />
                </li>
                <li className="flex items-center gap-2 justify-center">
                  <img
                    draggable={false}
                    className="w-8 lg:w-12"
                    src={cdnFile("images/cats-slider/joy-cat.webp")}
                  />
                  <PixelButton text="SAVED A CAT BY ADOPTING NFT" />
                </li>
                <li className="flex items-center gap-2 justify-center">
                  <img
                    draggable={false}
                    className="w-8 lg:w-12"
                    src={cdnFile("images/cats-slider/coin-cat.webp")}
                  />
                  <PixelButton text="COLLECTED 100 Catnips" />
                </li>
                <li className="flex items-center font-primary gap-2 text-p5 text-center justify-center">
                  <div className="sm:text-nowrap">
                    TOTAL REWARDS POOL IS $1m USD - SAVE A CAT AND START EARNING
                  </div>
                </li>
              </div>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};
