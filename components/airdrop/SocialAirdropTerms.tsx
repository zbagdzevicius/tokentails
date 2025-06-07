import { useState } from "react";
import { SocialImages } from "../landing/Team";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { CloseButton } from "../shared/CloseButton";

const whatToDo = [
  {
    description: "Use $TAILS In a post",
    help: "Declare your loyalty. 🗣 Speak the Codex - Use #TAILS in a Post. Post on X and be rewarded. It can be combined with other ways.",
    points: "+1",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Cats%20called%2C%20I%20answered.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "Tag Fellow rescuers",
    help: "Summon Allies - Tag Fellow Rescuers. Tag your friends while you posts. Points stacks up!",
    points: "+1",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20%24TAILS%20calling.%20Will%20you%20answer%3F&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "tag @Tokentails",
    help: "Amplify the order. Signal the Tailsguard - Mention @TokenTails in Post. All quests can be completed multiple times.",
    points: "+3",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Cats%20called%2C%20I%20answered.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "SHARE OUR MEME",
    help: "Share a Sacred Meme - Post Our Cat Meme Content. Post any meme or craft one on your own! Points stacks up!",
    points: "+3",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20My%20soul%20belongs%20to%20the%20cats.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "QUOTE OUR POST",
    help: "Speak your own verse. Echo the Codex - Quote a Tails Post with Your Take. Points stacks up!",
    points: "+1",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Cats%20called%2C%20I%20answered.%20%24TAILS&url=https%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "Get engagement",
    help: "Rally the Chain - Drive Likes & Comments on Your Tails Content. The higher forces calculate and distribute. It stacks up!",
    points: "+∞",
    image: SocialImages.X,
  },
  {
    description: "1000 game coins + 1",
    help: "Complete a Mission to fulfill your destiny - Earn 1000 Game Coins in Token Tails playing Catbassadors and be rewarded!",
    points: "+∞",
    image: "logo/coin.webp",
    href: "https://tokentails.com/game",
  },
  {
    description: "Collect 100 catnip",
    help: "Play catnip to complete levels and collect catnip.",
    points: "+100",
    image: "logo/catnip.webp",
    href: "https://tokentails.com/game",
  },
  {
    description: "ADOPT NFT CAT",
    help: "The bond is sealed in adoption. Multiply Your Blessings - Adopt a Cat NFT to Boost Your $TAILS",
    points: "Multiply",
    image: "images/cats-slider/joy-cat.webp",
    href: "https://tokentails.com/game",
  },
];

export const SocialAirdropTerms = () => {
  const [modal, setModal] = useState<null | string>(null);

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
          ENGAGE ON SOCIALS AND PLAY TO EARN
        </div>
        <Countdown isDaysDisplayed isBig targetDate={new Date("2025-06-31")} />
        <div className="flex items-center font-primary gap-2 text-p5 pt-4 text-center justify-center">
          TOTAL REWARDS POOL IS WORTH $1m USD
        </div>
        <h2 className="font-primary uppercase lg:mt-3 tracking-tight text-h6 md:text-h3 text-balance px-4">
          9 WAYS TO
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] ml-2">
            EARN
          </span>
        </h2>
        <div className="flex items-center font-primary gap-2 -mt-1 text-p5 text-center justify-center">
          EACH WAY CAN BE USED MULTIPLE TIMES AND STACKED
        </div>
        <a
          target="_blank"
          href="https://tokentails.com/feed/announcements/how-to-farm-dollartails-airdrop-earn-while-you-play-and-engage"
        >
          <PixelButton text="TUTORIAL" isSmall />
        </a>
      </div>

      <div className="flex flex-col gap-2 mb-10 py-2 lg:-mt-8">
        <div className="flex flex-col gap-2">
          {whatToDo.map((what, index) => (
            <div className="flex items-center" key={index}>
              <a
                href={what.href}
                target="_blank"
                className="flex items-center bg-opacity-75 whitespace-nowrap mr-2 font-primary text-p4 bg-yellow-300 hover:bg-opacity-100 rounded-xl"
              >
                <img
                  draggable={false}
                  className="min-w-8 w-8 mr-1 -ml-1"
                  src={what.image}
                />
                {what.points}
                <img
                  draggable={false}
                  src="/logo/coin.webp"
                  className="min-w-8 w-8 h-8 ml-1 -mr-1"
                />
              </a>
              <a href={what.href} target="_blank">
                <PixelButton text={what.description} />
              </a>
              <PixelButton
                text="?"
                isSmall
                onClick={() => {
                  setModal(what.help);
                }}
              />
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 mt-safe w-full z-50 flex justify-center h-full">
          <div
            onClick={() => setModal(null)}
            className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
          ></div>
          <div
            className="z-50 rem:w-[350px] md:w-[480px] max-w-full absolute top-1/2 -translate-y-1/2 rounded-xl shadow animate-appear pb-4"
            style={{
              backgroundImage: "url('/backgrounds/bg-6.png')",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <CloseButton onClick={() => setModal(null)} />
            <div className="pb-safe rem:min-h-[100px] p-8 flex flex-col gap-2 justify-between items-center">
              <p className="text-p3 font-secondary whitespace-pre-line text-center">
                {modal}
              </p>
              <PixelButton
                onClick={() => setModal(null)}
                text="Let's get started"
              ></PixelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialAirdropTerms;
