import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  type Auth,
  type AuthCredential,
  type User,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  OAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { authErrorCode, isAuthCancel, mapNativeAuthError } from "./authErrors";

/**
 * Sign-in and account linking (plan G1, G9). Linking keeps the anonymous uid, so the guest
 * document, its scores and its starter stay the same backend document:
 *
 * - web: `linkWithPopup` on the anonymous user;
 * - native: the Capacitor plugin with `skipNativeAuth`, then `linkWithCredential`, built exactly
 *   like the old `nativeGoogleSignIn` / `nativeAppleSignIn`;
 * - email: `EmailAuthProvider.credential`, then a verification email.
 *
 * When the Google, Apple or email identity already belongs to an account
 * (`credential-already-in-use`, `email-already-in-use`), the guest's ID token is captured first,
 * the player is signed in to that account, and the caller runs `POST /user/guest/merge`.
 * No `fetchSignInMethodsForEmail` (it leaks whether an account exists).
 */

export type OAuthProviderName = "google" | "apple";

export type AuthOutcome =
  /** Signed in, or the anonymous user was linked (same uid). */
  | { kind: "done"; linked: boolean; provider: OAuthProviderName | "email" }
  /** Signed in to an existing account; merge the guest named by `guestToken` into it. */
  | { kind: "merge"; guestToken: string; provider: OAuthProviderName | "email" }
  /**
   * The email already has an account with another sign-in method. Keep `pending` in memory, sign
   * in the original way, then `linkPendingCredential`. `guestToken` is merged afterwards if set.
   */
  | {
      kind: "link-account";
      pending: AuthCredential;
      provider: OAuthProviderName;
      email: string | null;
      guestToken: string | null;
    }
  /**
   * An email account was created or linked. `justSent`: the verification email went out now (the
   * verify state starts on its resend cooldown); otherwise "Resend" is available at once.
   */
  | { kind: "verify"; email: string; justSent: boolean }
  | { kind: "cancelled" }
  | { kind: "error"; error: unknown; native?: boolean };

const IN_USE = new Set(["auth/credential-already-in-use", "auth/email-already-in-use"]);
const EXISTS_OTHER = "auth/account-exists-with-different-credential";

export function oauthProvider(name: OAuthProviderName): GoogleAuthProvider | OAuthProvider {
  if (name === "google") return new GoogleAuthProvider();
  const apple = new OAuthProvider("apple.com");
  apple.addScope("email");
  apple.addScope("name");
  return apple;
}

function credentialFromError(name: OAuthProviderName, error: unknown): AuthCredential | null {
  try {
    const credential =
      name === "google"
        ? GoogleAuthProvider.credentialFromError(error as never)
        : OAuthProvider.credentialFromError(error as never);
    return credential ?? null;
  } catch {
    return null;
  }
}

function errorEmail(error: unknown): string | null {
  const email = (error as { customData?: { email?: unknown } } | null)?.customData?.email;
  return typeof email === "string" ? email : null;
}

