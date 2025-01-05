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
    featuredWalletIds: [
      "38f5d18bd8522c244bdd70cb4a68e0e718865155811c043f052fb9f1c51de662",
      "21c3a371f72f0057186082edb2ddd43566f7e908508ac3e85373c6d1966ed614",
    ],
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
