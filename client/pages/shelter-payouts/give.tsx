import { bgStyle, cdnFile } from "@/constants/utils";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";
import Head from "next/head";

// Reads the session token and the router query; render it in the browser only.
const GiveTreat = dynamic(() => import("@/components/shelter-payouts/GiveTreat"), {
  ssr: false,
});

const GivePage = () => (
  <div>
    <Head>
      <title>Token Tails - Send a rescue treat</title>
      <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
      <meta property="og:title" content="Token Tails - Send a rescue treat" key="title" />
      <meta
        name="description"
        content="One tap sends a small USDC treat to a cat shelter, split on-chain by ShelterSplit."
      />
      <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
    </Head>
    <Header />
    <div
      className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center"
      style={bgStyle("6")}
      id="shelter-give"
    >
      <FirebaseAuthProvider>
        <GiveTreat />
      </FirebaseAuthProvider>
    </div>
    <Footer />
  </div>
);

export default GivePage;
