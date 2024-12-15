import { adoptCatFetch, catsFetch } from "@/constants/api";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import Web3ModalProvider from "@/context/web3";
import { useWeb3, Web3Provider } from "@/context/Web3Context";
import { CatAbilities, IBlessing, ICat } from "@/models/cats";
import { GameType } from "@/models/game";
import { CurrencyType } from "@/web3/contracts";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { ChainSelect } from "./shared/ChainSelect";
import { PixelButton } from "./shared/PixelButton";
import { Web3Transfer } from "./web3/minting/Web3Transfer";
import { EntityType } from "@/models/save";

interface IProps extends ICat {
  onClose: () => void;
}

interface ICatBlessingsProps {
  blessings: IBlessing[];
}

const blessingsPositions = [
  "left-0 top-0",
  "left-0 bottom-0",
  "right-0 bottom-0",
  "right-0 top-0",
];
export const CatBlessings = ({ blessings }: ICatBlessingsProps) => {
  const blessingsToDisplay = blessings ? blessings.slice(1, 5) : [];
  return (
    <>
      {blessingsToDisplay.map((blessing, index) => (
        <img
          key={index}
          src={`/blessings/${blessing.ability}_TYPE.png`}
          alt={blessing.type}
          width={40}
          height={40}
          className={`w-12 h-12 absolute ${blessingsPositions[index]}`}
        />
      ))}
    </>
  );
};

export const getMultiplier = (cat?: ICat | null) => {
  if (!cat) {
    return 1;
  }
  if (cat.blessings?.length) {
    return 10;
  }
  if (cat.isExclusive) {
    return 5;
  }
  if (cat.catpoints > 50000) {
    return 2;
  }
  if (cat.catpoints > 1000000) {
    return 3;
  }
  return 1;
};

export const CatMultiplier = (cat: ICat) => {
  const multiplier = useMemo(() => getMultiplier(cat), [cat]);
  return (
    <div className="absolute flex flex-col right-4 bg-yellow-300 bg-opacity-75 border border-yellow-300 hover:bg-opacity-100 px-2 rounded-xl">
      <div className="text-p5 font-secondary flex font-bold justify-center items-center">
        X<span className="font-secondary ml-1 lowercase">{multiplier}</span>
      </div>
      <div className="-mt-2 font-bold rem:text-[13px] font-secondary">
        rewards
      </div>
    </div>
  );
};

export const CatDescription = ({
  blessings,
  resqueStory,
  type,
  ability,
  activeBlessing,
  setActiveBlessing,
}: ICat & {
  activeBlessing: IBlessing | null;
  setActiveBlessing: (blessing: IBlessing | null) => void;
}) => {
  const firstBlessing = blessings && blessings.length > 0 ? blessings[0] : null;

  return (
    <>
      <div className="text-outline mb-3 max-sm:mb-2">
        <div className="flex flex-row items-center">
          {firstBlessing && (
            <img
              src={`/blessings/${firstBlessing.ability}_TYPE.png`}
              alt={firstBlessing.type}
              className="w-10 h-10"
            />
          )}
          <h4
            className={`text-white text-p3 ${
              firstBlessing ? "ml-6" : "ml-16"
            } max-sm:ml-10 font-bold`}
          >
            STORY
          </h4>
          <div className="mx-2"></div>
          {firstBlessing && (
            <PixelButton
              text={activeBlessing ? "Show Virtual Cat" : "Read Linked story"}
              onClick={() =>
                setActiveBlessing(activeBlessing ? null : firstBlessing)
              }
            ></PixelButton>
          )}
        </div>
        <p
          className="text-gray-200 text-p5 font-bold"
          dangerouslySetInnerHTML={{
            __html: activeBlessing ? activeBlessing.description : resqueStory,
          }}
        ></p>
      </div>
      {activeBlessing && (
        <audio className="hidden" loop autoPlay>
          <source src="/purrquest/sounds/meow.mp3" />
        </audio>
      )}
      {!activeBlessing && (
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
      )}
    </>
  );
};

