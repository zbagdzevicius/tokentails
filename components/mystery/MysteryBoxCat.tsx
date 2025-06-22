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

const price = Prices.generatedCat;

export const MysteryBoxCat = () => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const [rolledCat, setRolledCat] = useState<null | ICat>();
  const {
    currencyType,
    bnbRate,
    xlmRate,
    solRate,
    transactionStatus,
    setTransactionStatus,
  } = useWeb3();
  const onSuccess = (cat?: ICat) => {
    if (cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), cat],
        cat,
        monthBoxes: (profile?.monthBoxes || 0) + 1,
      });
      setTransactionStatus(null);
      setRolledCat(cat);
    }
    toast({ message: "Congratz on your Mystery Cat !" });
  };
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
      onSuccess(transactionStatus.cat);
    }
  }, [transactionStatus]);

  return (
    <div className="flex flex-col items-center justify-center mb-4">
      <img
        className={`w-48 md:w-32 lg:w-52 mb-4 ${
          rolledCat?.catImg ? "pixelated" : ""
        }`}
        src={rolledCat?.catImg || "/elements/mystery-box.webp"}
      />
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
                entityType={EntityType.MYSTERY_BOX}
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
