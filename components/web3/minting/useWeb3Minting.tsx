import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { EntityType } from "@/models/save";
import { abiERC721 } from "@/web3/abi-erc721";
import { ChainNamespace, ChainType, CurrencyType } from "@/web3/contracts";
import { chainTypeId } from "@/web3/web3-chains";
import { wagmiConfig } from "@/web3/web3-config";
import { IMysteryBox } from "@/web3/web3.model";
import { useAppKit } from "@reown/appkit/react";
import { useEffect, useMemo, useState } from "react";
import {
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

interface IProps {
  entityType: EntityType;
  user?: string;
  mysteryBox: IMysteryBox;
}

export const useWeb3Minting = ({ entityType, user, mysteryBox }: IProps) => {
  const {
    evmConnected,
    evmAddress,
    namespace,
    setNamespace,
    namespaceDetail,
    chainId,
  } = useWeb3();
  const { switchChainAsync } = useSwitchChain({
    config: wagmiConfig,
  });
  const { open } = useAppKit();
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

  async function syncChain() {
    try {
      if (chainId !== chainTypeId[mysteryBox.chain]) {
        await switchChainAsync({ chainId: chainTypeId[mysteryBox.chain] });
      }
    } catch (error) {
      console.error("Error switching chain:", error);
      toast({ message: "Failed to switch chain. Please try again." });
    }
  }

  async function mint() {
    if (namespace === ChainNamespace.EVM) {
      evmMint();
    }
  }

  async function evmMint() {
    if (!evmConnected) {
      toast({ message: "Please login to Metamask" });
      return false;
    }
    await syncChain();
    try {
      const txHash = await writeContractAsync({
        abi: abiERC721,
        address: mysteryBox.address as any,
        functionName: "safeMint",
        args: [evmAddress!],
      });
      setHash(txHash);
    } catch (error) {
      console.error("Error minting:", error);
      toast({ message: "Get gas and try again." });
    }
  }

  useEffect(() => {
    if (taxData?.status === "success") {
      refetchUserNFTsCount();
      toast({ message: "Mystery box is minted successfully" });
    }
  }, [taxData]);

  const connectWallet = () => {
    if (namespace === ChainNamespace.EVM) {
      open();
    }
  };

  const { data: userNFTsCount, refetch: refetchUserNFTsCount } =
    useReadContract({
      abi: abiERC721,
      address: mysteryBox.address as any,
      functionName: "balanceOf",
      args: evmAddress ? [evmAddress] : undefined,
    });

  return {
    isLoading,
    namespaceDetail,
    connectWallet,
    mint,
    userNFTsCount,
  };
};
