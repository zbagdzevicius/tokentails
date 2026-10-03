import { setErrorRoute } from "@/analytics/errors";
import { AppRouteRestore } from "@/components/AppRouteRestore";
import { RootBoundary } from "@/components/errors/RootBoundary";
import { applySkyScope, viewportForPath } from "@/components/shared/skyScope";
import { MainLayout } from "@/layouts/MainLayout";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import "../styles/globals.scss";

// Status bar style and colour on iOS and Android; renders nothing on the web.
const NativeChrome = dynamic(() => import("@/components/native/NativeChrome"), {
  ssr: false,
});

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const route = router?.pathname || "/";
  // Crash reports carry the page pattern (`/cats/[cat]`), not the real path
  // (F9). Set during render so a crash in this very render already has it.
  if (typeof window !== "undefined") setErrorRoute(route);

  // _document sets data-sky / data-zoom in the server HTML; this keeps them right after a
  // client-side navigation (for example landing -> /game) (plan G6).
  useEffect(() => {
    applySkyScope(document.documentElement, route);
  }, [route]);

  // RootBoundary sits outside every provider, so a provider crash still
  // shows a way out instead of a blank page (F9).
  return (
    <RootBoundary>
      <Head>
        {/* One viewport tag (next/head dedupes it by name): pinch zoom on everywhere except
            /game (WCAG 1.4.4). */}
        <meta name="viewport" content={viewportForPath(route)} key="viewport" />
      </Head>
      <NativeChrome />
      <MainLayout>
        <AppRouteRestore />
        <Component {...pageProps} />
      </MainLayout>
    </RootBoundary>
  );
}

export default MyApp;
