import { Analytics } from "@/components/Analytics";
import { PacksModal } from "@/components/shared/PacksModal";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { CatProvider } from "@/context/CatContext";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { queryClient } from "@/context/query";
import { ToastProvider } from "@/context/ToastContext";
import { QueryClientProvider } from "@tanstack/react-query";

export default function TestPage({ close }: { close: () => void }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Analytics />
      <ToastProvider>
        <ProfileProvider>
          <CatProvider>
            <FirebaseAuthProvider>
              <Web3Providers>
                <PacksModal close={close} />
              </Web3Providers>
            </FirebaseAuthProvider>
          </CatProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
