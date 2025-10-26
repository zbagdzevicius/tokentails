import { CAT_API } from "@/api/cat-api";
import { getCatPrice } from "@/constants/cat-status";
import { BuyMode, getMultiplier } from "@/constants/cat-utils";
import { bgStyle, cdnFile, getSocialNetworkFromUrl } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { cardsColor, ICat } from "@/models/cats";
import { GameModal } from "@/models/game";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CatBenefits } from "../shared/CatBenefits";
import { ChainSelect } from "../shared/ChainSelect";
import { CloseButton } from "../shared/CloseButton";
import { PixelButton } from "../shared/PixelButton";
import { Web3Transfer } from "../web3/transfer/Web3Transfer";
import { StripePayment } from "../web3/StripePayment";
import { isApp } from "@/models/app";
import { Browser } from "@capacitor/browser";

interface IProps extends ICat {
  onClose?: (gameModal?: GameModal) => void;
  onAdopted?: () => void;
  relative?: boolean;
}

export const CatMultiplier = (cat: ICat) => {
  const multiplier = useMemo(() => getMultiplier(cat), [cat]);
  return (
    <div
      style={{
        backgroundColor: cardsColor[cat.type] || "white",
      }}
      className="absolute flex items-center top-2 md:top-11 lg:top-2 right-2 bg-opacity-75 border font-secondary text-p5 hover:bg-opacity-100 pl-2 rounded-xl"
    >
      X{multiplier}
      <img
        draggable={false}
        src={cdnFile("logo/logo.webp")}
        className="h-6 ml-1"
      />
    </div>
  );
};

export const CatDescription = ({ blessings, resqueStory, type }: ICat) => {
  const firstBlessing = blessings && blessings.length > 0 ? blessings[0] : null;

  return (
    <>
      <div
        className="flex flex-row items-center justify-center w-fit m-auto rounded-3xl"
        style={{ backgroundColor: cardsColor[type] || "white" }}
      >
        <img
          draggable={false}
          className="w-8 h-8 -ml-2"
          src={cdnFile(`ability/${type}.png`)}
          alt={type}
          width={40}
          height={40}
        />
        <span className="text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] text-p3 font-primary px-2">
          {type} TYPE
        </span>
        <img
          draggable={false}
          className="w-8 h-8 -mr-2"
          src={cdnFile(`ability/${type}.png`)}
          alt={type}
          width={40}
          height={40}
        />
      </div>
      <div className="mb-3 max-sm:mb-2 text-main-black">
        <div className="flex flex-row items-center justify-center font-primary">
          <span className="text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] text-p1">
            PET STORY
          </span>
        </div>
        <p
          className="text-p5 font-bold overflow-y-auto max-h-[12rem] md:max-h-[12rem] pb-1"
          dangerouslySetInnerHTML={{
            __html: firstBlessing?.description || resqueStory,
          }}
        ></p>
      </div>
      <audio className="hidden" loop autoPlay>
        <source src={cdnFile("purrquest/sounds/meow.mp3")} />
      </audio>
    </>
  );
};

