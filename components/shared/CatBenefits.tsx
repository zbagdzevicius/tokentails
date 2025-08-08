import { cardsColor, CatAbilityType, ICat } from "@/models/cats";
import { Tag } from "./Tag";
import { getMultiplier } from "@/constants/cat-utils";

export const CatBenefits = ({
  cat,
  isOwned,
}: {
  cat: ICat;
  isOwned?: boolean;
}) => {
  return (
    <div className="w-64 rounded-xl flex relative justify-center py-2 m-auto mt-4 transition-animation">
      <div className="relative z-10 items-center flex flex-col w-full">
        <div
          className="text-p4 overflow-hidden h-14 font-secondary  w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black"
          style={{ backgroundColor: cardsColor[cat.type] || "bg-red-600" }}
        >
          <img
            draggable={false}
            className="w-16 z-10 pixelated -ml-8 -my-1"
            src={cat.catImg}
            alt={cat.name}
          />
          <span className="flex flex-col">
            <span className="text-p5 -mb-1 text-center">
              {cat.blessings?.length
                ? isOwned
                  ? getMultiplier(cat) >= 15
                    ? "DOUBLE JUMP"
                    : "SAVED REAL PET"
                  : "SAVE REAL PET"
                : isOwned
                ? "SUPPORTED SHELTER"
                : "HELP REAL SHELTER"}
            </span>
            <span>
              <Tag isSmall>{cat.name}</Tag>
            </span>
          </span>
          {!!cat.blessings?.length && (
            <img
              draggable={false}
              className="w-12 rounded-xl z-10 -mr-4 ml-2 -my-1"
              src={cat.blessings?.[0].image?.url}
              alt={cat.name}
            />
          )}
        </div>
        <div className="text-p4 bg-red-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
          <img
            draggable={false}
            src="/logo/coin.webp"
            className="w-8 h-8 mr-3 -ml-5"
          />
          <span className="flex flex-col">
            <span className="text-p5 -mb-1 text-gray-200">EARN MORE COINS</span>
            <span>X{getMultiplier(cat)} multiplier</span>
          </span>
        </div>
        {cat.price && (
          <div className="text-p4 bg-green-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
            <img
              draggable={false}
              src="/logo/rocket.png"
              className="w-8 h-8 mr-3 -ml-4"
            />
            <span className="flex flex-col text-gray-200">
              <span className="text-p5 -mb-1">GET AIRDROP</span>
              <span>{isOwned ? "BECAME ELIGIBLE" : "BECOME ELIGIBLE"}</span>
            </span>
          </div>
        )}
        {!!cat.blessings?.length && (
          <div className="text-p4 bg-purple-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
            <img
              draggable={false}
              className="w-12 h-12 mr-3 -ml-6 pixelated"
              src={`/flare-effect/${cat.type}.gif`}
            ></img>
            <span className="flex flex-col">
              <span className="text-p5 -mb-1 text-gray-200">
                IN GAME EFFECTS
              </span>
              <span>INDIVIDUAL AURA</span>
            </span>
          </div>
        )}
        {!!cat.blessings?.length && (
          <div className="text-p4 bg-gray-500 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
            <img
              draggable={false}
              src="/logo/heart.webp"
              className="w-8 h-8 mr-3 -ml-4 pixelated"
            />
            <span className="flex flex-col">
              <span className="text-p5 -mb-1 text-gray-200">
                OWN YOUR BUDDY
              </span>
              <span>COMPANION ON X</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
