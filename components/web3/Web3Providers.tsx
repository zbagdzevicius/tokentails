import Web3ModalProvider from "@/context/web3";
import { Web3Provider } from "@/context/Web3Context";
import { isProd } from "@/models/app";
import { solanaWallets } from "@/web3/web3-config";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { PropsWithChildren, useMemo } from "react";
require("@solana/wallet-adapter-react-ui/styles.css");

export const Web3Providers = ({ children }: PropsWithChildren<{}>) => {
  const network = isProd
    ? WalletAdapterNetwork.Mainnet
    : WalletAdapterNetwork.Testnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={solanaWallets} autoConnect>
        <WalletModalProvider>
          <Web3ModalProvider>
            <Web3Provider>{children}</Web3Provider>
          </Web3ModalProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
