import Web3ModalProvider from "@/context/web3";
import { Web3Provider } from "@/context/Web3Context";
import { solanaWallets } from "@/web3/web3-config";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PropsWithChildren } from "react";
require("@solana/wallet-adapter-react-ui/styles.css");

export const Web3Providers = ({ children }: PropsWithChildren<{}>) => {
  return (
    <ConnectionProvider
      endpoint={"https://go.getblock.io/3589c7e1595a475e9dbec2eb57f96fa8"}
    >
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
