"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { EntityType } from "@/models/save";
import { useMemo } from "react";
import { useWeb3Minting } from "./useWeb3Minting";

interface Web3TransferProps {
  user?: string;
}

export const Web3Mint = ({ user }: Web3TransferProps) => {
  const { namespaceDetail, connectWallet, mint, isLoading } = useWeb3Minting({
    entityType: EntityType.MYSTERY_BOX,
    user,
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
  if (isLoading) {
    return <PixelButton text={"MINTING"} active></PixelButton>;
  }

  if (!namespaceDetail?.connected) {
    return (
      <PixelButton text="Connect Wallet" onClick={connectWallet}></PixelButton>
    );
  }

  return (
    <div className="flex justify-center items-center">
      <PixelButton
        isWidthFull
        isBig
        text={"Mint Now"}
        onClick={() => mint()}
      ></PixelButton>
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
