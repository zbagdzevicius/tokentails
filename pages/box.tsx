import { AirdropRewardsSlider } from "@/components/airdrop/AirdropRewardsSlider";
import SocialAirdropTerms from "@/components/airdrop/SocialAirdropTerms";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";
import Head from "next/head";

const MysteryBoxCat = dynamic(
  () =>
    import("@/components/mystery/MysteryBoxCat").then(
      (mod) => mod.MysteryBoxCat
    ),
  {
    ssr: false,
    loading: () => (
      <img
        src="/icons/loader.webp"
        className="w-8 h-8 m-auto animate-spin pixelated"
      />
    ),
  }
);

const Box = () => {
  return (
    <div>
      <Head>
        <title>Token Tails - Mystery Boxes</title>
        <meta property="og:image" content="/logo/airdrop.jpg" />
        <meta property="og:title" content="Token Tails - Airdrop" key="title" />
        <meta name="description" content="9 ways to earn $TAILS" />
        <link rel="shortcut icon" href="/logo/coin.webp" />
      </Head>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center"
        style={{
          backgroundImage: "url(/backgrounds/bg-6.webp)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
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
