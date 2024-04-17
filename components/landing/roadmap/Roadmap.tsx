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
      <div className="flex flex-col md:flex-row justify-around gap-4 md:gap-0 pt-4">
        <div className="flex flex-col items-center gap-4 md:pt-36">
          <div className="bg-gradient-to-r to-main-rusty from-main-grape rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center mb-4">
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/grey/Loaf-Clothed-Grey.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2024 Q2</h2>
          <div className="flex flex-col items-center">
            <span>MVP release: Virtual cat shelter</span>
            <span>Cat NFT launch</span>
            <span>Shelters Collab</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-24">
          <div className="bg-gradient-to-r from-main-ember to-main-rusty rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center mb-4">
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/pinkie/pink-lamiendo-ropa.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2024 Q3</h2>
          <div className="flex flex-col items-center">
            <span>Full version: Purrquest</span>
            <span>$TAILS listing</span>
            <span>Mystery boxes</span>
            <span>Affiliate system</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-12">
          <div className="bg-gradient-to-r to-main-ember from-main-rusty rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center mb-4">
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/siamese/jugando Ropa Siames.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2024 Q4</h2>
          <div className="flex flex-col items-center">
            <span>Skins & Customizations</span>
            <span>NFT royalties system</span>
            <span>NFT marketplace</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="bg-gradient-to-r to-main-grape from-main-rusty rounded-full border b-gray-500 w-16 h-16 flex justify-center items-center mb-4">
            <img
              className="h-32 w-32 max-w-[200px]"
              src="/cats/yellow/Jump-Hat-Yellow.gif"
            />
          </div>
          <h2 className="font-secondary text-h3">2025 Q1</h2>
          <div className="flex flex-col items-center">
            <span>Cross-chain expansion</span>
            <span>Breeding</span>
            <span>Quests</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
