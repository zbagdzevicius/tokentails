import { cardsColor, ICat } from "@/models/cats";
import React, { useMemo } from "react";
import { ShelterBenefits } from "../shared/ShelterBenefits";
import { CatDonation } from "../shared/CatDonation";
import { PixelButton } from "../shared/PixelButton";
import { CatCard } from "../catCard/CatCard";

export const MarketplaceItemDetails = ({ cat }: { cat: ICat }) => {
  const blessing = useMemo(() => {
    return cat.blessings?.[0];
  }, [cat]);
  const isFamous = useMemo(() => {
    return cat.shelter.slug === "token-tails";
  }, [blessing]);
  console.log({ cat, blessing });
  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-16">
        <CatCard {...cat} relative />
        <div className="lg:absolute -bottom-12 -left-1/2 pixelated rounded-full flex flex-col items-center lg:-ml-8">
          <img
            draggable={false}
            src={cat.catImg}
            className="pixelated hover:rotate-[-30deg] transition-all flex items-center -mb-16 w-48 h-48"
          />
          {blessing && (
            <img
              draggable={false}
              src={blessing.image?.url}
              style={{ borderColor: cardsColor[cat.type] }}
              className="flex items-center w-48 h-auto rounded-t-full border-4 transition-all hover:scale-110 -mb-8 z-0"
            />
          )}
          {blessing && !isFamous && <ShelterBenefits />}
        </div>
        <div className="lg:absolute bottom-0 -right-1/2 pixelated rounded-full flex items-center lg:-mr-8 -mb-12">
          <CatDonation />
        </div>
      </div>
      {!isFamous && (
        <a href="/cats">
          <PixelButton isBig text="SEE ALL CATS IN NEED" />
        </a>
      )}
    </div>
  );
};
