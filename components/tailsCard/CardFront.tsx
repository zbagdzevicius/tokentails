import { IBlessing, ICat, cardsBorderColor } from "@/models/cats";
import React, { useMemo } from "react";
import { countryFlagMap } from "./data";

type CardFrontProps = {
  cat: ICat;
  blessing: IBlessing;
  shelterName: string;
  getPlainText: (html: string) => string;
  limitWords: (text: string, maxWords?: number) => string;
};

export const CardFront: React.FC<CardFrontProps> = React.memo(
  ({ cat, blessing, shelterName, getPlainText, limitWords }) => {
    // Memoize computed values
    const shelterCountry = useMemo(
      () => cat.shelter?.country || "US",
      [cat.shelter?.country]
    );
    const flagPath = useMemo(
      () =>
        countryFlagMap[shelterCountry.toUpperCase()] || countryFlagMap["US"],
      [shelterCountry]
    );
    const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);
    const imageUrl = useMemo(
      () => blessing?.image?.url || cat.catImg,
      [blessing?.image?.url, cat.catImg]
    );
    const imageAlt = useMemo(
      () => blessing?.name || cat.name,
      [blessing?.name, cat.name]
    );
    const displayName = useMemo(
      () => blessing?.name || cat.name,
      [blessing?.name, cat.name]
    );
    const description = useMemo(
      () => blessing?.description || cat.resqueStory,
      [blessing?.description, cat.resqueStory]
    );

    return (
      <div className="w-[88%] h-[93%] flex flex-col">
        <div className="flex-1 flex flex-col p-[3.5%]">
          <div className="flex justify-between items-center mb-[2.5%] gap-2">
            <h2 className="font-normal text-black drop-shadow-md flex-1 leading-tight font-primary text-[clamp(18px,4.5vw,28px)]">
              {displayName}
            </h2>
            <img
              draggable={false}
              src={flagPath}
              alt="Country Flag"
              className="object-cover border-2 border-white rounded-[8px] flex-shrink-0 w-[clamp(52px,25%,82px)] h-auto"
            />
          </div>

          <div className="relative border-b-2 border-[#00000040] w-full aspect-[5/3] rounded-[12px] overflow-hidden mb-[4.5%] shadow-xl flex-shrink-0">
            <img
              draggable={false}
              src={imageUrl}
              alt={imageAlt}
              className="object-cover w-full h-full"
            />
            <div
              className="absolute inset-0 opacity-50"
              style={{ backgroundColor: borderColor }}
            />
            <div className="absolute inset-[2px] rounded-[10px] overflow-hidden">
              <img
                draggable={false}
                src={imageUrl}
                alt={imageAlt}
                className="object-cover w-full h-full"
              />
            </div>
          </div>

          <div className="flex justify-between mb-[4.5%]">
            <div>
              <h3 className="text-black mb-0.5 leading-tight font-primary text-[clamp(12px,3vw,22px)]">
                Shelter
              </h3>
              <p className="text-black leading-tight font-tertiary font-bold text-[clamp(11px,2.5vw,13px)]">
                {shelterName || "Unknown"}
              </p>
            </div>
            <div>
              <h3 className="text-black mb-0.5 leading-tight font-primary text-[clamp(12px,3vw,22px)]">
                Status
              </h3>
              <p className="text-black leading-tight font-tertiary font-bold text-[clamp(11px,2.5vw,13px)]">
                Waiting for home
              </p>
            </div>
          </div>

          <div
            className="mb-[4.5%] rounded-full border-b-2 border-[#00000060] h-[5px]"
            style={{ backgroundColor: borderColor }}
          ></div>

          <div className="flex-1 min-h-0">
            <h3 className="text-black mb-0.5 leading-tight font-primary text-[clamp(14px,3.5vw,22px)]">
              Pet Story
            </h3>
            <div className="text-black leading-snug overflow-hidden font-tertiary font-bold text-[clamp(10px,2.2vw,13px)]">
              <p className="line-clamp-6">
                {limitWords(getPlainText(description), 45)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
