"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { EntityType } from "@/models/save";
import { useMemo } from "react";
import { useWeb3Transfer } from "./useWeb3Transfer";

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
}

export const Web3Transfer = ({
  price,
  text,
  loadingText,
  entityType,
  id,
  user,
  discount,
}: Web3TransferProps) => {
  const {
    isTransactionPending,
    namespaceDetail,
    connectWallet,
    isLoading,
    transfer,
  } = useWeb3Transfer({
    entityType,
    price,
    id,
    user,
    discount,
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
