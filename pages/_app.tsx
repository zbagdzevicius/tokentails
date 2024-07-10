import "../styles/globals.scss";
import { MainLayout } from "@/layouts/MainLayout";
import type { AppProps } from "next/app";
import { GoogleAnalytics } from "nextjs-google-analytics";
import { useEffect, useState } from "react";

function MyApp({ Component, pageProps }: AppProps) {
  const [isClicked, setIsClicked] = useState(false);
  useEffect(() => {
    window.onclick = () => {
      setIsClicked(true);
    }
  }, [])
  return (
    <MainLayout>
      {isClicked && (
        <audio className="display: none" autoPlay>
          <source
            src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
            type="audio/mpeg"
          />
        </audio>
      )}
      <GoogleAnalytics trackPageViews />
      <Component {...pageProps} />
    </MainLayout>
  );
}

export default MyApp;
