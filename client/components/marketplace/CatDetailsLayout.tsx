import { MarketplaceItemDetails } from "@/components/marketplace/MarketplaceItemDetails";
import { bgStyle } from "@/constants/utils";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import { ICat } from "@/models/cats";
import dynamic from "next/dynamic";

const Web3Providers = dynamic(
  () =>
    import("@/components/web3/Web3Providers").then((mod) => mod.Web3Providers),
  { ssr: false }
);

// Shared by the prerendered web route (/cats/[cat]) and the client route
// the static app export uses (/cats/view?id=).
export const CatDetailsLayout = ({ cat }: { cat: ICat | null }) => {
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
};
