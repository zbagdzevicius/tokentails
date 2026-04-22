import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { openAppKitModal } from "@/context/web3";
import { EntityType } from "@/models/save";
import {
  ChainType,
  currencyContracts,
  CurrencyType,
  EVM_CHAINS,
  recipientEvm,
  recipientStellar,
} from "@/web3/contracts";
import { chainTypeId } from "@/web3/web3-chains";
import {
  horizonServer,
  stellarKit,
  stellarNetworkPassphrase,
  wagmiConfig,
} from "@/web3/web3-config";
import { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { ethers } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi } from "@/node_modules/viem";
import {
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
interface IProps {
  entityType: EntityType;
  price: number;
  id?: string;
  user?: string;
  discount?: string;
}

export const useWeb3Transfer = ({
  entityType,
  price,
  id,
  user,
  discount,
}: IProps) => {
  const {
    evmConnected,
    stellarAddress,
    stellarConnected,
    chainType,
    chainStatusDetail,
    setStellarAddress,
    setStellarConnected,
    chainId,
    query,
    currencyType,
    setTransactionStatus,
  } = useWeb3();
  const { switchChainAsync } = useSwitchChain({
    config: wagmiConfig as any,
  });
  const { sendTransactionAsync, isPending: isTransactionPending } =
    useSendTransaction();
  const toast = useToast();
  const [hash, setHash] = useState<undefined | `0x${string}`>();
  const {
    data: writeContractHash,
    writeContractAsync,
    isPending,
  } = useWriteContract();
  const [isStellarPending, setIsStellarPending] = useState(false);

  const {
    isLoading: isTaxLoading,
    isSuccess: isTaxConfirmed,
    data: taxData,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const confirm = async (hash: string) => {
    const status = await ORDER_API.confirm({
      hash: hash,
      chainType,
      walletAddress: chainStatusDetail.address!,
      currencyType,
      price,
      ref: query?.ref,
      entityType,
      id,
      user,
      discount,
    });
    setTransactionStatus(status);
  };

  const isLoading = useMemo(
    () => isPending || isStellarPending || isTaxLoading,
    [isStellarPending, isPending, isTaxLoading],
  );

  useEffect(() => {
    if (writeContractHash) {
      setHash(writeContractHash);
    }
  }, [setHash, writeContractHash]);

  async function syncChain() {
    try {
      if (chainId !== chainTypeId[chainType]) {
        await switchChainAsync({ chainId: chainTypeId[chainType] });
      }
    } catch (error) {
      console.error("Error switching chain:", error);
      toast({ message: "Failed to switch chain. Please try again." });
    }
  }

  async function stellarTransfer(stellarAddress: string) {
    try {
      setIsStellarPending(true);
      const account = await horizonServer.loadAccount(stellarAddress!);

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: stellarNetworkPassphrase, // Use Networks.TESTNET for testing
      })
        .addOperation(
          Operation.payment({
            destination: recipientStellar,
            asset:
              currencyType === CurrencyType.XLM
                ? Asset.native()
                : new Asset(
                    currencyType,
                    currencyContracts.STELLAR[currencyType],
                  ),
            amount: String(price),
          }),
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
        stellarNetworkPassphrase,
      );

      // Submit the transaction to the Stellar Horizon server
      const result = await horizonServer.submitTransaction(signedTransaction);

      confirm(result?.hash)
        .then(() => {})
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });
      setIsStellarPending(false);
    } catch {
      setIsStellarPending(false);
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
    if (EVM_CHAINS.includes(chainType)) {
      evmTransfer();
    } else if (chainType === ChainType.STELLAR) {
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

      if (
        ![
          CurrencyType.BNB,
          CurrencyType.SEI,
          CurrencyType.ETH,
          CurrencyType.MNT,
        ].includes(currencyType)
      ) {
        await writeContractAsync({
          abi: erc20Abi,
          address: currencyContracts[chainType][currencyType]!,
          functionName: "transfer",
          args: [recipientEvm, amountHex],
        });
      } else {
        const bnbAmountHex = ethers.parseUnits(
          price?.toFixed(16)?.toString()!,
          18,
        );

        const txHash = await sendTransactionAsync({
          to: recipientEvm,
          value: bnbAmountHex,
        });
        setHash(txHash);
        toast({ message: "Transaction sent! Awaiting confirmation..." });
      }
    } catch (error) {
      console.error("Transfer failed:", error);
      toast({
        message: "Transaction failed. Please try again.",
        isError: true,
      });
    }
  }

  useEffect(() => {
    if (isTaxConfirmed) {
      confirm(hash!).catch((error) => {
        console.error("Confirmation failed:", error);
      });
    }
  }, [isTaxConfirmed]);

  const connectWallet = () => {
    if (EVM_CHAINS.includes(chainType)) {
      void openAppKitModal();
    } else if (chainType === ChainType.STELLAR) {
      connectStellarWallet();
    }
  };

  return {
    isTransactionPending,
    isLoading,
    chainStatusDetail,
    connectWallet,
    currencyType,
    transfer,
  };
};
