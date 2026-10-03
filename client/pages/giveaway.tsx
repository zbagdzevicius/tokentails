import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

// Retired (plan decision #43, G5 P7): the giveaway page sent players to token-era rewards. On Node
// hosting next.config.js redirects /giveaway to /game first; this page covers the static app export.
export default function RetiredGiveawayRedirect() {
  const router = useRouter();

  useEffect(() => {
    void router.replace("/game");
  }, [router]);

  return (
    <Head>
      <meta name="robots" content="noindex" />
      <meta httpEquiv="refresh" content="0;url=/game" />
    </Head>
  );
}
