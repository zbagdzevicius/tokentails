import { isProd } from "@/models/app";
import { bsc, bscTestnet, defineChain, sei } from "@reown/appkit/networks";
import { ChainType } from "./contracts";

export const campMainnet = defineChain({
  id: 484,
  chainNamespace: "eip155",
  caipNetworkId: `eip155:${484}`,
  name: "Camp Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Camp Network",
    symbol: "CAMP",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.camp.raas.gelato.cloud"],
    },
  },
  blockExplorers: {
    default: {
      name: "Camp",
      url: "https://camp.cloud.blockscout.com",
    },
  },
  testnet: true,
});

// Create wagmiConfig
export const networks = isProd
  ? [bsc, campMainnet, sei]
  : [bscTestnet, campMainnet, sei];

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bsc.id,
  [ChainType.BNB_TEST]: bscTestnet.id,
  [ChainType.CAMP]: campMainnet.id,
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
  [campMainnet.id]: ChainType.CAMP,
  [0]: ChainType.STELLAR,
  [1]: ChainType.STELLAR_TEST,
};
