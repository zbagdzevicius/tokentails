import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";
import { defineChain } from "viem";

import { cookieStorage, createStorage } from "wagmi";
import { ChainType, currencyContracts, CurrencyType } from "./contracts";
import { abiERC20 } from "./abi-erc20";
import { isProd } from "@/models/app";

export const bnbChain = defineChain({
  id: 56, // BNB Chain mainnet chain ID
  name: "BNB Chain",
  nativeCurrency: {
    name: "Binance Coin",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://bsc-dataseed.binance.org/"],
    },
  },
  blockExplorers: {
    default: {
      name: "BscScan",
      url: "https://bscscan.com",
      apiUrl: "https://api.bscscan.com/api",
    },
  },
  contracts: {
    [CurrencyType.USDC]: {
      address: currencyContracts.BNB.USDC,
      abi: abiERC20,
    },
    [CurrencyType.USDT]: {
      address: currencyContracts.BNB.USDT,
      abi: abiERC20,
    },
    [CurrencyType.TAILS]: {
      address: currencyContracts.BNB.TAILS,
      abi: abiERC20,
    },
  },
});

export const bnbTestnetChain = defineChain({
  id: 97, // BNB Testnet chain ID
  name: "BNB Testnet",
  nativeCurrency: {
    name: "Binance Coin",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
    },
  },
  blockExplorers: {
    default: {
      name: "BscScan Testnet",
      url: "https://testnet.bscscan.com",
      apiUrl: "https://api-testnet.bscscan.com/api",
    },
  },
  contracts: {
    [CurrencyType.USDC]: {
      address: currencyContracts.BNB_TEST.USDC,
      abi: abiERC20,
    },
    [CurrencyType.USDT]: {
      address: currencyContracts.BNB_TEST.USDT,
      abi: abiERC20,
    },
    [CurrencyType.TAILS]: {
      address: currencyContracts.BNB_TEST.TAILS,
      abi: abiERC20,
    },
  },
});

export const skaleNebulaTestnet = defineChain({
  id: 4201, // Example chain ID for SKALE Nebula Testnet, change if needed
  name: "SKALE Nebula Testnet",
  nativeCurrency: {
    name: "sFUEL",
    symbol: "sFUEL",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.skalenodes.com/v1/lanky-ill-funny-testnet"],
    },
  },
  blockExplorers: {
    default: {
      name: "SKALE Explorer",
      url: "https://lanky-ill-funny-testnet.explorer.testnet.skalenodes.com/",
      apiUrl:
        "https://lanky-ill-funny-testnet.explorer.testnet.skalenodes.com/api",
    },
  },
  contracts: {},
});

export const skaleNebulaMainnet = defineChain({
  id: 1482601649, // SKALE Nebula Mainnet chain ID
  name: "SKALE Nebula Mainnet",
  nativeCurrency: {
    name: "sFUEL",
    symbol: "sFUEL",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.skalenodes.com/v1/green-giddy-denebola"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://green-giddy-denebola.explorer.mainnet.skalenodes.com",
      apiUrl:
        "https://green-giddy-denebola.explorer.mainnet.skalenodes.com/api",
    },
  },
  contracts: {},
});

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bnbChain.id,
  [ChainType.BNB_TEST]: bnbTestnetChain.id,
  [ChainType.SKALE]: skaleNebulaMainnet.id,
  [ChainType.SKALE_TEST]: skaleNebulaMainnet.id,
};

export const nftContractAddress = "0xd6265283af414697b61a46272669f21e6131628f";

// Get projectId at https://cloud.walletconnect.com
export const projectId = "4ef5743bb63ef48716115119e580ff88";

const metadata = {
  name: "Web3Modal",
  description: "TokenTails wallet connect",
  url: "https://tokentails.com", // origin must match your domain & subdomain
  icons: ["https://tokentails.com/logo/logo.webp"],
};

// Create wagmiConfig
const chains = isProd
  ? ([
      bnbChain,
      // skaleNebulaMainnet
    ] as const)
  : ([
      bnbTestnetChain,
      // skaleNebulaTestnet
    ] as const);
export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  ssr: typeof window === "undefined",
  storage: createStorage({
    storage: cookieStorage,
  }),
  //   ...wagmiOptions, // Optional - Override createConfig parameters
});