export const CatPayment = ({
  cat,
  onClose,
  onAdopted,
  cats,
}: {
  cat: ICat;
  onClose?: () => void;
  onAdopted?: () => void;
  cats?: ICat[];
}) => {
  const { currencyType, rates, transactionStatus, setTransactionStatus } =
    useWeb3();
  const { supply, name, price } = cat;
  const { profile, setProfileUpdate } = useProfile();
  const [buyMode, setBuyMode] = useState<BuyMode | null>(null);
  const isOwned = useMemo(
    () => cats?.find((cat) => cat.name === name),
    [cats, cat]
  );
  const [paymentMethod, setPaymentMethod] = useState<"crypto" | "card">(
    "crypto"
  );
  const corePrice = useMemo(() => getCatPrice(cat), [cat]);
  const currencyPrice = useMemo(() => {
    if (
      [
        CurrencyType.XLM,
        CurrencyType.BNB,
        CurrencyType.SOL,
        CurrencyType.SEI,
      ].includes(currencyType) &&
      rates
    ) {
      if (currencyType === CurrencyType.BNB) {
        return parseFloat((corePrice / rates[CurrencyType.BNB]).toFixed(3));
      }
      if (currencyType === CurrencyType.SEI) {
        return Math.ceil(corePrice / rates[CurrencyType.SEI]);
      }
      if (currencyType === CurrencyType.XLM) {
        return Math.ceil(corePrice / rates[CurrencyType.XLM]);
      }
      if (currencyType === CurrencyType.SOL) {
        return parseFloat((corePrice / rates[CurrencyType.SOL]).toFixed(3));
      }
    }
    return corePrice;
  }, [currencyType, rates, corePrice, buyMode]);

  const toast = useToast();
  const outOfSupply = supply === undefined || supply <= 0;

  const onSuccess = (cat: ICat) => {
    setProfileUpdate({
      cats: [...(cats || []), cat],
      cat,
      monthCatsAdopted: (profile?.monthCatsAdopted || 0) + 1,
    });
    setTransactionStatus(null);

    toast({ message: "Congratz on your adopted cat !", img: cat.catImg });
    onAdopted?.();
    onClose?.();
  };

  useEffect(() => {
    if (transactionStatus?.success) {
      onSuccess(transactionStatus.cat);
    }
  }, [transactionStatus]);

  const close = () => {
    if (buyMode) {
      setBuyMode(null);
    } else onClose?.();
  };

  const handleBuyClick = () => {
    setBuyMode(BuyMode.CAT);
  };

  const buyText = "ADOPT";

  return (
    <>
      {!!buyMode && (
        <div
          className="z-20 absolute bottom-0 pb-4 bg-opacity-85 pt-8 px-4 left-0 right-0 border-t-8 max-h-screen overflow-y-auto border-radius-2xl"
          style={bgStyle("4")}
        >
          <CloseButton absolute onClick={close} />
          <div className="font-secondary bg-purple-300 px-4 rounded-full w-fit m-auto">
            PAYMENT METHOD
          </div>
          <div className="flex flex-row justify-center items-center">
            <PixelButton
              isSmall
              text="CRYPTO"
              active={paymentMethod === "crypto"}
              onClick={() => setPaymentMethod("crypto")}
            />
            <PixelButton
              isSmall
              text="CARD / APPLE PAY"
              active={paymentMethod === "card"}
              onClick={() =>
                isApp
                  ? Browser.open({
                      url: `https://tokentails.com/cats/${cat._id}`,
                    })
                  : setPaymentMethod("card")
              }
            />
          </div>
          <div className="flex flex-col gap-4">
            {paymentMethod === "crypto" && <ChainSelect />}
            {paymentMethod === "card" && (
              <StripePayment
                price={currencyPrice}
                catId={cat._id!}
                onSuccess={() => onSuccess(cat)}
              />
            )}
          </div>

          {paymentMethod === "crypto" && (
            <div className="m-auto">
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
            </div>
          )}
        </div>
      )}
      <div className="z-10 relative flex flex-row w-full pt-2">
        {outOfSupply && !isOwned && (
          <PixelButton text="Out of supply" active isDisabled></PixelButton>
        )}
        {!buyMode && !isOwned && (
          <span className="relative flex items-center gap-2 w-full justify-center">
            <div className="relative">
              <span className="z-10 relative">
                <PixelButton
                  text={buyText}
                  onClick={handleBuyClick}
                  isDisabled={outOfSupply}
                />
              </span>

              {!!price && (
                <div className="absolute top-2 -left-10 right-0 flex z-0">
                  <div className="bg-red-500 text-yellow-300 px-2 border-2 border-main-black text-p4 font-primary pr-4">
                    ${corePrice}
                  </div>
                </div>
              )}
            </div>
          </span>
        )}
      </div>
    </>
  );
};

