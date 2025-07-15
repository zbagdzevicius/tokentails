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

export const MysteryBoxCat = () => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const [rolledCat, setRolledCat] = useState<null | ICat>();
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
    }
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
      {!rolledCat ? (
        <>
          <ChainSelect />
          <div className="m-auto animate-appear">
            <div className="flex flex-col items-start w-fit m-auto">
              <div className="text-main-black font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6 ml-3">
                {currencyPrice} {currencyType}
              </div>
              <Web3Transfer
                price={currencyPrice}
                amount={1}
                entityType={boxType}
                user={profile?._id}
                text="Open THE Box"
                loadingText="Opening..."
              />
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
    </div>
  );
};
