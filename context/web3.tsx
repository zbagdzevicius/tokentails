"use client";

import {
  metadata,
  networks,
  projectId,
  wagmiAdapter
} from "@/web3/web3-config";
import { ReactNode } from "react";

import { createAppKit } from "@reown/appkit/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WagmiProvider } from "wagmi";

export const queryClient = new QueryClient();
if (typeof window !== "undefined") {
  createAppKit({
    adapters: [wagmiAdapter],
    metadata,
    networks: networks as any,
    projectId,
    features: {
      analytics: true,
      email: false,
      socials: false,
      smartSessions: true,
    },
  });
}

export default function Web3ModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
