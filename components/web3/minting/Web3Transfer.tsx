"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { confirmTransaction } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { isProd } from "@/models/app";
import { EntityType } from "@/models/save";
import {
  ChainType,
  ChainTypeCurrencies,
  CurrencyType,
  recipient,
} from "@/web3/contracts";
import { bnbTestnetChain, chainTypeId, config } from "@/web3/web3";
import { ITransfer } from "@/web3/web3.model";
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

const nftTypeCtaText: Partial<Record<EntityType, string>> = {
  [EntityType.CAT]: "Adopt",
};

const paymentsChain = isProd ? ChainType.BNB : ChainType.BNB_TEST;

export const Web3Transfer = ({ price, entityType, _id }: ITransfer) => {
  const { profile, setProfileUpdate } = useProfile();
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
  useEffect(() => {
    if (writeContractHash) {
      setHash(writeContractHash);
    }
  }, [setHash, writeContractHash]);
  const [state, setState] = useState<null | "success">(null);

  async function syncChain() {
    if (chainId !== chainTypeId[paymentsChain]) {
      await switchChainAsync({ chainId: chainTypeId[paymentsChain] });
    }
  }

  async function transfer() {
    const amountHex = ethers.parseUnits(price?.toString(), 18);
    await syncChain();
    if (currencyType !== CurrencyType.BNB) {
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
        cat: _id,
        entityType,
        hash: hash!,
        chainType: paymentsChain,
        currencyType,
        price,
      }).then(() => {
        // TODO - add cat to user profile as main
      });
    }
  }, [isTaxConfirmed]);

  useEffect(() => {
    if (taxData?.status === "success") {
      setState("success");
    }
  }, [taxData, setState]);

  if (isProd) {
    return <PixelButton text="COMING SOON"></PixelButton>;
  }

  if (!isConnected) {
    return <w3m-button />;
  }
  if (profile?.cats?.find((cat) => cat?._id === _id)) {
    return (
      <PixelButton text={entityType} subtext="Adopted" active></PixelButton>
    );
  }

  if (isPending || isTaxLoading || isTransactionPending || isTaxConfirmed) {
    return <PixelButton text="ADOPTING" active></PixelButton>;
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-between gap-2 mb-2">
        {ChainTypeCurrencies[ChainType.BNB].map((currency) => (
          <button key={currency} onClick={() => setCurrencyType(currency)}>
            <img
              className={`transition ${
                currencyType === currency
                  ? "w-12"
                  : "w-12 px-1 grayscale hover:grayscale-0 hover:px-0"
              }`}
              src={`/currency/${currency}.webp`}
            />
          </button>
        ))}
      </div>
      <PixelButton
        text={nftTypeCtaText[entityType]!}
        subtext={`for $${price} ${
          [CurrencyType.USDC, CurrencyType.USDT].includes(currencyType)
            ? currencyType
            : `in ${currencyType}`
        }`}
        onClick={() => transfer()}
      ></PixelButton>
    </div>
  );
};
