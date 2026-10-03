import { SeoHead } from "@/components/seo/SeoHead";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";

// Reads a public RPC with fetch and BigInt; render it in the browser only.
const ShelterReceipt = dynamic(() => import("@/components/shelter-payouts/ShelterReceipt"), {
  ssr: false,
});

const ReceiptPage = () => (
  <div className="bg-tt-night-900">
    {/* One page per donation (its id is in the query), so it stays out of search results. */}
    <SeoHead
      title="Token Tails - Rescue receipt"
      description="A shelter donation, read straight from the chain."
      noindex
    />
    <Header />
    <div className="fade-in min-h-screen relative flex flex-col items-center" id="shelter-receipt">
      <ShelterReceipt />
    </div>
    <Footer tone="night" />
  </div>
);

export default ReceiptPage;
