import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Capacitor } from "@capacitor/core";
import { type Auth, onIdTokenChanged, signInAnonymously, signOut } from "firebase/auth";
import type { AuthUserSnapshot } from "./types";

/**
 * The few Firebase calls the auth runtime makes on every page, behind one interface so Playwright
 * can swap in a fake (the E2E hook below). Linking and the sign-in methods talk to Firebase
 * directly (`link.ts`).
 */
export interface AdapterUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  emailVerified: boolean;
  providerData: ReadonlyArray<{ providerId: string }>;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export interface AuthAdapter {
  /** Fires on sign-in, sign-out, token refresh and account linking (`onIdTokenChanged`). */
  subscribe(listener: (user: AdapterUser | null) => void): () => void;
  current(): AdapterUser | null;
  signInAnonymously(): Promise<void>;
  signOut(): Promise<void>;
  /** True for the Playwright fake. */
  readonly isTestDouble?: boolean;
}

export function snapshotOf(user: AdapterUser): AuthUserSnapshot {
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    email: user.email,
    emailVerified: user.emailVerified,
    providers: (user.providerData || []).map((info) => info.providerId).filter(Boolean),
  };
}

export function sameSnapshot(a: AuthUserSnapshot | null, b: AuthUserSnapshot | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.uid === b.uid &&
    a.isAnonymous === b.isAnonymous &&
    a.email === b.email &&
    a.emailVerified === b.emailVerified &&
    a.providers.join(",") === b.providers.join(",")
  );
}

export function firebaseAdapter(auth: Auth): AuthAdapter {
  return {
    subscribe: (listener) => onIdTokenChanged(auth, listener),
    current: () => auth.currentUser,
    signInAnonymously: async () => {
      await signInAnonymously(auth);
    },
    signOut: async () => {
      if (Capacitor.isNativePlatform()) {
        // The native layer holds its own Google/Apple session; the web SDK holds the Firebase one.
        await FirebaseAuthentication.signOut().catch(() => undefined);
      }
      await signOut(auth);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Playwright hook (plan G1 acceptance). Active only in development builds, or in a build made with
// NEXT_PUBLIC_E2E=1, and only when the test sets `window.__TT_E2E_AUTH__` before the page loads.
// It fakes the Firebase client only; every backend call is still a real request (Playwright mocks
// them with page.route). There is no server-side bypass.
// ---------------------------------------------------------------------------------------------

export const E2E_AUTH_FLAG = "__TT_E2E_AUTH__";
export const E2E_AUTH_CONTROL = "__ttE2EAuth";

export interface E2EAuthConfig {
  /** What `signInAnonymously` does. Default `ok`. */
  anonymous?: "ok" | "fail";
  /** A user already signed in when the page loads. */
  user?: Partial<Omit<AdapterUser, "getIdToken" | "providerData">> & { providers?: string[] };
  /** Delay before the first auth report, in ms. */
  delayMs?: number;
}

export interface E2EAuthControl {
  /** Signs the fake in as a registered (or given) user; the token becomes `fbe2e.<uid>.user`. */
  signIn(user?: E2EAuthConfig["user"]): void;
  signOut(): void;
  current(): AuthUserSnapshot | null;
  anonymousCalls(): number;
}

export function e2eAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E === "1";
}

export function readE2EAuthConfig(): E2EAuthConfig | null {
  if (typeof window === "undefined" || !e2eAuthAllowed()) return null;
  const config = (window as unknown as Record<string, unknown>)[E2E_AUTH_FLAG];
  return config && typeof config === "object" ? (config as E2EAuthConfig) : null;
}

let counter = 0;

function fakeUser(input: E2EAuthConfig["user"] & { uid?: string }): AdapterUser {
  const uid = input?.uid || `e2e-${++counter}`;
  const isAnonymous = input?.isAnonymous ?? false;
  return {
    uid,
    isAnonymous,
    email: input?.email ?? (isAnonymous ? null : `${uid}@e2e.invalid`),
    emailVerified: input?.emailVerified ?? !isAnonymous,
    providerData: (input?.providers ?? (isAnonymous ? [] : ["google.com"])).map((providerId) => ({ providerId })),
    getIdToken: async () => `e2e.${uid}.${isAnonymous ? "anon" : "user"}`,
  };
}

export function e2eAdapter(config: E2EAuthConfig): AuthAdapter {
  const listeners = new Set<(user: AdapterUser | null) => void>();
  let user: AdapterUser | null = config.user ? fakeUser(config.user) : null;
  let anonymousCalls = 0;
  const emit = () => listeners.forEach((listener) => listener(user));

  const control: E2EAuthControl = {
    signIn(next) {
      user = fakeUser({ isAnonymous: false, ...(next || {}), uid: next?.uid || user?.uid });
      emit();
    },
    signOut() {
      user = null;
      emit();
    },
    current: () => (user ? snapshotOf(user) : null),
    anonymousCalls: () => anonymousCalls,
  };
  (window as unknown as Record<string, unknown>)[E2E_AUTH_CONTROL] = control;

  return {
    isTestDouble: true,
    subscribe(listener) {
      listeners.add(listener);
      const timer = setTimeout(() => listener(user), config.delayMs ?? 0);
      return () => {
        clearTimeout(timer);
        listeners.delete(listener);
      };
    },
    current: () => user,
    async signInAnonymously() {
      anonymousCalls += 1;
      if (config.anonymous === "fail") {
        throw Object.assign(new Error("Anonymous sign-in is off (E2E)"), { code: "auth/admin-restricted-operation" });
      }
      user = fakeUser({ isAnonymous: true });
      emit();
    },
    async signOut() {
      user = null;
      emit();
    },
  };
}
