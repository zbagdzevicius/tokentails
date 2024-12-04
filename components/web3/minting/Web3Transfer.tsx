"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { confirmTransaction } from "@/constants/api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { isProd } from "@/models/app";
import {
  ChainType,
  ChainTypeCurrencies,
  CurrencyType,
  recipient,
} from "@/web3/contracts";
import { bnbTestnetChain, chainTypeId, config } from "@/web3/web3";
import { ethers } from "ethers";
import { useEffect, useState } from "react";
import { erc20Abi } from "viem";
import {
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useTokenPrice } from "../useTokenPrice";
import { EntityType } from "@/models/save";

const paymentsChain = isProd ? ChainType.BNB : ChainType.BNB_TEST;

interface Web3TransferProps {
  price: number;
}

export const Web3Transfer = ({ price }: Web3TransferProps) => {
  const { isConnected, chainId, currencyType, setCurrencyType, balance } =
    useWeb3();
  const { switchChainAsync } = useSwitchChain({ config });
  const bnbPrice = useTokenPrice({ price, currencyType: CurrencyType.BNB });
  const { sendTransactionAsync, isPending: isTransactionPending } =
    useSendTransaction();
  const toast = useToast();
  const [hash, setHash] = useState<undefined | `0x${string}`>();
  const {
    data: writeContractHash,
    writeContractAsync,
    isPending,
  } = useWriteContract();
  const [state, setState] = useState<null | "success">(null);

  useEffect(() => {
    if (writeContractHash) {
      setHash(writeContractHash);
    }
  }, [setHash, writeContractHash]);

  async function syncChain() {
    if (chainId !== chainTypeId[paymentsChain]) {
      await switchChainAsync({ chainId: chainTypeId[paymentsChain] });
    }
  }

  async function transfer() {
    const amountHex = ethers.parseUnits(price.toString(), 18);
    await syncChain();
    if (currencyType !== CurrencyType.BNB) {
      console.log(balance)
      if (!balance || amountHex > balance.value) {
        toast({
          message: `Top up your ${currencyType} balance or switch currency`,
        });
        return;
      }
      await writeContractAsync({
        abi: erc20Abi,
        address: bnbTestnetChain.contracts[currencyType].address!,
        functionName: "transfer",
        args: [recipient, amountHex],
      }).catch((e) => undefined);
    } else {
      const amountHex = ethers.parseUnits(
        bnbPrice?.toFixed(16)?.toString()!,
        18
      );
      if (!balance || amountHex > balance.value) {
        toast({
          message: `Top up your ${currencyType} balance or switch currency`,
        });
        return;
      }
      setHash(
        await sendTransactionAsync({
          to: recipient,
          value: amountHex,
        }).catch((e) => undefined)
      );
    }
  }
  //TODO DELETE IN THE FUTURE
  const entityType = EntityType.CAT

  const {
    isLoading: isTaxLoading,
    isSuccess: isTaxConfirmed,
    data: taxData,
  } = useWaitForTransactionReceipt({
    hash,
  });
  useEffect(() => {
    if (isTaxConfirmed) {
      confirmTransaction({
        hash: hash!,
        chainType: paymentsChain,
        currencyType,
        price,
        entityType
      }).then(() => {
        setState("success");
      });
    }
  }, [isTaxConfirmed]);

  useEffect(() => {
    if (taxData?.status === "success") {
      setState("success");
    }
  }, [taxData]);

  if (isProd) {
    return <PixelButton text="COMING SOON"></PixelButton>;
  }

  if (isPending || isTaxLoading || isTransactionPending) {
    return <PixelButton text="PROCESSING" active></PixelButton>;
  }

  useEffect(() => {
    if (state === "success") {
      toast({
        message: "Transaction successful!",
      });

    }
  }, [state]);
  return (
    <div className="flex flex-col items-center">
      <PixelButton
        isWidthFull
        isBig
        isDisabled={isNaN(price) || price <= 0}
        text="Buy"
        subtext={`With ${currencyType}`}
        onClick={() => transfer()}
      ></PixelButton>
    </div>
  );
};
