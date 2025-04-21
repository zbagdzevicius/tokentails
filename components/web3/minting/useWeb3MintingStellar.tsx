import { sleep } from "@/constants/utils";
import { useWeb3 } from "@/context/Web3Context";
import { EntityType } from "@/models/save";
import { ChainNamespace, ChainType } from "@/web3/contracts";
import {
  horizonServer,
  stellarKit,
  stellarNetworkPassphrase,
} from "@/web3/web3-config";
import { chainTypeRpcUrl, IMysteryBox } from "@/web3/web3.model";
import { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import * as StellarSdk from "@stellar/stellar-sdk";
import { useEffect, useMemo, useState } from "react";

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
  const [isStellarPending, setIsStellarPending] = useState(false);
  useEffect(() => {
    if (
      ![ChainType.STELLAR, ChainType.STELLAR_TEST].includes(mysteryBox.chain)
    ) {
      setNamespace(ChainNamespace.EVM);
    }
  }, [mysteryBox]);
  const isLoading = useMemo(() => isStellarPending, [isStellarPending]);

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

  const confirm = async (hash: string, tries = 10) => {
    let getResponse = await sorobanServer.getTransaction(hash);
    while (getResponse.status === "NOT_FOUND") {
      if (tries === 0) {
        throw new Error("Transaction not found, check mint");
      }
      getResponse = await sorobanServer.getTransaction(hash);
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
        await sleep(3000);
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
