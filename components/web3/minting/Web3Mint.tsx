"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { EntityType } from "@/models/save";
import { useMemo } from "react";
import { useWeb3Minting } from "./useWeb3Minting";
import { ChainType } from "@/web3/contracts";
import { mysteryBoxes } from "@/web3/web3.model";

interface Web3TransferProps {
  user?: string;
  ownedNFTCallback?: () => void;
}

export const Web3Mint = ({ user, ownedNFTCallback }: Web3TransferProps) => {
  const { namespaceDetail, connectWallet, mint, isLoading, userNFTsCount } =
    useWeb3Minting({
      entityType: EntityType.MYSTERY_BOX,
      user,
      mysteryBox: mysteryBoxes[ChainType.CAMP_TEST]!,
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

  return (
    <div className="flex flex-col justify-center items-center">
      {namespaceDetail?.connected ? (
        <>
          <PixelButton
            isWidthFull
            isBig
            text={
              ownedNFTCallback && (userNFTsCount as bigint) > 0
                ? "Redeem Now"
                : "Mint Now"
            }
            onClick={() =>
              ownedNFTCallback && (userNFTsCount as bigint) > 0
                ? ownedNFTCallback()
                : mint()
            }
          ></PixelButton>
          {address && (
            <PixelButton
              text={address}
              isSmall
              onClick={() => connectWallet()}
            ></PixelButton>
          )}
        </>
      ) : (
        <PixelButton
          text="Connect Wallet"
          onClick={connectWallet}
        ></PixelButton>
      )}
    </div>
  );
};
