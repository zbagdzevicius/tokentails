import Web3ModalProvider from "@/context/web3";
import { Web3Provider } from "@/context/Web3Context";
import { PropsWithChildren } from "react";

export const Web3Providers = ({ children }: PropsWithChildren<{}>) => {
  return (
    <Web3ModalProvider>
      <Web3Provider>{children}</Web3Provider>
    </Web3ModalProvider>
  );
};
