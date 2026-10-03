import { GoogleTagManager } from "@/components/GoogleTagManager";
import { PageBoundary } from "@/components/errors/PageBoundary";
import { installWindowErrorReporting } from "@/components/Phaser/events";
import { CatProvider } from "@/context/CatContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { ToastProvider } from "@/context/ToastContext";
import { queryClient } from "@/context/query";
import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { PropsWithChildren, useEffect } from "react";

const AnalyticsConsentBanner = dynamic(
  () => import("@/components/shared/AnalyticsConsentBanner"),
  { ssr: false },
);

/** The visible path, without query or hash. */
export const routeKey = (asPath: string | undefined) =>
  (asPath || "/").split(/[?#]/)[0] || "/";

export const MainLayout = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  // Keyed by the route (the page file), so a new page always mounts fresh;
  // a path change inside the same route clears a crash without remounting
  // a healthy page.
  const route = router?.pathname || "/";
  const path = routeKey(router?.asPath);

  // Same-origin uncaught errors and rejections become app_error (F9).
  useEffect(() => installWindowErrorReporting(), []);

  // Pinch zoom is no longer blocked here: it stays on everywhere except /game, whose viewport
  // meta (pages/_app.tsx) and data-zoom="locked" touch-action handle it (plan G6, WCAG 1.4.4).
  // The old double-tap "preventer" registered its factory as the listener, so it never ran.

  return (
    <QueryClientProvider client={queryClient}>
      <GoogleTagManager />
      <ToastProvider>
        <ProfileProvider>
          <CatProvider>
            <main className="text-yellow-900 [[data-sky]_&]:text-tt-gold-ink">
              <PageBoundary key={route} route={route} path={path}>
                {children}
              </PageBoundary>
            </main>
            <AnalyticsConsentBanner />
          </CatProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};
