import React from "react";

const Roadmap = () => {
  return (
    <div className="container flex flex-col py-8 justify-center items-center">
      <div className="flex justify-center items-center gap-4 mb-8">
        <img src="/logo/paw.png" className="w-14" />
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          ROADMEOW
        </h2>
        <img src="/logo/paw.png" className="w-14" />
      </div>
      <div className="flex flex-col md:flex-row justify-around gap-16 md:gap-24 pt-16 md:pt-4">
        <div className="flex flex-col items-center gap-4 md:pt-36 hover:brightness-125 hover:animate-hover">
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
          <h2 className="font-secondary text-h2">2024</h2>
          <div className="flex flex-col font-bold text-p4">
            <span className="flex gap-2 items-center">
              <img className="h-6" src="icons/check.webp" />
              50k Players
            </span>
            <span className="flex gap-2 items-center">
              <img className="h-6" src="icons/check.webp" />
              Launch Game MVP
            </span>
            <span className="flex gap-2 items-center">
              <img className="h-6" src="icons/check.webp" />
              Shelters Infrastructure
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-12 hover:brightness-125 hover:animate-hover">
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
          <h2 className="font-secondary text-h2">2025 Q1</h2>
          <div className="flex flex-col font-bold text-p4">
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-6" src="icons/loader.webp" />
              Tokenize your cat
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-6" src="icons/loader.webp" />
              Story mode game
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-6" src="icons/loader.webp" />
              KOLs share platform
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 hover:brightness-125 hover:animate-hover">
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
          <h2 className="font-secondary text-h2">2025 Q2</h2>
          <div className="flex flex-col text-p4 font-bold">
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-6" src="icons/loader.webp" />
              TGE
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-6" src="icons/loader.webp" />
              Social AI Agents
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img className="h-6" src="icons/loader.webp" />
              In-game Marketplace
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
