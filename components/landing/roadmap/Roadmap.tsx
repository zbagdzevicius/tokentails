import React from "react";

const Roadmap = () => {
  return (
    <div className="container">
      <div className="flex justify-center items-center gap-4">
        <img src="/logo/paw.png" className="w-14" />
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          ROADMEOW
        </h2>
        <img src="/logo/paw.png" className="w-14" />
      </div>
      <div className="flex flex-col md:flex-row justify-around gap-16 md:gap-0 pt-16 md:pt-4">
        <div className="flex flex-col items-center gap-4 md:pt-36">
          <div className="relative bg-gradient-to-r to-main-rusty from-main-grape rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center">
            <img
              className="w-10 absolute left-0 right-0 -top-14 m-auto"
              src="icons/check.webp"
            />
            <img
              className="h-32 w-32 max-w-[200px] mt-8"
              src="/cats/grey/Loaf-Clothed-Grey.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2024 Q2</h2>
          <div className="flex flex-col">
            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              Demo
            </span>
            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              Cat NFTs launch
            </span>
            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              Virtual cat shelter
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-24">
          <div className="relative bg-gradient-to-r from-main-ember to-main-rusty rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center">
            <img
              className="w-10 absolute left-0 right-0 -top-14 m-auto"
              src="icons/check.webp"
            />
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/pinkie/pink-lamiendo-ropa.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2024 Q3</h2>
          <div className="flex flex-col">
            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              Quests
            </span>

            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              Cat home
            </span>

            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              Purrquest
            </span>

            <span className="flex gap-2 items-center">
              <img className="h-4" src="icons/check.webp" />
              MVP - TG game
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-12">
          <div className="relative bg-gradient-to-r to-main-ember from-main-rusty rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center">
            <img
              className="w-10 absolute left-0 right-0 -top-14 m-auto"
              src="icons/loader.webp"
            />
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/siamese/jugando Ropa Siames.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2024 Q4</h2>
          <div className="flex flex-col">
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-4" src="icons/check.webp" />
              Cross-Play
            </span>
            <span>Stake to Craft</span>
            <span>$TAILS listing</span>
            <span>Clash of Claws</span>
            <span>Skins & Customizations</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative bg-gradient-to-r to-main-grape from-main-rusty rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center">
            <img
              className="w-10 absolute left-0 right-0 -top-14 m-auto"
              src="icons/loader.webp"
            />
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/yellow/Jump-Hat-Yellow.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2025 Q1</h2>
          <div className="flex flex-col">
            <span>New pets</span>
            <span>NFT Breeding</span>
            <span>Builders initiative</span>
            <span>RWA Merchandise</span>
            <span>Cross-chain expansion</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
