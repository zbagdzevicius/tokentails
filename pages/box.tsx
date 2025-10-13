import { MysteryBoxCat } from "@/components/mystery/MysteryBoxCat";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { bgStyle, cdnFile } from "@/constants/utils";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import Head from "next/head";

const Box = () => {
  return (
    <div>
      <Head>
        <title>Token Tails - Mystery Boxes</title>
        <meta property="og:image" content={cdnFile("logo/airdrop.jpg")} />
        <meta property="og:title" content="Token Tails - Airdrop" key="title" />
        <meta name="description" content="9 ways to earn $TAILS" />
        <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
      </Head>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center"
        style={bgStyle("6")}
        id="social-farmin"
      >
        <FirebaseAuthProvider>
          <Web3Providers>
            <MysteryBoxCat />
          </Web3Providers>
        </FirebaseAuthProvider>
      </div>

      <Footer />
    </div>
  );
};

export default Box;
