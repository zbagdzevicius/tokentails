import { isProd } from "@/models/app";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  bsc,
  bscTestnet,
  skaleNebula,
  skaleNebulaTestnet,
} from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";
import { ChainType } from "./contracts";

import {
  AlbedoModule,
  FreighterModule,
  LOBSTR_ID,
  LobstrModule,
  StellarWalletsKit,
  WalletNetwork,
  xBullModule,
  HanaModule,
  RabetModule
} from "@creit.tech/stellar-wallets-kit/index";

import { Horizon, Networks } from "@stellar/stellar-sdk";

// Get projectId at https://cloud.walletconnect.com
export const projectId = "4ef5743bb63ef48716115119e580ff88";

export const horizonServer = new Horizon.Server(
  isProd ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"
);
export const stellarNetworkPassphrase = isProd ? Networks.PUBLIC : Networks.TESTNET

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

export const chainTypeId: Record<ChainType, number> = {
  [ChainType.BNB]: bsc.id,
  [ChainType.BNB_TEST]: bscTestnet.id,
  [ChainType.SKALE]: skaleNebula.id,
  [ChainType.SKALE_TEST]: skaleNebulaTestnet.id,
  [ChainType.STELLAR]: 0,
  [ChainType.STELLAR_TEST]: 1,
};

export const idChainType: Record<number, ChainType> = {
  [bsc.id]: ChainType.BNB,
  [bscTestnet.id]: ChainType.BNB_TEST,
  [skaleNebula.id]: ChainType.SKALE,
  [skaleNebulaTestnet.id]: ChainType.SKALE_TEST,
  [0]: ChainType.STELLAR,
  [1]: ChainType.STELLAR_TEST,
};

// Create wagmiConfig
export const networks = isProd
  ? [
      bsc,
      // skaleNebulaMainnet
    ]
  : [
      bscTestnet,
      // skaleNebulaTestnet
    ];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: typeof window === "undefined",
  storage: createStorage({
    storage: cookieStorage,
  }),
  multiInjectedProviderDiscovery: true,
});
wagmiAdapter.sendTransaction;
