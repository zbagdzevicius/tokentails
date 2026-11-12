import { USER_API } from "@/api/user-api";
import { requestAccountDeletion, signedInWith } from "@/components/shared/ProfileModal";
import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ConfirmAction, DangerZone, ModalButton, ModalSection } from "@/components/ui/modal";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { PAWLEGENDS_CONTACT } from "./flags";
import { PAWLEGENDS_TITLE } from "./title";

/**
 * The Paw Legends account (sign-in): who is signed in and how, Sign out, and Delete account. Shown in the game's
 * host as a sheet (the account chip's "Manage account") and on `/pawlegends/account`, the public account deletion
 * page Google Play's Data safety form links to. Deletion is the Token Tails one (`DELETE /user/me`, the same
 * `requestAccountDeletion` as the profile): it anonymises the account, deletes the sign-in and releases the cats.
 */

export const PAWLEGENDS_ACCOUNT_PATH = "/pawlegends/account";

/** "Signed in with Google and email", or "Signed in". */
export const signedInLine = (providers?: string[]): string => {
  const how = signedInWith(providers);
  return how ? `Signed in ${how.replace(/^With /, "with ")}` : "Signed in";
};

const appleAuthorizationCode = async (): Promise<string | undefined> => {
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
  return result?.credential?.authorizationCode;
};

export const PawlegendsAccountPanel = ({ onDone }: { onDone?: () => void }) => {
  const auth = useOptionalFirebaseAuth();
  const { profile } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);

  if (!auth) return null;
  const user = auth.user;
  const signedIn = !!user && !user.isAnonymous;
  const loading = auth.authStatus === "unknown";
  const ready = auth.authStatus === "ready";
  const name = signedIn && profile && !(profile as { transient?: boolean }).transient ? profile.name ?? null : null;

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    const result = await requestAccountDeletion({
      needsAppleCode: Capacitor.getPlatform() === "ios" && !!user?.providers.includes("apple.com"),
      getAppleCode: appleAuthorizationCode,
      deleteMe: USER_API.deleteMe,
      signOut: auth.signOut,
    });
    setBusy(false);
    if (result.status === "cancelled") return setError("Apple sign-in was cancelled, so your account was not deleted.");
    if (result.status === "error") return setError(result.message);
    setLine("Your account was deleted. You can keep playing without one.");
    onDone?.();
  };

  if (loading) {
    return (
      <p className="font-sans text-p5 text-tt-cream" data-testid="pawlegends-account-loading">
        Checking your sign-in…
      </p>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-4 font-sans text-p5 text-tt-cream" data-testid="pawlegends-account-signed-out">
        {line && (
          <p role="status" className="font-bold" data-testid="pawlegends-account-deleted">
            {line}
          </p>
        )}
        <p>
          {PAWLEGENDS_TITLE} plays without an account. Sign in with Apple, Google or email to keep your wins, unlocks and
          Treat Track on every device, and to play ranked with friends.
        </p>
        <p className="text-p6 opacity-80">
          To delete an account, sign in to it here, then choose Delete account. Or write to{" "}
          <a href={`mailto:${PAWLEGENDS_CONTACT}`} className="font-bold text-tt-gold-400 underline underline-offset-2">
            {PAWLEGENDS_CONTACT}
          </a>{" "}
          from the address on the account.
        </p>
        <ActionRow>
          <ModalButton
            variant="primary"
            icon="user"
            onClick={() => void auth.requireAccount("sign-in")}
            data-testid="pawlegends-account-sign-in"
          >
            SIGN IN
          </ModalButton>
        </ActionRow>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="pawlegends-account">
      <ModalSection title="Account" icon="user">
        <p className="font-sans text-p5 text-tt-cream" data-testid="pawlegends-account-who">
          {name ? <b className="block">{name}</b> : null}
          {signedInLine(user?.providers)}. Your wins save to your account.
        </p>
        <ActionRow>
          <ModalButton
            variant="secondary"
            icon="logout"
            onClick={() => {
              void auth.signOut();
              onDone?.();
            }}
            data-testid="pawlegends-account-sign-out"
          >
            SIGN OUT
          </ModalButton>
        </ActionRow>
      </ModalSection>
      {ready && (
        <DangerZone description="Deletes your sign-in and anonymises your profile. This cannot be undone.">
          {error && (
            <p role="alert" className="border-2 border-tt-rust/70 bg-tt-night-950/60 px-3 py-2 font-sans text-p5 font-semibold text-tt-cream">
              {error}
            </p>
          )}
          <ConfirmAction
            label="DELETE ACCOUNT"
            icon="trash"
            message="Your sign-in is deleted, your profile is anonymised and your cats go back to the shelter pool. This cannot be undone. The game keeps working without an account."
            confirmLabel="DELETE FOREVER"
            cancelLabel="KEEP MY ACCOUNT"
            busy={busy}
            confirmTestId="pawlegends-confirm-delete"
            onCancel={() => setError(null)}
            onConfirm={deleteAccount}
          />
        </DangerZone>
      )}
    </div>
  );
};

/** The host's sheet for the account chip's "Manage account". */
export const PawlegendsAccountSheet = ({ onClose }: { onClose: () => void }) => (
  <GameModal
    open
    onOpenChange={(open) => !open && onClose()}
    title="Your account"
    icon="user"
    size="sm"
    surface="panel"
    name="pawlegends-account"
  >
    <PawlegendsAccountPanel />
  </GameModal>
);

export default PawlegendsAccountSheet;
