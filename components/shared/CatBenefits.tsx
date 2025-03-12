import { ICat } from "@/models/cats";
import { getMultiplier } from "../CatCardModal";
import { getCatDiscountPercentage } from "@/constants/cat-status";

export const CatBenefits = ({ cat }: { cat: ICat }) => {
  const discountPercentage = getCatDiscountPercentage(cat);
  return (
    <div
      className="w-64 rounded-xl flex relative justify-center py-2 m-auto mt-4"
      style={{
        backgroundImage: "url('/backgrounds/bg-6.png')",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="relative z-10 items-center flex flex-col w-full">
        <div className="text-p4 bg-yellow-700 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
          <img
            className="w-16 z-10 pixelated -ml-8 -my-1"
            src={cat.catImg}
            alt={cat.name}
          />
          <span className="flex flex-col">
            <span className="text-p5 -mb-1 text-gray-200">
              {cat.blessings ? "SAVE REAL CAT" : "HELP REAL SHELTER"}
            </span>
            <span>{cat.name}</span>
          </span>
        </div>
        <div className="text-p4 bg-red-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
          <img src="/logo/coin.webp" className="w-8 h-8 mr-3 -ml-5" />
          <span className="flex flex-col">
            <span className="text-p5 -mb-1 text-gray-200">EARN MORE COINS</span>
            <span>X{getMultiplier(cat)} multiplier</span>
          </span>
        </div>
        {cat.price && (
          <div className="text-p4 bg-green-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
            <img src="/logo/rocket.png" className="w-8 h-8 mr-3 -ml-4" />
            <span className="flex flex-col text-gray-200">
              <span className="text-p5 -mb-1">GET AIRDROP</span>
              <span>BECOME ELIGIBLE</span>
            </span>
          </div>
        )}
        {!!discountPercentage && (
          <div className="text-p4 bg-blue-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
            <img src="/logo/rocket.png" className="w-8 h-8 mr-3 -ml-4" />
            <span className="flex flex-col text-gray-200">
              <span className="text-p5 -mb-1">EXCLUSIVE PRICE</span>
              <span>{discountPercentage}% DISCOUNT</span>
            </span>
          </div>
        )}
        {cat.blessings?.length && (
          <div className="text-p4 bg-purple-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
            <img
              className="w-10 h-10 mr-3 -ml-6 pixelated"
              src={`/flare-effect/${cat.blessings[0]?.ability}.gif`}
            ></img>
            <span className="flex flex-col">
              <span className="text-p5 -mb-1 text-gray-200">
                IN GAME EFFECTS
              </span>
              <span>INDIVIDUAL AURA</span>
            </span>
          </div>
        )}
        {cat.ai ||
          (cat.blessings?.length && (
            <div className="text-p4 bg-gray-500 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 bg-opacity-60 hover:bg-opacity-80 mb-2 border-2 rounded-xl border-main-black">
              <img
                src="/logo/ai.webp"
                className="w-8 h-8 mr-3 -ml-4 pixelated"
              />
              <span className="flex flex-col">
                <span className="text-p5 -mb-1 text-gray-200">
                  OWN YOUR BUDDY
                </span>
                <span>COMPANION ON X</span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};
