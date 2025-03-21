import { ORDER_API } from "@/api/order-api";
import { getCatDiscountPercentage, getCatPrice } from "@/constants/cat-status";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import {
  cardsColor,
  CatAbilities,
  IBlessing,
  ICat,
  Prices,
} from "@/models/cats";
import { GameType } from "@/models/game";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import React, { useEffect, useMemo, useState } from "react";
import { ChainSelect } from "./shared/ChainSelect";
import { CloseButton } from "./shared/CloseButton";
import { PixelButton } from "./shared/PixelButton";
import { Tag } from "./shared/Tag";
import { StripePayment } from "./web3/payments/StripePayment";
import { Web3Transfer } from "./web3/transfer/Web3Transfer";
import { Web3Providers } from "./web3/Web3Providers";
import { CAT_API } from "@/api/cat-api";
import { useQuery } from "@tanstack/react-query";
import { CatBenefits } from "./shared/CatBenefits";
import { isApp } from "@/models/app";
import {
  CAT_CARD_ONBOARDING_MODAL_IDS,
  ONBOARDING_MODAL_IDS,
} from "@/constants/onboarding";
import { CatCardOnboarding } from "./onboarding/CardOnboarding";

interface IProps extends ICat {
  onClose?: () => void;
  onAdopted?: () => void;
  relative?: boolean;
}

interface ICatBlessingsProps {
  blessings: IBlessing[];
}

export enum BuyMode {
  AI = "AI",
  CAT = "CAT",
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
          draggable={false}
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
  if (cat.isExclusive || cat.price) {
    return 5;
  }
  if (cat.catpoints > 1000000) {
    return 3;
  }
  if (cat.catpoints > 50000) {
    return 2;
  }
  return 1;
};

