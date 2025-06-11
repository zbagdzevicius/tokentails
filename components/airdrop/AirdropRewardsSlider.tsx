import React from "react";

export const AirdropRewardsSlider = () => {
  const slides = [
    <div
      key="tails"
      className="flex flex-col items-center p-4 rounded-t-2xl min-w-64 animate-appear"
      style={{
        backgroundImage: "url(/backgrounds/bg-4.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <img className="w-12 h-12" draggable={false} src="/logo/coin.webp" />
      <span className="text-p2 text-center">$TAILS AIRDROP</span>
      <span>
        <span className="text-red-700">600k USD</span> in{" "}
        <span className="text-red-700">$TAILS</span>
      </span>
    </div>,
    <div
      key="heroes"
      className="flex flex-col items-center p-4 rounded-t-2xl min-w-64 animate-appear relative"
      style={{
        backgroundImage: "url(/backgrounds/bg-6.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <img className="w-12 h-12" draggable={false} src="/logo/heart.webp" />
      <span className="text-p2 text-center">CATS GUARD AWARDS</span>
      <span>
        <span className="text-red-700">200k USD</span> in{" "}
        <span className="text-red-700">$TAILS</span>
      </span>
      <div className="absolute inset-0 flex items-center justify-center bg-white/50 p-1 w-full h-full z-20 rounded-t-2xl">
        <img className="w-16 h-16" src="/purrquest/sprites/key.png" />
      </div>
    </div>,
    <div
      key="nft"
      className="flex flex-col items-center p-4 rounded-t-2xl min-w-64 animate-appear relative"
      style={{
        backgroundImage: "url(/backgrounds/bg-4.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <img
        className="w-36 h-36 pixelated -mt-14 -mb-10"
        draggable={false}
        src="/cats/pinkie/pink-lamiendo-ropa.gif"
      />
      <span className="text-p2 text-center">MEGA NFT REWARDS</span>
      <span>
        worth
        <span className="text-red-700 ml-1">$200k USD</span>
      </span>
      <div className="absolute inset-0 flex items-center justify-center bg-white/50 p-1 w-full h-full z-20 rounded-t-2xl">
        <img className="w-16 h-16" src="/purrquest/sprites/key.png" />
      </div>
    </div>,
  ];

  return (
    <div className="slider max-w-screen overflow-hidden h-36 font-primary lg:absolute bottom-0">
      <div className="slide-track-airdrop">
        {slides}
        {slides}
        {slides}
        {slides}
      </div>
    </div>
  );
};
