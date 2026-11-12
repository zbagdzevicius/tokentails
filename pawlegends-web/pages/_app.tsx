import { setErrorRoute } from "@/analytics/errors";
import { GoogleTagManager } from "@/components/GoogleTagManager";
import { RootBoundary } from "@/components/errors/RootBoundary";
import { PawlegendsConsent } from "@/components/pawlegends/PawlegendsConsent";
import { ProfileProvider } from "@/context/ProfileContext";
import { ToastProvider } from "@/context/ToastContext";
import { queryClient } from "@/context/query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import "../styles/globals.scss";

/** Pinch zoom stays on (WCAG 1.4.4); `/play` replaces this tag with its own (components/pawlegends/noZoom.ts). */
export const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover";

/**
 * The Paw Legends shell: crash boundary outside every provider, react-query, toasts, the profile, GTM (Paw Legends'
 * container with Consent Mode v2) and its consent bar. Sign-in (FirebaseAuthProvider) is mounted by the pages that need
 * it (`/play`, `/account`), so the landings and legal pages load no Firebase.
 */
export default function PawlegendsApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  // Crash reports carry the page pattern, set during render so a crash in this very render already has it.
  if (typeof window !== "undefined") setErrorRoute(router?.pathname || "/");
  return (
    <RootBoundary>
      <Head>
        <meta name="viewport" content={DEFAULT_VIEWPORT} key="viewport" />
      </Head>
      <QueryClientProvider client={queryClient}>
        <GoogleTagManager />
        <PawlegendsConsent />
        <ToastProvider>
          <ProfileProvider>
            <Component {...pageProps} />
          </ProfileProvider>
        </ToastProvider>
      </QueryClientProvider>
    </RootBoundary>
  );
}
