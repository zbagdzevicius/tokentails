import { CATS_ONBOARDING_MODAL_IDS } from "@/constants/onboarding";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { Prices, ICat } from "@/models/cats";
import { GameType } from "@/models/game";
import { IImage } from "@/models/image";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { useState, useMemo, useEffect } from "react";
import { ChainSelect } from "../shared/ChainSelect";
import { Previews } from "../shared/drag-drop";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StripePayment } from "../web3/payments/StripePayment";
import { Web3Transfer } from "../web3/transfer/Web3Transfer";

export const GenerateCat = ({ close }: { close: () => void }) => {
  const [isDisplayed, setIsDisplayed] = useState(false);
  const { profile, setProfileUpdate } = useProfile();
  const [price, setPrice] = useState(Prices.generatedCat);
  const [name, setName] = useState("");
  const [image, setImage] = useState<IImage[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"web3" | "card">("web3");
  const toast = useToast();
  const { setGameType } = useGame();
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
      });
      setTransactionStatus(null);
    }
    toast({ message: "Congratz on your generated cat !" });
    setGameType(GameType.HOME);
    close();
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
      {isDisplayed ? (
        <div className="flex flex-col items-center justify-center mb-8 gap-3 animate-appear">
          <Tag>Generate Your Own Cat</Tag>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value?.slice(0, 24))}
            className="flex-grow px-2 py-1 outline-none text-p3 bg-white rounded-full"
            placeholder="Name of your cat"
          />
          <Previews maxFiles={1} value={image} onChange={setImage} />

          {!!name && !!image?.length && (
            <>
              {/* TODO - RESTORE FIAT PAYMENTS */}
              {/* <div className="flex justify-center gap-4 animate-appear">
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
              </div> */}
              {paymentMethod === "web3" ? (
                <ChainSelect />
              ) : (
                <StripePayment
                  price={price}
                  generatedCat={{
                    name,
                    image: image[0]?._id!,
                  }}
                  onSuccess={() => {
                    onSuccess();
                  }}
                />
              )}
              <div className="m-auto animate-appear">
                {paymentMethod === "web3" && (
                  <div className="flex flex-col items-start w-fit m-auto">
                    <div className="text-main-black font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6 ml-3">
                      {currencyPrice} {currencyType}
                    </div>
                    <Web3Transfer
                      price={currencyPrice}
                      amount={1}
                      entityType={EntityType.CAT}
                      user={profile?._id}
                      generatedCat={{
                        name,
                        image: image[0]?._id!,
                      }}
                      text="Generate"
                      loadingText="Generating..."
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <PixelButton
          id={CATS_ONBOARDING_MODAL_IDS.GENERATE}
          onClick={() => setIsDisplayed(true)}
          text="Generate Your Own Cat"
        />
      )}
    </div>
  );
};
