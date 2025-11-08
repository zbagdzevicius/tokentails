import { cdnFile } from "@/constants/utils";
import { cardsColor, ICat } from "@/models/cats";

export const MarketplaceItem = ({
  cat,
  onClick,
}: {
  cat: ICat;
  onClick?: () => void;
}) => {
  return (
    <a
      onClick={onClick}
      href={onClick ? "#" : `/cats/${cat._id}`}
      className="relative overflow-hidden w-48 rounded-2xl rem:border-[7px] min-w-[12rem] group"
      style={{ borderColor: cardsColor[cat.type] }}
    >
      <div
        onClick={onClick}
        className="relative z-10 items-center flex flex-col h-full"
      >
        <img
          draggable={false}
          className="w-20 z-10 pixelated -mt-2 -m-2 absolute bottom-6 left-0"
          src={cat.catImg}
          alt={cat.name}
        />
        {cat?.blessings?.length && (
          <img
            draggable={false}
            className="w-full max-h-[200px] object-cover mb-2 -mt-4 z-0 rounded-t-2xl group-hover:scale-150 group-hover:rounded-2xl transition-all duration-300"
            src={cat.blessings?.[0]?.image?.url}
            alt={`${cat.type} icon`}
          />
        )}
        <img
          draggable={false}
          className="w-8 z-0 animate-spin absolute bottom-4"
          src={cdnFile(`ability/${cat.type}.png`)}
          alt={`${cat.type} icon`}
        />
        <div
          onClick={onClick}
          className="text-p4 font-secondary text-center border-yellow-300 absolute bottom-0 font-bold mb-2 w-[92%] rounded-full tracking-wider"
          style={{ background: cardsColor[cat.type] }}
        >
          {cat.name}
        </div>
      </div>
      <img
        draggable={false}
        className="absolute inset-0 object-cover w-full h-full z-0"
        src={cdnFile(`ability/${cat.type}_BG.webp`)}
        alt={`${cat.type} background`}
      />
    </a>
  );
};
