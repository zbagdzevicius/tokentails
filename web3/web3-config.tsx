import { isProd } from "@/models/app";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  bsc,
  bscTestnet,
  defineChain,
  skaleNebula,
  skaleNebulaTestnet,
  zetachain,
} from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";
import { ChainType } from "./contracts";

import {
  AlbedoModule,
  FreighterModule,
  HanaModule,
  LOBSTR_ID,
  LobstrModule,
  RabetModule,
  StellarWalletsKit,
  WalletNetwork,
  xBullModule,
} from "@creit.tech/stellar-wallets-kit/index";
import {
  BitgetWalletAdapter,
  HuobiWalletAdapter,
  LedgerWalletAdapter,
  NightlyWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  TrustWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import { Horizon, Networks } from "@stellar/stellar-sdk";

// Get projectId at https://cloud.walletconnect.com
export const projectId = "4ef5743bb63ef48716115119e580ff88";

export const horizonServer = new Horizon.Server(
  isProd ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"
);
export const stellarNetworkPassphrase = isProd
  ? Networks.PUBLIC
  : Networks.TESTNET;

export const metadata = {
  name: "Web3Modal",
  description: "TokenTails wallet connect",
  url: "https://tokentails.com", // origin must match your domain & subdomain
  icons: ["https://tokentails.com/logo/logo.webp"],
  projectId,
};

export const stellarKit = new StellarWalletsKit({
  selectedWalletId: LOBSTR_ID,
  network: isProd ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET,
  modules: [
    new LobstrModule(),
    new xBullModule(),
    new FreighterModule(),
    new AlbedoModule(),
    new HanaModule(),
    new RabetModule(),
  ],
});

const campTestnet = defineChain({
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

const torus = defineChain({
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

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bsc.id,
  [ChainType.BNB_TEST]: bscTestnet.id,
  [ChainType.SKALE]: skaleNebula.id,
  [ChainType.SKALE_TEST]: skaleNebulaTestnet.id,
  [ChainType.ZETA]: zetachain.id,
  [ChainType.CAMP_TEST]: campTestnet.id,
  [ChainType.STELLAR]: 0,
  [ChainType.STELLAR_TEST]: 0,
  [ChainType.SOLANA]: 0,
  [ChainType.SOLANA_TEST]: 0,
  [ChainType.TORUS]: torus.id,
};

export const idChainType: Record<number, ChainType> = {
  [bsc.id]: ChainType.BNB,
  [bscTestnet.id]: ChainType.BNB_TEST,
  [skaleNebula.id]: ChainType.SKALE,
  [skaleNebulaTestnet.id]: ChainType.SKALE_TEST,
  [zetachain.id]: ChainType.ZETA,
  [campTestnet.id]: ChainType.CAMP_TEST,
  [torus.id]: ChainType.TORUS,
  [0]: ChainType.STELLAR,
  [1]: ChainType.STELLAR_TEST,
};

// 0. Set up Solana Adapter
export const solanaWallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new TorusWalletAdapter(),
  new TrustWalletAdapter(),
  new NightlyWalletAdapter(),
  new BitgetWalletAdapter(),
  new HuobiWalletAdapter(),
  new LedgerWalletAdapter(),
];

// Create wagmiConfig
export const networks = isProd
  ? [bsc, campTestnet, torus]
  : [bscTestnet, campTestnet, torus];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: typeof window === "undefined",
  storage: createStorage({
    storage: cookieStorage,
  }),
  multiInjectedProviderDiscovery: true,
});
