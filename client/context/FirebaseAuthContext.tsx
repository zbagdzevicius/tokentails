import { analytics, buildEvent } from "@/analytics";
import { ApiError, installApiInterceptor, setAuthBridge } from "@/api/api";
import { USER_API } from "@/api/user-api";
import { AuthSheet } from "@/components/shared/auth/AuthSheet";
import { ErrorCode } from "@/shared-contracts/errors";
import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import {
  type AuthCredential,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { useRouter } from "next/router";
import * as React from "react";
import { useCallback } from "react";
import { AccountGate } from "./auth/accountGate";
import {
  type AdapterUser,
  type AuthAdapter,
  e2eAdapter,
  firebaseAdapter,
  readE2EAuthConfig,
  sameSnapshot,
  snapshotOf,
} from "./auth/adapter";
import { getAppCheckToken } from "./auth/appCheck";
import { AUTH_COPY, authErrorCode, mapAuthError, mapNativeAuthError } from "./auth/authErrors";
import { deriveAuthStatus, isAuthReady, isAuthSettled, isRegisteredProfile } from "./auth/authStatus";
import { guestTemplateProfile, withProfileDefaults } from "./auth/guestProfile";
import {
  type AuthOutcome,
  createEmailAccount,
  linkPendingCredential,
  type OAuthProviderName,
  refreshVerified,
  resendVerification,
  sendReset,
  signInWithEmail,
  startOAuth,
} from "./auth/link";
import {
  clearPendingMerge,
  isRetryableMergeError,
  readPendingMerge,
  savePendingMerge,
} from "./auth/pendingMerge";
import { capturePendingRef, sendPendingRefOnPromotion } from "./auth/pendingRef";
import { setSessionHint } from "./auth/sessionHint";
import { currentEnv, isAppleFirst, isInAppBrowser } from "./auth/platform";
import {
  ensureAnonymousOnce,
  ensureGuestSessionOnce,
  markGuestSession,
  resetAnonymous,
} from "./auth/sessions";
import type {
  AccountReason,
  AccountResult,
  AuthMode,
  AuthStatus,
  AuthUserSnapshot,
  FirebasePhase,
  ProfilePhase,
  SessionProfile,
} from "./auth/types";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";

export type { AccountReason, AccountResult, AuthMode, AuthStatus } from "./auth/types";

let reauthInterval: ReturnType<typeof setInterval> | null = null;

/** A profile request that has not answered after this long is a `profile-error` (G9). */
export const PROFILE_TIMEOUT_MS = 20_000;

// Decision #6: the web authDomain moves to tokentails.com behind NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
// (with the /__/auth rewrites from task 3f), verified on a preview first. Unset, and in the
// Capacitor build, it stays on the Firebase default domain.
const firebaseConfig = {
  apiKey: "AIzaSyCfitm6sU-lOunY3JpGdn8D4Ng7Dz5m3yk",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "news-ccd33.firebaseapp.com",
  projectId: "news-ccd33",
  storageBucket: "news-ccd33.appspot.com",
  messagingSenderId: "158850509760",
  appId: "1:158850509760:web:446ea8a11bdddeb616f625",
};

const app = initializeApp(firebaseConfig);
const getFirebaseAuth = () => {
  if (Capacitor.isNativePlatform()) {
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    });
  } else {
    return getAuth(app);
  }
};
const auth = getFirebaseAuth();

/** What the AuthSheet shows (plan G1, G9). */
export type SheetView =
  | { name: "choose" }
  | { name: "email"; tab: "sign-in" | "create"; email?: string; notice?: string }
  /** `justSent`: a verification email went out just now, so "Resend" starts on its cooldown. */
  | { name: "verify-email"; email: string | null; justSent?: boolean }
  | { name: "reset"; email?: string }
  | { name: "link-account"; provider: OAuthProviderName; email: string | null }
  | { name: "linking"; label: string }
  | { name: "busy"; label: string }
  | { name: "profile-error"; timeout?: boolean }
  | { name: "conflict" }
  | { name: "merged"; gamesMoved: number; tailsCredited: number; note?: string }
  | { name: "fallback" };

export type SheetViewName = SheetView["name"];

interface SheetState {
  open: boolean;
  reason: AccountReason;
  view: SheetView;
  /** The view before a busy step, to return to on cancel or error. */
  back: SheetView;
}

