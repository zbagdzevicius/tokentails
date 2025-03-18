import { PixelButton } from "../shared/PixelButton";
import { SocialImages } from "./Team";

export const Airdrop = () => {
  return (
    <div className="container flex flex-col py-8 justify-center items-center">
      <div className="flex justify-center items-center gap-4 mb-8">
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          UNLOCK REWARDS
        </h2>
      </div>
      <div className="flex flex-col sm:flex-row w-full items-center sm:gap-8">
        <div className="sm:w-1/2 flex justify-end">
          <img
            className="w-48 md:w-96 animate-hover hover:brightness-125"
            src="/images/cats-hub/airdrop.webp"
          />
        </div>
        <div className="sm:w-1/2  hover:brightness-110">
          <ul className="font-secondary text-p3 lg:text-p1 flex flex-col gap-2">
            <a href="/game" className="-mt-6 mb-4 flex justify-center">
              <PixelButton text="PLAY TO SAVE" />
            </a>
            <a
              href="https://x.com/tokentails"
              target="_blank"
              className="flex items-center gap-2 justify-center"
            >
              <img
                draggable={false}
                className="w-8 lg:w-16"
                src={SocialImages.X}
              />
              <div className="">FOLLOWED ON X</div>
            </a>
            <a
              href="https://t.me/+ofyPNIfNX5w4ZjM8"
              target="_blank"
              className="flex items-center gap-2 justify-center"
            >
              <img
                draggable={false}
                className="w-8 lg:w-16"
                src={SocialImages.TELEGRAM}
              />
              <div className="">JOINED TELEGRAM</div>
            </a>
            <li className="flex items-center gap-2 justify-center">
              <img
                draggable={false}
                className="w-8 lg:w-16"
                src="/logo/rocket.png"
              />
              <div className="text-nowrap">REACHED 30 DAYS STREAK</div>
            </li>
            <li className="flex items-center gap-2 justify-center">
              <img
                draggable={false}
                className="w-8 lg:w-16"
                src="/images/cats-slider/joy-cat.webp"
              />
              <div className="">SAVED A CAT BY ADOPTING NFT</div>
            </li>
            <li className="flex items-center gap-2 justify-center">
              <img
                draggable={false}
                className="w-8 lg:w-16"
                src="/images/cats-slider/coin-cat.webp"
              />
              <div className="md:text-nowrap">
                COLLECTED AND SPENT 100k COINS
              </div>
            </li>
            <li className="flex items-center gap-2 text-p5 sm:text-p4 text-center justify-center">
              <div className="sm:text-nowrap">
                TOTAL $TAILS REWARDS POOL IS $500k USD - SAVE A CAT AND START
                EARNING
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
