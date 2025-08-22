import Stats from "@/components/stats/Stats";
import { bgStyle, cdnFile } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import Head from "next/head";

const Airdrop = () => {
  return (
    <div>
      <Head>
        <title>Token Tails - Stats</title>
        <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
        <meta
          property="og:title"
          content="Token Tails - Play to Save"
          key="title"
        />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <link rel="shortcut icon" href={cdnFile("logo/coin.webp")} />
      </Head>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center"
        style={bgStyle("6")}
        id="stats"
      >
        <Stats />
      </div>

      <Footer />
    </div>
  );
};

export default Airdrop;
