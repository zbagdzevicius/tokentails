// copy-lint: web-only every caller renders it in a web branch (WebPayment, ImmortalizePetFlow and MysteryBoxCat under !isApp)
"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { EntityType } from "@/models/save";
import { useEffect, useMemo, useRef } from "react";
import { useWeb3Transfer } from "./useWeb3Transfer";
import { IMessage } from "@/models/cats";
import { useWeb3 } from "@/context/Web3Context";
import { CurrencyType } from "@/web3/contracts";
import { isApp } from "@/models/app";
import { AppCheckoutNotice } from "../AppCheckoutNotice";
import { useAccountAction } from "@/hooks/useAccountAction";
import { useToast } from "@/context/ToastContext";

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
  /** True while a transfer is being signed or confirmed (the host locks its close). */
  onProcessingChange?: (processing: boolean) => void;
}

// App builds show a notice instead: digital goods must use store IAP there.
export const Web3Transfer = (props: Web3TransferProps) =>
  isApp ? <AppCheckoutNotice /> : <WebWeb3Transfer {...props} />;

const WebWeb3Transfer = ({
  price,
  text,
  loadingText,
  entityType,
  id,
  user,
  discount,
  onSuccess,
  onProcessingChange,
}: Web3TransferProps) => {
  const { currencyType, rates, transactionStatus, setTransactionStatus } =
    useWeb3();
  // A crypto purchase needs an account too (decision #9): a guest gets the AuthSheet first.
  // Connecting and signing open wallet popups, which browsers allow only straight from a tap
  // (plan G9), so after the sheet the guest taps again instead of the action running on its own.
  const { runWithAccount, isRegistered, hasAuth } = useAccountAction();
  const toast = useToast();
  const runFromTap = (action: () => unknown) => {
    if (isRegistered || !hasAuth) {
      void action();
      return;
    }
    void runWithAccount("purchase", () =>
      toast({ message: "You're signed in. Tap again to continue with your wallet." })
    );
  };

  const currencyPrice = useMemo(() => {
    if (currencyType === CurrencyType.XLM && rates) {
      return Math.ceil(price / rates[CurrencyType.XLM]);
    }
    return price;
  }, [currencyType, rates, price]);

  const {
    isTransactionPending,
    chainStatusDetail,
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

  const processingChange = useRef(onProcessingChange);
  useEffect(() => {
    processingChange.current = onProcessingChange;
  });
  useEffect(() => {
    processingChange.current?.(!!isTransactionPending);
  }, [isTransactionPending]);
  useEffect(() => () => processingChange.current?.(false), []);

  useEffect(() => {
    if (transactionStatus?.success) {
      onSuccess?.(transactionStatus);
      setTransactionStatus(null);
    }
  }, [transactionStatus, onSuccess, setTransactionStatus]);

  const address = useMemo(() => {
    if (!chainStatusDetail?.connected) {
      return "CONNECT";
    }
    if (!chainStatusDetail?.address) {
      return "";
    }
    return (
      chainStatusDetail.address.slice(0, 3) +
      "..." +
      chainStatusDetail.address.slice(-3)
    );
  }, [chainStatusDetail]);
  if (isLoading || isTransactionPending) {
    return <PixelButton text={loadingText || "LOADING"} active></PixelButton>;
  }

  if (!chainStatusDetail?.connected) {
    return (
      <PixelButton
        text="Connect Wallet"
        onClick={() => runFromTap(connectWallet)}
      ></PixelButton>
    );
  }

  return (
    <div className="flex justify-center items-center">
      <div className="glow-box">
        <PixelButton
          fullWidth
          text={text || "Buy Now"}
          onClick={() => runFromTap(transfer)}
        ></PixelButton>
      </div>
      {address && (
        <PixelButton
          text={address}
          size="sm"
          onClick={() => connectWallet()}
        ></PixelButton>
      )}
    </div>
  );
};
