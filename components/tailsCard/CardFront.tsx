import React, { useRef } from "react";
import { ICat } from "@/models/cats";
import Image from "next/image";
import flag from "./assets/usa.png";
import ellipse from "./assets/backgrounds/ellipse.png";
import sparkle from "./assets/backgrounds/sparkle.png";

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
  const backfaceRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={backfaceRef}
        className="absolute"
        style={{
          inset: "45px",
          background: "linear-gradient(45deg, #0b0b2a, #0b0b2a)",
          borderRadius: "20px",
        }}
      />

      {/* Main Pink Card */}
      <div
        className="relative w-full h-full overflow-visible cursor-pointer"
        style={{
          background:
            "radial-gradient(circle at 60% 30%, #FFDBF1 0%, #FF6F71 100%)",
          borderRadius: "20px",
          border: "5px solid #ffffffff",
        }}
      >
        {/* Sparkles on borders */}
        <Image
          src={sparkle}
          alt="Sparkle"
          width={100}
          height={100}
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
          style={{ pointerEvents: "none" }}
        />
        <Image
          src={sparkle}
          alt="Sparkle"
          width={100}
          height={100}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[100]"
          style={{ pointerEvents: "none" }}
        />
        <Image
          src={sparkle}
          alt="Sparkle"
          width={75}
          height={75}
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
          style={{ pointerEvents: "none" }}
        />
        <Image
          src={sparkle}
          alt="Sparkle"
          width={75}
          height={75}
          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-[100]"
          style={{ pointerEvents: "none" }}
        />
        {/* Card Content */}
        <div className="relative p-6 pb-8 z-10">
          {/* Header with Name and Flag */}
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-4xl font-black text-black drop-shadow-md">
              {blessing?.name || cat.name}
            </h2>
            <Image
              src={flag}
              alt="Country Flag"
              width={64}
              height={48}
              className="object-cover"
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

        {/* Footer with Token Count */}
      </div>
    </>
  );
};

export default CardFront;