export const CatCard = ({ onClose, onAdopted, relative, ...cat }: IProps) => {
  const { catImg, name, type, blessings } = cat;
  const { profile } = useProfile();
  const [showBenefits, setShowBenefits] = useState(false);
  const [showBlessingImage, setShowBlessingImage] = useState(false);
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => CAT_API.cats(),
  });
  const isOwned = !!cats?.find((cat) => cat.name === name);

  // Image rotation effect - only if blessing image exists
  useEffect(() => {
    if (!blessings?.[0]?.image?.url) {
      return; // No blessing image, no rotation needed
    }

    const interval = setInterval(() => {
      setShowBlessingImage((prev) => !prev);
    }, 5000); // Toggle every 5 seconds

    return () => clearInterval(interval);
  }, [blessings]);
  return (
    <div
      style={{ borderColor: cardsColor[type] }}
      className={`${
        relative ? "" : "top-1/2 -translate-y-1/2"
      } md:rem:w-[560px] lg:w-auto max-w-screen-xl hover:brightness-105 border-8 rounded-[24px] relative rem:h-[540px] md:h-[360px] lg:h-[600px] aspect-[2/3] max-w-screen`}
    >
      <img
        draggable={false}
        src={cdnFile(`ability/${type}_BG.webp`)}
        className="absolute object-cover z-10 h-full w-full rounded-[16px]"
      />
      <div
        className="absolute inset-0 z-10 h-full w-full opacity-80 rounded-[16px]"
        style={{ backgroundColor: cardsColor[type] || "white" }}
      />
      <div className="relative z-20 flex flex-col md:flex-row lg:flex-col flex-start h-full">
        <CatMultiplier {...cat} />
        {showBenefits && (
          <div
            className="absolute bottom-0 left-0 right-0 w-full rounded-2xl z-20 animate-appear"
            style={bgStyle("5")}
          >
            <CloseButton onClick={() => setShowBenefits(false)} />
            <CatBenefits cat={cat} isOwned={isOwned} />
          </div>
        )}
        <div className="w-full relative flex flex-col min-w-64">
          <div>
            <div className="flex justify-between items-center m-1">
              <div className="flex flex-row space-x-2 items-center pl-4">
                {!!blessings?.[0]?.instagram ? (
                  <a
                    href={blessings?.[0]?.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      className="w-6 h-6"
                      src={getSocialNetworkFromUrl(blessings?.[0]?.instagram)}
                      draggable="false"
                    />
                  </a>
                ) : (
                  <img
                    className="w-6 h-6"
                    src={cdnFile("currency/SEI.webp")}
                    draggable="false"
                  />
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
              src={cdnFile(`ability/${type}_BG.webp`)}
              alt="base"
              width={400}
              height={400}
            />
            <span className="relative z-0">
              <img
                key={showBlessingImage ? "blessing" : "cat"}
                draggable={false}
                src={
                  blessings?.[0]?.image?.url && showBlessingImage
                    ? blessings[0].image.url
                    : catImg
                }
                alt="Hero cat"
                className={`w-36 h-36 ${
                  showBlessingImage ? "" : "pixelated"
                } relative z-10 object-contain animate-opacity`}
              />
              {!!blessings?.length && (
                <img
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                  src={cdnFile(`flare-effect/${type}.gif`)}
                ></img>
              )}
            </span>
            {!showBenefits && (
              <div className="absolute -bottom-2 md:-bottom-8 lg:-bottom-2 flex justify-center z-10 animate-appear">
                <PixelButton
                  onClick={() => setShowBenefits(!showBenefits)}
                  text="benefits"
                  isSmall
                />
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-start mx-3 mb-3 md:mx-5 md:mb-5 bg">
            <CatDescription {...cat} />
            <CatPayment
              cat={cat}
              onClose={onClose}
              onAdopted={() => onAdopted?.()}
              cats={cats}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
