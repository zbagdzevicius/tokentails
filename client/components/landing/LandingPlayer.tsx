import { FirebaseAuthProvider, useFirebaseAuth } from "@/context/FirebaseAuthContext";
import type { SessionProfile } from "@/context/auth/types";
import { useProfile } from "@/context/ProfileContext";
import { useEffect } from "react";
import { playerStateFrom } from "./landingCta";
import type { CrewCtaState } from "./TeamSection";

const Reporter = ({ onChange }: { onChange: (state: CrewCtaState) => void }) => {
  const { authStatus } = useFirebaseAuth();
  const { profile } = useProfile();
  const state = playerStateFrom(authStatus, profile as SessionProfile | null);
  const key = `${state.signedIn}|${state.onboardingState ?? ""}|${state.catName ?? ""}`;
  useEffect(() => {
    onChange(state);
    // `key` captures every field of `state`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onChange]);
  return null;
};

/**
 * Reads the player for the landing through an `optional` auth provider (see `playerStateFrom`).
 * Loaded with `next/dynamic` and `ssr: false` from the landing, and only when this browser has had
 * a session (`hasSessionHint`), so Firebase stays out of the landing's first load, a first-time
 * visitor never loads it, and the server HTML always shows the signed-out labels. `passive`: the
 * landing sends no writes (no guest-merge retry, no stored referral); `/game` runs both.
 */
export default function LandingPlayer({ onChange }: { onChange: (state: CrewCtaState) => void }) {
  return (
    <FirebaseAuthProvider authMode="optional" passive>
      <Reporter onChange={onChange} />
    </FirebaseAuthProvider>
  );
}
