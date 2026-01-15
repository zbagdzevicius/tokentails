"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { EntityType } from "@/models/save";
import { useEffect, useMemo } from "react";
import { useWeb3Transfer } from "./useWeb3Transfer";
import { IMessage } from "@/models/cats";
import { useWeb3 } from "@/context/Web3Context";
import { CurrencyType } from "@/web3/contracts";

export interface IGeneratedCat {
  name: string;
  image: string;
}

interface Web3TransferProps {
  price: number;
  text?: string;
  loadingText?: string;
  entityType: EntityType;
  id?: string;
  user?: string;
  discount?: string;
  onSuccess?: (response: IMessage) => void;
}

export const Web3Transfer = ({
  price,
  text,
  loadingText,
  entityType,
  id,
  user,
  discount,
  onSuccess,
}: Web3TransferProps) => {
  const { currencyType, rates, transactionStatus, setTransactionStatus } =
    useWeb3();

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

  const {
    isTransactionPending,
    namespaceDetail,
    connectWallet,
    isLoading,
    transfer,
  } = useWeb3Transfer({
    entityType,
    price: currencyPrice,
    id,
    user,
    discount,
  });

  useEffect(() => {
    if (transactionStatus?.success) {
      onSuccess?.(transactionStatus);
      setTransactionStatus(null);
    }
  }, [transactionStatus, onSuccess, setTransactionStatus]);

  const address = useMemo(() => {
    if (!namespaceDetail?.connected) {
      return "CONNECT";
    }
    if (!namespaceDetail?.address) {
      return "";
    }
    return (
      namespaceDetail.address.slice(0, 3) +
      "..." +
      namespaceDetail.address.slice(-3)
    );
  }, [namespaceDetail]);
  if (isLoading || isTransactionPending) {
    return <PixelButton text={loadingText || "LOADING"} active></PixelButton>;
  }

  if (!namespaceDetail?.connected) {
    return (
      <PixelButton text="Connect Wallet" onClick={connectWallet}></PixelButton>
    );
  }

  return (
    <div className="flex justify-center items-center">
      <div className="glow-box">
        <PixelButton
          isWidthFull
          text={text || "Buy Now"}
          onClick={() => transfer()}
        ></PixelButton>
      </div>
      {address && (
        <PixelButton
          text={address}
          isSmall
          onClick={() => connectWallet()}
        ></PixelButton>
      )}
    </div>
  );
};
