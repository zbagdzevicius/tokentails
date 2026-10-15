import { SeoHead } from "@/components/seo/SeoHead";
import { swordcatEnabled } from "@/components/swordcat/flags";
import { SwordcatHost } from "@/components/swordcat/SwordcatHost";
<<<<<<< HEAD
<<<<<<< HEAD
import { SWORDCAT_SUBTITLE, SWORDCAT_TITLE } from "@/components/swordcat/title";
=======
>>>>>>> b76f405ff (feat(swordcat): /swordcat embeds Pink Paw Knight behind NEXT_PUBLIC_SWORDCAT (default off))
=======
import { SWORDCAT_SUBTITLE, SWORDCAT_TITLE } from "@/components/swordcat/title";
>>>>>>> 8f58572a0 (feat(swordcat): Token Tails edition title, host and embed copy update)
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { useRouter } from "next/router";
import { useEffect } from "react";

/** `/swordcat` meta. `noindex` while the page is behind its flag (it is also left out of the sitemap). */
export const SWORDCAT_SEO = Object.freeze({
<<<<<<< HEAD
<<<<<<< HEAD
  title: `${SWORDCAT_TITLE} - Token Tails`,
  description: `Rescue lost kittens with a tiny knight with a pink bow. ${SWORDCAT_SUBTITLE}.`,
=======
  title: "Pink Paw Knight - Token Tails",
  description: "Rescue lost kittens with a tiny knight with a pink bow. A Token Tails adventure.",
>>>>>>> b76f405ff (feat(swordcat): /swordcat embeds Pink Paw Knight behind NEXT_PUBLIC_SWORDCAT (default off))
=======
  title: `${SWORDCAT_TITLE} - Token Tails`,
  description: `Rescue lost kittens with a tiny knight with a pink bow. ${SWORDCAT_SUBTITLE}.`,
>>>>>>> 8f58572a0 (feat(swordcat): Token Tails edition title, host and embed copy update)
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
<<<<<<< HEAD
<<<<<<< HEAD
 * `/swordcat` (Swordcat plan §5.1): the founder's three.js game (`SWORDCAT_TITLE`), in the Token Tails
 * shell. On by default; `NEXT_PUBLIC_SWORDCAT=0` (or false/no/off) is the kill switch. Auth is `optional`: an existing session is
<<<<<<< HEAD
=======
 * `/swordcat` (Swordcat plan §5.1): Pink Paw Knight, the founder's three.js game, in the Token Tails
=======
 * `/swordcat` (Swordcat plan §5.1): the founder's three.js game (`SWORDCAT_TITLE`), in the Token Tails
>>>>>>> 8f58572a0 (feat(swordcat): Token Tails edition title, host and embed copy update)
 * shell. Behind `NEXT_PUBLIC_SWORDCAT` (default off). Auth is `optional`: an existing session is
>>>>>>> b76f405ff (feat(swordcat): /swordcat embeds Pink Paw Knight behind NEXT_PUBLIC_SWORDCAT (default off))
=======
>>>>>>> 1208e29e9 (feat(swordcat): Pink Paw Knight on by default; env flags are kill switches only)
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
