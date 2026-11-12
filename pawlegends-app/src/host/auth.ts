/**
 * Sign-in in the app (the in-page host): the Firebase JS SDK holds the session, exactly as the Token Tails app does
 * (pawlegends-web/context/FirebaseAuthContext.tsx with `initializeAuth` and IndexedDB persistence). Google and Apple run
 * natively through `@capacitor-firebase/authentication` with `skipNativeAuth`, and their ID token becomes a JS SDK
 * credential (`linkWithCredential` for a guest, so the uid and its progress stay; `signInWithCredential` otherwise).
 * The flows themselves are the web host's own (`pawlegends-web/context/auth/link.ts`), imported, not copied. Email and
 * password run in the JS SDK only.
 *
 * Which native providers this build can use comes from the native shell (`window.__PL_NATIVE_AUTH__`, set at
 * document start by GameViewController.swift and ShellPlugin.java from whether the Firebase config files are in the
 * build) and the platform: Apple on iPhone and Mac, Google on iPhone and Android (not on Mac: GoogleSignIn and the
 * keychain under the Mac App Sandbox are untested), email everywhere. A provider that is not set up is never called:
 * GoogleSignIn throws an Objective-C exception (a crash) without its URL scheme.
 *
 * The guest is a Firebase anonymous user, made lazily the first time the game needs the server (a match save, a
 * party ticket, a pass claim) and only online; offline play never makes one.
 */
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  type AuthCredential,
  indexedDBLocalPersistence,
  initializeAuth,
  onIdTokenChanged,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { FIREBASE_WEB_CONFIG } from "@/context/auth/firebaseConfig";
import {
  createEmailAccount,
  linkPendingCredential,
  refreshVerified,
  resendVerification,
  sendReset,
  signInWithEmail,
  startOAuth,
  type AuthOutcome,
  type OAuthProviderName,
} from "@/context/auth/link";
import { methodFromProviders, readLastMethod, type LastMethodProvider } from "@/context/auth/lastMethod";

export type { AuthOutcome, OAuthProviderName };

export type ShellPlatform = "ios" | "android" | "mac";

/** The native providers this build can call. */
export interface NativeCaps {
  apple: boolean;
  google: boolean;
}

export interface UserSnapshot {
  uid: string;
  isAnonymous: boolean;
  providers: string[];
  email: string | null;
  emailVerified: boolean;
}

/** What the host needs from sign-in (the Firebase implementation below; tests pass a fake). */
export interface AuthPort {
  readonly caps: NativeCaps;
  current(): UserSnapshot | null;
  /** Called on every user or token change (sign-in, sign-out, link, refresh). */
  onChange(listener: () => void): () => void;
  /** `fb` + the current user's ID token, or null with no user. */
  token(): Promise<string | null>;
  /** Makes the anonymous guest when there is no user yet. False offline or when it failed. */
  ensureGuest(online: boolean): Promise<boolean>;
  oauth(name: OAuthProviderName): Promise<AuthOutcome>;
  createEmail(email: string, password: string): Promise<AuthOutcome>;
  signInEmail(email: string, password: string): Promise<AuthOutcome>;
  reset(email: string): Promise<void>;
  resend(): Promise<void>;
  checkVerified(): Promise<boolean>;
  linkPending(pending: AuthCredential): Promise<boolean>;
  signOut(): Promise<void>;
  /** A fresh Sign in with Apple authorization code (account deletion revokes the Apple token with it). */
  appleCode(): Promise<string | undefined>;
}

/** `google`, `apple` or `email` for the account chip, from the user's providers (the last-used one wins). */
export function providerOf(user: UserSnapshot | null): LastMethodProvider | null {
  if (!user || user.isAnonymous) return null;
  return methodFromProviders(user.providers, readLastMethod());
}

/** The platform the shell runs on (`window.__PL_PLATFORM__`; Capacitor's own name for an old Android shell). */
export function platformOf(win: unknown): ShellPlatform {
  const w = win as { __PL_PLATFORM__?: unknown; Capacitor?: { getPlatform?: () => unknown } } | undefined;
  const p = w?.__PL_PLATFORM__;
  if (p === "mac" || p === "android" || p === "ios") return p;
  try {
    if (w?.Capacitor?.getPlatform?.() === "android") return "android";
  } catch {
    /* fall through */
  }
  return "ios";
}

