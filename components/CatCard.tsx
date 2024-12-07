import { CatAbilities, ICat } from "@/models/cats";
import React, { useMemo, useRef, useState } from "react";
import { PixelButton } from "./shared/PixelButton";
import { useProfile } from "@/context/ProfileContext";
import { adoptCatFetch, catsFetch } from "@/constants/api";
import { useToast } from "@/context/ToastContext";
import { useQuery } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { GameType } from "@/models/game";

interface IProps extends ICat {
  onClose: () => void;
}

export const CatCard: React.FC<IProps> = ({ onClose, ...catData }) => {
  const {
    _id,
    catImg,
    name,
    type,
    ability,
    resqueStory,
    catpoints,
    price,
    multiplier,
    blessings,
    supply,
  } = catData;
  const cardRef = useRef<HTMLDivElement>(null);
  const { profile, setProfileUpdate } = useProfile();
  const [isAdopting, setIsAdopting] = useState(false);
  const { setGameType } = useGame();
  const firstBlessing = blessings && blessings.length > 0 ? blessings[0] : null;
  const blessingsToDisplay = blessings ? blessings.slice(1, 5) : [];
  const positions = [
    "left-0 top-0",
    "left-0 bottom-0",
    "right-0 bottom-0",
    "right-0 top-0",
  ];
  const outOfStockSupply = supply === undefined || supply <= 0
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => catsFetch(),
  });
  const catpointsInMillions = useMemo(() => {
    if (isAdopting) {
      return "adopting";
    }
    if (cats?.find((cat) => cat.name === name)) {
      return "adopted";
    }
    const inMillions = catpoints / 1000000;
    return `${inMillions.toFixed(2)}m`;
  }, [price, cats, isAdopting]);
  const toast = useToast();
  const isForSale = useMemo(() => {
    const isOwned = cats?.find((cat) => cat.name === name);
    const hasEnoughFunds = (profile?.catpoints || 0) < catpoints;

    if (isOwned || hasEnoughFunds) {
      return false;
    }

    return true;
  }, [cats, profile?.catpoints]);

  const adopt = async () => {
    if (cats?.find((cat) => cat.name === name)) {
      toast({ message: "You already own this NFT cat" });
      return;
    }

    if (
      !profile?.catpoints ||
      !catpoints ||
      (catpoints || 0) > (profile?.catpoints || 0)
    ) {
      toast({ message: "You need more coins to adopt" });
      return;
    }

    setIsAdopting(true);
    const status = await adoptCatFetch(_id!);
    if (status.success) {
      setProfileUpdate({
        cats: [...(cats || []), catData],
        cat: catData,
        catpoints: profile.catpoints - catpoints,
      });

      toast({ message: "Congratz on your adopted cat !" });
      setIsAdopting(false);
      setGameType(GameType.HOME);
    }
  };

  return (
    <div className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]">
      <div
        className="absolute inset-0 z-0 bg-yellow-300 opacity-50"
        onClick={() => onClose()}
      ></div>
      <div
        className={`max-w-screen-xl border-4 rounded-[16px] border-yellow-300 relative rem:h-[540px] md:rem:h-[600px] aspect-[2/3] max-w-screen ${type.toLocaleLowerCase()}`}
        ref={cardRef}
      >
        <img
          src={`/ability/${type}_BG.webp`}
          className="absolute object-cover z-10 h-full w-full brightness-[35%] rounded-[16px]"
        />
        <div className="relative z-20 inset-0 flex flex-col justify-between h-full">
          <div className="w-full">
            <div>
              <div className="flex justify-between items-center m-1">
                <div className="flex flex-row space-x-4 items-center pl-4">
                  <h3 className="text-white text-p3 uppercase font-bold flex items-center">
                    {name}
                  </h3>
                </div>
                <div className="relative">
                  <img
                    className="w-16 md:w-20 h-7 md:h-8"
                    src="/card/base.png"
                    alt="base"
                  />
                  <h3 className="text-gray-500 italic text-p5 md:text-p4 font-secondary absolute inset-0 font-bold flex justify-center items-center">
                    KITTEN <span className=" text-p5 font-secondary ml-1 lowercase">{multiplier}</span>
                  </h3>
                </div>
              </div>
            </div>
            <div className="relative mx-4 h-full flex justify-center items-center">
              <img
                className="w-full h-full rounded-xl absolute z-0"
                src={`/ability/${type}_BG.webp`}
                alt="base"
                width={400}
                height={400}
              />
              {blessingsToDisplay.map((blessing, index) => (
                <img
                  key={index}
                  src={`/blessings/${blessing.type}_TYPE.png`}
                  alt={blessing.type}
                  width={40}
                  height={40}
                  className={`w-12 h-12 absolute ${positions[index]}`}
                />
              ))}
              <img
                src={catImg}
                alt="Hero cat"
                width={250}
                height={250}
                className="w-32 h-32 relative z-10"
              />
            </div>
          </div>
          <div>
            <div className="text-start m-3 md:m-5 bg">
              <div className="text-outline mb-3 max-sm:mb-2">
                <div className="flex flex-row items-center">
                  {firstBlessing && (
                    <img
                      src={`/blessings/${firstBlessing.type}_TYPE.png`}
                      alt={firstBlessing.type}
                      className="w-10 h-10"
                    />
                  )}
                  <h4
                    className={`text-white text-p3 ${firstBlessing ? "ml-6" : "ml-16"
                      } max-sm:ml-10 font-bold`}
                  >
                    STORY
                  </h4>
                </div>
                <p className="text-gray-200 text-p5 font-bold">{resqueStory}</p>
              </div>
              <div className="my-3 text-outline">
                <div className="flex flex-row items-center">
                  <img
                    className="w-10 h-10 max-lg:w-8 max-lg:h-8 max-sm:h-6 max-sm:w-6 "
                    src={`/ability/${type}.png`}
                    alt={type}
                    width={40}
                    height={40}
                  />
                  <h4 className="text-white text-p3 ml-4 md:ml-8 font-bold">
                    {ability}
                  </h4>
                </div>
                <p className="text-gray-200 text-p5 font-bold">
                  {CatAbilities[ability].description}
                </p>
              </div>
              <div className="flex flex-row justify-around  text-white">
                <PixelButton
                  isDisabled={outOfStockSupply}
                  active={!isForSale}
                  text={
                    outOfStockSupply
                      ? "Out of stock"
                      : catpointsInMillions
                  }
                  subtext={
                    ["adopted", "adopting"].includes(catpointsInMillions) || outOfStockSupply
                      ? ""
                      : "coins"
                  }
                  onClick={() => adopt()}
                />

                {!outOfStockSupply && <PixelButton active={true} isSmall isDisabled={true} text={`Supply`} subtext={supply} />}
                <PixelButton text="CLOSE" onClick={() => onClose()}></PixelButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
