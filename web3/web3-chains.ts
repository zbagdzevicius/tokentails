import { bsc, mantle, sei, mainnet, base } from "@reown/appkit/networks";
import { defineChain } from "viem";
import { ChainType } from "./contracts";

// Define Torus Mainnet custom network
export const torus = defineChain({
  id: 8195,
  name: "Torus Mainnet",
  nativeCurrency: {
    name: "TQF",
    symbol: "TQF",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc-v2.toruschain.com/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Toruscan",
      url: "https://toruscan.com/",
    },
  },
});

// Create wagmiConfig
export const networks = [bsc, sei, torus, mainnet, base, mantle];

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bsc.id,
  [ChainType.MANTLE]: mantle.id,
  [ChainType.SEI]: sei.id,
  [ChainType.STELLAR]: 0,
  [ChainType.TORUS]: torus.id,
  [ChainType.ETH]: mainnet.id,
  [ChainType.BASE]: base.id,
};

export const idChainType: Record<number, ChainType> = {
  [bsc.id]: ChainType.BNB,
  [sei.id]: ChainType.SEI,
  [mantle.id]: ChainType.MANTLE,
  [torus.id]: ChainType.TORUS,
  [mainnet.id]: ChainType.ETH,
  [base.id]: ChainType.BASE,
  [0]: ChainType.STELLAR,
};
