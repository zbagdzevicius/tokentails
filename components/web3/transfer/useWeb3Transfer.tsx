import { ORDER_API } from "@/api/order-api";
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
  recipientSolana,
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
  useConnection,
  useWallet as useSolanaWallet,
} from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { ethers } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi } from "viem";
import {
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { IGeneratedCat } from "./Web3Transfer";
import { BuyMode } from "@/components/CatCardModal";
interface IProps {
  entityType: EntityType;
  price: number;
  amount: number;
  cat?: string;
  blessing?: string;
  user?: string;
  generatedCat?: IGeneratedCat;
  buyMode?: BuyMode;
}

export const useWeb3Transfer = ({
  entityType,
  price,
  amount,
  buyMode,
  cat,
  blessing,
  user,
  generatedCat,
}: IProps) => {
  const {
    evmConnected,
    stellarAddress,
    evmAddress,
    solanaConnected,
    stellarConnected,
    namespace,
    namespaceDetail,
    setStellarAddress,
    chainType,
    setStellarConnected,
    solanaAddress,
    chainId,
    query,
    currencyType,
    balance,
    setTransactionStatus,
  } = useWeb3();
  const { setVisible: connectSolana } = useWalletModal();
  const {
    signTransaction: signSolanaTransaction,
    sendTransaction: sendSolanaTransaction,
  } = useSolanaWallet();
  const { connection: solanaConnection } = useConnection();
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
  const [isStellarPending, setIsStellarPending] = useState(false);
  const [isSolanaPending, setIsSolanaPending] = useState(false);

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
      namespace: namespace!,
      amount,
      walletAddress: namespaceDetail.address!,
      currencyType,
      price,
      buyMode,
      ref: query?.ref,
      entityType,
      cat,
      blessing,
      user,
      generatedCat,
    });
    setTransactionStatus(status);
  };

  const isLoading = useMemo(
    () => isPending || isStellarPending || isTaxLoading || isSolanaPending,
    [isStellarPending, isPending, isTaxLoading, isSolanaPending]
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
    if (namespace === ChainNamespace.EVM) {
      evmTransfer();
    } else if (namespace === ChainNamespace.STELLAR) {
      if (!stellarConnected) {
        connectStellarWallet(true);
      } else {
        stellarTransfer(stellarAddress!);
      }
    } else if (namespace === ChainNamespace.TORUS) {
      torusTransfer();
    } else if (namespace === ChainNamespace.SOLANA) {
      if (!solanaConnected) {
        connectSolana(true);
      } else {
        solanaTransfer();
      }
    }
  }

  const solanaTransfer = async () => {
    if (!solanaConnected) {
      toast({ message: "Please login to Wallet" });
      console.error("Wallet not connected!");
      return;
    }
    setIsSolanaPending(true);
    try {
      const lamportsToSend = price * 1e9;

      // Create a transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: solanaAddress!, // Sender's public key
          toPubkey: new PublicKey(recipientSolana), // Recipient's public key
          lamports: lamportsToSend, // Amount to send in lamports
        })
      );

      // Send the transaction
      const signature = await sendSolanaTransaction(
        transaction,
        solanaConnection
      );
      const latestBlockHash = await solanaConnection.getLatestBlockhash();

      confirm(signature)
        .then(() => {})
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });

      // Confirm the transaction
      const confirmation = await solanaConnection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        },
        "confirmed"
      );
    } catch (error) {
      console.error("Error sending SOL:", error);
    }
    setIsSolanaPending(false);
  };

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

  async function torusTransfer() {
    if (!evmConnected) {
      toast({ message: "Please login to Metamask" });
      return false;
    }
    const amountHex = ethers.parseUnits(price.toString(), 18);
    try {
      await syncChain();

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
    } catch (error) {
      console.error("Transfer failed:", error);
      toast({ message: "Transaction failed. Please try again." });
    }
  }

  useEffect(() => {
    if (isTaxConfirmed) {
      confirm(hash!)
        .then(() => {
          confirm(hash!);
        })
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });
    }
  }, [isTaxConfirmed]);

  const connectWallet = () => {
    if (namespace === ChainNamespace.EVM) {
      open();
    } else if (namespace === ChainNamespace.STELLAR) {
      connectStellarWallet();
    } else if (namespace === ChainNamespace.SOLANA) {
      connectSolana(true);
    }
  };

  return {
    isTransactionPending,
    isLoading,
    namespaceDetail,
    connectWallet,
    currencyType,
    transfer,
  };
};
