import { PixelButton } from "@/components/shared/PixelButton";
import { getCatFundsToRaise, getCatPrice } from "@/constants/cat-status";
import { getMultiplier } from "@/constants/cat-utils";
import { cardsColor, ICat } from "@/models/cats";
import { useMemo } from "react";

export const MarketplaceItem = ({
  cat,
  onClick,
  hideButton,
}: {
  cat: ICat;
  onClick?: () => void;
  hideButton?: boolean;
}) => {
  const price = getCatFundsToRaise(cat);
  const lives = useMemo(() => {
    return cat.totalSupply - cat.supply;
  }, [cat]);
  return (
    <a
      onClick={onClick}
      href={`/cats/${cat._id}`}
      className="relative overflow-hidden w-48 rounded-2xl pb-2 rem:border-[7px] min-w-[12rem] group"
      style={{ borderColor: cardsColor[cat.type] }}
    >
      <div
        onClick={onClick}
        style={{ backgroundColor: cardsColor[cat.type] || "white" }}
        className="absolute left-0 top-0 opacity-75 text-black pl-1 text-p5 font-secondary rounded-r-xl z-20 flex items-center"
      >
        X{getMultiplier(cat)}
        <img draggable={false} src="/logo/coin.webp" className="w-6 h-6 ml-1" />
      </div>

      <div
        onClick={onClick}
        style={{ backgroundColor: cardsColor[cat.type] || "white" }}
        className="absolute right-0 top-0 opacity-75 text-black pr-1 text-p5 rounded-tl-xl font-secondary z-20 flex items-center"
      >
        <img
          draggable={false}
          src="/logo/heart.webp"
          className="w-6 h-6 mr-0.5 -ml-3"
        />
        {lives}/{cat.totalSupply}
      </div>
      <div
        onClick={onClick}
        className="relative z-10 items-center flex flex-col"
      >
        <img
          draggable={false}
          className="w-16 z-10 pixelated -mt-2 -m-2"
          src={cat.catImg}
          alt={cat.name}
        />
        {cat?.blessings?.length && (
          <img
            draggable={false}
            className="h-24 max-w-full mb-2 -mt-4 z-0 rounded-t-2xl group-hover:scale-150 group-hover:rounded-2xl transition-all duration-300"
            src={cat.blessings?.[0]?.image?.url}
            alt={`${cat.type} icon`}
          />
        )}
        <img
          draggable={false}
          className="w-8 -mb-4 -mt-6 z-0 animate-spin"
          src={`/ability/${cat.type}.png`}
          alt={`${cat.type} icon`}
        />
        <div
          onClick={onClick}
          className="text-p4 bg-red-600 font-secondary text-white w-full text-center opacity-80 mb-1 border-yellow-300"
        >
          {cat.name}
        </div>
        {!hideButton && (
          <PixelButton text={`ONLY $${getCatPrice(cat)} TO SAVE`} />
        )}
      </div>
      <img
        draggable={false}
        className="absolute inset-0 object-cover w-full h-full z-0"
        src={`/ability/${cat.type}_BG.webp`}
        alt={`${cat.type} background`}
      />
    </a>
  );
};
