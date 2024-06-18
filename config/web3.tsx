import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";
import { defineChain } from "viem";

import { cookieStorage, createStorage } from "wagmi";

export const u2u = defineChain({
  id: 2484,
  name: "Nebulas Testnet",
  nativeCurrency: { name: "Unicorn Ultra", symbol: "U2U", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc-nebulas-testnet.uniultra.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "u2uscan",
      url: "https://testnet.u2uscan.xyz",
      apiUrl: "https://testnet.u2uscan.xyz/api",
    },
  },
  contracts: {},
});

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
const chains = [u2u] as const;
export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  ssr: typeof window === 'undefined',
  storage: createStorage({
    storage: cookieStorage,
  }),
  //   ...wagmiOptions, // Optional - Override createConfig parameters
});
