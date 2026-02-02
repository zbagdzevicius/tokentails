import { useRouter } from "next/router";
import Script from "next/script";
import { useEffect, useRef } from "react";

const FACEBOOK_PIXEL_ID = "2406974683092562";

declare global {
  interface Window {
    fbq: (
      action: string,
      event: string,
      params?: Record<string, any>
    ) => void;
    _fbq: typeof window.fbq;
    _fbPixelInitialized?: boolean;
  }
}

// Prevent duplicate script execution
if (typeof window !== "undefined") {
  (window as any)._fbPixelInitialized = (window as any)._fbPixelInitialized || false;
}

export const FacebookPixel = () => {
  const router = useRouter();
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate initialization
    if (initializedRef.current || typeof window === "undefined") {
      return;
    }

    // Check if already initialized
    if (window._fbPixelInitialized) {
      return;
    }

    // Initialize fbq if it exists and hasn't been initialized
    if (window.fbq && !window._fbPixelInitialized) {
      window._fbPixelInitialized = true;
      initializedRef.current = true;
      // Only track PageView, don't re-init
      window.fbq("track", "PageView");
    }
  }, []);

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (typeof window !== "undefined" && window.fbq) {
        window.fbq("track", "PageView");
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return (
    <div className="hidden">
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          (function() {
            if (window._fbPixelInitialized) return;
            
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            
            window._fbPixelInitialized = true;
            fbq('init', '${FACEBOOK_PIXEL_ID}');
            fbq('track', 'PageView');
          })();
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${FACEBOOK_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </div>
  );
};

// Utility function to track Facebook Pixel events
export const trackFacebookEvent = (
  eventName: string,
  params?: Record<string, any>
) => {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", eventName, params);
  }
};
