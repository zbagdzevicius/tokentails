import { isAppBuild } from "@/components/claims/build";
import { SeoHead } from "@/components/seo/SeoHead";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";

// Talks to the shelter's browser wallet (EIP-1193); render it in the browser only.
const ShelterOnboard = dynamic(() => import("@/components/shelter-payouts/ShelterOnboard"), {
  ssr: false,
});

const isApp = isAppBuild();
// App builds name no wallet (R10): the page itself shows the proof notice there.
const TITLE = isApp ? "Token Tails - Shelter handover" : "Token Tails - Shelter wallet handover";
const DESCRIPTION = isApp
  ? "How a shelter takes over its payouts from Token Tails."
  : "How a shelter takes its payout wallet over from Token Tails.";

const OnboardPage = () => (
  <div className="bg-tt-night-900">
    {/* A page for one shelter's handover, not for search. */}
    <SeoHead
      title={TITLE}
      description={DESCRIPTION}
      path="/shelter-payouts/onboard"
      noindex
    />
    <Header />
    <div className="fade-in min-h-screen relative flex flex-col items-center" id="shelter-onboard">
      <ShelterOnboard />
    </div>
    <Footer tone="night" />
  </div>
);

export default OnboardPage;
