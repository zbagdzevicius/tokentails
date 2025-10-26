import { useState } from "react";
import { SocialImages } from "../landing/Team";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { CloseButton } from "../shared/CloseButton";
import { bgStyle, cdnFile } from "@/constants/utils";

const whatToDo = [
  {
    description: "Use $TAILS In a post",
    help: "Declare your loyalty. 🗣 Speak the Codex - Use #TAILS in a Post. Post on X and be rewarded. It can be combined with other ways.",
    points: "+1",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20The%20Codex%20is%20real.%20So%20is%20the%20fortune.%20Walk%20the%20path%20-%20or%20be%20forgotten.%20%24TAILS%0Ahttps%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1927673989406588989",
  },
  {
    description: "Tag Fellow rescuers",
    help: "Summon Allies - Tag Fellow Rescuers. Tag your friends while you posts. Points stacks up!",
    points: "+1",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20One%20mystery%20box.%20200%20lives%20to%20save.%20The%20Codex%20can't%20wait.%20Who%E2%80%99s%20minting%20with%20me%3F%20%24TAILS%0Ahttps%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1928440571057594726%0A",
  },
  {
    description: "tag @Tokentails",
    help: "Amplify the order. Signal the Tailsguard - Mention @TokenTails in Post. All quests can be completed multiple times.",
    points: "+3",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=The%20Codex%20whispered.%20I%20minted.%20I%20mattered.%0A%40tokentails%20%24TAILS%0Ahttps%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1900186546969432232",
  },
  {
    description: "SHARE OUR MEME",
    help: "Share a Sacred Meme - Post Our Cat Meme Content. Post any meme or craft one on your own! Points stacks up!",
    points: "+3",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20Even%20the%20Codex%20needs%20a%20laugh.%0AMemes%20with%20meaning%20%3E%20memes%20for%20clout.%20%24TAILS%0Ahttps%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1948065811681427542",
  },
  {
    description: "QUOTE OUR POST",
    help: "Speak your own verse. Echo the Codex - Quote a Tails Post with Your Take. Points stacks up!",
    points: "+1",
    image: SocialImages.X,
    href: "https://x.com/intent/post?text=%40tokentails%20I%20didn%E2%80%99t%20scroll%20past%20this.%0AI%20heard%20the%20Codex%20calling%20-%20and%20I%20stepped%20forward.%20%24TAILS%0Ahttps%3A%2F%2Fx.com%2Ftokentails%2Fstatus%2F1942698433154048437",
  },
  {
    description: "Get engagement",
    help: "Rally the Chain - Drive Likes & Comments on Your Tails Content. The higher forces calculate and distribute. It stacks up!",
    points: "+∞",
    image: SocialImages.X,
  },
  {
    description: "Collect 690 catnip",
    help: "Play catnip to complete levels and collect catnip.",
    points: "+690",
    image: cdnFile("logo/catnip.webp"),
    href: "https://tokentails.com/game",
  },
  {
    description: "ADOPT PLAYABLE CAT",
    help: "The bond is sealed in adoption. Multiply Your Blessings - Adopt COLLECTIBLE CAT to Boost Your $TAILS",
    points: "+∞",
    image: cdnFile("images/cats-slider/joy-cat.webp"),
    href: "https://tokentails.com/game",
  },
  {
    description: "Engage In-game",
    help: "Do Quests, redeem on daily basis",
    points: "+∞",
    image: cdnFile("logo/catnip.webp"),
    href: "https://tokentails.com/game",
  },
];

export const SocialAirdropTerms = () => {
  const [modal, setModal] = useState<null | string>(null);

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start lg:mt-8 2xl:mt-16 gap-2 lg:gap-16">
      <div className="flex flex-col items-center">
        <img
          className="w-32"
          src={cdnFile("logo/logo.webp")}
          alt="airdrop-logo"
        />
        <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h1 text-balance px-4">
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-4">
            $TAILS
          </span>
          REWARDS
        </h2>
        <span className="bg-gradient-to-r font-primary from-yellow-300 to-yellow-400 text-black px-3 py-1 pb-2 rounded-md font-bold shadow-lg border-4 border-main-black animate-pulse">
          PHASE 4
        </span>
        <Countdown
          isDaysDisplayed
          isBig
          targetDate={new Date(Date.UTC(2025, 12, 1))}
        />
        <h2 className="font-primary uppercase lg:mt-3 tracking-tight text-h6 md:text-h3 text-balance px-4 pt-4">
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
                  src={cdnFile("logo/logo.webp")}
                  className="w-8 ml-1 -mr-1"
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
            style={bgStyle("5")}
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
