import { isProd } from "@/models/app";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage } from "wagmi";

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
import { paraConnector } from "@getpara/wagmi-v2-integration";
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

import { para } from "@/models/para";
import { Horizon, Networks } from "@stellar/stellar-sdk";
import { networks } from "./web3-chains";
import { OAuthMethod, AuthLayout } from "@getpara/react-sdk";

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

export const paraConnected = paraConnector({
  para,
  appName: "Token Tails",
  logo: "https://tokentails.com/logo/logo.webp",
  oAuthMethods: [OAuthMethod.GOOGLE, OAuthMethod.TWITTER],
  theme: {
    mode: "light",
  },
  onRampTestMode: true,
  disablePhoneLogin: true,
  authLayout: [AuthLayout.AUTH_FULL],
  recoverySecretStepEnabled: true,
  options: {},
});

export const wagmiAdapter = new WagmiAdapter({
  connectors: [paraConnected as any],
  networks,
  projectId,
  ssr: typeof window === "undefined",
  storage: createStorage({
    storage: cookieStorage,
  }),
  multiInjectedProviderDiscovery: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
