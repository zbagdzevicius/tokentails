import * as Sentry from "@sentry/browser";
import { useRouter } from "next/router";
import Script from "next/script";
import { useEffect } from "react";

export const Analytics = () => {
  const router = useRouter();
  const handleRouteChange = (url: string) => {
    (window as any)?.gtag("config", "G-5SY23ENHR0", {
      page_path: url,
    });
  };
  useEffect(() => {
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);
  useEffect(() => {
    Sentry.init({
      dsn: "https://71bb87b9dcc24b6eb84f68d9594a26bc@glitchtip-hqvww.ondigitalocean.app/1",
      tracesSampleRate: 0.01,
    });
  }, []);

  return (
    <div className="hidden">
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=G-5SY23ENHR0`}
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
 
              gtag('config', 'G-5SY23ENHR0');
            gtag('config', 'G-5SY23ENHR0', {
                page_path: window.location.pathname,
            });
            `}
      </Script>
    </div>
  );
};
