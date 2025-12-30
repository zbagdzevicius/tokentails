import { CatAbilityType, CatAbilityTypes, ICat } from "@/models/cats";
import { useMemo } from "react";
import { PixelButton } from "../shared/PixelButton";
import { ShelterBenefits } from "../shared/ShelterBenefits";
import { TailsCard } from "../tailsCard/TailsCard";

export const MarketplaceItemDetails = ({ cat }: { cat: ICat }) => {
  const isFamous = useMemo(() => {
    return cat.shelter?.slug === "token-tails" || false;
  }, [cat.shelter?.slug]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-16">
        <TailsCard
          cat={{
            ...cat,
            type: CatAbilityTypes.includes(cat.type)
              ? cat.type
              : CatAbilityType.FAIRY,
          }}
        />
        <div className="lg:absolute -bottom-12 -left-1/2 pixelated rounded-full flex flex-col items-center lg:-ml-8">
          {cat.shelter?.slug === "rozine-pedute" && <ShelterBenefits />}
        </div>
      </div>
      {!isFamous && (
        <a href="/cats">
          <PixelButton isBig text="SEE ALL SHELTER CATS" />
        </a>
      )}
    </div>
  );
};
