import { HeistHost } from "@/components/heist/HeistHost";
import { HEIST_DESCRIPTION, HEIST_OG_IMAGE, HEIST_TITLE } from "@/components/heist/session";
import { SeoHead } from "@/components/seo/SeoHead";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";

/**
 * `/heist` (plan G2 layer 1): Catnip Heist in the Token Tails shell. The iframe is in the server
 * HTML (the Heist is a static three.js build with no Phaser or Stellar code, so it needs no
 * `next/dynamic`). Auth is `optional`: an existing session is reused, none is created, and the
 * sign-in sheet opens only when the player asks for it.
 */
export default function HeistPage() {
  return (
    <FirebaseAuthProvider authMode="optional">
      <SeoHead title={HEIST_TITLE} description={HEIST_DESCRIPTION} image={HEIST_OG_IMAGE} path="/heist" />
      <HeistHost />
    </FirebaseAuthProvider>
  );
}
