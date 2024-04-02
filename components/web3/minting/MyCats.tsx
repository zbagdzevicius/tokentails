"use client";

import { config, nftContractAddress } from "@/config";
import { nftContractAbi } from "@/contracts/ERC721Basic";
import { CatsMap } from "@/models/cats";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";

export const useMyCats = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { isConnected, address } = useAccount();
  const {
    data: balance,
    error: balanceError,
    isPending: isBalanceLoading,
  } = useReadContract({
    ...config,
    abi: nftContractAbi.abi,
    address: nftContractAddress,
    functionName: "getOwnedURIs",
    args: [address],
  });

  useEffect(() => {
    const catsMetadata = balance as any[];

    if (catsMetadata?.length) {
      setCats(
        catsMetadata.map((meta: any) => {
          const name = meta.split("/")?.reverse()?.[0]?.toLowerCase()?.replace('.json', '');

          return CatsMap[name];
        })
      );
      setIsReady(true);
    }
  }, [balance]);

  return {
    isConnected,
    balance,
    isBalanceLoading,
    isReady,
    cats,
  };
};
