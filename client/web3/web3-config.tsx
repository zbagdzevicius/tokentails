import { isProd } from "@/models/app";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { LOBSTR_ID } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { Networks as WalletNetwork } from "@creit.tech/stellar-wallets-kit/types";

import { Horizon, Networks } from "@stellar/stellar-sdk";

if (typeof window !== "undefined") {
  StellarWalletsKit.init({
    modules: defaultModules(),
    selectedWalletId: LOBSTR_ID,
    network: isProd ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET,
  });
}

export { StellarWalletsKit };

export const horizonServer = new Horizon.Server(
  isProd
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org",
);
export const stellarNetworkPassphrase = isProd
  ? Networks.PUBLIC
  : Networks.TESTNET;
