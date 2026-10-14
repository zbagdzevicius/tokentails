import { SeoHead } from "@/components/seo/SeoHead";
import { swordcatEnabled } from "@/components/swordcat/flags";
import { SwordcatHost } from "@/components/swordcat/SwordcatHost";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { useRouter } from "next/router";
import { useEffect } from "react";

/** `/swordcat` meta. `noindex` while the page is behind its flag (it is also left out of the sitemap). */
export const SWORDCAT_SEO = Object.freeze({
  title: "Pink Paw Knight - Token Tails",
  description: "Rescue lost kittens with a tiny knight with a pink bow. A Token Tails adventure.",
  path: "/swordcat",
});

/** Flag off: a client-side redirect to the lobby (no `getServerSideProps`, so the app export works). */
const BackToGame = () => {
  const router = useRouter();
  useEffect(() => {
    void router.replace("/game");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/**
 * `/swordcat` (Swordcat plan §5.1): Pink Paw Knight, the founder's three.js game, in the Token Tails
 * shell. Behind `NEXT_PUBLIC_SWORDCAT` (default off). Auth is `optional`: an existing session is
 * reused, none is created; the game only learns whether the player is signed in.
 */
export default function SwordcatPage() {
  if (!swordcatEnabled()) return <BackToGame />;
  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead {...SWORDCAT_SEO} noindex />
      <SwordcatHost />
    </FirebaseAuthProvider>
  );
}
