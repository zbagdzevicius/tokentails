import { CAT_API } from "@/api/cat-api";
import { ICat } from "@/models/cats";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CatBenefits } from "../shared/CatBenefits";
import { CatMiniCard } from "../shared/CatMiniCard";
import { ShelterBenefits } from "../shared/ShelterBenefits";
import { PixelButton } from "../shared/PixelButton";
import { cdnFile } from "@/constants/utils";

export const FeedbackSlider = () => {
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });
  const fiveRandomCatsForSale = useMemo(() => {
    return catsForSale?.["rozine-pedute"]
      ?.sort(() => Math.random() - 0.5)
      .slice(0, 5);
  }, [catsForSale]);
  return (
    <>
      <div className="flex items-center justify-center flex-col my-32">
        <h2 className="text-center font-primary uppercase tracking-tight text-h4 sm:text-h1 text-balance my-3 px-4">
          <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
            ADOPT
          </span>{" "}
          AND PLAY
        </h2>

        <div className="flex items-center justify-center flex-row gap-6">
          <a
            href="https://www.facebook.com/rozine.pedute"
            target="_blank"
            className="relative border flex items-center justify-center w-36 h-36 rounded-full overflow-hidden hover:brightness-110 transition-all duration-300 animate-spin-slow"
          >
            <img
              draggable={false}
              src={cdnFile("logo/shelters/pink-paw.webp")}
              className="pixelated w-32 h-32 relative z-10"
            />
            <img
              draggable={false}
              src={cdnFile("logo/shelters/lt.webp")}
              className="absolute inset-0 z-0 w-full h-full object-cover rounded-2xl"
            />
          </a>
          <ShelterBenefits />
        </div>

        <div className="w-screen mt-4">
          {catsForSale?.["rozine-pedute"]?.length && (
            <div className="flex justify-center items-center gap-4 overflow-x-auto">
              {fiveRandomCatsForSale?.map((cat) => (
                <CatMiniCard
                  key={cat._id}
                  cat={cat}
                  onBenefitsClick={setSelectedCat}
                  active={selectedCat?._id === cat._id}
                />
              ))}
            </div>
          )}

          {selectedCat && (
            <CatBenefits key={selectedCat._id} cat={selectedCat} />
          )}
        </div>

        <a href="/cats" className="mt-8">
          <PixelButton text="SEE ALL SHELTER CATS" />
        </a>
      </div>
    </>
  );
};
