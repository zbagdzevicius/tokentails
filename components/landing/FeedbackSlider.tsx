import { CAT_API } from "@/api/cat-api";
import { useQuery } from "@tanstack/react-query";
import { CatMiniCard } from "../shared/CatMiniCard";
import { PixelButton } from "../shared/PixelButton";
import { CatBenefits } from "../shared/CatBenefits";
import { ICat } from "@/models/cats";
import { useState } from "react";

export const FeedbackSlider = () => {
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);
  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale"],
    queryFn: () => CAT_API.catsForSale(),
  });

  return (
    <>
      <div className="flex items-center justify-center flex-col my-32">
        <h2 className="text-left font-secondary uppercase tracking-tight text-h6 md:text-h2 text-balance my-3">
          Get to Know Shelters Cats
        </h2>

        <a
          href="https://www.facebook.com/rozine.pedute"
          target="_blank"
          className="relative flex items-center justify-center w-48 h-48 rounded-2xl overflow-hidden hover:brightness-110 transition-all duration-300"
        >
          <img
            draggable={false}
            src="/logo/shelters/pink-paw.webp"
            className="pixelated w-32 h-32 relative z-10"
          />
          <img
            draggable={false}
            src="/logo/shelters/lt.webp"
            className="absolute inset-0 z-0 w-full h-full object-cover"
            rounded-2xl
          />
        </a>

        <div className="w-screen mt-4">
          {catsForSale?.["rozine-pedute"]?.length && (
            <div className="flex justify-center items-center gap-4 overflow-x-auto">
              {catsForSale?.["rozine-pedute"]?.map((cat) => (
                <CatMiniCard
                  key={cat._id}
                  cat={cat}
                  onClick={setSelectedCat}
                  active={selectedCat?._id === cat._id}
                />
              ))}
            </div>
          )}

          {selectedCat && (
            <CatBenefits key={selectedCat._id} cat={selectedCat} />
          )}
        </div>
        <a href="/game" className="flex mb-4 justify-center mt-4">
          <PixelButton text="PLAY TO SAVE" />
        </a>
      </div>
    </>
  );
};
