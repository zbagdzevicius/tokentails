import { ICat, cardsBorderColor, cardsIcon } from "@/models/cats";
import React from "react";

type CardBackProps = {
  cat: ICat;
};

const POWER = 7; // TODO: Replace with actual cat power value

export const CardBack: React.FC<CardBackProps> = ({ cat }) => {
  const typeIcon = cardsIcon[cat.type];
  const borderColor = cardsBorderColor[cat.type];

  return (
    <div
      className="w-full h-full relative"
      style={{ borderRadius: "20px", overflow: "hidden" }}
    >
      <img
        draggable={false}
        src={"/sample.png"}
        alt="Card Back"
        className="opacity-90 object-cover"
      />

      <div className="absolute top-[2%] left-[5%] flex items-center gap-2 z-10">
        <div
          className="relative w-7 h-7 rounded-full flex items-center justify-center"
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
          className="text-black font-bold"
          style={{
            fontSize: "28px",
            fontFamily: "Passion One",
            WebkitTextStroke: `1px ${borderColor}`,
            textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          {cat.name}
        </span>
      </div>

      <div className="absolute bottom-[2%] left-[5%] flex items-center gap-2 z-10">
        <span
          className="text-black font-bold"
          style={{
            fontSize: "24px",
            fontFamily: "Passion One",
            WebkitTextStroke: `1px ${borderColor}`,
            textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          Power
        </span>
        {Array.from({ length: POWER }).map((_, index) => (
          <div
            key={index}
            className="relative w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: borderColor,
              boxShadow: "0px 1.5px 0px 0px #00000040",
            }}
          >
            <img
              src="/cards/icons/power.webp"
              alt="power"
              className="object-contain w-[22px] h-[22px]"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CardBack;
