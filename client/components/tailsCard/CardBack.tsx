import { cdnFile } from "@/constants/utils";
import { IBlessing, ICat, cardsBorderColor, cardsIcon } from "@/models/cats";
import React, { useMemo } from "react";
import { cardPx } from "./cardScale";

type CardBackProps = {
  cat: ICat;
  blessing: IBlessing;
};

const POWER = 1; // TODO: Replace with actual cat power value

export const CardBack: React.FC<CardBackProps> = React.memo(
  ({ cat, blessing }) => {
    // Memoize lookups
    const typeIcon = useMemo(() => cardsIcon[cat.type], [cat.type]);
    const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);

    // Memoize power array to prevent recreation
    const powerArray = useMemo(() => Array.from({ length: POWER }), []);

    return (
      <div className="w-full h-full relative">
        <img
          draggable={false}
          src={
            blessing?.catAvatar?.url ||
            cdnFile("cards/backgrounds/card-placeholder.webp")
          }
          alt="Card Back"
          className="opacity-90 w-full h-full object-cover"
        />

        <div className="absolute top-[2%] left-[5%] flex items-center gap-[2cqw] z-10">
          <div
            className="w-[7cqw] h-[7cqw] rounded-full flex items-center justify-center"
            style={{ backgroundColor: borderColor }}
          >
            <img
              draggable={false}
              src={typeIcon}
              alt={cat.type}
              className="object-contain w-[5.5cqw] h-[5.5cqw]"
            />
          </div>
          <span
            className="text-black font-bold font-primary text-[length:7cqw] [text-shadow:0.5cqw_0.5cqw_1cqw_rgba(0,0,0,0.3)]"
            style={{
              WebkitTextStroke: `${cardPx(1)} ${borderColor}`,
            }}
          >
            {cat.name}
          </span>
        </div>

        <div className="absolute bottom-[2%] left-[5%] flex items-center gap-[2cqw] z-10">
          <span
            className="text-black font-bold font-primary text-[length:6cqw] [text-shadow:0.5cqw_0.5cqw_1cqw_rgba(0,0,0,0.3)]"
            style={{
              WebkitTextStroke: `${cardPx(1)} ${borderColor}`,
            }}
          >
            Power
          </span>
          {powerArray.map((_, index) => (
            <div
              key={index}
              className="w-[6cqw] h-[6cqw] rounded-full flex items-center justify-center [box-shadow:0_0.375cqw_0_0_rgba(0,0,0,0.25)]"
              style={{
                backgroundColor: borderColor,
              }}
            >
              <img
                draggable={false}
                src={cdnFile("cards/icons/power.webp")}
                alt="power"
                className="object-contain w-[5.5cqw] h-[5.5cqw]"
              />
            </div>
          ))}
        </div>
      </div>
    );
  },
);
