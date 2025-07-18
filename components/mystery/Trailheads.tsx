import React from "react";
import { ConnectWallet } from "../web3/minting/Web3Mint";
import { Web3Providers } from "../web3/Web3Providers";
import { PixelButton } from "../shared/PixelButton";

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
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BEAVER/base/RUNNING.gif"
          className="w-20 rounded-2xl -mx-6"
        />
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOX/base/IDLE.gif"
          className="w-20 rounded-2xl -mx-6"
        />
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GOAT/base/JUMPING.gif"
          className="w-20 rounded-2xl -mx-6"
        />
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OWL/base/RUNNING.gif"
          className="w-20 rounded-2xl -mx-6"
        />
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MOOSE/base/JUMPING.gif"
          className="w-20 rounded-2xl -mx-6"
        />
        <img
          src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RACCON/base/WALKING.gif"
          className="w-20 rounded-2xl -mx-6"
        />
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
