"use client";

import {
  metadata,
  projectId,
  wagmiAdapter,
  wagmiConfig,
} from "@/web3/web3-config";
import { ReactNode } from "react";

import { createAppKit } from "@reown/appkit/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { networks } from "@/web3/web3-chains";
import { WagmiProvider } from "wagmi";

export const queryClient = new QueryClient();
let appKitInitialized = false;
let appKitInstance: ReturnType<typeof createAppKit> | null = null;

const appKitConfig = {
  adapters: [wagmiAdapter],
  featuredWalletIds: [
    "67f1ec404dbf3bddc509b5fcf615850e05b28c287ccd7167b4fe81b4293ac9df",
  ],
  metadata,
  networks: networks as any,
  projectId,
  themeMode: "light" as const,
  features: {
    analytics: true,
    email: false as const,
    socials: false as const,
    smartSessions: true,
  },
};

export const ensureAppKitInitialized = () => {
  if (appKitInitialized || typeof window === "undefined") {
    return appKitInstance;
  }

  appKitInstance = createAppKit(appKitConfig);

  appKitInitialized = true;
  return appKitInstance;
};

export const openAppKitModal = async () => {
  const appKit = ensureAppKitInitialized();
  if (!appKit) {
    return;
  }
  await appKit.open();
};

if (typeof window !== "undefined") {
  ensureAppKitInitialized();
}

export default function Web3ModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  ensureAppKitInitialized();

  return (
    <WagmiProvider config={wagmiConfig as any}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
