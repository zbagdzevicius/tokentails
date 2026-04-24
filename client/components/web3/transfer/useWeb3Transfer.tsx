import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { EntityType } from "@/models/save";
import {
  ChainType,
  currencyContracts,
  CurrencyType,
  recipientStellar,
} from "@/web3/contracts";
import {
  horizonServer,
  StellarWalletsKit,
  stellarNetworkPassphrase,
} from "@/web3/web3-config";
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { useMemo, useState } from "react";

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
    stellarAddress,
    stellarConnected,
    chainType,
    chainStatusDetail,
    setStellarAddress,
    setStellarConnected,
    query,
    currencyType,
    setTransactionStatus,
  } = useWeb3();
  const toast = useToast();
  const [isStellarPending, setIsStellarPending] = useState(false);

  const confirm = async (hash: string) => {
    const status = await ORDER_API.confirm({
      hash,
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

  const isLoading = useMemo(() => isStellarPending, [isStellarPending]);

  async function stellarTransfer(address: string) {
    try {
      setIsStellarPending(true);
      const account = await horizonServer.loadAccount(address);

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: stellarNetworkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: recipientStellar,
            asset:
              currencyType === CurrencyType.XLM
                ? Asset.native()
                : new Asset(
                    currencyType,
                    currencyContracts[ChainType.STELLAR][currencyType],
                  ),
            amount: String(price),
          }),
        )
        .setTimeout(300)
        .build();

      const xdr = transaction.toXDR();

      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: stellarNetworkPassphrase,
      });

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        stellarNetworkPassphrase,
      );

      const result = await horizonServer.submitTransaction(signedTransaction);

      confirm(result?.hash)
        .then(() => {})
        .catch((error) => {
          console.error("Confirmation failed:", error);
        });
      setIsStellarPending(false);
    } catch (error) {
      console.error("Stellar transfer failed:", error);
      toast({
        message: "Transaction failed. Please try again.",
        isError: true,
      });
      setIsStellarPending(false);
    }
  }

  async function connectStellarWallet(forceTransfer?: boolean) {
    try {
      const { address } = await StellarWalletsKit.authModal();
      setStellarAddress(address);
      setStellarConnected(true);
      if (forceTransfer) {
        stellarTransfer(address);
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);
    }
  }

  async function transfer() {
    if (!stellarConnected) {
      connectStellarWallet(true);
    } else {
      stellarTransfer(stellarAddress!);
    }
  }

  const connectWallet = () => {
    connectStellarWallet();
  };

  return {
    isTransactionPending: false,
    isLoading,
    chainStatusDetail,
    connectWallet,
    currencyType,
    transfer,
  };
};
