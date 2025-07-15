"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { useWeb3 } from "@/context/Web3Context";
import { EntityType } from "@/models/save";
import { ChainNamespace } from "@/web3/contracts";
import { IMysteryBox } from "@/web3/web3.model";
import { useAppKit } from "@reown/appkit/react";
import { useMemo } from "react";
import { useWeb3Minting } from "./useWeb3Minting";

interface Web3TransferProps {
  user?: string;
  ownedNFTCallback?: () => void;
  mysteryBox: IMysteryBox;
  hideAddress?: boolean;
}

export const ConnectWallet = () => {
  const { setNamespace, namespaceDetail } = useWeb3();
  const { open } = useAppKit();
  const connectWallet = () => {
    setNamespace(ChainNamespace.EVM);
    open();
  };
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
  if (address) {
    return (
      <div className="flex flex-col justify-center items-center font-primary -my-2">
        <div className="flex flex-row items-center gap-2 -mb-2">
          YOUR WALLET
        </div>
        <PixelButton
          text={address}
          isSmall
          onClick={() => connectWallet()}
        ></PixelButton>
      </div>
    );
  }
  return (
    <PixelButton text="Connect Wallet" onClick={connectWallet}></PixelButton>
  );
};

export const Web3Mint = ({
  user,
  ownedNFTCallback,
  mysteryBox,
  hideAddress,
}: Web3TransferProps) => {
  const { namespaceDetail, connectWallet, mint, isLoading, userNFTsCount } =
    useWeb3Minting({
      entityType: EntityType.MYSTERY_BOX,
      user,
      mysteryBox,
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
    return (
      <PixelButton text={"MINTING"} active isSmall={hideAddress}></PixelButton>
    );
  }

  return (
    <div className="flex flex-col justify-center items-center">
      {namespaceDetail?.connected ? (
        <>
          <PixelButton
            isWidthFull
            isBig
            isSmall={hideAddress}
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
          {address && !hideAddress && (
            <PixelButton
              text={address}
              isSmall
              onClick={() => connectWallet()}
            ></PixelButton>
          )}
        </>
      ) : (
        <PixelButton
          isSmall={hideAddress}
          text="Connect Wallet"
          onClick={connectWallet}
        ></PixelButton>
      )}
    </div>
  );
};
