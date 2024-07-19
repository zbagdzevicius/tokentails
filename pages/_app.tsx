import "../styles/globals.scss";
import { MainLayout } from "@/layouts/MainLayout";
import type { AppProps } from "next/app";
import { GoogleAnalytics } from "nextjs-google-analytics";
import { useEffect, useState } from "react";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <MainLayout>
      <GoogleAnalytics trackPageViews />
      <Component {...pageProps} />
    </MainLayout>
  );
}

export default MyApp;
