import { SocialImages } from "../landing/Team";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";

const whatToDo = [
  {
    description: "Post with $TAILS hashtag",
    points: 1,
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Cats%20called%2C%20I%20answered.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "+ Mention your friends",
    points: 1,
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20%24TAILS%20calling.%20Will%20you%20answer%3F&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "+ mention @Tokentails",
    points: 3,
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Cats%20called%2C%20I%20answered.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "+ INCLUDE OUR MEME",
    points: 3,
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20My%20soul%20belongs%20to%20the%20cats.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "+ QUOTE OUR POST",
    points: 1,
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Cats%20called%2C%20I%20answered.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "+ Get engagement on post",
    points: "∞",
    image: SocialImages.X,
  },
  {
    description: "1000 game coins = 1 score",
    points: "∞",
    image: "logo/coin.webp",
    href: "https://tokentails.com/game",
  },
  {
    description: "ADOPT NFT CAT",
    points: "Multiply",
    image: "images/cats-slider/joy-cat.webp",
    href: "https://tokentails.com/game",
  },
];

export const SocialAirdropTerms = () => {
  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start lg:mt-8 2xl:mt-16 gap-2 lg:gap-16">
      <div className="flex flex-col items-center">
        <img className="w-32" src="/logo/logo.webp" alt="airdrop-logo" />
        <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h1 text-balance px-4">
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-4">
            $TAILS
          </span>
          Airdrop
        </h2>
        <div className="flex items-center font-primary gap-2 text-p5 pb-4 text-center justify-center">
          TOTAL $TAILS REWARDS POOL IS $1m USD
        </div>
        <Countdown isDaysDisplayed isBig targetDate={new Date("2025-05-31")} />
        <div className="flex items-center font-primary gap-2 text-p5 pt-4 text-center justify-center">
          ENGAGE ON SOCIALS AND PLAY TO EARN
        </div>
        <h2 className="font-primary uppercase lg:mt-3 tracking-tight text-h6 md:text-h3 text-balance px-4">
          8 WAYS TO
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] ml-2">
            EARN
          </span>
        </h2>
        <div className="flex items-center font-primary gap-2 -mt-1 text-p5 text-center justify-center">
          EACH WAY CAN BE USED MULTIPLE TIMES AND STACKED
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-10 py-2 lg:-mt-8">
        <div className="flex flex-col gap-3">
          {whatToDo.map((what, index) => (
            <a
              href={what.href}
              target="_blank"
              className="flex items-center"
              key={index}
            >
              <div className="flex items-center bg-opacity-75 whitespace-nowrap mr-2 font-primary text-p4 bg-yellow-300 hover:bg-opacity-100 rounded-xl">
                <img
                  draggable={false}
                  className="min-w-8 w-8 mr-1 -ml-1"
                  src={what.image}
                />
                +{what.points}
                <img
                  draggable={false}
                  src="/logo/coin.webp"
                  className="min-w-8 w-8 h-8 ml-1 -mr-1"
                />
              </div>
              <PixelButton text={what.description} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SocialAirdropTerms;
