"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { confirmTransaction } from "@/constants/api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { isProd } from "@/models/app";
import { EntityType } from "@/models/save";
import {
  ChainNamespace,
  ChainType,
  currencyContracts,
  CurrencyType,
  recipientEvm,
  recipientStellar,
} from "@/web3/contracts";
import {
  chainTypeId,
  horizonServer,
  idChainType,
  stellarKit,
  stellarNetworkPassphrase,
  wagmiAdapter,
} from "@/web3/web3-config";
import { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import { useAppKit } from "@reown/appkit/react";
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { ethers } from "ethers";
import { useEffect, useState } from "react";
import { erc20Abi } from "viem";
import {
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

const paymentsChain = isProd ? ChainType.BNB : ChainType.BNB_TEST;

interface Web3TransferProps {
  price: number;
}

export const Web3Transfer = ({ price }: Web3TransferProps) => {
  const {
    evmConnected,
    stellarAddress,
    evmAddress,
    stellarConnected,
    namespace,
    setStellarAddress,
    setStellarConnected,
    chainId,
    query,
    currencyType,
    balance,
    setIsTransactionSucces,
    amountOfTails,
  } = useWeb3();
  const { switchChainAsync } = useSwitchChain({
    config: wagmiAdapter.wagmiConfig,
  });
  const { open } = useAppKit();
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

  async function syncChain() {
    try {
      if (chainId !== chainTypeId[paymentsChain]) {
        await switchChainAsync({ chainId: chainTypeId[paymentsChain] });
      }
    } catch (error) {
      console.error("Error switching chain:", error);
      toast({ message: "Failed to switch chain. Please try again." });
    }
  }

  async function stellarTransfer(stellarAddress: string) {
    try {
      const account = await horizonServer.loadAccount(stellarAddress!);

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: stellarNetworkPassphrase, // Use Networks.TESTNET for testing
      })
        .addOperation(
          Operation.payment({
            destination: recipientStellar,
            asset:
              currencyType === CurrencyType.USDC
                ? new Asset(
                    "USDC",
                    "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
                  )
                : Asset.native(),
            amount: String(price),
          })
        )
        .setTimeout(300)
        .build();
  
      const xdr = transaction.toXDR(); // Convert to XDR for signing
  
      const { signedTxXdr } = await stellarKit.signTransaction(xdr, {
        address: stellarAddress,
        networkPassphrase: stellarNetworkPassphrase,
      });
  
      // Convert signed XDR back to a transaction object
      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        stellarNetworkPassphrase
      );
  
      // Submit the transaction to the Stellar Horizon server
      const result = await horizonServer.submitTransaction(signedTransaction);
      setIsTransactionSucces(true);
  
      confirmTransaction({
        hash: result?.hash,
        chainType: paymentsChain,
        namespace: namespace!,
        amount: amountOfTails!,
        walletAddress:
          namespace === ChainNamespace.BNB ? evmAddress! : stellarAddress!,
        currencyType,
        price,
        ref: query?.ref,
        entityType,
      })
        .then(() => {})
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });
    } catch {
      
    }
  }

  async function connectStellarWallet(forceTransfer?: boolean) {
    stellarKit.openModal({
      onWalletSelected: async (option: ISupportedWallet) => {
        stellarKit.setWallet(option.id);
        const { address } = await stellarKit.getAddress();
        setStellarAddress(address);
        setStellarConnected(true);
        if (forceTransfer) {
          stellarTransfer(address);
        }
      },
    });
  }

  async function transfer() {
    if (namespace === ChainNamespace.BNB) {
      evmTransfer();
    } else if (namespace === ChainNamespace.STELLAR) {
      if (!stellarConnected) {
        connectStellarWallet(true);
      } else {
        stellarTransfer(stellarAddress!);
      }
    }
  }

  async function evmTransfer() {
    if (!evmConnected) {
      toast({ message: "Please login to Metamask" });
      return false;
    }
    const amountHex = ethers.parseUnits(price.toString(), 18);
    try {
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
          address: currencyContracts[idChainType[chainId!]][currencyType]!,
          functionName: "transfer",
          args: [recipientEvm, amountHex],
        });
      } else {
        const bnbAmountHex = ethers.parseUnits(
          price?.toFixed(16)?.toString()!,
          18
        );

        if (!balance || bnbAmountHex > balance.value) {
          toast({
            message: `Top up your ${currencyType} balance or switch currency`,
          });
          return;
        }
        const txHash = await sendTransactionAsync({
          to: recipientEvm,
          value: bnbAmountHex,
        });
        setHash(txHash);
        toast({ message: "Transaction sent! Awaiting confirmation..." });
      }
    } catch (error) {
      console.error("Transfer failed:", error);
      toast({ message: "Transaction failed. Please try again." });
    }
  }

  const entityType = EntityType.PRESALE;

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
        namespace: namespace!,
        amount: amountOfTails!,
        walletAddress:
          namespace === ChainNamespace.BNB ? evmAddress! : stellarAddress!,
        currencyType,
        price,
        ref: query?.ref,
        entityType,
      })
        .then(() => {
          setIsTransactionSucces(true);
        })
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });
    }
  }, [isTaxConfirmed]);

  useEffect(() => {
    if (taxData?.status === "success") {
      setIsTransactionSucces(true);
    }
  }, [taxData]);

  if (isPending || isTaxLoading || isTransactionPending) {
    return <PixelButton text="PROCESSING" active></PixelButton>;
  }

  if (!evmConnected && namespace === ChainNamespace.BNB) {
    return (
      <>
        <PixelButton text="Connect Wallet" onClick={open}></PixelButton>
      </>
    );
  }

  if (!stellarConnected && namespace === ChainNamespace.STELLAR) {
    return (
      <>
        <PixelButton
          text="Connect Wallet"
          onClick={connectStellarWallet}
        ></PixelButton>
      </>
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
    <div className="flex flex-col items-center">
      <PixelButton
        isWidthFull
        isBig
        isDisabled={isNaN(price) || amountOfTails! <= 0}
        text="Buy"
        subtext={`With ${currencyType}`}
        onClick={() => transfer()}
      ></PixelButton>
    </div>
  );
};
