import { CAT_API } from "@/api/cat-api";
import { MarketplaceItemDetails } from "@/components/marketplace/MarketplaceItemDetails";
import { getAppStaticProps } from "@/constants/props-functions";
import { bgStyle } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import { ICat } from "@/models/cats";
import dynamic from "next/dynamic";

const Web3Providers = dynamic(
  () => import("@/components/web3/Web3Providers").then((mod) => mod.Web3Providers),
  { ssr: false },
);

interface Props {
  cat: ICat | null;
}

export default function CatPage({ cat }: Props) {
  return (
    <div>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center pb-16"
        style={bgStyle("6")}
        id="social-farming-results"
      >
        <Web3Providers>
          {cat && <MarketplaceItemDetails cat={cat} />}
        </Web3Providers>
      </div>

      <Footer />
    </div>
  );
}

async function fetchProps(slug: string): Promise<Props> {
  const cat = await CAT_API.cat(slug);

  return { cat };
}

export const getStaticProps = async (params: any) =>
  getAppStaticProps<Promise<Props>>(() => fetchProps(params.params.cat));

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: "blocking",
  };
}
