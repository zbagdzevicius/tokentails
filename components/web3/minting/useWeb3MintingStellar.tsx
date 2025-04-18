import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { EntityType } from "@/models/save";
import { ChainNamespace, ChainType, CurrencyType } from "@/web3/contracts";
import {
  horizonServer,
  stellarKit,
  stellarNetworkPassphrase,
} from "@/web3/web3-config";
import { chainTypeRpcUrl, IMysteryBox } from "@/web3/web3.model";
import { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import * as StellarSdk from "@stellar/stellar-sdk";
import { useEffect, useMemo, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

interface IProps {
  entityType: EntityType;
  user?: string;
  mysteryBox: IMysteryBox;
}

const sorobanServer = new StellarSdk.rpc.Server(
  chainTypeRpcUrl[ChainType.STELLAR]
);

export const useWeb3MintingStellar = ({
  entityType,
  user,
  mysteryBox,
}: IProps) => {
  const {
    namespace,
    setNamespace,
    namespaceDetail,
    stellarConnected,
    setStellarAddress,
    setStellarConnected,
    stellarAddress,
  } = useWeb3();
  const [userNFTsCount, setUserNFTsCount] = useState(0);
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
  useEffect(() => {
    if (
      ![ChainType.STELLAR, ChainType.STELLAR_TEST].includes(mysteryBox.chain)
    ) {
      setNamespace(ChainNamespace.EVM);
    }
  }, [mysteryBox]);

  const isLoading = useMemo(
    () => isPending || isStellarPending || isTaxLoading,
    [isStellarPending, isPending, isTaxLoading]
  );

  useEffect(() => {
    if (writeContractHash) {
      setHash(writeContractHash);
    }
  }, [setHash, writeContractHash]);

  useEffect(() => {
    if (isTaxConfirmed) {
      ORDER_API.confirm({
        hash: hash!,
        chainType: mysteryBox.chain,
        namespace: namespace!,
        amount: 1,
        walletAddress: namespaceDetail.address!,
        currencyType: CurrencyType.USDT,
        price: 0,
        entityType,
        user,
      })
        .then(() => {})
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });
    }
  }, [isTaxConfirmed]);

  async function connectStellarWallet(forceTransfer?: boolean) {
    setNamespace(ChainNamespace.STELLAR);
    stellarKit.openModal({
      onWalletSelected: async (option: ISupportedWallet) => {
        stellarKit.setWallet(option.id);
        const { address } = await stellarKit.getAddress();
        setStellarAddress(address);
        setStellarConnected(true);
        if (forceTransfer) {
          mint();
        }
      },
    });
  }

  const confirm = async (hash: string, tries = 5) => {
    let getResponse = await sorobanServer.getTransaction(hash);
    while (getResponse.status === "NOT_FOUND") {
      if (tries === 0) {
        throw new Error("Transaction not found, check mint");
      }
      getResponse = await sorobanServer.getTransaction(hash);
      await new Promise((resolve) => setTimeout(resolve, 100));
      tries - 1;
    }

    return getResponse;
  };

  const prepareBlessingMintTransaction = async () => {
    const account = await horizonServer.loadAccount(stellarAddress!);
    const smartContract = new StellarSdk.Contract(mysteryBox.address);
    const builtTransaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: stellarNetworkPassphrase,
    })
      .addOperation(
        smartContract.call(
          "mint",
          StellarSdk.nativeToScVal(
            StellarSdk.Address.fromString(stellarAddress!)
          )
        )
      )
      .setTimeout(30)
      .build();

    const preparedTransaction = await sorobanServer.prepareTransaction(
      builtTransaction
    );
    const { signedTxXdr } = await stellarKit.signTransaction(
      preparedTransaction.toXDR(),
      {
        address: stellarAddress,
        networkPassphrase: stellarNetworkPassphrase,
      }
    );
    const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
      signedTxXdr,
      stellarNetworkPassphrase
    );

    return signedTransaction;
  };

  async function mint() {
    if (!stellarConnected) {
      connectStellarWallet(true);
    } else {
      try {
        setIsStellarPending(true);
        const signedTransaction = await prepareBlessingMintTransaction();
        const result = await sorobanServer.sendTransaction(signedTransaction);
        confirm(result?.hash)
          .then(() => {
            setUserNFTsCount(userNFTsCount + 1);
          })
          .catch((error) => {
            console.error("Confirmation failed:", error);
          });
        setIsStellarPending(false);
      } catch (e) {
        console.error("Mint failed:", e);
        setIsStellarPending(false);
      }
    }
  }

  return {
    isLoading,
    namespaceDetail,
    connectWallet: connectStellarWallet,
    mint,
    userNFTsCount,
  };
};
