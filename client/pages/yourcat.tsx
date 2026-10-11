import { SeoHead } from "@/components/seo/SeoHead";
import { YourCatPage } from "@/components/yourcat/YourCatPage";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { Footer } from "@/layouts/Footer";
import { Header } from "@/layouts/Header";

/** `/yourcat` meta (bet #3, docs/plans/yourcat-v2.md §8 B). The default OG image until a custom one exists. */
export const YOURCAT_SEO = Object.freeze({
  title: "Turn your cat into a pixel cat | Token Tails",
  description: "Upload one photo of your cat and play as it in Token Tails. Free pixel portrait and share card.",
  path: "/yourcat",
});

/**
 * `/yourcat`: one photo of your cat becomes your playable pixel cat. Auth is `guest`, so a first-time
 * visitor gets a silent anonymous identity. No `getServerSideProps` or API routes: the page also ships
 * in the app export (where it shows the "works in your browser" notice).
 */
export default function YourcatRoute() {
  return (
    <FirebaseAuthProvider authMode="guest">
      <SeoHead {...YOURCAT_SEO} />
      <div className="bg-tt-night-900">
        <Header />
        <YourCatPage />
        <Footer tone="night" />
      </div>
    </FirebaseAuthProvider>
  );
}
