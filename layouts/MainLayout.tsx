import { EntityMetadataProvider } from "@/context/EntityMetadataContext";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { queryClient } from "@/context/query";
import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";

export const MainLayout = ({ children }: PropsWithChildren<any>) => {
  return (
    <div>
      <QueryClientProvider client={queryClient}>
        <FirebaseAuthProvider>
          <EntityMetadataProvider>
            <ToastProvider>
              <main className="z-10 relative flex flex-col">{children}</main>
            </ToastProvider>
          </EntityMetadataProvider>
        </FirebaseAuthProvider>
      </QueryClientProvider>
    </div>
  );
};
