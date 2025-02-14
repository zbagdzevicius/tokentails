import React from "react";
import { PixelButton } from "../shared/PixelButton";

const sponsorImages: { src: string; link: string }[] = [
  {
    src: "/images/dapp/dappradar.webp",
    link: "https://dappradar.com/dapp/token-tails/",
  },
  {
    src: "/images/dapp/dapplist.webp",
    link: "https://thedapplist.com/project/token-tails",
  },
  {
    src: "/currency/XLM.webp",
    link: "https://x.com/BuildOnStellar/status/1796241035766677885",
  },
  {
    src: "/images/dapp/carbify.webp",
    link: "https://x.com/tokentails/status/1811408751288529056",
  },
  {
    src: "/images/dapp/gamefi.webp",
    link: "https://gamefi.org/games/token-tails",
  },
  {
    src: "/images/dapp/skale.png",
    link: "https://skale.space/blog/a-purrfect-match-token-tails-partners-with-skale-for-gas-free-gaming-experience",
  },
  {
    src: "/images/dapp/diamante.webp",
    link: "https://diam-io.medium.com/diamante-blockchain-joins-forces-with-token-tails-to-lead-the-web3-gaming-revolution-e2e7f95d1b0a",
  },
  {
    src: "/images/dapp/sekuya_logo.jpeg",
    link: "https://sekuya.io/news/sekuya-x-token-tails-partnership",
  },
  {
    src: "/images/dapp/ggem.webp",
    link: "https://ggem.gg/news/ggem-partners-with-token-tails-to-save-real-cats-through-gaming",
  },
  {
    src: "/images/dapp/data.webp",
    link: "https://www.rootdata.com/Projects/detail/Token%20Tails?k=MTQ3NjA%3D",
  },
  {
    src: "/images/dapp/playtoearn.webp",
    link: "https://playtoearn.com/blockchaingame/token-tails?rel=search",
  },
  {
    src: "/images/dapp/chronicle.webp",
    link: "https://markets.chroniclejournal.com/chroniclejournal/news/article/marketersmedia-2024-12-10-token-tails-launches-groundbreaking-blockchain-game-to-save-shelter-cats-and-boost-investments",
  },
  {
    src: "/images/dapp/isotopic.webp",
    link: "https://isotopic.io/game/?game=Token_Tails",
  },
  {
    src: "/images/sponsor/earn-alliance.webp",
    link: "https://www.earnalliance.com/games/token-tails",
  },
  {
    src: "/images/dapp/magic.webp",
    link: "https://magicsquare.io/store/app/token-tails",
  },
  {
    src: "/images/dapp/doglibre.webp",
    link: "https://blog.doglibre.com/doglibre-x-token-tails-a-partnership-for-paws-and-play-81a7210a7635",
  },
  {
    src: "/images/dapp/spintop.webp",
    link: "https://spintop.network/gamepedia/games/token-tails",
  },
  {
    src: "/images/dapp/tonapp.webp",
    link: "https://ton.app/games/token-tails?id=3901",
  },
];

export const GameAggregators = () => {
  return (
    <div className="flex flex-wrap gap-2 relative justify-center">
      <div className="absolute left-1/2 -translate-x-1/2 rem:-top-[38px] px-4 bg-gradient-to-r text-p4 from-purple-400 to-blue-400 text-white rounded-full font-secondary">
        READ ABOUT US
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        {sponsorImages.map((sponsorImage, index) => (
          <a
            key={index}
            href={sponsorImage.link}
            target="_blank"
            className="hover:brightness-150 hover:scale-110"
          >
            <img src={sponsorImage.src} className="h-12 w-auto" />
          </a>
        ))}
      </div>
    </div>
  );
};
