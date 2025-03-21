import React from "react";
import { PixelButton } from "../shared/PixelButton";

const Roadmap = () => {
  return (
    <div className="container flex flex-col py-8 justify-center items-center">
      <h2 className="font-primary uppercase tracking-tight text-h3 md:text-h2 lg:text-h1 text-balance mb-8">
        WHAT'S NEXT?
      </h2>
      <a href="/game" className="-mt-6 mb-4">
        <PixelButton text="PLAY TO SAVE" />
      </a>
      <div className="flex flex-col md:flex-row justify-around gap-16 lg:gap-24 pt-16 md:pt-4">
        <div className="flex flex-col items-center gap-4 md:pt-36 hover:brightness-125 hover:animate-hover">
          <div className="relative bg-gradient-to-t to-purple-300 from-blue-300 rounded-full border-4 border-purple-300 w-16 h-16 flex justify-center items-center">
            <img
              draggable={false}
              className="w-10 absolute left-0 right-0 -top-14 m-auto"
              src="icons/check.webp"
            />
            <img
              draggable={false}
              className="h-32 w-32 max-w-[200px] mt-8"
              src="/cats/grey/Loaf-Clothed-Grey.gif"
            />
          </div>
          <h2 className="font-primary text-h2">2024</h2>
          <div className="flex flex-col font-secondary text-p2 font-bold">
            <span className="flex gap-2 items-center">
              <img draggable={false} className="h-6" src="icons/check.webp" />
              50k Players
            </span>
            <span className="flex gap-2 items-center whitespace-nowrap">
              <img draggable={false} className="h-6" src="icons/check.webp" />
              Launch Game MVP
            </span>
            <span className="flex gap-2 items-center whitespace-nowrap">
              <img draggable={false} className="h-6" src="icons/check.webp" />
              Shelters Infra
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 md:pt-12 hover:brightness-125 hover:animate-hover">
          <div className="relative bg-gradient-to-t to-purple-300 from-blue-300 rounded-full border-4 border-purple-300 w-16 h-16 flex justify-center items-center">
            <img
              draggable={false}
              className="w-10 absolute left-0 right-0 -top-14 m-auto"
              src="icons/check.webp"
            />
            <img
              draggable={false}
              className="h-32 w-32 max-w-[200px]"
              src="/cats/siamese/jugando Ropa Siames.gif"
            />
          </div>
          <h2 className="font-primary text-h2 whitespace-nowrap">2025 Q1</h2>
          <div className="flex flex-col font-secondary text-p2 font-bold">
            <span className="flex gap-2 items-center -ml-6">
              <img draggable={false} className="h-6" src="icons/check.webp" />
              Tokenize your cat
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img draggable={false} className="h-6" src="icons/check.webp" />
              Social AI Agents
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img draggable={false} className="h-6" src="icons/check.webp" />
              APP BETA TESTING
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 hover:brightness-125 hover:animate-hover">
          <div className="relative bg-gradient-to-t to-purple-300 from-blue-300 rounded-full border-4 border-purple-300 w-16 h-16 flex justify-center items-center">
            <img
              draggable={false}
              className="w-10 absolute left-0 right-0 -top-14 m-auto pixelated"
              src="icons/loader.webp"
            />
            <img
              draggable={false}
              className="h-32 w-32 max-w-[200px]"
              src="/cats/yellow/Jump-Hat-Yellow.gif"
            />
          </div>
          <h2 className="font-primary text-h2 whitespace-nowrap">2025 Q2</h2>
          <div className="flex flex-col font-secondary text-p2 font-bold">
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6 pixelated"
                src="icons/loader.webp"
              />
              TGE
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6 pixelated"
                src="icons/loader.webp"
              />
              MMO GAME
            </span>
            <span className="flex gap-2 items-center -ml-6">
              <img
                draggable={false}
                className="h-6 pixelated"
                src="icons/loader.webp"
              />
              Marketplace
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
