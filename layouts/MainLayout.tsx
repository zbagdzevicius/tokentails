import Web3ModalProvider from "@/context/web3";
import { PropsWithChildren } from "react";

export const MainLayout = ({ children }: PropsWithChildren<any>) => {
  return (
    <div>
      <Web3ModalProvider>
        <main className="z-10 relative flex flex-col">{children}</main>
      </Web3ModalProvider>
    </div>
  );
};
