import { SeoHead } from "@/components/seo/SeoHead";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Reads public RPCs with fetch and BigInt; render it in the browser only.
const ShelterPayouts = dynamic(
  () => import("@/components/shelter-payouts/ShelterPayouts"),
  { ssr: false }
);

/** `?embed=1`: the page sits in a modal iframe (e.g. inside Catnip Heist), without site chrome. */
const isEmbedSearch = (search: string) => new URLSearchParams(search).get("embed") === "1";

/**
 * `?embed=1` drops the site header and footer so the page can sit in a modal iframe. The query is
 * read after mount, so the server HTML and the first client render match.
 */
const ShelterPayoutsPage = () => {
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    // Read the query after mount to keep SSR output hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmbed(isEmbedSearch(window.location.search));
  }, []);
  const chrome = !embed;
  return (
    <div className="bg-tt-night-900">
      <SeoHead
        title="Token Tails - Shelter Payouts"
        description="Every Token Tails payout to cat shelters, read live from the chain."
        path="/shelter-payouts"
      />
      {chrome && <Header />}
      <div className="fade-in min-h-screen relative flex flex-col items-center" id="shelter-payouts">
        <ShelterPayouts embed={embed} />
      </div>
      {chrome && <Footer tone="night" />}
    </div>
  );
};

export default ShelterPayoutsPage;
