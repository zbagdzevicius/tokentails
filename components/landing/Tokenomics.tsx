import { VestingSchedule } from "@/components/shared/VestingSchedule";
import { PixelButton } from "../shared/PixelButton";
import { useState } from "react";
import { Tag } from "../shared/Tag";
export const Tokenomics = () => {
  const [showSchedule, setShowSchedule] = useState(false);
  return (
    <div className="pb-4 md:mx-auto flex flex-col items-center max-w-[1780px]">
      <div className="flex justify-center items-center gap-4">
        <img draggable={false} src="/logo/coin.webp" className="w-14" />
        <h2 className="text-center font-secondary uppercase tracking-tight text-h3 md:text-8xl">
          $TAILS Tokens
        </h2>
        <img draggable={false} src="/logo/coin.webp" className="w-14" />
      </div>
      <div className="flex justify-center items-center gap-4 w-full mb-4">
        <a href="/game">
          <PixelButton text="PLAY TO SAVE" />
        </a>
        <span>
          <Tag>
            <span className="font-bold">TGE</span> - Q2
          </Tag>
        </span>
        <PixelButton
          onClick={() => setShowSchedule(!showSchedule)}
          text={showSchedule ? "HIDE VESTING" : "SHOW VESTING"}
        />
      </div>
      {showSchedule && <VestingSchedule />}
    </div>
  );
};
