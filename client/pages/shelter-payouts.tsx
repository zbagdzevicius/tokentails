import { bgStyle, cdnFile } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";
import Head from "next/head";

// Reads public RPCs with fetch and BigInt; render it in the browser only.
const ShelterPayouts = dynamic(
  () => import("@/components/shelter-payouts/ShelterPayouts"),
  { ssr: false }
);

const ShelterPayoutsPage = () => {
  return (
    <div>
      <Head>
        <title>Token Tails - Shelter Payouts</title>
        <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
        <meta
          property="og:title"
          content="Token Tails - Shelter Payouts"
          key="title"
        />
        <meta
          name="description"
          content="Every Token Tails payout to cat shelters, read live from the chain."
        />
        <link rel="shortcut icon" href={cdnFile("logo/logo.webp")} />
      </Head>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center"
        style={bgStyle("6")}
        id="shelter-payouts"
      >
        <ShelterPayouts />
      </div>
      <Footer />
    </div>
  );
};

export default ShelterPayoutsPage;
