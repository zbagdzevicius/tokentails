import { CatProvider } from "@/context/CatContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { ToastProvider } from "@/context/ToastContext";
import { queryClient } from "@/context/query";
import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";

export const MainLayout = ({ children }: PropsWithChildren<any>) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ProfileProvider>
          <CatProvider>
            <main className="z-10 relative flex flex-col overflow-hidden">
              {children}
            </main>
          </CatProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};
