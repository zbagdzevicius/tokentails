import { bgStyle, cdnFile } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";
import Head from "next/head";

// Reads a public RPC with fetch and BigInt; render it in the browser only.
const ShelterReceipt = dynamic(() => import("@/components/shelter-payouts/ShelterReceipt"), {
  ssr: false,
});

const ReceiptPage = () => (
  <div>
    <Head>
      <title>Token Tails - Rescue receipt</title>
      <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
      <meta property="og:title" content="Token Tails - Rescue receipt" key="title" />
      <meta name="description" content="A shelter donation, read straight from the chain." />
      <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
    </Head>
    <Header />
    <div
      className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center"
      style={bgStyle("6")}
      id="shelter-receipt"
    >
      <ShelterReceipt />
    </div>
    <Footer />
  </div>
);

export default ReceiptPage;
