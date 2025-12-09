import { ICat } from "@/models/cats";
import { GameModal } from "@/models/game";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { CatCard } from "../catCard/CatCard";
import { PixelButton } from "../shared/PixelButton";
import { ShelterBenefits } from "../shared/ShelterBenefits";

export const MarketplaceItemDetails = ({ cat }: { cat: ICat }) => {
  const isFamous = useMemo(() => {
    return cat.shelter.slug === "token-tails";
  }, [cat.blessing]);
  const router = useRouter();
  const onClose = (gameModal?: GameModal) => {
    if (gameModal) {
      router.push(`/game`);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-16">
        <CatCard {...cat} relative onClose={onClose} />
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
