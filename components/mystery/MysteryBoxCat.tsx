import { getRewardsPropName, ITransactionStatus } from "@/api/order-api";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { ICat, Prices } from "@/models/cats";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { useEffect, useMemo, useState } from "react";
import { CatBenefits } from "../shared/CatBenefits";
import { ChainSelect } from "../shared/ChainSelect";
import { PixelButton } from "../shared/PixelButton";
import { Web3Transfer } from "../web3/transfer/Web3Transfer";
import { QUEST_API } from "@/api/quest-api";

export const MysteryBoxCat = () => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const [rolledCat, setRolledCat] = useState<null | ICat>();
  const [lootBoxRewards, setLootBoxRewards] = useState<null | string>(null);
  const [boxType, setBoxType] = useState<EntityType>(EntityType.LOOT_BOX);
  const {
    currencyType,
    bnbRate,
    xlmRate,
    solRate,
    transactionStatus,
    setTransactionStatus,
  } = useWeb3();
  const onSuccess = (transactionStatus: ITransactionStatus) => {
    const { cat, type, amount } = transactionStatus;
    if (cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), cat],
        cat,
        monthBoxes: (profile?.monthBoxes || 0) + 1,
      });
      setTransactionStatus(null);
      setRolledCat(cat);
      toast({ message: `You just got ${cat.name} !`, img: cat.catImg });
    }
    if (type) {
      toast({
        message: `You got ${amount} ${getRewardsPropName(type)} !`,
        symbol: type,
      });
      setLootBoxRewards(
        `You just got ${amount} ${getRewardsPropName(
          type
        )} from this box. Open a new box to get more rewards!`
      );
    }
  };

  const openFreeBox = async () => {
    const result = await QUEST_API.openLootBox();
    const { type, amount } = result;
    setProfileUpdate({ boxes: (profile?.boxes || 0) - 1 });
    setLootBoxRewards(
      `You just got ${amount} ${getRewardsPropName(
        type
      )} from this box. Open a new box to get more rewards!`
    );
  };

  const price = useMemo(() => {
    if (boxType === EntityType.MYSTERY_BOX) {
      return Prices.generatedCat;
    }
    return Prices.lootBox;
  }, [boxType]);
  const currencyPrice = useMemo(() => {
    if (
      [
        CurrencyType.XLM,
        CurrencyType.BNB,
        CurrencyType.SOL,
        CurrencyType.XFI,
      ].includes(currencyType) &&
      bnbRate &&
      xlmRate &&
      solRate
    ) {
      if (currencyType === CurrencyType.BNB) {
        return parseFloat((price / bnbRate).toFixed(3));
      }
      if (currencyType === CurrencyType.ODP) {
        return parseFloat((price * 1000).toFixed(0));
      }
      if (currencyType === CurrencyType.XFI) {
        return parseFloat((price * 10).toFixed(0));
      }
      if (currencyType === CurrencyType.XLM) {
        return Math.ceil(price / xlmRate);
      }
      if (currencyType === CurrencyType.SOL) {
        return parseFloat((price / solRate).toFixed(3));
      }
    }
    return price;
  }, [currencyType, bnbRate, xlmRate, solRate, price]);

  useEffect(() => {
    if (transactionStatus?.success) {
      onSuccess(transactionStatus);
    }
  }, [transactionStatus]);

  return (
    <div className="flex flex-col items-center justify-center mb-4">
      <img
        className={`w-48 md:w-32 lg:w-52 mb-4 ${
          rolledCat?.catImg ? "pixelated" : ""
        }`}
        src={
          rolledCat?.catImg ||
          (boxType === EntityType.MYSTERY_BOX
            ? "/elements/mystery-box.webp"
            : "/elements/loot-box.webp")
        }
      />
      <div className="flex gap-2 -mt-2 mb-2 items-center justify-center">
        <PixelButton
          onClick={() => setBoxType(EntityType.LOOT_BOX)}
          active={boxType === EntityType.LOOT_BOX}
          text="Loot Box"
        />
        <PixelButton
          onClick={() => setBoxType(EntityType.MYSTERY_BOX)}
          active={boxType === EntityType.MYSTERY_BOX}
          text="Mystery Box"
        />
      </div>
      {lootBoxRewards && (
        <div className="font-primary my-2 animate-opacity text-p4 text-center text-balance">
          {lootBoxRewards.toUpperCase()}
        </div>
      )}
      {!rolledCat ? (
        <>
          <ChainSelect />
          <div className="m-auto animate-appear">
            <div className="flex flex-col items-start w-fit m-auto">
              {(!profile?.boxes || boxType === EntityType.MYSTERY_BOX) && (
                <div className="text-main-black font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6 ml-3">
                  {currencyPrice} {currencyType}
                </div>
              )}
              {!!profile?.boxes && boxType === EntityType.LOOT_BOX ? (
                <PixelButton
                  text="Open FREE Box"
                  onClick={() => openFreeBox()}
                />
              ) : (
                <Web3Transfer
                  price={currencyPrice}
                  amount={1}
                  entityType={boxType}
                  user={profile?._id}
                  text="Open THE Box"
                  loadingText="Opening..."
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col">
          <div className="text-p3 font-primary -mt-12 text-center">
            YOU JUST GOT{" "}
            <span className="text-outline text-p1">{rolledCat?.name}!</span>
          </div>
          <PixelButton onClick={() => setRolledCat(null)} text="Try again" />
          <CatBenefits cat={rolledCat}></CatBenefits>
        </div>
      )}
      {boxType === EntityType.LOOT_BOX && (
        <div className="flex flex-col items-center justify-center w-48">
          <div className="text-p4 font-secondary text-center mt-2">
            WHAT CAN I WIN?
          </div>
          <div className="text-p4 bg-amber-500 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 hover:scale-110 transition-transform mb-2 border-2 rounded-xl border-main-black">
            <img draggable={false} src="/logo/logo.webp" className="w-8 mr-3" />
            <span className="flex flex-col">
              <span className="text-p5 -mb-1 text-amber-900">WIN $TAILS</span>
              <span>UP TO $3k in $TAILS</span>
            </span>
          </div>
          <div className="text-p4 bg-green-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 hover:scale-110 transition-transform mb-2 border-2 rounded-xl border-main-black">
            <img
              draggable={false}
              src="/logo/coin.webp"
              className="w-8 h-8 mr-3 -ml-5"
            />
            <span className="flex flex-col">
              <span className="text-p5 -mb-1 text-green-900">WIN COINS</span>
              <span>UP TO 1 000 000</span>
            </span>
          </div>
          <div className="text-p4 bg-red-600 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 hover:scale-110 transition-transform mb-2 border-2 rounded-xl border-main-black">
            <img
              draggable={false}
              src="/logo/heart.webp"
              className="w-8 h-8 mr-3 -ml-1 pixelated"
            />
            <span className="flex flex-col">
              <span className="text-p5 -mb-1 text-red-900">WIN LIVES</span>
              <span>UP TO 10000 LIVES</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
