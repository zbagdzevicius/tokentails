import {
  defineChain,
  bsc,
  bscTestnet,
  skaleNebula,
  skaleNebulaTestnet,
} from "@reown/appkit/networks";
import { ChainType } from "./contracts";
import { isProd } from "@/models/app";

export const campTestnet = defineChain({
  id: 123420001114,
  chainNamespace: "eip155",
  caipNetworkId: `eip155:${123420001114}`,
  name: "Camp Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Camp Network",
    symbol: "CAMP",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.basecamp.t.raas.gelato.cloud"],
    },
  },
  blockExplorers: {
    default: {
      name: "Camp",
      url: "https://basecamp.cloud.blockscout.com",
    },
  },
  testnet: true,
});

export const torus = defineChain({
  id: 8192,
  chainNamespace: "eip155",
  caipNetworkId: `eip155:${8192}`,
  name: "Torus Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Torus Mainnet",
    symbol: "TQF",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.toruschain.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Torus Scan",
      url: "https://toruscan.com",
    },
  },
  testnet: false,
});

// Create wagmiConfig
export const networks = isProd
  ? [bsc, campTestnet, torus]
  : [bscTestnet, campTestnet, torus];

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bsc.id,
  [ChainType.DIAM]: bsc.id,
  [ChainType.BNB_TEST]: bscTestnet.id,
  [ChainType.SKALE]: skaleNebula.id,
  [ChainType.SKALE_TEST]: skaleNebulaTestnet.id,
  [ChainType.CAMP_TEST]: campTestnet.id,
  [ChainType.STELLAR]: 0,
  [ChainType.STELLAR_TEST]: 0,
  [ChainType.SOLANA]: 0,
  [ChainType.SOLANA_TEST]: 0,
  // [ChainType.TORUS]: torus.id,
};

export const idChainType: Record<number, ChainType> = {
  [bsc.id]: ChainType.BNB,
  [bscTestnet.id]: ChainType.BNB_TEST,
  [skaleNebula.id]: ChainType.SKALE,
  [skaleNebulaTestnet.id]: ChainType.SKALE_TEST,
  [campTestnet.id]: ChainType.CAMP_TEST,
  // [torus.id]: ChainType.TORUS,
  [0]: ChainType.STELLAR,
  [1]: ChainType.STELLAR_TEST,
};
