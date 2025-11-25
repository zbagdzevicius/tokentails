import { cdnFile } from "@/constants/utils";
import React from "react";

export const Socials = ({ isVertical }: { isVertical?: boolean }) => {
  return (
    <div
      className={`flex gap-2 ${
        isVertical ? "flex-col" : "flex-row justify-center"
      }`}
    >
      <a
        target="_blank"
        href="https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton"
      >
        <img
          className="w-8 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/x.webp")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://instagram.com/tokentails">
        <img
          className="w-8 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/instagram.png")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://tiktok.com/@tokentails">
        <img
          className="w-8 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/tiktok.png")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://t.me/+ofyPNIfNX5w4ZjM8">
        <img
          className="w-8 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/telegram.png")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://discord.gg/4FVYmnd7Hg">
        <img
          className="w-8 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/discord.png")}
          draggable="false"
        />
      </a>
      <a target="_blank" href="mailto:info@tokentails.com">
        <img
          className="w-8 hover:scale-125 transition-all duration-300"
          src={cdnFile("icons/social/email.png")}
          draggable="false"
        />
      </a>
    </div>
  );
};