export const CatPayment = ({
  cat,
  onClose,
}: {
  cat: ICat;
  onClose: () => void;
}) => {
  const { currencyType, bnbRate, xlmRate, isTransactionSucces } = useWeb3();
  const { _id, supply, name, catpoints, price } = cat;
  const { profile, setProfileUpdate } = useProfile();
  const [isBuyMode, setIsBuyMode] = useState(false);
  const [isAdopting, setIsAdopting] = useState(false);
  const isCoinsPayment = !!cat.catpoints;
  const { setGameType } = useGame();
  const currencyPrice = useMemo(() => {
    if (
      [CurrencyType.XLM, CurrencyType.BNB].includes(currencyType) &&
      bnbRate &&
      xlmRate
    ) {
      if (currencyType === CurrencyType.BNB) {
        return parseFloat((price / bnbRate).toFixed(3));
      }
      if (currencyType === CurrencyType.XLM) {
        return Math.ceil(price / bnbRate);
      }
    }
    return cat.price;
  }, [currencyType, bnbRate, xlmRate, cat]);
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => catsFetch(),
  });
  const catpointsText = useMemo(() => {
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
  const outOfSupply = supply === undefined || supply <= 0;
  const isOwned = cats?.find((cat) => cat.name === name);
  const isForSale = !outOfSupply && !isOwned;

  const onSuccess = () => {
    setProfileUpdate({
      cats: [...(cats || []), cat],
      cat: cat,
      catpoints: profile!.catpoints - catpoints,
    });

    toast({ message: "Congratz on your adopted cat !" });
    setIsAdopting(false);
    setGameType(GameType.HOME);
  };

  useEffect(() => {
    if (isTransactionSucces) {
      onSuccess();
    }
  }, [isTransactionSucces]);

  const adoptWithCoins = async () => {
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
      onSuccess();
    }
  };

  const close = () => {
    if (isBuyMode) {
      setIsBuyMode(false);
    } else onClose();
  };

  return (
    <>
      {!isCoinsPayment && isBuyMode && (
        <div
          className="z-0 absolute bottom-0 pb-24 bg-opacity-85 pt-8 px-4 left-0 right-0 border-t-8 border-yellow-300"
          style={{
            backgroundImage: "url(/base/bg.gif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <ChainSelect />
        </div>
      )}
      <div className="z-10 relative flex items-end flex-row justify-around  text-white">
        {outOfSupply && !isOwned && (
          <PixelButton text="Out of supply" active isDisabled></PixelButton>
        )}
        {isOwned && <PixelButton text="Adopted" active></PixelButton>}
        {isCoinsPayment && !outOfSupply && !isOwned && (
          <PixelButton
            text={catpointsText}
            subtext="coins"
            onClick={adoptWithCoins}
          />
        )}
        {!isCoinsPayment && !isBuyMode && isForSale && (
          <PixelButton
            text="SAVE"
            onClick={() => setIsBuyMode(true)}
            isDisabled={outOfSupply}
          />
        )}
        {!isCoinsPayment && isBuyMode && isForSale && (
          <div className="flex flex-col items-center">
            <div className="text-main-black font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6">
              {currencyPrice} {currencyType}
            </div>
            <Web3Transfer
              price={currencyPrice}
              amount={1}
              entityType={EntityType.CAT}
              cat={cat._id}
              blessing={cat.blessings?.[0]?._id}
              user={profile?._id}
              text="save now"
              loadingText="Saving Cat"
            />
          </div>
        )}

        {cat.supply !== undefined && (
          <div className="flex flex-col bg-gray-600 px-2 text-center rounded-lg font-secondary text-p4 mb-1">
            <div className="text-p5 text-yellow-300">SUPPLY</div>
            <div className="text-yellow-200 -mt-1">{supply}</div>
          </div>
        )}
        <PixelButton text="CLOSE" onClick={close}></PixelButton>
      </div>
    </>
  );
};

export const CatCard = ({ onClose, ...catData }: IProps) => {
  const { catImg, name, type, blessings } = catData;
  const [activeBlessing, setActiveBlessing] = useState<IBlessing | null>(null);

  return (
    <div className="max-w-screen-xl top-1/2 hover:brightness-105 -translate-y-1/2 border-8 rounded-[24px] border-yellow-300 border-opacity-50 hover:border-opacity-100 relative rem:h-[540px] md:rem:h-[600px] aspect-[2/3] max-w-screen">
      <img
        src={`/ability/${type}_BG.webp`}
        className="absolute object-cover z-10 h-full w-full brightness-[35%] rounded-[16px]"
      />
      <div className="relative z-20 flex flex-col justify-between h-full">
        <div className="w-full">
          <div>
            <div className="flex justify-between items-center m-1">
              <div className="flex flex-row space-x-4 items-center pl-4">
                <h3 className="text-white text-p3 uppercase font-bold flex items-center">
                  {name}
                </h3>
              </div>
              <CatMultiplier {...catData} />
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
            <CatBlessings blessings={blessings} />
            <span className="relative">
              <img
                src={
                  (activeBlessing ? activeBlessing.image?.url : catImg) ||
                  catImg
                }
                alt="Hero cat"
                className={`${
                  activeBlessing ? "w-full h-48" : "w-32 h-32"
                } relative z-10 object-contain`}
              />
              {blessings?.length && (
                <img
                  className="absolute inset-0 w-full h-full object-cover"
                  src={`/flare-effect/${blessings[0]?.ability}.gif`}
                ></img>
              )}
            </span>
          </div>
        </div>
        <div>
          <div className="text-start m-3 md:m-5 bg">
            <CatDescription
              {...catData}
              setActiveBlessing={setActiveBlessing}
              activeBlessing={activeBlessing}
            />
            <CatPayment cat={catData} onClose={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const CatCardModal: React.FC<IProps> = ({ onClose, ...catData }) => {
  return (
    <div className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]">
      <div
        className="absolute inset-0 z-0 bg-yellow-300 opacity-50"
        onClick={() => onClose()}
      ></div>

      <Web3ModalProvider>
        <Web3Provider>
          <CatCard {...catData} onClose={onClose} />
        </Web3Provider>
      </Web3ModalProvider>
    </div>
  );
};
