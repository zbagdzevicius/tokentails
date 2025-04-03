import { cardsColor, ICat } from "@/models/cats";
import { getMultiplier } from "../CatCardModal";
import { PixelButton } from "./PixelButton";

export const CatMiniCard = ({
  cat,
  onBenefitsClick,
  onClick,
  active,
  hideBenefits,
}: {
  cat: ICat;
  onBenefitsClick?: (cat: ICat | null) => void;
  onClick?: () => void;
  active?: boolean;
  hideBenefits?: boolean;
}) => {
  return (
    <div
      className="relative overflow-hidden w-48 rounded-xl pb-2 border-4 min-w-[12rem]"
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
            className="h-24 max-w-full mb-2 -mt-4 z-0 rounded-t-2xl"
            src={cat.blessings?.[0]?.image?.url}
            alt={`${cat.type} icon`}
          />
        )}
        <img
          draggable={false}
          className="w-8 -mb-4 -mt-6 z-0 animate-spin"
          src={`ability/${cat.type}.png`}
          alt={`${cat.type} icon`}
        />
        <div
          onClick={onClick}
          className="text-p4 bg-red-600 font-secondary text-white w-full text-center opacity-80 mb-1 border-yellow-300"
        >
          {cat.name}
        </div>
        <a onClick={onClick} href={onClick ? undefined : "/game"}>
          <PixelButton text="SAVE THIS CAT" />
        </a>
        {!hideBenefits && (
          <PixelButton
            isSmall
            text={active ? "CLOSE" : "OWNER BENEFITS"}
            onClick={() => onBenefitsClick?.(active ? null : cat)}
          />
        )}
      </div>
      <img
        draggable={false}
        className="absolute inset-0 object-cover w-full h-full z-0"
        src={`ability/${cat.type}_BG.webp`}
        alt={`${cat.type} background`}
      />
    </div>
  );
};
