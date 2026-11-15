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
        rel="noopener noreferrer"
        aria-label="Token Tails on X (opens in a new tab)"
        href="https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton"
      >
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/x.webp")}
          alt=""
          draggable="false"
        />
      </a>
      <a
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Token Tails on Instagram (opens in a new tab)"
        href="https://instagram.com/tokentails"
      >
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/ig.webp")}
          alt=""
          draggable="false"
        />
      </a>
      <a
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Token Tails on TikTok (opens in a new tab)"
        href="https://tiktok.com/@tokentails"
      >
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/tiktok.webp")}
          alt=""
          draggable="false"
        />
      </a>
      <a
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Token Tails on Discord (opens in a new tab)"
        href="https://discord.gg/4FVYmnd7Hg"
      >
        <img
          className="w-8 md:w-12 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/discord.webp")}
          alt=""
          draggable="false"
        />
      </a>
    </div>
  );
};