/** The anonymous user's ID token (raw, without the `fb` prefix), or null. */
async function guestTokenOf(user: User | null): Promise<string | null> {
  if (!user?.isAnonymous) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * The identity already belongs to an account: capture the guest token, sign in to that account
 * with `credential`, and ask the caller to merge.
 */
async function signInToExisting(
  auth: Auth,
  name: OAuthProviderName,
  credential: AuthCredential,
  guest: User | null
): Promise<AuthOutcome> {
  const guestToken = await guestTokenOf(guest);
  try {
    await signInWithCredential(auth, credential);
    return guestToken ? { kind: "merge", guestToken, provider: name } : { kind: "done", linked: false, provider: name };
  } catch (error) {
    if (authErrorCode(error) === EXISTS_OTHER) {
      return {
        kind: "link-account",
        pending: credentialFromError(name, error) ?? credential,
        provider: name,
        email: errorEmail(error),
        guestToken,
      };
    }
    return { kind: "error", error };
  }
}

async function afterOAuthError(
  auth: Auth,
  name: OAuthProviderName,
  error: unknown,
  guest: User | null,
  fallbackCredential: AuthCredential | null,
  native: boolean
): Promise<AuthOutcome> {
  if (native ? mapNativeAuthError(error) === null : isAuthCancel(error)) return { kind: "cancelled" };
  const code = authErrorCode(error);
  if (guest?.isAnonymous && IN_USE.has(code)) {
    const credential = credentialFromError(name, error) ?? fallbackCredential;
    if (credential) return signInToExisting(auth, name, credential, guest);
  }
  if (code === EXISTS_OTHER) {
    const pending = credentialFromError(name, error) ?? fallbackCredential;
    if (pending) {
      return {
        kind: "link-account",
        pending,
        provider: name,
        email: errorEmail(error),
        guestToken: await guestTokenOf(guest),
      };
    }
  }
  return { kind: "error", error, native };
}

async function nativeCredential(name: OAuthProviderName): Promise<AuthCredential> {
  if (name === "google") {
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    return GoogleAuthProvider.credential(result?.credential?.idToken);
  }
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
  return new OAuthProvider("apple.com").credential({
    idToken: result?.credential?.idToken,
    rawNonce: result?.credential?.nonce,
  });
}

async function nativeOAuth(auth: Auth, name: OAuthProviderName): Promise<AuthOutcome> {
  const guest = auth.currentUser;
  let credential: AuthCredential | null = null;
  try {
    credential = await nativeCredential(name);
    if (guest?.isAnonymous) {
      await linkWithCredential(guest, credential);
      return { kind: "done", linked: true, provider: name };
    }
    await signInWithCredential(auth, credential);
    return { kind: "done", linked: false, provider: name };
  } catch (error) {
    return afterOAuthError(auth, name, error, guest, credential, true);
  }
}

/**
 * Google or Apple. On the web the popup is opened SYNCHRONOUSLY, before anything is awaited, so
 * Safari and iOS treat it as part of the tap and do not block it. Call it straight from the click
 * handler.
 */
export function startOAuth(auth: Auth, name: OAuthProviderName, native: boolean): Promise<AuthOutcome> {
  if (native) return nativeOAuth(auth, name);
  const guest = auth.currentUser;
  const provider = oauthProvider(name);
  const popup = guest?.isAnonymous ? linkWithPopup(guest, provider) : signInWithPopup(auth, provider);
  return popup.then(
    (): AuthOutcome => ({ kind: "done", linked: !!guest?.isAnonymous, provider: name }),
    (error) => afterOAuthError(auth, name, error, guest, null, false)
  );
}

/**
 * Create account (the explicit tab; the old auto-create on `auth/user-not-found` is gone). A guest
 * links the email credential and keeps its uid; anyone else gets a new user. Either way a
 * verification email goes out and the backend refuses the account until it is verified.
 */
export async function createEmailAccount(auth: Auth, email: string, password: string): Promise<AuthOutcome> {
  const guest = auth.currentUser;
  try {
    const user = guest?.isAnonymous
      ? (await linkWithCredential(guest, EmailAuthProvider.credential(email, password))).user
      : (await createUserWithEmailAndPassword(auth, email, password)).user;
    let justSent = false;
    try {
      await sendEmailVerification(user);
      justSent = true;
    } catch {
      // The verify state offers "Resend" at once; the account itself exists.
    }
    return { kind: "verify", email, justSent };
  } catch (error) {
    if (guest?.isAnonymous && IN_USE.has(authErrorCode(error))) {
      // Maybe it is the player's own account: try the same email and password once.
      const guestToken = await guestTokenOf(guest);
      try {
        await signInWithEmailAndPassword(auth, email, password);
        return guestToken
          ? { kind: "merge", guestToken, provider: "email" }
          : { kind: "done", linked: false, provider: "email" };
      } catch {
        return { kind: "error", error: { code: "auth/email-already-in-use" } };
      }
    }
    return { kind: "error", error };
  }
}

/** Email sign-in. A guest's token is captured first so its progress can be merged. */
export async function signInWithEmail(auth: Auth, email: string, password: string): Promise<AuthOutcome> {
  const guestToken = await guestTokenOf(auth.currentUser);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return guestToken
      ? { kind: "merge", guestToken, provider: "email" }
      : { kind: "done", linked: false, provider: "email" };
  } catch (error) {
    return { kind: "error", error };
  }
}

/** After `link-account`: the player signed in the original way; attach the pending credential. */
export async function linkPendingCredential(auth: Auth, pending: AuthCredential): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await linkWithCredential(user, pending);
    return true;
  } catch {
    return false;
  }
}

export function sendReset(auth: Auth, email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export async function resendVerification(auth: Auth): Promise<void> {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

/** Reloads the user; when the email is now verified, refreshes the token so it says so. */
export async function refreshVerified(auth: Auth): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}
