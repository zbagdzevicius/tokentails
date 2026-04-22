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
} from "@creit.tech/stellar-wallets-kit";

import { cdnFile, randomObjectFromArray } from "@/constants/utils";
import { Horizon, Networks } from "@stellar/stellar-sdk";
import { networks } from "./web3-chains";

// Get projectId at https://cloud.walletconnect.com
export const projectId = randomObjectFromArray([
  "4ef5743bb63ef48716115119e580ff88",
  "71977b8c06fe43e4e97a85a767a52abe",
  "3e393963240614a0d229b0af8960f434",
  "905bdc970aa83b821ecc2d1729f0b7b0",
  "b034902eefee7e0b309bc7089089ca85",
])!;

export const horizonServer = new Horizon.Server(
  isProd
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org",
);
export const stellarNetworkPassphrase = isProd
  ? Networks.PUBLIC
  : Networks.TESTNET;

export const metadata = {
  name: "Web3Modal",
  description: "TokenTails wallet connect",
  url: "https://tokentails.com", // origin must match your domain & subdomain
  icons: [cdnFile("logo/logo.webp")],
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

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: typeof window === "undefined",
  storage: createStorage({
    storage: cookieStorage,
  }) as any,
  multiInjectedProviderDiscovery: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
