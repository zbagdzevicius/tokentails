import { ICat } from "@/models/cats";
import React from "react";
import { getMultiplier } from "../CatCardModal";
import { PixelButton } from "./PixelButton";

export const CatMiniCard = ({ cat }: { cat: ICat }) => {
  return (
    <div>
      <div className="relative overflow-hidden w-48 rounded-xl py-2 border-2 border-black">
        <div className="absolute left-2 top-1 opacity-75 text-black px-2 text-p5 font-secondary rounded-xl bg-yellow-300 z-20">
          X{getMultiplier(cat)}
        </div>
        <div className="relative z-10 items-center flex flex-col">
          <img
            className="w-16 z-10 pixelated"
            src={cat.catImg}
            alt={cat.name}
          />
          <img
            className="w-8 mb-2 -mt-8 z-0 animate-spin"
            src={`ability/${cat.type}.png`}
            alt={`${cat.type} icon`}
          />
          <div className="text-p4 bg-red-600 font-secondary text-white w-full text-center opacity-75 mb-2 border-y-2 border-black">
            {cat.name}
          </div>
          <a href="/game">
            <PixelButton text="Play" />
          </a>
        </div>
        <img
          className="absolute inset-0 object-cover w-full h-full z-0"
          src={`ability/${cat.type}_BG.webp`}
          alt={`${cat.type} background`}
        />
      </div>
    </div>
  );
};
