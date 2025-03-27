import React from "react";

export const Socials = () => {
  return (
    <div className="flex gap-2 justify-center">
      <a
        target="_blank"
        href="https://x.com/intent/follow?screen_name=tokentails&tw_p=followbutton"
      >
        <img className="w-8" src="/icons/social/x.webp" draggable="false" />
      </a>
      <a target="_blank" href="https://instagram.com/tokentails">
        <img
          className="w-8"
          src="/icons/social/instagram.png"
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://tiktok.com/@tokentails">
        <img className="w-8" src="/icons/social/tiktok.png" draggable="false" />
      </a>
      <a target="_blank" href="https://t.me/+ofyPNIfNX5w4ZjM8">
        <img
          className="w-8"
          src="/icons/social/telegram.png"
          draggable="false"
        />
      </a>
      <a target="_blank" href="https://discord.gg/4FVYmnd7Hg">
        <img
          className="w-8"
          src="/icons/social/discord.png"
          draggable="false"
        />
      </a>
      <a target="_blank" href="mailto:info@tokentails.com">
        <img className="w-8" src="/icons/social/email.png" draggable="false" />
      </a>
    </div>
  );
};
