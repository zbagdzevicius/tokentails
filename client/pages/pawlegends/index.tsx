import { pawlegendsEnabled, PAWLEGENDS_EXIT_PATH } from "@/components/pawlegends/flags";
import { PawlegendsHost } from "@/components/pawlegends/PawlegendsHost";
import { PAWLEGENDS_SUBTITLE, PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { useRouter } from "next/router";
import { useEffect } from "react";

/** `/pawlegends` meta. `noindex` until the trademark search passes (POC.md §11.4); left out of the sitemap. */
export const PAWLEGENDS_SEO = Object.freeze({
  title: `${PAWLEGENDS_TITLE} - Token Tails`,
  description: `${PAWLEGENDS_SUBTITLE}. Nine-minute matches in your browser, no download.`,
  path: "/pawlegends",
});

/** Kill switch on: a client-side redirect to the lobby (no `getServerSideProps`, so the app export works). */
const BackToGame = () => {
  const router = useRouter();
  useEffect(() => {
    void router.replace(PAWLEGENDS_EXIT_PATH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/**
 * `/pawlegends` (POC.md §11.4): the Pawlegends three.js build in the Token Tails shell, a copy of `/swordcat`.
 * On by default; `NEXT_PUBLIC_PAWLEGENDS=0` (or false/no/off) is the kill switch. Auth is `optional`: an
 * existing session is reused, none is created; the game only learns whether the player is signed in.
 */
export default function PawlegendsPage() {
  if (!pawlegendsEnabled()) return <BackToGame />;
  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead {...PAWLEGENDS_SEO} noindex />
      <PawlegendsHost />
    </FirebaseAuthProvider>
  );
}
