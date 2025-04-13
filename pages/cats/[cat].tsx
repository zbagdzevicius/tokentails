import { CAT_API } from "@/api/cat-api";
import { MarketplaceItemDetails } from "@/components/marketplace/MarketplaceItemDetails";
import { MarketplaceItems } from "@/components/marketplace/MarketplaceItems";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { getAppStaticProps } from "@/constants/props-functions";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import { ICat } from "@/models/cats";

interface Props {
  cat: ICat | null;
}

export default function CatPage({ cat }: Props) {
  return (
    <div>
      <Header />
      <div
        className="pt-20 md:pt-24 fade-in min-h-screen relative flex flex-col items-center justify-center pb-16"
        style={{
          background: "url(/backgrounds/bg-night.gif)",
          backgroundAttachment: "fixed",
          backgroundSize: "cover",
          backgroundPosition: "bottom",
        }}
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
