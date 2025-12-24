import React from "react";
import Image from "next/image";
import background from "./sample.png";
import { ICat, cardsIcon, cardsBorderColor } from "@/models/cats";
import powerIcon from "@/public/cards/icons/power.png";

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
      <Image
        src={background}
        alt="Card Back"
        fill
        style={{
          objectFit: "cover",
          opacity: 0.9,
          borderRadius: "20px",
        }}
      />

      <div className="absolute top-[2%] left-[5%] flex items-center gap-2 z-10">
        <div
          className="relative w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: borderColor }}
        >
          <Image
            src={typeIcon}
            alt={cat.type}
            width={22}
            height={22}
            style={{ objectFit: "contain" }}
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
            style={{ backgroundColor: borderColor }}
          >
            <Image
              src={powerIcon}
              alt="power"
              width={22}
              height={22}
              style={{ objectFit: "contain" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CardBack;