const CLOSED_SHEET: SheetState = {
  open: false,
  reason: "save-progress",
  view: { name: "choose" },
  back: { name: "choose" },
};

/** Everything the AuthSheet needs. Internal: features use `useFirebaseAuth()`. */
export interface AuthSheetController {
  sheet: SheetState;
  status: AuthStatus;
  user: AuthUserSnapshot | null;
  mode: AuthMode;
  /** The latest error or notice, shown in the sheet's one `role="alert"` region. */
  message: string | null;
  messageField: "email" | "password" | null;
  dismissible: boolean;
  appleFirst: boolean;
  inAppBrowser: boolean;
  native: boolean;
  setView: (view: SheetView) => void;
  close: () => void;
  oauth: (provider: OAuthProviderName) => void;
  emailSubmit: (tab: "sign-in" | "create", email: string, password: string) => void;
  sendPasswordReset: (email: string) => Promise<void>;
  resend: () => Promise<boolean>;
  checkVerified: (silent?: boolean) => Promise<boolean>;
  retryProfile: () => void;
  retryGuest: () => void;
  signOut: () => Promise<void>;
  clearMessage: () => void;
}

type ContextState = {
  mode: AuthMode;
  user: AuthUserSnapshot | null;
  authStatus: AuthStatus;
  /** The anonymous session (or account) and its profile are ready (the intro lifts, G14). */
  authReady: boolean;
  /** Nothing is loading any more: a page can decide what to show (any final status). */
  authSettled: boolean;
  requireAccount: (reason: AccountReason) => Promise<AccountResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<SessionProfile | null>;
  /** "Erase guest progress" (G1): deletes the guest doc and starts a fresh guest. */
  eraseGuest: () => Promise<boolean>;
  sheetController: AuthSheetController;
};

const FirebaseAuthContext = React.createContext<ContextState | undefined>(undefined);

const isNative = () => Capacitor.isNativePlatform();

function track(event: Parameters<typeof analytics.track>[0]) {
  try {
    analytics.track(event);
  } catch {
    // Analytics never breaks sign-in.
  }
}

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem("accesstoken", `fb${token}`);
    else sessionStorage.removeItem("accesstoken");
  } catch {
    // Storage blocked: requests go out without a token and get 401.
  }
}

/** One merge attempt per guest token, account and verification state, per page. */
function mergeAttemptKey(guestToken: string, user: AuthUserSnapshot | null): string {
  return `${guestToken.slice(-16)}|${user?.uid ?? ""}|${user?.emailVerified ? 1 : 0}`;
}

function readProfileError(error: unknown): ProfilePhase {
  if (error instanceof ApiError) return { phase: "error", status: error.status, code: error.code };
  return { phase: "error", status: null, code: null };
}

/**
 * Firebase auth for one page (plan F5.7).
 *
 * `authMode="guest"` (only `/game`): a silent anonymous sign-in, so the game plays at once; the
 * transient template profile renders before the backend answers; the guest document is created by
 * the first write (`POST /user/guest/session` through the API wrapper). `authMode="optional"`
 * (default): an existing session, anonymous included, is reused, nothing is created, and the
 * sheet opens only through `requireAccount`. `passive` (the landing's read, Task 6b review #5)
 * also skips the two background writes: the pending guest-merge retry and the stored referral.
 *
 * There is no forced sign-in modal any more: the sheet opens for `requireAccount(reason)`, and on
 * `/game` only by itself when a verification is pending, a signed-in profile failed to load, or
 * the anonymous sign-in itself failed (the `fallback` state).
 */
