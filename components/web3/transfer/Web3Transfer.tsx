"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { BuyMode } from "@/constants/cat-utils";
import { EntityType } from "@/models/save";
import { useMemo } from "react";
import { useWeb3Transfer } from "./useWeb3Transfer";

export interface IGeneratedCat {
  name: string;
  image: string;
}

interface Web3TransferProps {
  price: number;
  amount: number;
  text?: string;
  loadingText?: string;
  entityType: EntityType;
  buyMode?: BuyMode;
  cat?: string;
  generatedCat?: IGeneratedCat;
  generate?: boolean;
  blessing?: string;
  user?: string;
  disabled?: boolean;
}

export const Web3Transfer = ({
  price,
  amount,
  text,
  loadingText,
  entityType,
  buyMode,
  disabled,
  generatedCat,
  cat,
  blessing,
  user,
}: Web3TransferProps) => {
  const {
    isTransactionPending,
    namespaceDetail,
    connectWallet,
    currencyType,
    isLoading,
    transfer,
  } = useWeb3Transfer({
    entityType,
    price,
    amount,
    buyMode,
    cat,
    blessing,
    user,
    generatedCat,
  });
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
      {!disabled && (
        <PixelButton
          isWidthFull
          isDisabled={isNaN(price) || amount <= 0}
          text={text || "Buy Now"}
          onClick={() => transfer()}
        ></PixelButton>
      )}
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
