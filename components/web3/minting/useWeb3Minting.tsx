import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { useWeb3 } from "@/context/Web3Context";
import { EntityType } from "@/models/save";
import { abiERC721 } from "@/web3/abi-erc721";
import { ChainNamespace, ChainType, CurrencyType } from "@/web3/contracts";
import { chainTypeId, wagmiAdapter } from "@/web3/web3-config";
import { zetachainMysteryBoxAddress } from "@/web3/web3.model";
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
}

interface NFT {
  tokenId: number;
  tokenURI: string;
  owner: string;
}

export const useWeb3Minting = ({ entityType, user }: IProps) => {
  const { evmConnected, evmAddress, namespace, namespaceDetail, chainId } =
    useWeb3();
  const { switchChainAsync } = useSwitchChain({
    config: wagmiAdapter.wagmiConfig,
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
  const [isSolanaPending, setIsSolanaPending] = useState(false);
  const {
    isLoading: isTaxLoading,
    isSuccess: isTaxConfirmed,
    data: taxData,
  } = useWaitForTransactionReceipt({
    hash,
  });

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
      if (chainId !== chainTypeId[ChainType.ZETA]) {
        await switchChainAsync({ chainId: chainTypeId[ChainType.ZETA] });
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
        address: zetachainMysteryBoxAddress,
        functionName: "safeMint",
        args: [evmAddress!],
      });
      setHash(txHash);
    } catch {
      toast({ message: "Failed to mint. Please try again." });
    }
  }

  useEffect(() => {
    if (isTaxConfirmed) {
      ORDER_API.confirm({
        hash: hash!,
        chainType: ChainType.ZETA,
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

  useEffect(() => {
    if (taxData?.status === "success") {
      toast({ message: "Mystery box is minted successfully" });
    }
  }, [taxData]);

  const connectWallet = () => {
    if (namespace === ChainNamespace.EVM) {
      open();
    }
  };

  const { data: userNFTsCount } = useReadContract({
    abi: abiERC721,
    address: zetachainMysteryBoxAddress,
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
