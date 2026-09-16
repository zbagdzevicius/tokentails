import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

// Static-export fallback for legacy /gaming links. On Node hosting the
// redirect in next.config.js runs first and this page is never served.
export default function GamingRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Keep ?ref=<id> and any hash so legacy referral links still work.
    router.replace({
      pathname: "/",
      query: router.query,
      hash: window.location.hash,
    });
  }, [router]);

  return (
    <Head>
      <meta name="robots" content="noindex" />
      <meta httpEquiv="refresh" content="0;url=/" />
    </Head>
  );
}
