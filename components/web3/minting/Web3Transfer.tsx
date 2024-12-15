"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { useWeb3Transfer } from "./useWeb3Transfer";

interface Web3TransferProps {
  price: number;
  amount: number;
  text?: string;
  loadingText?: string;
  entityType?: EntityType;
  cat?: string;
  blessing?: string;
  user?: string;
}

export const Web3Transfer = ({
  price,
  amount,
  text,
  loadingText,
  entityType,
  cat,
  blessing,
  user,
}: Web3TransferProps) => {
  const {
    isTransactionPending,
    walletConnected,
    connectWallet,
    currencyType,
    isLoading,
    transfer,
  } = useWeb3Transfer({
    entityType: entityType || EntityType.PRESALE,
    price,
    amount,
    cat,
    blessing,
    user,
  });
  if (isLoading || isTransactionPending) {
    return <PixelButton text={loadingText || "LOADING"} active></PixelButton>;
  }

  if (!walletConnected) {
    return (
      <PixelButton text="Connect Wallet" onClick={connectWallet}></PixelButton>
    );
  }

  if (isNaN(price) || price <= 0) {
    return <PixelButton text="Enter amount" isDisabled />;
  }

  if (price < 1 && currencyType !== CurrencyType.BNB) {
    return <PixelButton text="1$ is minimum amount" isDisabled />;
  }

  if (price < 0.001 && currencyType === CurrencyType.BNB) {
    return <PixelButton text="0.001 BNB is minimum amount" isDisabled />;
  }
  return (
    <PixelButton
      isWidthFull
      isBig
      isDisabled={isNaN(price) || amount <= 0}
      text={text || "Buy Now"}
      onClick={() => transfer()}
    ></PixelButton>
  );
};
