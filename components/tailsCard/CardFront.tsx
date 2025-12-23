import React from "react";
import { ICat } from "@/models/cats";
import Image from "next/image";
import ellipse from "./assets/backgrounds/ellipse.png";
import { countryFlagMap } from "./data";

type CardFrontProps = {
  cat: ICat;
  blessing: any;
  shelterName: string;
  getPlainText: (html: string) => string;
  limitWords: (text: string, maxWords?: number) => string;
};

export const CardFront: React.FC<CardFrontProps> = ({
  cat,
  blessing,
  shelterName,
  getPlainText,
  limitWords,
}) => {
  const shelterCountry = cat.shelter?.country || "US";
  const flagPath =
    countryFlagMap[shelterCountry.toUpperCase()] || countryFlagMap["US"];

  return (
    <div className="w-[88%] h-[93%] flex flex-col">
      {/* Card Content */}
      <div className="flex-1 flex flex-col p-[3.5%]">
        {/* Header with Name and Flag */}
        <div className="flex justify-between items-center mb-[2.5%] gap-2">
          <h2
            className="font-normal text-black drop-shadow-md flex-1 leading-tight font-primary"
            style={{ fontSize: "clamp(18px, 4.5vw, 28px)" }}
          >
            {blessing?.name || cat.name}
          </h2>
          <Image
            src={flagPath}
            alt="Country Flag"
            width={64}
            height={48}
            className="object-cover border-[2px] border-white rounded-[8px] flex-shrink-0"
            style={{
              width: "clamp(48px, 13%, 65px)",
              height: "auto",
            }}
          />
        </div>

        {/* Cat Image */}
        <div
          className="bg-white rounded-[12px] mb-[2.5%] shadow-xl flex-shrink-0"
          style={{ padding: "1.8%" }}
        >
          <div className="relative w-full aspect-[5/3] rounded-[8px] overflow-hidden">
            {blessing?.image?.url ? (
              <Image
                src={blessing.image.url}
                alt={blessing.name}
                fill
                className="object-cover relative z-10"
              />
            ) : (
              <Image
                src={cat.catImg}
                alt={cat.name}
                fill
                className="object-cover relative z-10"
              />
            )}
          </div>
        </div>

        {/* Shelter and Status Info */}
        <div className="grid grid-cols-2 gap-[2.5%] mb-[2.5%]">
          <div>
            <h3
              className="font-black text-black mb-1 leading-tight font-primary"
              style={{ fontSize: "clamp(12px, 3vw, 18px)" }}
            >
              Shelter
            </h3>
            <p
              className="text-black leading-tight"
              style={{
                fontSize: "clamp(11px, 2.5vw, 15px)",
                fontFamily: "Nunito, sans-serif",
                fontWeight: 700,
              }}
            >
              {shelterName || "Unknown"}
            </p>
          </div>
          <div>
            <h3
              className="font-black text-black mb-1 leading-tight font-primary"
              style={{ fontSize: "clamp(12px, 3vw, 18px)" }}
            >
              Status
            </h3>
            <p
              className="text-black leading-tight"
              style={{
                fontSize: "clamp(11px, 2.5vw, 15px)",
                fontFamily: "Nunito, sans-serif",
                fontWeight: 700,
              }}
            >
              Waiting for home
            </p>
          </div>
        </div>

        {/* Divider */}
        <div
          className="bg-white rounded-full mb-[2.5%]"
          style={{ height: "2.5px" }}
        ></div>

        {/* Pet Story */}
        <div className="flex-1 min-h-0">
          <h3
            className="font-black text-black mb-1 leading-tight font-primary"
            style={{ fontSize: "clamp(14px, 3.5vw, 20px)" }}
          >
            Pet Story
          </h3>
          <div
            className="text-black leading-snug overflow-hidden"
            style={{
              fontSize: "clamp(10px, 2.2vw, 13px)",
              fontFamily: "Nunito, sans-serif",
              fontWeight: 700,
            }}
          >
            {blessing?.description ? (
              <p className="line-clamp-6">
                {limitWords(getPlainText(blessing.description), 45)}
              </p>
            ) : (
              <p className="line-clamp-6">
                {limitWords(getPlainText(cat.resqueStory), 45)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardFront;
