import { GoogleTagManager } from "@/components/GoogleTagManager";
import { CatProvider } from "@/context/CatContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { ToastProvider } from "@/context/ToastContext";
import { queryClient } from "@/context/query";
import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { PropsWithChildren, useEffect } from "react";

const AnalyticsConsentBanner = dynamic(
  () => import("@/components/shared/AnalyticsConsentBanner"),
  { ssr: false },
);

export const MainLayout = ({ children }: PropsWithChildren) => {
  // DISABLE iOS Pinch to zoom and magnifier
  useEffect(() => {
    function createDoubleTapPreventer() {
      let dblTapTimer = 0;
      let dblTapPressed = false;

      return function (e: TouchEvent) {
        clearTimeout(dblTapTimer);
        if (dblTapPressed) {
          e.preventDefault();
          dblTapPressed = false;
        } else {
          dblTapPressed = true;
          dblTapTimer = window.setTimeout(() => {
            dblTapPressed = false;
          }, 500);
        }
      };
    }

    document.body.addEventListener("touchstart", createDoubleTapPreventer, {
      passive: false,
    });

    return () => {
      document.body.removeEventListener("touchstart", createDoubleTapPreventer);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GoogleTagManager />
      <ToastProvider>
        <ProfileProvider>
          <CatProvider>
            <main className="text-yellow-900">{children}</main>
            <AnalyticsConsentBanner />
          </CatProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};
