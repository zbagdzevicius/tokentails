import { getRewardsPropName, ITransactionStatus } from "@/api/order-api";
import { QUEST_API } from "@/api/quest-api";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { ICat, Prices } from "@/models/cats";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { useEffect, useMemo, useState } from "react";
import { ChainSelect } from "../shared/ChainSelect";
import { PixelButton } from "../shared/PixelButton";
import { Web3Transfer } from "../web3/transfer/Web3Transfer";

const price = Prices.lootBox;

export const MysteryBoxCat = () => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const [rolledCat, setRolledCat] = useState<null | ICat>();
  const [lootBoxRewards, setLootBoxRewards] = useState<null | string>(null);
  const { currencyType, rates, transactionStatus, setTransactionStatus } =
    useWeb3();
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
        return parseFloat((price / rates[CurrencyType.BNB]).toFixed(3));
      }
      if (currencyType === CurrencyType.SEI) {
        return Math.ceil(price / rates[CurrencyType.SEI]);
      }
      if (currencyType === CurrencyType.XLM) {
        return Math.ceil(price / rates[CurrencyType.XLM]);
      }
      if (currencyType === CurrencyType.SOL) {
        return parseFloat((price / rates[CurrencyType.SOL]).toFixed(3));
      }
    }
    return price;
  }, [currencyType, rates, price]);

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
        src={rolledCat?.catImg || cdnFile("elements/loot-box.webp")}
      />
      {lootBoxRewards && (
        <div className="font-primary relative my-2 animate-opacity text-p4 text-center text-balance bg-gradient-to-b from-purple-300 to-blue-300 border-yellow-300 border-4 rounded-2xl px-2 mt-12 mb-8">
          <span className="relative z-10">{lootBoxRewards.toUpperCase()}</span>
          <img
            className="absolute -top-14 left-1/2 -translate-x-1/2 z-0 w-12"
            draggable={false}
            src={cdnFile("logo/logo.webp")}
          />
        </div>
      )}
      <ChainSelect />
      <div className="m-auto animate-appear">
        <div className="flex flex-col items-start w-fit m-auto">
          {!profile?.boxes && (
            <div className="text-yellow-900 font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6 ml-3">
              {currencyPrice} {currencyType}
            </div>
          )}
          {!!profile?.boxes ? (
            <PixelButton text="Open FREE Box" onClick={() => openFreeBox()} />
          ) : (
            <Web3Transfer
              price={currencyPrice}
              amount={1}
              entityType={EntityType.LOOT_BOX}
              user={profile?._id}
              text="Open THE Box"
              loadingText="Opening..."
            />
          )}
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-48">
        <div className="text-p4 font-secondary text-center mt-2">
          WHAT CAN I WIN?
        </div>
        <div className="text-p4 bg-gradient-to-r from-yellow-600 to-yellow-900 h-14 font-secondary text-white w-full flex items-center justify-center gap-1 hover:scale-110 transition-transform mb-2 border-4 rounded-lg border-yellow-900">
          <img
            draggable={false}
            src={cdnFile("logo/logo.webp")}
            className="w-8 mr-3"
          />
          <span className="flex flex-col">
            <span className="text-p5 -mb-1 text-amber-900 font-primary glow">
              WIN $TAILS
            </span>
            <span className="text-yellow-50">UP TO 1000000</span>
          </span>
        </div>
      </div>
    </div>
  );
};
