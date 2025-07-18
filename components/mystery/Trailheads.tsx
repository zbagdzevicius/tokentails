import React from "react";
import { Web3Providers } from "../web3/Web3Providers";
import { PixelButton } from "../shared/PixelButton";
import dynamic from "next/dynamic";
import { TrailheadsImgs } from "../shared/QuestsModal";

const ConnectWallet = dynamic(
  () => import("../web3/minting/Web3Mint").then((mod) => mod.ConnectWallet),
  {
    ssr: false,
    loading: () => (
      <img
        src="/icons/loader.webp"
        className="w-8 h-8 m-auto animate-spin pixelated"
      />
    ),
  }
);

export const TrailheadsRedeem = () => {
  return (
    <div className="flex flex-col items-center gap-2">
      <PixelButton text="REDEEM" />
      <ConnectWallet />
    </div>
  );
};

export const Trailheads = () => {
  return (
    <div className="flex flex-col items-center">
      <img src="/catnip-chaos/trailheads.gif" className="w-52 rounded-2xl" />

      <div className="flex flex-row items-center gap-2 pixelated -mt-12">
        {TrailheadsImgs.map((trailhead, index) => (
          <img key={index} src={trailhead} className="w-20 rounded-2xl -mx-6" />
        ))}
        <img
          src="/blessings/CAMP_TYPE.png"
          className="w-24 -mt-8 rounded-2xl"
        />
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/STICKY/base/IDLE.gif"
          className="w-20 rounded-2xl -mx-6 scale-x-[-1]"
        />
      </div>
      <div className="flex flex-col items-center font-primary">
        <div className="text-p1">
          Do you own{" "}
          <span className="text-yellow-300 drop-shadow-[0_1.6px_1.8px_rgba(0,0,0)]">
            TrailHeads NFT
          </span>{" "}
          ?
        </div>
        <div className="mb-2 text-p4">REDEEM YOUR PLAYABLE CHARACTERS</div>
        <Web3Providers>
          <TrailheadsRedeem />
        </Web3Providers>
      </div>
    </div>
  );
};
