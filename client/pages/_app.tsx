import { setErrorRoute } from "@/analytics/errors";
import { AppRouteRestore } from "@/components/AppRouteRestore";
import { clearStaticHomeStamp, loadStaticHome, servesStaticHome } from "@/components/home/staticHome";
import { RootBoundary } from "@/components/errors/RootBoundary";
import { applySkyScope, viewportForPath } from "@/components/shared/skyScope";
import { MainLayout } from "@/layouts/MainLayout";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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

  // Web "/" is the static home page (components/home/staticHome.ts): a client-side navigation to it
  // reloads instead of rendering pages/index.tsx. If that reload comes straight back here (the rewrite is
  // not serving "/"), the guard falls back to rendering pages/index.tsx rather than reloading forever.
  const staticHome = servesStaticHome(router?.pathname ?? "");
  const [homeFallback, setHomeFallback] = useState(false);
  useEffect(() => {
    if (!staticHome) {
      clearStaticHomeStamp();
      return;
    }
    if (loadStaticHome()) return;
    let live = true;
    queueMicrotask(() => {
      if (live) setHomeFallback(true);
    });
    return () => {
      live = false;
    };
  }, [staticHome]);
  if (staticHome && !homeFallback) return null;

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
