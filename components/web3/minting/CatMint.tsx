"use client";

import { config, nftContractAddress } from "@/web3/web3";
import { getRandomInt } from "@/constants/utils";
import { nftContractAbi } from "@/contracts/ERC721Basic";
import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

interface IProps {
  name: string;
}

export const useCatMint = ({ name }: IProps) => {
  const { isConnected, address } = useAccount();
  const [tokenId, setTokenId] = useState(getRandomInt(9999999)); // Example token ID, could be dynamically set
  const [tokenURI, setTokenURI] = useState(
    `https://tokentails.com/cats/metadata/${name?.toLowerCase()}.json`
  ); // Metadata URI

  const { data: hash, writeContract, isPending } = useWriteContract();
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

  async function mint() {
    const result = await writeContract({
      abi: nftContractAbi.abi,
      address: nftContractAddress,
      functionName: "safeMint",
      args: [address!, tokenId, tokenURI],
    });
    setTokenId(getRandomInt(9999999));
  }

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  return {
    mint,
    isConnected,
    isPending,
    isConfirming,
    isConfirmed,
  };
};
