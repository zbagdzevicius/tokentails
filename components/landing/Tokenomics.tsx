import { VestingSchedule } from "@/components/shared/VestingSchedule";
import { PixelButton } from "../shared/PixelButton";
import { useState } from "react";
import { Tag } from "../shared/Tag";
import { Countdown } from "../shared/Countdown";
export const Tokenomics = () => {
  return (
    <div className="pb-4 flex flex-col items-center">
      {/* <a href="/airdrop" className="font-secondary relative mt-7">
        <span className="absolute -top-7 w-full flex">
          <Countdown isDaysDisplayed targetDate={new Date("2025-05-31")} />
        </span>
        <img
          draggable={false}
          src="/logo/chest.webp"
          alt="coin"
          className="h-12 w-12 absolute bottom-0 top-0 -right-6"
        />
        <img
          draggable={false}
          src="/logo/level.png"
          alt="coin"
          className="h-12 w-12 absolute bottom-0 top-0 -left-6"
        />
        <span className="relative z-10">
          <PixelButton text="GET" subtext="AIRDROP" isBig></PixelButton>
        </span>
      </a> */}
      <div className="flex items-center font-primary gap-2 mt-1 text-p5 text-center justify-center">
        REDEEMAL AT TOKEN LAUNCH
      </div>
      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance my-3 mb-6 z-10">
        $TAILS Token
      </h2>
      <div className="flex justify-center items-center gap-4">
        <div className="flex items-center whitespace-nowrap mr-2 font-primary text-p4 bg-yellow-300 pr-2 hover:bg-opacity-100 rounded-xl">
          <img
            draggable={false}
            src="/logo/coin.webp"
            className="min-w-8 w-8 h-8 -ml-1 mr-1"
          />
          100m supply
        </div>

        <span className="relative flex justify-center items-center">
          <Tag>
            <span className="font-bold">TGE</span> - Q2
          </Tag>
          <img
            className="w-12 absolute -top-[44px]"
            src="/logo/logo.webp"
            alt="airdrop-logo"
          />
        </span>
        <div className="flex items-center whitespace-nowrap font-primary text-p4 bg-yellow-300 pl-2 hover:bg-opacity-100 rounded-xl">
          $0.035 at launch
          <img
            draggable={false}
            src="/currency/USDC.webp"
            className="min-w-8 w-8 h-8 ml-1 -mr-1"
          />
        </div>
      </div>
      <VestingSchedule />
    </div>
  );
};
