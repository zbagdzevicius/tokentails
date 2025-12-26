import { Analytics } from "@/components/Analytics";
import { CatProvider } from "@/context/CatContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { ToastProvider } from "@/context/ToastContext";
import { queryClient } from "@/context/query";
import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useEffect } from "react";

export const MainLayout = ({ children }: PropsWithChildren<any>) => {
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
          dblTapTimer = setTimeout(() => {
            dblTapPressed = false;
          }, 500) as any;
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
      <Analytics />
      <ToastProvider>
        <ProfileProvider>
          <CatProvider>
            <main className="text-yellow-900">{children}</main>
          </CatProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};
