import { isAppBuild } from "@/components/claims/build";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";

// Reads the session token and the router query; render it in the browser only.
const GiveTreat = dynamic(() => import("@/components/shelter-payouts/GiveTreat"), {
  ssr: false,
});

const isApp = isAppBuild();
// claim: C-004, L-rail (the treat size and the rail it travels on). App builds name no coin or chain.
const DESCRIPTION = isApp
  ? "Tap and Token Tails sends a cat shelter a small treat."
  : "Tap and Token Tails sends a cat shelter a small stablecoin treat (USDC, USDC.e or USDG, by network), split on-chain by ShelterSplit.";

const GivePage = () => (
  <div className="bg-tt-night-900">
    <SeoHead
      title="Token Tails - Send a rescue treat"
      description={DESCRIPTION}
      path="/shelter-payouts/give"
    />
    <Header />
    <div className="fade-in min-h-screen relative flex flex-col items-center" id="shelter-give">
      <FirebaseAuthProvider authMode="optional">
        <GiveTreat />
      </FirebaseAuthProvider>
    </div>
    <Footer tone="night" />
  </div>
);

export default GivePage;
