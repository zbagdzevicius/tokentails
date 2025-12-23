import { cdnFile } from "@/constants/utils";
import React from "react";

export const Socials = ({ isVertical }: { isVertical?: boolean }) => {
  return (
    <div
      className={`flex gap-2 transition-all duration-300 ${
        isVertical ? "flex-col" : "flex-row justify-center"
      }`}
    >
      <a
        target="_blank"
        href="https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton"
      >
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/x.webp")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://instagram.com/tokentails">
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/ig.webp")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://tiktok.com/@tokentails">
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/tiktok.webp")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://t.me/+ofyPNIfNX5w4ZjM8">
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/telegram.webp")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://discord.gg/4FVYmnd7Hg">
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/discord.webp")}
          draggable="false"
        />
      </a>
    </div>
  );
};
