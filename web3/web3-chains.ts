import { isProd } from "@/models/app";
import { bsc, bscTestnet, mantle, sei } from "@reown/appkit/networks";
import { ChainType } from "./contracts";

// Create wagmiConfig
export const networks = isProd
  ? [bsc, mantle, sei]
  : [bscTestnet, mantle, sei];

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bsc.id,
  [ChainType.BNB_TEST]: bscTestnet.id,
  [ChainType.MANTLE]: mantle.id,
  [ChainType.SEI]: sei.id,
  [ChainType.STELLAR]: 0,
  [ChainType.STELLAR_TEST]: 0,
  [ChainType.SOLANA]: 0,
  [ChainType.SOLANA_TEST]: 0,
};

export const idChainType: Record<number, ChainType> = {
  [bsc.id]: ChainType.BNB,
  [bscTestnet.id]: ChainType.BNB_TEST,
  [sei.id]: ChainType.SEI,
  [mantle.id]: ChainType.MANTLE,
  [0]: ChainType.STELLAR,
  [1]: ChainType.STELLAR_TEST,
};
