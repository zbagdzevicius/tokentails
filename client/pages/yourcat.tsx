import { SeoHead } from "@/components/seo/SeoHead";
import { SKY_SRC } from "@/components/yourcat/Stage";
import { YourCatPage } from "@/components/yourcat/YourCatPage";
import { YourcatHeader } from "@/components/yourcat/YourcatHeader";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import Head from "next/head";

/**
 * `/yourcat` meta (bet #3, docs/plans/yourcat-polish.md §9.4): the B9 title separator and the page's
 * own 1200 x 630 card (`public/yourcat/og.jpg`).
 */
export const YOURCAT_SEO = Object.freeze({
  title: "Turn your cat into a pixel cat - Token Tails",
  description: "Upload one photo of your cat and play as it in Token Tails. Free pixel portrait and share card.",
  path: "/yourcat",
  image: Object.freeze({
    url: "/yourcat/og.jpg",
    width: 1200,
    height: 630,
    alt: "A pixel cat steps out of a gold frame on a glowing altar. Your cat, in the game.",
  }),
});

/**
 * `/yourcat`: one photo of your cat becomes your playable pixel cat. Auth is `guest`, so a first-time
 * visitor gets a silent anonymous identity. No `getServerSideProps` or API routes: the page also ships
 * in the app export (where it shows the "works in your browser" notice). Its own header with the
 * canonical lockup (`YourcatHeader`), not the shared one. The wrapper fills the screen, so the footer
 * always starts below the fold and its movement never counts as a layout shift (polish §3). The head
 * preloads the stage's sky (`SKY_SRC`, R2-10).
 */
export default function YourcatRoute() {
  return (
    <FirebaseAuthProvider authMode="guest">
      <SeoHead {...YOURCAT_SEO} image={{ ...YOURCAT_SEO.image }} />
      <Head>
        {/* The painted sky (31 KB) behind the stage and, from md up, the whole studio: fetched with the
            HTML, so it is decoded before the first paint settles (R2-10). The H1 stays the LCP element. */}
        <link key="yc-sky" rel="preload" as="image" type="image/webp" href={SKY_SRC} />
      </Head>
      <div className="flex min-h-[100svh] flex-col bg-tt-night-900">
        <YourcatHeader />
        <YourCatPage className="flex-1" />
        <Footer tone="night" />
      </div>
    </FirebaseAuthProvider>
  );
}
