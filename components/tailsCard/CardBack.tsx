import { ICat, cardsBorderColor, cardsIcon } from "@/models/cats";
import React, { useMemo } from "react";

type CardBackProps = {
  cat: ICat;
};

const POWER = 7; // TODO: Replace with actual cat power value

export const CardBack: React.FC<CardBackProps> = React.memo(({ cat }) => {
  // Memoize lookups
  const typeIcon = useMemo(() => cardsIcon[cat.type], [cat.type]);
  const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);

  // Memoize power array to prevent recreation
  const powerArray = useMemo(() => Array.from({ length: POWER }), []);

  return (
    <div className="w-full h-full relative">
      <img
        draggable={false}
        src={"/sample.png"}
        alt="Card Back"
        className="opacity-90 w-full h-full object-cover"
      />

      <div className="absolute top-[2%] left-[5%] flex items-center gap-2 z-10">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: borderColor }}
        >
          <img
            draggable={false}
            src={typeIcon}
            alt={cat.type}
            className="object-contain w-[22px] h-[22px]"
          />
        </div>
        <span
          className="text-black font-bold font-primary text-[28px] [text-shadow:2px_2px_4px_rgba(0,0,0,0.3)]"
          style={{
            WebkitTextStroke: `1px ${borderColor}`,
          }}
        >
          {cat.name}
        </span>
      </div>

      <div className="absolute bottom-[2%] left-[5%] flex items-center gap-2 z-10">
        <span
          className="text-black font-bold font-primary text-2xl [text-shadow:2px_2px_4px_rgba(0,0,0,0.3)]"
          style={{
            WebkitTextStroke: `1px ${borderColor}`,
          }}
        >
          Power
        </span>
        {powerArray.map((_, index) => (
          <div
            key={index}
            className="w-6 h-6 rounded-full flex items-center justify-center [box-shadow:0px_1.5px_0px_0px_rgba(0,0,0,0.25)]"
            style={{
              backgroundColor: borderColor,
            }}
          >
            <img
              draggable={false}
              src="/cards/icons/power.webp"
              alt="power"
              className="object-contain w-[22px] h-[22px]"
            />
          </div>
        ))}
      </div>
    </div>
  );
});