export const CatMultiplier = (cat: ICat) => {
  const multiplier = useMemo(() => getMultiplier(cat), [cat]);
  return (
    <div
      id={CAT_CARD_ONBOARDING_MODAL_IDS.MULTIPLIER}
      style={{ backgroundColor: cardsColor[cat.type] || "white" }}
      className="absolute flex items-center right-4 bg-opacity-75 border font-secondary text-p5 border-yellow-300 hover:bg-opacity-100 pl-2 rounded-xl"
    >
      X{multiplier}
      <img draggable={false} src="/logo/coin.webp" className="w-6 h-6 ml-1" />
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
      <div className="mb-3 max-sm:mb-2 text-main-black">
        <div className="flex flex-row items-center">
          {firstBlessing && (
            <img
              draggable={false}
              src={`/blessings/${firstBlessing.ability}_TYPE.png`}
              alt={firstBlessing.type}
              className="w-6 h-6 md:w-10 md:h-10"
            />
          )}
          <h4
            id={CAT_CARD_ONBOARDING_MODAL_IDS.STORY}
            className={`text-p3 ${
              firstBlessing ? "ml-4 md:ml-2 lg:ml-4" : "ml-16"
            } font-bold`}
          >
            STORY
          </h4>
          <div className="mx-2 md:hidden lg:block"></div>
          {firstBlessing && (
            <PixelButton
              text={activeBlessing ? "Show Virtual Cat" : "Read Shelter story"}
              isSmall
              onClick={() =>
                setActiveBlessing(activeBlessing ? null : firstBlessing)
              }
            ></PixelButton>
          )}
        </div>
        <p
          className="text-p5 font-bold overflow-y-auto max-h-[8rem] md:max-h-[11rem]"
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
        <div className="my-3">
          <div className="flex flex-row items-center">
            <img
              draggable={false}
              className="w-6 h-6 md:w-10 md:h-10"
              src={`/ability/${type}.png`}
              alt={type}
              width={40}
              height={40}
            />
            <h4
              id={CAT_CARD_ONBOARDING_MODAL_IDS.ABILITY}
              className="text-p3 ml-4 md:ml-2 lg:ml-4 font-bold"
            >
              {ability}
            </h4>
          </div>
          <p className="text-p5 font-bold">
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
  onAdopted,
  relative,
  cats,
}: {
  cat: ICat;
  onClose?: () => void;
  onAdopted?: () => void;
  relative?: boolean;
  cats?: ICat[];
}) => {
  const {
    currencyType,
    bnbRate,
    xlmRate,
    solRate,
    transactionStatus,
    setTransactionStatus,
  } = useWeb3();
  const { _id, supply, name, catpoints, price } = cat;
  const { profile, setProfileUpdate } = useProfile();
  const [paymentMethod, setPaymentMethod] = useState<"web3" | "card">("card");
  const [buyMode, setBuyMode] = useState<BuyMode | null>(null);
  const [isAdopting, setIsAdopting] = useState(false);
  const isOwned = useMemo(
    () => cats?.find((cat) => cat.name === name),
    [cats, cat]
  );
  const currencyPrice = useMemo(() => {
    const corePrice = buyMode === BuyMode.AI ? Prices.ai : getCatPrice(cat);
    if (paymentMethod === "card") {
      return corePrice;
    }
    if (
      [CurrencyType.XLM, CurrencyType.BNB, CurrencyType.SOL].includes(
        currencyType
      ) &&
      bnbRate &&
      xlmRate &&
      solRate
    ) {
      if (currencyType === CurrencyType.BNB) {
        return parseFloat((corePrice / bnbRate).toFixed(3));
      }
      if (currencyType === CurrencyType.ODP) {
        return parseFloat((corePrice * 1000).toFixed(0));
      }
      if (currencyType === CurrencyType.XLM) {
        return Math.ceil(corePrice / xlmRate);
      }
      if (currencyType === CurrencyType.SOL) {
        return parseFloat((corePrice / solRate).toFixed(3));
      }
    }
    return corePrice;
  }, [currencyType, bnbRate, xlmRate, solRate, cat, buyMode, paymentMethod]);

  const catpointsText = useMemo(() => {
    if (isAdopting) {
      return "adopting";
    }
    const inMillions = catpoints / 1000000;
    return `${inMillions.toFixed(2)}m`;
  }, [price, isAdopting]);

  const toast = useToast();
  const outOfSupply = supply === undefined || supply <= 0;
  const isForSale = !outOfSupply && !isOwned;
  const isCoinsPayment = !!cat.catpoints && !isOwned;

  const onSuccess = (cat: ICat) => {
    if (buyMode === BuyMode.AI) {
      toast({ message: "Your Cat has been AI-ified!" });

      setProfileUpdate({
        cats: (cats || []).map((c) => (c._id === cat._id ? cat : c)),
        cat,
        catpoints: profile!.catpoints - catpoints,
      });
    } else {
      setProfileUpdate({
        cats: [...(cats || []), cat],
        cat,
        catpoints: profile!.catpoints - catpoints,
      });
      setTransactionStatus(null);

      toast({ message: "Congratz on your adopted cat !" });
      setIsAdopting(false);
      onAdopted?.();
    }
  };

  useEffect(() => {
    if (transactionStatus?.success) {
      onSuccess(transactionStatus.cat);
    }
  }, [transactionStatus]);

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
    const status = await ORDER_API.adopt(_id!);
    if (status.success) {
      onSuccess(status.cat);
    }
  };

  const close = () => {
    if (buyMode) {
      setBuyMode(null);
    } else onClose?.();
  };

  const handleBuyClick = () => {
    if (isApp) {
      window.open("https://tokentails.com/game", "_blank");
    } else {
      setBuyMode(isForSale ? BuyMode.CAT : BuyMode.AI);
    }
  };

  return (
    <>
      {!isCoinsPayment && !!buyMode && (
        <div
          className="z-0 absolute bottom-0 pb-4 bg-opacity-85 pt-8 px-4 left-0 right-0 border-t-8 border-yellow-300 max-h-screen overflow-y-auto border-radius-2xl"
          style={{
            backgroundImage: "url(/backgrounds/bg.gif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <CloseButton onClick={close} />
          <div className="flex flex-col gap-4">
            <div className="flex justify-center gap-4">
              <PixelButton
                text="Credit Card"
                active={paymentMethod === "card"}
                onClick={() => setPaymentMethod("card")}
              />
              <PixelButton
                text="Crypto"
                active={paymentMethod === "web3"}
                onClick={() => setPaymentMethod("web3")}
              />
            </div>

            {paymentMethod === "web3" ? (
              <ChainSelect />
            ) : (
              <StripePayment
                price={currencyPrice}
                catId={cat._id!}
                buyMode={buyMode}
                text={buyMode === BuyMode.AI ? "Buy" : undefined}
                onSuccess={() => {
                  onSuccess(cat);
                }}
              />
            )}
          </div>

          <div className="m-auto">
            {paymentMethod === "web3" && (
              <div className="flex flex-col items-start w-fit m-auto">
                <div className="text-main-black font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6 ml-3">
                  {currencyPrice} {currencyType}
                </div>
                <Web3Transfer
                  price={currencyPrice}
                  amount={1}
                  entityType={EntityType.CAT}
                  buyMode={buyMode}
                  cat={cat._id}
                  blessing={cat.blessings?.[0]?._id}
                  user={profile?._id}
                  text={buyMode === BuyMode.AI ? "Buy now" : "Save Now"}
                  loadingText="Saving Cat"
                />
              </div>
            )}
          </div>
        </div>
      )}
      <div className="z-10 relative flex items-end flex-row justify-around">
        {outOfSupply && !isOwned && (
          <PixelButton text="Out of supply" active isDisabled></PixelButton>
        )}
        {isOwned && !buyMode && (
          <PixelButton text="Adopted" active isDisabled></PixelButton>
        )}
        {isCoinsPayment && !outOfSupply && !isOwned && (
          <PixelButton
            text={catpointsText}
            subtext="coins"
            onClick={adoptWithCoins}
          />
        )}
        {!isCoinsPayment && !buyMode && (isForSale || (isOwned && !cat.ai)) && (
          <span className="relative">
            <PixelButton
              text={isOwned && !cat.ai ? "AI Companion" : "Save"}
              onClick={handleBuyClick}
              isDisabled={outOfSupply}
            />
            {isOwned && !cat.ai && (
              <img
                draggable={false}
                src="/logo/ai.webp"
                className="absolute top-1/2 -translate-y-1/2 -left-2 flex items-center w-6 h-6"
              />
            )}
          </span>
        )}

        {cat.totalSupply && !buyMode && !isOwned && (
          <div className="flex flex-col bg-gray-600 px-2 text-center rounded-lg font-secondary text-p4 mb-1">
            <div className="text-p5 text-yellow-300">SUPPLY</div>
            <div className="text-yellow-200 -mt-1">
              {cat.supply} / {cat.totalSupply}
            </div>
          </div>
        )}
        {!relative ||
          (buyMode && <PixelButton text="CLOSE" onClick={close}></PixelButton>)}
      </div>
    </>
  );
};

export const CatCard = ({
  onClose,
  onAdopted,
  relative,
  ...catData
}: IProps) => {
  const { catImg, name, type, blessings, ai } = catData;
  const [activeBlessing, setActiveBlessing] = useState<IBlessing | null>(null);
  const { profile } = useProfile();
  const [showBenefits, setShowBenefits] = useState(false);
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => CAT_API.cats(),
  });
  const isOwned = !!cats?.find((cat) => cat.name === name);
  const discountPercentage = useMemo(
    () => (isOwned ? 0 : getCatDiscountPercentage(catData)),
    [catData, cats]
  );
  return (
    <div
      className={`${
        relative ? "" : "top-1/2 -translate-y-1/2"
      } md:rem:w-[560px] lg:w-auto max-w-screen-xl hover:brightness-105 border-8 rounded-[24px] border-yellow-300 relative rem:h-[540px] md:h-[360px] lg:h-[600px] aspect-[2/3] max-w-screen`}
    >
      <CatCardOnboarding />
      <img
        draggable={false}
        src={`/ability/${type}_BG.webp`}
        className="absolute object-cover z-10 h-full w-full rounded-[16px]"
      />
      <div
        className="absolute inset-0 z-10 h-full w-full opacity-80 rounded-[16px]"
        style={{ backgroundColor: cardsColor[type] || "white" }}
      />
      <div className="relative z-20 flex flex-col md:flex-row lg:flex-col justify-between h-full">
        <div className="w-full">
          <div>
            <div className="flex justify-between items-center m-1">
              <div className="flex flex-row space-x-2 items-center pl-4">
                {(!!ai || !!blessings?.length) && (
                  <img
                    draggable={false}
                    src="/logo/ai.webp"
                    className="w-8 h-8 pixelated"
                  />
                )}
                <h3 className="text-main-black text-p3 whitespace-nowrap uppercase font-bold flex items-center">
                  {name}
                </h3>
              </div>
              <CatMultiplier {...catData} />
            </div>
          </div>
          <div className="relative mx-4 h-full md:h-auto lg:h-full flex justify-center items-center">
            <img
              draggable={false}
              className="w-full h-full rounded-xl absolute z-0 object-cover object-center"
              src={`/ability/${type}_BG.webp`}
              alt="base"
              width={400}
              height={400}
            />
            {discountPercentage && (
              <div className="absolute top-0.5 md:-top-2 right-0.5 md:-right-2 lg:top-1 lg:right-1 flex justify-center z-10">
                <Tag isSmall>{discountPercentage}% OFF</Tag>
              </div>
            )}
            <CatBlessings blessings={blessings} />
            <span className="relative z-0">
              <img
                draggable={false}
                src={
                  (activeBlessing ? activeBlessing.image?.url : catImg) ||
                  catImg
                }
                alt="Hero cat"
                className={`${
                  activeBlessing
                    ? "w-full h-48 rounded-xl min-w-48"
                    : "w-32 h-32"
                } relative z-10 object-contain pixelated`}
              />
              {!!blessings?.length && (
                <img
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                  src={`/flare-effect/${blessings[0]?.ability}.gif`}
                ></img>
              )}
            </span>
            {!activeBlessing && (
              <div
                id={CAT_CARD_ONBOARDING_MODAL_IDS.BENEFITS}
                className="absolute bottom-2 md:-bottom-8 lg:bottom-2 flex justify-center"
              >
                <PixelButton
                  onClick={() => setShowBenefits(!showBenefits)}
                  text={
                    showBenefits
                      ? "Hide benefits"
                      : `${catData.name} owner benefits`
                  }
                  isSmall
                />
              </div>
            )}
          </div>
          {showBenefits && (
            <div
              className="absolute bottom-0 left-0 right-0 w-full rounded-b-2xl z-20 animate-appear"
              style={{
                backgroundImage: "url('/backgrounds/bg-6.png')",
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <CloseButton onClick={() => setShowBenefits(false)} />
              <CatBenefits cat={catData} isOwned={isOwned} />
            </div>
          )}
        </div>
        <div>
          <div className="text-start m-3 md:m-5 bg md:mt-10 lg:mt-5">
            <CatDescription
              {...catData}
              setActiveBlessing={setActiveBlessing}
              activeBlessing={activeBlessing}
            />
            <CatPayment
              cat={catData}
              onClose={onClose}
              onAdopted={() => onAdopted?.()}
              relative={relative}
              cats={cats}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const CatCardModal: React.FC<IProps> = ({ onClose, ...catData }) => {
  const { setGameType } = useGame();

  return (
    <div className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]">
      <div
        className="absolute inset-0 z-0 opacity-50"
        style={{ backgroundColor: cardsColor[catData.type] || "white" }}
        onClick={() => onClose?.()}
      ></div>
      <CloseButton absolute onClick={() => onClose?.()} />

      <Web3Providers>
        <CatCard
          {...catData}
          onClose={onClose}
          onAdopted={() => setGameType(GameType.HOME)}
        />
      </Web3Providers>
    </div>
  );
};
