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
    <>
      {/* Card Content */}
      <div className="relative p-6 pb-8 z-10">
        {/* Header with Name and Flag */}
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-4xl font-black text-black drop-shadow-md">
            {blessing?.name || cat.name}
          </h2>
          <Image
            src={flagPath}
            alt="Country Flag"
            width={64}
            height={48}
            className="object-cover border-[2px] border-white rounded-[10px]"
          />
        </div>

        {/* Cat Image */}
        <div
          className="bg-white rounded-[20px] mb-6 shadow-xl"
          style={{ padding: "5px" }}
        >
          <div className="relative w-full aspect-[525/300] rounded-xl overflow-hidden">
            {/* Ellipse Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Image src={ellipse} alt="Ellipse" className="object-contain" />
            </div>
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
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-black mb-1">Shelter</h3>
            <p className="text-base font-bold text-black">
              {shelterName || "Unknown"}
            </p>
          </div>
          <div>
            <h3 className="text-xl font-black text-black mb-1">Status</h3>
            <p className="text-base font-bold text-black">Waiting for home</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-1 bg-black/20 rounded-full mb-6"></div>

        {/* Pet Story */}
        <div>
          <h3 className="text-2xl font-black text-black mb-3">Pet Story</h3>
          <div className="text-sm font-semibold text-black leading-relaxed space-y-2">
            {blessing?.description ? (
              <p>{limitWords(getPlainText(blessing.description))}</p>
            ) : (
              <p>{limitWords(getPlainText(cat.resqueStory))}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CardFront;