/**
 * The providers this build can call. `__PL_NATIVE_AUTH__ = {apple, google}` comes from the native shell; without it
 * (or without the plugin) only email works. Apple: iPhone and Mac only (Android's Apple flow does not hand the JS SDK
 * a usable credential with `skipNativeAuth`; App Store 4.8 is about iOS). Google: iPhone and Android only.
 */
export function nativeCaps(win: unknown, platform: ShellPlatform, pluginAvailable: boolean): NativeCaps {
  const raw = (win as { __PL_NATIVE_AUTH__?: unknown } | undefined)?.__PL_NATIVE_AUTH__;
  const flags = raw && typeof raw === "object" ? (raw as { apple?: unknown; google?: unknown }) : {};
  return {
    apple: pluginAvailable && platform !== "android" && flags.apple === true,
    google: pluginAvailable && platform !== "mac" && flags.google === true,
  };
}

const notSetUp = (name: OAuthProviderName): AuthOutcome => ({ kind: "error", error: { code: `pl/${name}-not-configured` } });

/** The Firebase JS SDK auth of the app: IndexedDB persistence, no popup resolver (native flows only). */
export function createFirebaseAuth(): Auth {
  const app = getApps().length ? getApp() : initializeApp({ ...FIREBASE_WEB_CONFIG });
  return initializeAuth(app, { persistence: indexedDBLocalPersistence });
}

const snapshotOf = (auth: Auth): UserSnapshot | null => {
  const u = auth.currentUser;
  if (!u) return null;
  return {
    uid: u.uid,
    isAnonymous: u.isAnonymous,
    providers: u.providerData.map((p) => p.providerId).filter(Boolean),
    email: u.email,
    emailVerified: u.emailVerified,
  };
};

export class NativeAuth implements AuthPort {
  private guestTry: Promise<boolean> | null = null;

  constructor(
    private readonly auth: Auth,
    readonly caps: NativeCaps
  ) {}

  current(): UserSnapshot | null {
    return snapshotOf(this.auth);
  }

  onChange(listener: () => void): () => void {
    return onIdTokenChanged(this.auth, () => listener());
  }

  async token(): Promise<string | null> {
    const u = this.auth.currentUser;
    if (!u) return null;
    try {
      return `fb${await u.getIdToken()}`;
    } catch {
      return null;
    }
  }

  ensureGuest(online: boolean): Promise<boolean> {
    if (this.auth.currentUser) return Promise.resolve(true);
    if (!online) return Promise.resolve(false);
    if (!this.guestTry) {
      this.guestTry = signInAnonymously(this.auth).then(
        () => true,
        () => false
      );
      void this.guestTry.finally(() => {
        this.guestTry = null;
      });
    }
    return this.guestTry;
  }

  oauth(name: OAuthProviderName): Promise<AuthOutcome> {
    if (!this.caps[name]) return Promise.resolve(notSetUp(name));
    return startOAuth(this.auth, name, true);
  }

  createEmail(email: string, password: string): Promise<AuthOutcome> {
    return createEmailAccount(this.auth, email, password);
  }

  signInEmail(email: string, password: string): Promise<AuthOutcome> {
    return signInWithEmail(this.auth, email, password);
  }

  reset(email: string): Promise<void> {
    return sendReset(this.auth, email);
  }

  resend(): Promise<void> {
    return resendVerification(this.auth);
  }

  checkVerified(): Promise<boolean> {
    return refreshVerified(this.auth);
  }

  linkPending(pending: AuthCredential): Promise<boolean> {
    return linkPendingCredential(this.auth, pending);
  }

  async signOut(): Promise<void> {
    // the native side keeps its own Google session (the next Google tap would pick the same account silently)
    if (this.caps.google || this.caps.apple) await FirebaseAuthentication.signOut().catch(() => undefined);
    await signOut(this.auth);
  }

  async appleCode(): Promise<string | undefined> {
    if (!this.caps.apple) return undefined;
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    return result?.credential?.authorizationCode;
  }
}
