import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { openAppKitModal } from "@/context/web3";
import { EntityType } from "@/models/save";
import { abiERC721 } from "@/web3/abi-erc721";
import { ChainType, EVM_CHAINS } from "@/web3/contracts";
import { chainTypeId } from "@/web3/web3-chains";
import { wagmiConfig } from "@/web3/web3-config";
import { IMysteryBox } from "@/web3/web3.model";
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
    chainType,
    setChainType,
    chainStatusDetail,
    chainId,
  } = useWeb3();
  const { switchChainAsync } = useSwitchChain({
    config: wagmiConfig as any,
  });
  const toast = useToast();
  const [hash, setHash] = useState<undefined | `0x${string}`>();
  const {
    data: writeContractHash,
    writeContractAsync,
    isPending,
  } = useWriteContract();
  const { isLoading: isTaxLoading, data: taxData } =
    useWaitForTransactionReceipt({
      hash,
    });
  useEffect(() => {
    if (![ChainType.STELLAR].includes(mysteryBox?.chain)) {
      setChainType(ChainType.SEI);
    }
  }, [mysteryBox]);
  const [isMinted, setIsMinted] = useState(false);
  useEffect(() => {
    setIsMinted(false);
  }, [mysteryBox]);

  const isLoading = useMemo(
    () => isPending || isTaxLoading,
    [isPending, isTaxLoading]
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
    if (EVM_CHAINS.includes(chainType)) {
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
      toast({ message: "COLLECTIBLE is minted successfully" });
      setIsMinted(true);
    }
  }, [taxData]);

  const connectWallet = () => {
    if (EVM_CHAINS.includes(chainType)) {
      void openAppKitModal();
    }
  };

  const { data: userNFTsCount, refetch: refetchUserNFTsCount } =
    useReadContract({
      abi: abiERC721,
      address: mysteryBox?.address as any,
      functionName: "balanceOf",
      args: evmAddress ? [evmAddress] : undefined,
    });

  return {
    isLoading,
    chainStatusDetail,
    connectWallet,
    mint,
    userNFTsCount: userNFTsCount || (isMinted ? 1 : 0),
  };
};
