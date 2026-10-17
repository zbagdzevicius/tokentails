import { FirebaseAuthProvider, useFirebaseAuth } from "@/context/FirebaseAuthContext";
import {
  isAllowedGameOrigin,
  isAuthRequest,
  safeReturnUrl,
  sessionMessage,
  tokenMessage,
} from "@/lib/badcatBridge";
import { getAuth } from "firebase/auth";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef } from "react";

/**
 * `/badcat-account` (Bad Cat Daily accounts, GDD 10 Phase 2; `lib/badcatBridge.ts`).
 *
 * - `?bridge=1&origin=<game origin>`: loaded by the game in a hidden iframe. It reports the session and answers
 *   `getToken` requests with a fresh Firebase ID token (`fb`-prefixed), only to an allowed origin. It never creates
 *   a session (auth mode `optional`).
 * - `?return=<game url>`: the visible sign-in step. It opens the usual account sheet, then sends the player back to
 *   the game (only to a /badcat page on an allowed origin).
 *
 * The game only uses this when its own VITE_BADCAT_ONLINE flag and the backend's BADCAT_ACCOUNTS_ENABLED are on.
 */

const dev = process.env.NODE_ENV !== "production";

function Bridge({ origin }: { origin: string }) {
  const { authStatus, authSettled, user, signOut } = useFirebaseAuth();
  const self = typeof window !== "undefined" ? window.location.origin : "";
  const allowed = isAllowedGameOrigin(origin, self, dev);

  useEffect(() => {
    if (!allowed || !authSettled || typeof window === "undefined" || window.parent === window) return;
    const signedIn = !!user && !user.isAnonymous && authStatus === "ready";
    window.parent.postMessage(sessionMessage(signedIn, authStatus === "guest", !!user?.emailVerified), origin);
  }, [allowed, authSettled, authStatus, user, origin]);

  useEffect(() => {
    if (!allowed || typeof window === "undefined") return;
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent || !isAuthRequest(event.data)) return;
      const req = event.data;
      if (req.type === "getToken") {
        let token: string | null = null;
        try {
          token = (await getAuth().currentUser?.getIdToken()) ?? null;
        } catch {
          token = null;
        }
        window.parent.postMessage(tokenMessage(req.id, token), origin);
      } else if (req.type === "signOut") {
        await signOut().catch(() => undefined);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowed, origin, signOut]);

  return null;
}

function SignIn({ returnTo }: { returnTo: string }) {
  const { authStatus, authSettled, user, requireAccount } = useFirebaseAuth();
  // The sheet opens once per page view (a ref, not state: nothing re-renders for it).
  const asked = useRef(false);
  const signedIn = !!user && !user.isAnonymous && authStatus === "ready";

  useEffect(() => {
    if (signedIn) window.location.replace(returnTo);
  }, [signedIn, returnTo]);

  useEffect(() => {
    if (!authSettled || signedIn || asked.current) return;
    asked.current = true;
    void requireAccount("save-progress").then((result) => {
      if (result === "dismissed") window.location.replace(returnTo);
    });
  }, [authSettled, signedIn, requireAccount, returnTo]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Bad Cat Daily</h1>
        <p style={{ opacity: 0.8 }}>Sign in to put your ranked runs on the daily board.</p>
        <p>
          <a href={returnTo}>Back to the game</a>
        </p>
      </div>
    </div>
  );
}

export default function BadcatAccountPage() {
  const router = useRouter();
  const ready = router.isReady;
  const bridge = router.query.bridge === "1";
  const origin = typeof router.query.origin === "string" ? router.query.origin : "";
  const rawReturn = typeof router.query.return === "string" ? router.query.return : "";
  const returnTo = useMemo(
    () => (typeof window === "undefined" ? "/badcat" : safeReturnUrl(rawReturn, window.location.origin, dev)),
    [rawReturn]
  );

  return (
    <FirebaseAuthProvider authMode="optional">
      <Head>
        <title>Bad Cat Daily account</title>
        <meta name="robots" content="noindex" />
      </Head>
      {!ready ? null : bridge ? <Bridge origin={origin} /> : <SignIn returnTo={returnTo} />}
    </FirebaseAuthProvider>
  );
}