const FirebaseAuthProvider = ({
  children,
  authMode = "optional",
  passive = false,
}: React.PropsWithChildren<{ authMode?: AuthMode; passive?: boolean }>) => {
  const mode = authMode;
  const toast = useToast();
  const { setProfile, setUtils, setShareUrl, setLogout, setIsFB } = useProfile();
  const router = useRouter();

  const adapter = React.useMemo<AuthAdapter>(() => {
    const e2e = readE2EAuthConfig();
    return e2e ? e2eAdapter(e2e) : firebaseAdapter(auth);
  }, []);

  const [fb, setFb] = React.useState<FirebasePhase>({ phase: "pending" });
  const [profileState, setProfileState] = React.useState<ProfilePhase>({ phase: "idle" });
  const [sheet, setSheet] = React.useState<SheetState>(CLOSED_SHEET);
  const [message, setMessage] = React.useState<{ text: string; field: "email" | "password" | null } | null>(null);

  const gate = React.useRef(new AccountGate()).current;
  const seqRef = React.useRef(0);
  const profileUidRef = React.useRef<string | null>(null);
  const pendingLinkRef = React.useRef<{ credential: AuthCredential; guestToken: string | null } | null>(null);
  const fallbackShownRef = React.useRef(false);
  /**
   * True while a sign-in started from the sheet is running (popup, email, merge). Profiles that
   * arrive meanwhile (the user swap fires its own profile load) do not settle `requireAccount`,
   * so the sheet stays open for the `merged` summary; the flow settles it when it ends.
   */
  const flowRef = React.useRef(false);
  const latestProfileRef = React.useRef<{ profile: SessionProfile; seq: number } | null>(null);
  const mergeRunningRef = React.useRef(false);
  const mergeAttemptsRef = React.useRef(new Set<string>());

  const user = fb.phase === "user" ? fb.user : null;
  const authStatus = deriveAuthStatus(mode, fb, profileState);
  const authReady = isAuthReady(authStatus, { mode, firebase: fb });
  const authSettled = isAuthSettled(authStatus);

  const statusRef = React.useRef(authStatus);
  statusRef.current = authStatus;
  const userRef = React.useRef(user);
  userRef.current = user;
  const sheetRef = React.useRef(sheet);
  sheetRef.current = sheet;

  const env = React.useMemo(() => currentEnv(), []);
  const appleFirst = React.useMemo(() => isAppleFirst(env), [env]);
  const inAppBrowser = React.useMemo(() => isInAppBrowser(env), [env]);

  // ---- sheet -----------------------------------------------------------------------------

  const openSheet = useCallback((reason: AccountReason, view: SheetView) => {
    setMessage(null);
    setSheet((current) =>
      current.open
        ? { ...current, view, back: view.name === "busy" || view.name === "linking" ? current.back : view }
        : { open: true, reason, view, back: view }
    );
  }, []);

  const setView = useCallback((view: SheetView) => {
    setSheet((current) => ({
      ...current,
      view,
      back: view.name === "busy" || view.name === "linking" ? current.back : view,
    }));
  }, []);

  const backToForm = useCallback(() => {
    setSheet((current) => ({ ...current, view: current.back }));
  }, []);

  const closeSheet = useCallback(() => {
    setSheet((current) => ({ ...current, open: false }));
    setMessage(null);
    pendingLinkRef.current = null;
    gate.dismiss();
  }, [gate]);

  const showError = useCallback((error: unknown, native = false) => {
    const copy = native ? mapNativeAuthError(error) : mapAuthError(error);
    if (!copy) return false;
    setMessage({ text: copy.message, field: copy.field });
    track(buildEvent("auth_error", { code: authErrorCode(error) || "unknown" }));
    return true;
  }, []);

  // ---- profile ---------------------------------------------------------------------------

  /**
   * Offers the newest profile to the waiting `requireAccount` callers. Signed in: the sheet
   * closes, except while it shows the `merged` summary (its CONTINUE closes it).
   */
  const settleGate = useCallback(() => {
    const latest = latestProfileRef.current;
    if (!latest || flowRef.current) return;
    if (gate.offerProfile(latest.profile, latest.seq)) {
      setSheet((current) => (current.view.name === "merged" ? current : { ...current, open: false }));
    }
  }, [gate]);

  const acceptProfile = useCallback(
    (raw: SessionProfile, seq: number) => {
      const profile = withProfileDefaults(raw);
      setProfileState({ phase: "ready", profile, seq });
      const uid = userRef.current?.uid;
      if (uid && profile.isGuest && !profile.transient) markGuestSession(uid);
      latestProfileRef.current = { profile, seq };
      settleGate();
      if (!passive) void sendPendingRefOnPromotion(profile, (referrerId) => USER_API.referral(referrerId));
      return profile;
    },
    [settleGate, passive]
  );

  const loadProfile = useCallback(async (): Promise<SessionProfile | null> => {
    const current = userRef.current;
    if (!current) return null;
    const seq = ++seqRef.current;
    if (profileUidRef.current !== current.uid) {
      profileUidRef.current = current.uid;
      setProfileState({ phase: "loading" });
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, PROFILE_TIMEOUT_MS);
    try {
      const raw = (await USER_API.profile(controller?.signal)) as SessionProfile;
      if (seq !== seqRef.current) return null; // a newer request owns the state
      return acceptProfile(raw, seq);
    } catch (error) {
      if (seq !== seqRef.current) return null;
      const next = timedOut
        ? ({ phase: "error", status: null, code: null, timeout: true } as ProfilePhase)
        : readProfileError(error);
      setProfileState(next);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }, [acceptProfile]);

  // ---- Firebase user ---------------------------------------------------------------------

  const onUser = useCallback(async (next: AdapterUser | null) => {
    setSessionHint(!!next);
    if (!next) {
      storeToken(null);
      profileUidRef.current = null;
      setFb((current) => (current.phase === "none" ? current : { phase: "none" }));
      setProfileState({ phase: "idle" });
      return;
    }
    try {
      storeToken(await next.getIdToken());
    } catch {
      storeToken(null);
    }
    const snapshot = snapshotOf(next);
    setFb((current) =>
      current.phase === "user" && sameSnapshot(current.user, snapshot) ? current : { phase: "user", user: snapshot }
    );
  }, []);

  React.useEffect(() => {
    const unsubscribe = adapter.subscribe((next) => void onUser(next));
    if (reauthInterval) clearInterval(reauthInterval);
    // Safety net next to the SDK's own refresh: tokens live an hour.
    reauthInterval = setInterval(async () => {
      const current = adapter.current();
      if (!current) return;
      try {
        storeToken(await current.getIdToken(true));
      } catch (error) {
        console.error("Error refreshing token:", error);
      }
    }, 29 * 60 * 1000);
    return () => {
      unsubscribe();
      if (reauthInterval) {
        clearInterval(reauthInterval);
        reauthInterval = null;
      }
    };
  }, [adapter, onUser]);

  // A new or changed user (sign-in, link, verified email): load its profile.
  const userKey = user ? `${user.uid}|${user.isAnonymous}|${user.emailVerified}|${user.email}` : "";
  React.useEffect(() => {
    if (userKey) void loadProfile();
  }, [userKey, loadProfile]);

  // Guest mode: no user means sign in anonymously (once per page; again after a sign-out).
  const needsAnonymous = mode === "guest" && fb.phase === "none" && !fb.anonymousFailed;
  React.useEffect(() => {
    if (!needsAnonymous) return;
    ensureAnonymousOnce(() => adapter.signInAnonymously()).catch((error) => {
      track(buildEvent("auth_error", { code: authErrorCode(error) || "anonymous_failed" }));
      setFb({ phase: "none", anonymousFailed: true });
    });
  }, [needsAnonymous, adapter]);

  // ---- ProfileContext ---------------------------------------------------------------------

  const templateRef = React.useRef<SessionProfile | null>(null);
  React.useEffect(() => {
    if (profileState.phase === "ready") {
      setProfile(profileState.profile);
      return;
    }
    if (mode === "guest" && authStatus !== "ready") {
      // F5.5: the menus and the game render with the template until the backend answers.
      templateRef.current = templateRef.current ?? guestTemplateProfile();
      setProfile(templateRef.current);
      return;
    }
    setProfile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileState, mode]);

  const profileId = profileState.phase === "ready" ? profileState.profile._id : "";
  React.useEffect(() => {
    if (profileId) setShareUrl(`https://tokentails.com/game?ref=${profileId}`);
  }, [profileId, setShareUrl]);

  // Referral (F5.7): `?ref` from this page is stored once; it is sent on promotion only. Once per
  // value per page, so a referrer cleared after sending is not stored again from the same URL.
  const refQuery = router?.query?.ref;
  const capturedRef = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (!refQuery || capturedRef.current === String(refQuery)) return;
    capturedRef.current = String(refQuery);
    capturePendingRef(refQuery);
  }, [refQuery]);

  // ---- requireAccount --------------------------------------------------------------------

  const initialView = useCallback((): SheetView => {
    if (statusRef.current === "needs-verification") {
      return { name: "verify-email", email: userRef.current?.email ?? null, justSent: false };
    }
    return { name: "choose" };
  }, []);

  const requireAccount = useCallback(
    (reason: AccountReason): Promise<AccountResult> => {
      const alreadyOpen = sheetRef.current.open;
      const result = gate.request(reason, seqRef.current);
      const show = () => {
        if (!alreadyOpen) track(buildEvent("auth_sheet_shown", { reason }));
        openSheet(reason, alreadyOpen ? sheetRef.current.view : initialView());
      };
      if (statusRef.current === "ready" || statusRef.current === "loading-profile") {
        // Already an account, or one whose profile is loading: a refreshed profile settles it
        // without showing the sheet; only a result that is not an account opens it.
        void loadProfile().then((profile) => {
          if (gate.pending && !isRegisteredProfile(profile)) show();
        });
      } else {
        show();
      }
      return result;
    },
    [gate, loadProfile, openSheet, initialView]
  );

  // ---- automatic views --------------------------------------------------------------------

  const errorCode = profileState.phase === "error" ? profileState.code : null;
  const errorTimeout = profileState.phase === "error" ? !!profileState.timeout : false;
  React.useEffect(() => {
    const canForce = mode === "guest" || gate.pending;
    const current = sheetRef.current;
    if (mode === "guest" && fb.phase === "none" && fb.anonymousFailed) {
      if (!fallbackShownRef.current) {
        fallbackShownRef.current = true;
        // Not "SAVE YOUR CAT": there is no guest to save yet (decision #64).
        openSheet(gate.reason ?? "sign-in", { name: "fallback" });
      }
      return;
    }
    if (!canForce || !user) return;
    if (authStatus === "needs-verification") {
      if (!current.open || current.view.name !== "verify-email") {
        openSheet(gate.reason ?? "sign-in", { name: "verify-email", email: user.email, justSent: false });
      }
      return;
    }
    if (authStatus === "profile-error") {
      if (errorCode === ErrorCode.ACCOUNT_CONFLICT) {
        if (current.view.name !== "conflict" || !current.open) openSheet(gate.reason ?? "sign-in", { name: "conflict" });
        return;
      }
      // A guest whose profile failed keeps playing on the template (the backend is unreachable,
      // not the account); a signed-in player gets the retry sheet.
      if (!user.isAnonymous && (!current.open || current.view.name !== "profile-error")) {
        openSheet(gate.reason ?? "sign-in", { name: "profile-error", timeout: errorTimeout });
      }
      return;
    }
    // Recovered: a forced view that no caller is waiting on closes by itself.
    const forced = ["verify-email", "profile-error", "conflict", "fallback"].includes(current.view.name);
    if (current.open && forced && (authStatus === "guest" || authStatus === "ready")) {
      if (gate.pending && authStatus === "guest") setView({ name: "choose" });
      else if (!gate.pending) setSheet((s) => ({ ...s, open: false }));
    }
  }, [mode, fb, user, authStatus, errorCode, errorTimeout, gate, openSheet, setView]);

  // ---- bridge for the API wrapper ----------------------------------------------------------

  const ensureGuestSession = useCallback(async (): Promise<boolean> => {
    const current = adapter.current();
    if (!current?.isAnonymous) return false;
    return ensureGuestSessionOnce(current.uid, async () => {
      const appCheckToken = await getAppCheckToken(app);
      const created = (await USER_API.guestSession(appCheckToken)) as SessionProfile;
      const seq = ++seqRef.current;
      acceptProfile(created, seq);
      track(buildEvent("guest_session_created", {}));
    });
  }, [adapter, acceptProfile]);

  React.useEffect(() => {
    const removeBridge = setAuthBridge({
      ensureGuestSession,
      requireAccount: (reason) => requireAccount(reason as AccountReason),
      onEmailUnverified: () => void loadProfile(),
      onAccountConflict: () => void loadProfile(),
    });
    const removeInterceptor = installApiInterceptor();
    return () => {
      removeBridge();
      removeInterceptor();
    };
  }, [ensureGuestSession, requireAccount, loadProfile]);

  // ---- sign-out --------------------------------------------------------------------------

  const signOutAll = useCallback(async () => {
    resetAnonymous();
    fallbackShownRef.current = false;
    pendingLinkRef.current = null;
    // A merge kept for retry belongs to the account being left (review round 3).
    clearPendingMerge();
    try {
      await adapter.signOut();
    } catch {
      // Already signed out.
    }
    // On /game the provider now signs in a fresh, lazy guest (G1).
  }, [adapter]);

  const eraseGuest = useCallback(async () => {
    try {
      await USER_API.deleteGuest();
    } catch {
      return false;
    }
    await signOutAll();
    return true;
  }, [signOutAll]);

  React.useEffect(() => {
    setUtils({
      openLink: (url: string) => window.open(url, "_blank")?.focus?.(),
      shareURL: (url: string) => {
        navigator.clipboard
          ?.writeText(url)
          .then(() =>
            toast({ message: "Your invite link is copied to your clipboard. Share it with your friends." })
          )
          .catch(() => toast({ message: url }));
      },
    });
    setLogout(() => () => void signOutAll());
    setIsFB?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signOutAll]);

  // ---- sign-in actions ---------------------------------------------------------------------

  /** After Firebase changed the user: refresh the stored token now, so the next call carries it. */
  const syncToken = useCallback(async () => {
    const current = adapter.current();
    if (!current) return;
    try {
      storeToken(await current.getIdToken());
    } catch {
      // onIdTokenChanged stores it as well.
    }
  }, [adapter]);

  /**
   * `POST /user/guest/merge` with the guest token captured before the sign-in. Shows `merged`
   * (the sheet stays open until its CONTINUE), or the verification state when the account still
   * needs its email confirmed. A retryable failure keeps the token for this tab (pendingMerge).
   */
  const runMerge = useCallback(
    async (guestToken: string) => {
      mergeRunningRef.current = true;
      // The adapter's user, not userRef: the swap to the account may not have rendered yet.
      const account = adapter.current();
      mergeAttemptsRef.current.add(mergeAttemptKey(guestToken, account ? snapshotOf(account) : null));
      setView({ name: "linking", label: "Bringing your guest progress along…" });
      await syncToken();
      try {
        const result = await USER_API.guestMerge(guestToken);
        clearPendingMerge();
        track(buildEvent("auth_merged", {}));
        setView({
          name: "merged",
          gamesMoved: result.gamesMoved ?? 0,
          tailsCredited: result.tailsCredited ?? 0,
        });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        const code = error instanceof ApiError ? error.code : null;
        if (isRetryableMergeError(status, code)) savePendingMerge(guestToken, account?.uid);
        else clearPendingMerge();
        if (status === 403 && code === ErrorCode.EMAIL_UNVERIFIED) {
          // Signed in to an account whose email is not confirmed yet: the merge runs again once
          // it is (the pending-merge effect).
          setView({ name: "verify-email", email: userRef.current?.email ?? null, justSent: false });
        } else {
          setView({
            name: "merged",
            gamesMoved: 0,
            tailsCredited: 0,
            note:
              status === 409
                ? "You're signed in. This account already took in guest progress this month, so this guest's runs stay separate."
                : "You're signed in, but we couldn't move your guest progress just now. We'll try again while this tab stays open, for up to an hour.",
          });
        }
      } finally {
        mergeRunningRef.current = false;
      }
      await loadProfile();
    },
    [adapter, loadProfile, setView, syncToken]
  );

  const runOutcome = useCallback(
    async (outcome: AuthOutcome) => {
      switch (outcome.kind) {
        case "done": {
          track(buildEvent("auth_linked", { provider: outcome.linked ? "link" : outcome.provider }));
          const pending = pendingLinkRef.current;
          pendingLinkRef.current = null;
          if (pending) {
            // The player signed in the original way: attach the method they tried first.
            await linkPendingCredential(auth, pending.credential);
            if (pending.guestToken) {
              await runMerge(pending.guestToken);
              return;
            }
          }
          setView({ name: "linking", label: "Saving your cat…" });
          await syncToken();
          const profile = await loadProfile();
          // Errors (verification, conflict, outage) switch the view through the status effect. A
          // profile that is somehow still a guest must not leave the sheet spinning.
          if (profile && !isRegisteredProfile(profile) && sheetRef.current.view.name === "linking") {
            backToForm();
            setMessage({ text: AUTH_COPY.unknown, field: null });
          }
          return;
        }
        case "merge": {
          const pending = pendingLinkRef.current;
          pendingLinkRef.current = null;
          if (pending) await linkPendingCredential(auth, pending.credential);
          await runMerge(outcome.guestToken);
          return;
        }
        case "link-account":
          pendingLinkRef.current = { credential: outcome.pending, guestToken: outcome.guestToken };
          setView({ name: "link-account", provider: outcome.provider, email: outcome.email });
          return;
        case "verify":
          track(buildEvent("auth_linked", { provider: "email" }));
          setView({ name: "verify-email", email: outcome.email, justSent: outcome.justSent });
          await syncToken();
          void loadProfile();
          return;
        case "cancelled":
          backToForm();
          return;
        case "error":
          backToForm();
          showError(outcome.error, outcome.native);
          return;
      }
    },
    [backToForm, loadProfile, runMerge, setView, showError, syncToken]
  );

  /** Ends a sign-in flow started from the sheet, then settles `requireAccount` with the result. */
  // A merge that failed retryably (or waited for a verified email) runs again on the next ready
  // account profile: after a reload in this tab, or once the email is confirmed. Once per
  // token, account and verification state per page, so a failure never loops.
  const readyAccount =
    profileState.phase === "ready" && isRegisteredProfile(profileState.profile) && !!user && !user.isAnonymous;
  const readySeq = profileState.phase === "ready" ? profileState.seq : 0;
  React.useEffect(() => {
    if (passive || !readyAccount || mergeRunningRef.current || flowRef.current) return;
    const account = adapter.current();
    // Only for the account it was saved for; an entry for another account is dropped.
    const pending = readPendingMerge(account?.uid);
    if (!pending) return;
    const key = mergeAttemptKey(pending.guestToken, account ? snapshotOf(account) : null);
    if (mergeAttemptsRef.current.has(key)) return;
    if (sheetRef.current.open) {
      void runMerge(pending.guestToken);
      return;
    }
    mergeAttemptsRef.current.add(key);
    mergeRunningRef.current = true;
    void USER_API.guestMerge(pending.guestToken)
      .then(
        (result) => {
          clearPendingMerge();
          track(buildEvent("auth_merged", {}));
          const runs = result.gamesMoved ?? 0;
          toast({
            message:
              runs > 0
                ? `Your guest progress is in your account now: ${runs} ${runs === 1 ? "run" : "runs"}.`
                : "Your guest progress is in your account now.",
          });
          return loadProfile();
        },
        (error) => {
          const status = error instanceof ApiError ? error.status : 0;
          const code = error instanceof ApiError ? error.code : null;
          if (!isRetryableMergeError(status, code)) clearPendingMerge();
        }
      )
      .finally(() => {
        mergeRunningRef.current = false;
      });
  }, [adapter, passive, readyAccount, readySeq, runMerge, loadProfile, toast]);

  const handleOutcome = useCallback(
    async (outcome: AuthOutcome) => {
      try {
        await runOutcome(outcome);
      } finally {
        flowRef.current = false;
        settleGate();
      }
    },
    [runOutcome, settleGate]
  );

  /** Starts a sign-in flow: profiles that arrive until it ends do not close the sheet. */
  const beginFlow = useCallback(() => {
    flowRef.current = true;
  }, []);

  /** Google or Apple. The popup opens synchronously inside the click (nothing awaited first). */
  const oauth = useCallback(
    (provider: OAuthProviderName) => {
      // Synchronous until the popup opened: beginFlow only sets a ref.
      const pending = startOAuth(auth, provider, isNative());
      beginFlow();
      setMessage(null);
      setView({ name: "busy", label: provider === "google" ? "Waiting for Google…" : "Waiting for Apple…" });
      void pending.then(handleOutcome, (error) => handleOutcome({ kind: "error", error }));
    },
    [beginFlow, handleOutcome, setView]
  );

  const emailSubmit = useCallback(
    (tab: "sign-in" | "create", email: string, password: string) => {
      setMessage(null);
      setView({ name: "busy", label: tab === "create" ? "Creating your account…" : "Signing you in…" });
      beginFlow();
      const run = tab === "create" ? createEmailAccount(auth, email, password) : signInWithEmail(auth, email, password);
      void run.then(handleOutcome, (error) => handleOutcome({ kind: "error", error }));
    },
    [beginFlow, handleOutcome, setView]
  );

  const sendPasswordReset = useCallback(
    async (email: string) => {
      setMessage(null);
      try {
        await sendReset(auth, email);
      } catch (error) {
        const code = authErrorCode(error);
        // Only a malformed address is reported; "no such user" reads like success (enumeration).
        if (code === "auth/invalid-email" || code === "auth/missing-email") {
          showError(error);
          return;
        }
        if (code === "auth/too-many-requests" || code === "auth/network-request-failed") {
          showError(error);
          return;
        }
      }
      // The toast fires only after the request resolved (G9). While the sheet is open it is held
      // and its text appears in the sheet's alert region (neutral styling), so the email view
      // repeats nothing.
      toast({ message: "If an account uses that email, a reset link is on its way. Check your inbox." });
      setView({ name: "email", tab: "sign-in", email });
    },
    [setView, showError, toast]
  );

  const resend = useCallback(async () => {
    try {
      await resendVerification(auth);
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }, [showError]);

  const checkVerified = useCallback(
    async (silent = false) => {
      try {
        const verified = await refreshVerified(auth);
        if (verified) {
          await syncToken();
          await loadProfile();
          return true;
        }
        if (!silent) {
          setMessage({
            text: "We haven't seen the confirmation yet. Open the link in the email, then try again.",
            field: null,
          });
        }
      } catch (error) {
        if (!silent) showError(error);
      }
      return false;
    },
    [loadProfile, showError, syncToken]
  );

  const retryProfile = useCallback(() => {
    profileUidRef.current = null; // show loading again
    void loadProfile();
  }, [loadProfile]);

  const retryGuest = useCallback(() => {
    resetAnonymous();
    fallbackShownRef.current = false;
    setSheet((s) => ({ ...s, open: false }));
    setFb({ phase: "none" });
  }, []);

  /**
   * "Sign in to my account" (conflict), "Use a different account" (verify) and "Sign out"
   * (profile error): sign out, then show the sign-in options. These views often open without a
   * waiting caller, so the sheet stays open with the sign-in title instead of closing (on /game
   * a fresh guest starts underneath, and "Keep playing as guest" closes it).
   */
  const signOutFromSheet = useCallback(async () => {
    await signOutAll();
    setMessage(null);
    setSheet((current) => ({
      open: true,
      reason: gate.pending ? current.reason : "sign-in",
      view: { name: "choose" },
      back: { name: "choose" },
    }));
  }, [gate, signOutAll]);

  const dismissible = !(
    sheet.view.name === "profile-error" ||
    (sheet.view.name === "verify-email" && authStatus === "needs-verification")
  );

  const sheetController: AuthSheetController = {
    sheet,
    status: authStatus,
    user,
    mode,
    message: message?.text ?? null,
    messageField: message?.field ?? null,
    dismissible,
    appleFirst,
    inAppBrowser,
    native: isNative(),
    setView: (view) => {
      setMessage(null);
      setView(view);
    },
    close: closeSheet,
    oauth,
    emailSubmit,
    sendPasswordReset,
    resend,
    checkVerified,
    retryProfile,
    retryGuest,
    signOut: signOutFromSheet,
    clearMessage: () => setMessage(null),
  };

  // Playwright: open any sheet state for the axe and layout checks (E2E builds only).
  React.useEffect(() => {
    if (!adapter.isTestDouble) return;
    const target = window as unknown as Record<string, unknown>;
    target.__ttAuthSheet = {
      requireAccount: (reason: AccountReason) => requireAccount(reason),
      show: (view: SheetView, reason: AccountReason = "save-progress") => openSheet(reason, view),
      status: () => statusRef.current,
      toast: (text: string) => toast({ message: text }),
    };
    return () => {
      delete target.__ttAuthSheet;
    };
  }, [adapter, openSheet, requireAccount, toast]);

  const value: ContextState = {
    mode,
    user,
    authStatus,
    authReady,
    authSettled,
    requireAccount,
    signOut: signOutAll,
    refreshProfile: loadProfile,
    eraseGuest,
    sheetController,
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      <AuthSheet controller={sheetController} />
      {children}
    </FirebaseAuthContext.Provider>
  );
};

function useFirebaseAuth() {
  const context = React.useContext(FirebaseAuthContext);
  if (context === undefined) {
    throw new Error("useFirebaseAuth must be used within a FirebaseAuthProvider");
  }
  return {
    mode: context.mode,
    user: context.user,
    authStatus: context.authStatus,
    authReady: context.authReady,
    authSettled: context.authSettled,
    isGuest: context.authStatus === "guest",
    requireAccount: context.requireAccount,
    signOut: context.signOut,
    refreshProfile: context.refreshProfile,
    eraseGuest: context.eraseGuest,
  };
}

/** For components that may render without a provider (they then behave as signed out). */
function useOptionalFirebaseAuth() {
  return React.useContext(FirebaseAuthContext);
}

export { FirebaseAuthProvider, useFirebaseAuth, useOptionalFirebaseAuth };
