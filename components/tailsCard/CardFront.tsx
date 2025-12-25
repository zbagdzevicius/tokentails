import { IBlessing, ICat, cardsBorderColor } from "@/models/cats";
import React from "react";
import { countryFlagMap } from "./data";

type CardFrontProps = {
  cat: ICat;
  blessing: IBlessing;
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
  const borderColor = cardsBorderColor[cat.type];

  return (
    <div className="w-[88%] h-[93%] flex flex-col">
      <div className="flex-1 flex flex-col p-[3.5%]">
        <div className="flex justify-between items-center mb-[2.5%] gap-2">
          <h2
            className="font-normal text-black drop-shadow-md flex-1 leading-tight font-primary"
            style={{ fontSize: "clamp(18px, 4.5vw, 28px)" }}
          >
            {blessing?.name || cat.name}
          </h2>
          <img
            draggable={false}
            src={flagPath}
            alt="Country Flag"
            className="object-cover border-2 border-white rounded-[8px] flex-shrink-0"
            style={{
              width: "clamp(52px, 25%, 82px)",
              height: "auto",
            }}
          />
        </div>

        <div className="relative w-full aspect-[5/3] rounded-[12px] overflow-hidden mb-[2.5%] shadow-xl flex-shrink-0">
          {blessing?.image?.url ? (
            <img
              draggable={false}
              src={blessing.image.url}
              alt={blessing.name}
              className="object-cover"
            />
          ) : (
            <img
              draggable={false}
              src={cat.catImg}
              alt={cat.name}
              className="object-cover"
            />
          )}
          <div
            className="absolute inset-0 opacity-50"
            style={{ backgroundColor: borderColor }}
          ></div>
          <div className="absolute inset-[2px] rounded-[10px] overflow-hidden">
            {blessing?.image?.url ? (
              <img
                draggable={false}
                src={blessing.image.url}
                alt={blessing.name}
                className="object-cover"
              />
            ) : (
              <img
                draggable={false}
                src={cat.catImg}
                alt={cat.name}
                className="object-cover"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[2.5%] mb-[2.5%]">
          <div>
            <h3
              className="text-black mb-1 leading-tight font-primary"
              style={{ fontSize: "clamp(12px, 3vw, 22px)" }}
            >
              Shelter
            </h3>
            <p
              className="text-black leading-tight"
              style={{
                fontSize: "clamp(11px, 2.5vw, 13px)",
                fontFamily: "Nunito, sans-serif",
                fontWeight: 700,
              }}
            >
              {shelterName || "Unknown"}
            </p>
          </div>
          <div>
            <h3
              className="text-black mb-1 leading-tight font-primary"
              style={{ fontSize: "clamp(12px, 3vw, 22px)" }}
            >
              Status
            </h3>
            <p
              className="text-black leading-tight"
              style={{
                fontSize: "clamp(11px, 2.5vw, 13px)",
                fontFamily: "Nunito, sans-serif",
                fontWeight: 700,
              }}
            >
              Waiting for home
            </p>
          </div>
        </div>

        <div
          className="rounded-full mb-[2.5%]"
          style={{
            height: "2.5px",
            backgroundColor: borderColor,
            boxShadow: "0px 2.5px 0px 0px #00000040",
          }}
        />

        <div className="flex-1 min-h-0">
          <h3
            className="text-black mb-1 leading-tight font-primary"
            style={{ fontSize: "clamp(14px, 3.5vw, 22px)" }}
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
