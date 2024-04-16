import { EntityMetadataProvider } from "@/context/EntityMetadataContext";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { ToastProvider } from "@/context/ToastContext";
import Web3ModalProvider, { queryClient } from "@/context/web3";
import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";

export const MainLayout = ({ children }: PropsWithChildren<any>) => {
  return (
    <div>
      <QueryClientProvider client={queryClient}>
        <FirebaseAuthProvider>
          <EntityMetadataProvider>
            <Web3ModalProvider>
              <ToastProvider>
                <main className="z-10 relative flex flex-col">{children}</main>
              </ToastProvider>
            </Web3ModalProvider>
          </EntityMetadataProvider>
        </FirebaseAuthProvider>
      </QueryClientProvider>
    </div>
  );
};
