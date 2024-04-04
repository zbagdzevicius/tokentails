"use client";

import { config, nftContractAddress } from "@/config/web3";
import { nftContractAbi } from "@/contracts/ERC721Basic";
import { CatsMap } from "@/models/cats";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";

const getUrisCatNames = (uris: string[]) => {
  return uris.map((uri: any) => {
    const name = uri
      .split("/")
      ?.reverse()?.[0]
      ?.toLowerCase()
      ?.replace(".json", "");

    return CatsMap[name];
  });
};

export const useMyCats = () => {
  const [cats, setCats] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);

  const { isConnected, address } = useAccount();
  const {
    data: ownedUris,
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
    if ((ownedUris as string[])?.length) {
      setCats(getUrisCatNames(ownedUris as string[]));
      setIsReady(true);
    }
  }, [ownedUris]);

  return {
    isConnected,
    isBalanceLoading,
    isReady,
    cats,
  };
};
