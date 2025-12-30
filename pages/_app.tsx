import { MainLayout } from "@/layouts/MainLayout";
import type { AppProps } from "next/app";
import "../styles/globals.scss";
import "@solana/wallet-adapter-react-ui/styles.css";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <MainLayout>
      <Component {...pageProps} />
    </MainLayout>
  );
}

export default MyApp;
