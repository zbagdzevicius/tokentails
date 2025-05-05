import { CAT_API } from "@/api/cat-api";
import { ORDER_API } from "@/api/order-api";
import { getCatPrice } from "@/constants/cat-status";
import { CAT_CARD_ONBOARDING_MODAL_IDS } from "@/constants/onboarding";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { isApp } from "@/models/app";
import { cardsColor, CatAbilities, IBlessing, ICat } from "@/models/cats";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CatCardOnboarding } from "../onboarding/CardOnboarding";
import { CatBenefits } from "../shared/CatBenefits";
import { ChainSelect } from "../shared/ChainSelect";
import { CloseButton } from "../shared/CloseButton";
import { PixelButton } from "../shared/PixelButton";
import { StripePayment } from "../web3/payments/StripePayment";
import { Web3Transfer } from "../web3/transfer/Web3Transfer";
import { BuyMode, getMultiplier } from "@/constants/cat-utils";

interface IProps extends ICat {
  onClose?: () => void;
  onAdopted?: () => void;
  relative?: boolean;
}

export const CatMultiplier = (cat: ICat) => {
  const multiplier = useMemo(() => getMultiplier(cat), [cat]);
  return (
    <div
      id={CAT_CARD_ONBOARDING_MODAL_IDS.MULTIPLIER}
      style={{
        backgroundColor: cardsColor[cat.type] || "white",
      }}
      className="absolute flex items-center top-2 right-2 bg-opacity-75 border font-secondary text-p5 hover:bg-opacity-100 pl-2 rounded-xl"
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
              src={`/blessings/${type}_TYPE.png`}
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
              text={activeBlessing ? "Show Virtual Twin" : "Read Cat story"}
              isSmall
              onClick={() =>
                setActiveBlessing(activeBlessing ? null : firstBlessing)
              }
            ></PixelButton>
          )}
        </div>
        <p
          className="text-p5 font-bold overflow-y-auto max-h-[8rem] md:max-h-[11rem] pb-1"
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
              {CatAbilities[type].skill}
            </h4>
          </div>
          <p className="text-p5 font-bold pb-1">
            {CatAbilities[type].description}
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
  unitsToBuy,
  handleUnitsToBuy,
}: {
  cat: ICat;
  onClose?: () => void;
  onAdopted?: () => void;
  relative?: boolean;
  cats?: ICat[];
  unitsToBuy: number;
  handleUnitsToBuy: (units: number) => void;
}) => {
  const {
    currencyType,
    bnbRate,
    xlmRate,
    solRate,
    diamRate,
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
    const corePrice = getCatPrice(cat) * unitsToBuy;
    if (paymentMethod === "card") {
      return corePrice;
    }
    if (
      [CurrencyType.XLM, CurrencyType.BNB, CurrencyType.SOL].includes(
        currencyType
      ) &&
      bnbRate &&
      xlmRate &&
      solRate &&
      diamRate
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
      if (currencyType === CurrencyType.DIAM) {
        return parseFloat((corePrice / diamRate).toFixed(3));
      }
    }
    return corePrice;
  }, [
    currencyType,
    bnbRate,
    xlmRate,
    solRate,
    diamRate,
    cat,
    buyMode,
    paymentMethod,
  ]);

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
    if (buyMode === BuyMode.CAT) {
      // IMPLEMENT IF WE'LL NEED TO SEPARATE POST-PURCHASE HANDLER
    }

    setProfileUpdate({
      cats: [...(cats || []), cat],
      cat,
      catpoints: profile!.catpoints - catpoints,
    });
    setTransactionStatus(null);

    toast({ message: "Congratz on your adopted cat !" });
    setIsAdopting(false);
    onAdopted?.();
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
      window.open(`https://tokentails.com/cats/${cat._id}`, "_blank");
    } else {
      setBuyMode(BuyMode.CAT);
    }
  };

  const buyText = cat.shelter?.slug === "token-tails" ? "Adopt" : "Save";

  return (
    <>
      {!isCoinsPayment && !!buyMode && (
        <div
          className="z-20 absolute bottom-0 pb-4 bg-opacity-85 pt-8 px-4 left-0 right-0 border-t-8 max-h-screen overflow-y-auto border-radius-2xl"
          style={{
            backgroundImage: "url(/backgrounds/bg.gif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderColor: cardsColor[cat.type],
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
                  text={buyText}
                  loadingText="Saving Cat"
                />
              </div>
            )}
          </div>
        </div>
      )}
      <div className="z-10 relative flex items-end flex-row justify-around w-full">
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
        {!isCoinsPayment && !buyMode && !isOwned && (
          <span className="relative flex items-center gap-2 w-full">
            <div className="relative">
              <span className="z-10 relative">
                <PixelButton
                  text={buyText}
                  onClick={handleBuyClick}
                  isDisabled={outOfSupply}
                />
              </span>

              {!!price && (
                <div className="absolute -top-4 left-0 right-0 justify-center flex z-0">
                  <div className="bg-red-500 text-yellow-300 px-2 border-2 border-main-black text-p6 font-primary">
                    ${currencyPrice}
                  </div>
                </div>
              )}
            </div>
            {!!cat.blessings?.length && (
              <div className="flex items-center">
                <PixelButton
                  text="-"
                  isSmall
                  onClick={() => handleUnitsToBuy(unitsToBuy - 1)}
                />
                <div className="flex gap-1 flex-wrap justify-center">
                  {cat.totalSupply <= 10 ? (
                    Array.from({
                      length: cat.totalSupply - (cat.totalSupply - cat.supply),
                    }).map((_, i) => (
                      <img
                        key={i}
                        draggable={false}
                        src={
                          unitsToBuy < i + 1
                            ? "/logo/heart-empty.webp"
                            : "/logo/heart-saved.webp"
                        }
                        className="w-4 h-4 pixelated"
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-center gap-1 font-secondary font-bold text-p2 w-12 h-12 relative">
                      <span className={unitsToBuy >= 10 ? `z-10` : `z-10 pt-1`}>
                        {unitsToBuy}
                      </span>
                      <img
                        draggable={false}
                        src={
                          unitsToBuy >= cat.supply
                            ? "/logo/heart-saved.webp"
                            : "/logo/heart.webp"
                        }
                        className="w-full h-full pixelated absolute inset-0 z-0"
                      />
                    </div>
                  )}
                </div>
                <PixelButton
                  text="+"
                  isSmall
                  onClick={() => handleUnitsToBuy(unitsToBuy + 1)}
                />
              </div>
            )}
          </span>
        )}
      </div>
    </>
  );
};

export const SafeCatCard = ({
  onClose,
  onAdopted,
  relative,
  ...cat
}: IProps) => {
  const { catImg, name, type, blessings } = cat;
  const [activeBlessing, setActiveBlessing] = useState<IBlessing | null>(
    !!cat.blessings?.length ? cat.blessings[0] : null
  );
  const { profile } = useProfile();
  const [showBenefits, setShowBenefits] = useState(false);
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => CAT_API.cats(),
  });
  const isOwned = !!cats?.find((cat) => cat.name === name);
  const [unitsToBuy, setUnitsToBuy] = useState(cat.supply >= 1 ? 1 : 0);
  const donationsToSave = useMemo(
    () => cat.totalSupply - (cat.totalSupply - cat.supply) - unitsToBuy,
    [cat.totalSupply, cat.supply, unitsToBuy]
  );

  const handleUnitsToBuy = (units: number) => {
    if (units < 1 || units > cat.totalSupply - (cat.totalSupply - cat.supply)) {
      return;
    }
    setUnitsToBuy(units);
  };

  const buyText = cat.shelter?.slug === "token-tails" ? "Adopt" : "Save";

  return (
    <div
      style={{ borderColor: cardsColor[type] }}
      className={`${
        relative ? "" : "top-1/2 -translate-y-1/2"
      } md:rem:w-[560px] lg:w-auto max-w-screen-xl hover:brightness-105 border-8 rounded-[24px] relative rem:h-[540px] md:h-[360px] lg:h-[600px] aspect-[2/3] max-w-screen`}
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
        <CatMultiplier {...cat} />
        {showBenefits && (
          <div
            className="absolute bottom-0 left-0 right-0 w-full rounded-2xl z-20 animate-appear"
            style={{
              backgroundImage: "url('/backgrounds/bg-6.png')",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <CloseButton onClick={() => setShowBenefits(false)} />
            <CatBenefits cat={cat} isOwned={isOwned} />
          </div>
        )}
        <div className="w-full relative flex flex-col">
          <div>
            <div className="flex justify-between items-center m-1">
              <div className="flex flex-row space-x-2 items-center pl-4">
                {!!blessings?.[0]?.instagram && (
                  <a
                    href={blessings?.[0]?.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      className="w-6 h-6"
                      src="/icons/social/instagram.png"
                      draggable="false"
                    />
                  </a>
                )}
                <h3 className="text-main-black text-p3 whitespace-nowrap uppercase font-bold flex items-center">
                  {name}
                </h3>
              </div>
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
                    : "w-36 h-36"
                } relative z-10 object-contain pixelated`}
              />
              {!!blessings?.length && (
                <img
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                  src={`/flare-effect/${type}.gif`}
                ></img>
              )}
            </span>
            {!activeBlessing && (
              <div
                id={CAT_CARD_ONBOARDING_MODAL_IDS.BENEFITS}
                className="absolute -bottom-2 md:-bottom-8 lg:-bottom-2 flex justify-center z-10"
              >
                <PixelButton
                  onClick={() => setShowBenefits(!showBenefits)}
                  text={
                    showBenefits
                      ? "Hide benefits"
                      : `${cat.name} owner benefits`
                  }
                  isSmall
                />
              </div>
            )}
          </div>
          {!!cat.blessings?.length && (
            <div className="flex flex-col absolute left-0 right-0 -bottom-14 md:bottom-0 lg:-bottom-14 z-0">
              <div className="flex flex-row-reverse m-auto gap-1 justify-center mt-2 md:mt-8 lg:mt-2">
                {cat.totalSupply <= 10 ? (
                  Array.from({ length: cat.totalSupply || 0 }).map((_, i) => (
                    <img
                      key={i}
                      draggable={false}
                      src={
                        cat.supply < i + 1
                          ? "/logo/heart.webp"
                          : cat.supply - unitsToBuy < i + 1
                          ? "/logo/heart-saved.webp"
                          : "/logo/heart-empty.webp"
                      }
                      className="w-4 h-4 pixelated"
                    />
                  ))
                ) : (
                  <div className="flex gap-1 justify-center items-center font-secondary">
                    <img
                      draggable={false}
                      src="/logo/heart.webp"
                      className="w-4 h-4 pixelated"
                    />
                    <div className="text-p5">
                      {cat.totalSupply - donationsToSave} / {cat.totalSupply}
                    </div>
                    <img
                      draggable={false}
                      src={
                        donationsToSave < 1
                          ? "/logo/heart-saved.webp"
                          : "/logo/heart-empty.webp"
                      }
                      className="w-4 h-4 pixelated"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-row-reverse m-auto gap-1 justify-center font-primary mb-2 text-balance text-center">
                {donationsToSave < 1
                  ? unitsToBuy
                    ? `MEOW! CLICK ${buyText} TO SAVE`
                    : "OUT OF SUPPLY"
                  : `${donationsToSave} Remaining. ${
                      buyText === "Adopt"
                        ? "Every sale supports local shelters"
                        : "Every sale supports the cat"
                    }`}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="text-start m-3 md:m-5 bg md:mt-10 lg:mt-5">
            <CatDescription
              {...cat}
              setActiveBlessing={setActiveBlessing}
              activeBlessing={activeBlessing}
            />
            <CatPayment
              cat={cat}
              onClose={onClose}
              onAdopted={() => onAdopted?.()}
              relative={relative}
              cats={cats}
              unitsToBuy={unitsToBuy}
              handleUnitsToBuy={handleUnitsToBuy}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
