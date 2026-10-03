/**
 * @jest-environment jsdom
 */
process.env.NEXT_PUBLIC_BE_URL = "https://api.test";

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("firebase/app", () => ({ initializeApp: () => ({}) }));
jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
  initializeAuth: () => ({ currentUser: null }),
  indexedDBLocalPersistence: {},
  onIdTokenChanged: () => () => undefined,
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
  EmailAuthProvider: { credential: jest.fn() },
}));
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
jest.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: {} }));
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/analytics", () => ({
  analytics: { track: jest.fn() },
  buildEvent: (name: string, properties: unknown) => ({ name, properties }),
  reportAppError: jest.fn(),
}));
jest.mock("@/analytics/platform", () => ({ getPlatform: () => "web" }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

const mockRouter: { query: Record<string, string>; pathname?: string } = { query: {} };
// The email flows swap the Firebase user before they report, like the real SDK: the mocks sign
// the e2e fake in first, then return their outcome.
const mockLink = { signInWithEmail: jest.fn(), createEmailAccount: jest.fn() };
jest.mock("@/context/auth/link", () => ({
  ...jest.requireActual("@/context/auth/link"),
  signInWithEmail: (...args: unknown[]) => mockLink.signInWithEmail(...args),
  createEmailAccount: (...args: unknown[]) => mockLink.createEmailAccount(...args),
}));

import { FirebaseAuthProvider, useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { ProfileProvider, useProfile } from "@/context/ProfileContext";
import { ToastProvider, useToast } from "@/context/ToastContext";
import { PENDING_REF_KEY } from "@/context/auth/pendingRef";
import { PENDING_MERGE_KEY } from "@/context/auth/pendingMerge";
import { SESSION_HINT_KEY } from "@/context/auth/sessionHint";
import { __resetSessionsForTests } from "@/context/auth/sessions";
import type { E2EAuthConfig, E2EAuthControl } from "@/context/auth/adapter";

type Auth = ReturnType<typeof useFirebaseAuth>;
const latest: { auth?: Auth; profile?: ReturnType<typeof useProfile>["profile"]; toast?: ReturnType<typeof useToast> } = {};

const Probe = () => {
  const auth = useFirebaseAuth();
  const { profile } = useProfile();
  const toast = useToast();
  // Published after each render, for the assertions below.
  React.useLayoutEffect(() => {
    latest.auth = auth;
    latest.profile = profile;
    latest.toast = toast;
  });
  return <div data-testid="status">{auth.authStatus}</div>;
};

const GUEST_TRANSIENT = { isGuest: true, transient: true, name: "Guest", cat: { _id: "guest-starter", name: "Scout" } };
const ACCOUNT = { _id: "64e2e0000000000000000a01", isGuest: false, name: "Player", cat: { _id: "c1", name: "Scout" } };

interface Route {
  status?: number;
  body?: unknown;
}
let routes: Record<string, (init: RequestInit) => Route>;
let calls: Array<{ method: string; path: string; token: string; body?: string }>;

const reply = ({ status = 200, body = {} }: Route) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    clone() {
      return reply({ status, body });
    },
  }) as unknown as Response;

function installFetch() {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace("https://api.test", "");
    const method = (init.method || "GET").toUpperCase();
    const token = ((init.headers || {}) as Record<string, string>).accesstoken || "";
    calls.push({ method, path, token, body: init.body as string | undefined });
    const handler = routes[`${method} ${path}`];
    return reply(handler ? handler(init) : { status: 404 });
  }) as unknown as typeof fetch;
}

const control = () => (window as unknown as { __ttE2EAuth: E2EAuthControl }).__ttE2EAuth;

function renderProvider(mode: "guest" | "optional", config: E2EAuthConfig = {}, passive = false) {
  (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = config;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProfileProvider>
          <FirebaseAuthProvider authMode={mode} passive={passive}>
            <Probe />
          </FirebaseAuthProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  calls = [];
  mockRouter.query = {};
  mockRouter.pathname = "/game";
  sessionStorage.clear();
  localStorage.clear();
  __resetSessionsForTests();
  routes = {
    "GET /user/profile": () => {
      const token = calls[calls.length - 1].token;
      return { body: token.endsWith(".user") ? ACCOUNT : GUEST_TRANSIENT };
    },
    "GET /user/leaderboard/position": () => ({ body: { position: 1 } }),
    "GET /user/leaderboard/catnip/position": () => ({ body: { position: 1 } }),
  };
  installFetch();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  // PixelButton plays a click sound; jsdom has no media.
  jest.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
});
afterEach(() => {
  jest.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__;
});

const profileCalls = () => calls.filter((call) => call.path === "/user/profile");

describe("FirebaseAuthProvider, guest mode (/game)", () => {
  it("signs in anonymously once, renders the template at once, and shows no sheet", async () => {
    renderProvider("guest");
    // Before any answer, the menus already have the transient template profile (F5.5).
    expect(latest.profile?.cat?._id).toBe("guest-starter");
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("guest"));
    expect(control().anonymousCalls()).toBe(1);
    expect(profileCalls()).toHaveLength(1);
    expect(profileCalls()[0].token).toMatch(/^fbe2e\./);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(latest.auth?.authReady).toBe(true);
    // A transient guest reads no positions (they would answer 428).
    expect(calls.some((call) => call.path.includes("position"))).toBe(false);
  });

  it("requireAccount opens the sheet and resolves only after a refreshed registered profile", async () => {
    renderProvider("guest");
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    let result: string | undefined;
    act(() => {
      void latest.auth!.requireAccount("save-progress").then((value) => (result = value));
    });
    expect(await screen.findByRole("heading", { name: "SAVE YOUR CAT" })).toBeTruthy();
    expect(result).toBeUndefined();
    await act(async () => control().signIn());
    await waitFor(() => expect(result).toBe("signed-in"));
    expect(latest.auth?.authStatus).toBe("ready");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The account kept the uid: same fake uid, now a registered token.
    expect(profileCalls().at(-1)?.token.endsWith(".user")).toBe(true);
  });

  it("requireAccount resolves dismissed when the sheet is closed", async () => {
    renderProvider("guest");
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    let result: string | undefined;
    act(() => {
      void latest.auth!.requireAccount("claim-rewards").then((value) => (result = value));
    });
    await screen.findByRole("heading", { name: "CLAIM YOUR REWARDS" });
    fireEvent.click(screen.getByRole("button", { name: "Keep playing as guest" }));
    await waitFor(() => expect(result).toBe("dismissed"));
  });

  it("an account already signed in resolves without the sheet, from a refreshed profile", async () => {
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("ready"));
    const before = profileCalls().length;
    let result: string | undefined;
    await act(async () => {
      result = await latest.auth!.requireAccount("claim-rewards");
    });
    expect(result).toBe("signed-in");
    expect(profileCalls().length).toBe(before + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the fallback state when the anonymous sign-in fails", async () => {
    renderProvider("guest", { anonymous: "fail" });
    expect(await screen.findByText("We couldn't start a guest game")).toBeTruthy();
    expect(latest.auth?.authStatus).toBe("signed-out");
    // The lobby still plays underneath, so the intro (4a) lifts.
    expect(latest.auth?.authReady).toBe(true);
    expect(latest.auth?.authSettled).toBe(true);
    expect(profileCalls()).toHaveLength(0);
    // No guest to save yet, so not "SAVE YOUR CAT"; and no "Keep playing as guest" either.
    expect(screen.getByRole("heading", { name: "WELCOME TO TOKEN TAILS" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in instead" }));
    expect(await screen.findByRole("button", { name: "Not now" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep playing as guest" })).toBeNull();
  });

  /** Opens the sheet from a guest and submits the email sign-in tab. */
  async function signInByEmailFromGuest(): Promise<{ result: () => string | undefined }> {
    renderProvider("guest");
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    let result: string | undefined;
    act(() => {
      void latest.auth!.requireAccount("save-progress").then((value) => (result = value));
    });
    await screen.findByRole("heading", { name: "SAVE YOUR CAT" });
    fireEvent.click(screen.getByRole("button", { name: /CONTINUE WITH EMAIL/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "Sign in" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "p@x.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("tabpanel"));
    });
    return { result: () => result };
  }

  it("signing in to an existing account from a guest shows the merged summary until CONTINUE", async () => {
    mockLink.signInWithEmail.mockImplementation(async () => {
      control().signIn({ uid: "existing" });
      return { kind: "merge", guestToken: "GUEST_TOKEN", provider: "email" };
    });
    routes["POST /user/guest/merge"] = () => ({
      status: 201,
      body: { success: true, merged: true, gamesMoved: 2, tailsCredited: 40 },
    });
    const flow = await signInByEmailFromGuest();
    expect(await screen.findByText("Welcome back!")).toBeTruthy();
    expect(screen.getByText("2 runs")).toBeTruthy();
    expect(screen.getByText("+40 Tails")).toBeTruthy();
    const merge = calls.find((call) => call.path === "/user/guest/merge");
    expect(merge?.token.endsWith(".user")).toBe(true);
    await waitFor(() => expect(flow.result()).toBe("signed-in"));
    // Still open: the summary closes only with its CONTINUE.
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /CONTINUE/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
  });

  it("a merge that fails keeps the guest token for this tab and says so honestly", async () => {
    mockLink.signInWithEmail.mockImplementation(async () => {
      control().signIn({ uid: "existing" });
      return { kind: "merge", guestToken: "GUEST_TOKEN", provider: "email" };
    });
    routes["POST /user/guest/merge"] = () => ({ status: 503, body: {} });
    await signInByEmailFromGuest();
    expect(await screen.findByText(/We'll try again while this tab stays open/)).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem(PENDING_MERGE_KEY)!)).toMatchObject({
      guestToken: "GUEST_TOKEN",
      targetUid: "existing",
    });
    // Tried once on this page, not in a loop.
    expect(calls.filter((call) => call.path === "/user/guest/merge")).toHaveLength(1);
  });

  it("a merge into an unverified account waits for the verification, then runs again", async () => {
    let verified = false;
    mockLink.signInWithEmail.mockImplementation(async () => {
      control().signIn({ uid: "existing", emailVerified: false, email: "p@x.test" });
      return { kind: "merge", guestToken: "GUEST_TOKEN", provider: "email" };
    });
    routes["GET /user/profile"] = () => {
      const token = calls[calls.length - 1].token;
      if (!token.endsWith(".user")) return { body: GUEST_TRANSIENT };
      return verified ? { body: ACCOUNT } : { status: 403, body: { code: "EMAIL_UNVERIFIED" } };
    };
    routes["POST /user/guest/merge"] = () =>
      verified
        ? { status: 201, body: { success: true, merged: true, gamesMoved: 1, tailsCredited: 0 } }
        : { status: 403, body: { code: "EMAIL_UNVERIFIED" } };
    await signInByEmailFromGuest();
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).not.toBeNull();
    // Not on the resend cooldown: no email was sent just now.
    expect(screen.getByRole("button", { name: "Resend email" })).toBeTruthy();

    verified = true;
    await act(async () => control().signIn({ uid: "existing", emailVerified: true, email: "p@x.test" }));
    await waitFor(() => expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull());
    expect(calls.filter((call) => call.path === "/user/guest/merge")).toHaveLength(2);
  });

  it("a pending merge from earlier in this tab runs on the next ready account profile", async () => {
    sessionStorage.setItem(
      PENDING_MERGE_KEY,
      JSON.stringify({ guestToken: "GUEST_TOKEN", expiresAt: Date.now() + 60_000, targetUid: "acc" })
    );
    routes["POST /user/guest/merge"] = () => ({ status: 201, body: { success: true, merged: true, gamesMoved: 3 } });
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    await waitFor(() => expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull());
    const merge = calls.find((call) => call.path === "/user/guest/merge");
    expect(merge?.token.endsWith(".user")).toBe(true);
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("3 runs"));
  });

  it("a pending merge meant for another account is dropped, not merged into this one", async () => {
    sessionStorage.setItem(
      PENDING_MERGE_KEY,
      JSON.stringify({ guestToken: "GUEST_TOKEN", expiresAt: Date.now() + 60_000, targetUid: "account-a" })
    );
    routes["POST /user/guest/merge"] = () => ({ status: 201, body: { success: true, merged: true, gamesMoved: 3 } });
    renderProvider("guest", { user: { uid: "account-b", isAnonymous: false } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("ready"));
    await waitFor(() => expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull());
    expect(calls.some((call) => call.path === "/user/guest/merge")).toBe(false);
  });

  it("signing out clears a pending merge", async () => {
    routes["GET /user/profile"] = () => ({ status: 503, body: {} });
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("profile-error"));
    sessionStorage.setItem(
      PENDING_MERGE_KEY,
      JSON.stringify({ guestToken: "GUEST_TOKEN", expiresAt: Date.now() + 60_000, targetUid: "acc" })
    );
    await act(async () => {
      await latest.auth!.signOut();
    });
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).toBeNull();
  });

  it("an anonymous guest whose profile request fails keeps playing: authReady stays true", async () => {
    routes["GET /user/profile"] = () => ({ status: 503, body: {} });
    renderProvider("guest");
    await waitFor(() => expect(latest.auth?.authStatus).toBe("profile-error"), { timeout: 3000 });
    expect(latest.auth?.authReady).toBe(true);
  });

  it("'Sign in to my account' on the conflict state shows the sign-in options", async () => {
    routes["GET /user/profile"] = () => {
      const token = calls[calls.length - 1].token;
      return token.endsWith(".user")
        ? { status: 409, body: { code: "ACCOUNT_CONFLICT" } }
        : { body: GUEST_TRANSIENT };
    };
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    expect(await screen.findByText("This email already has an account")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /SIGN IN TO MY ACCOUNT/ }));
    });
    expect(await screen.findByRole("heading", { name: "WELCOME TO TOKEN TAILS" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /CONTINUE WITH EMAIL/ })).toBeTruthy();
    // On /game a fresh guest starts underneath; the sheet stays on the sign-in options.
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep playing as guest" })).toBeTruthy();
  });

  it("an unverified email gets the verification state, which cannot be dismissed", async () => {
    routes["GET /user/profile"] = () => ({ status: 403, body: { code: "EMAIL_UNVERIFIED" } });
    renderProvider("guest", { user: { uid: "u", isAnonymous: false, emailVerified: false, email: "p@x.test" } });
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(latest.auth?.authStatus).toBe("needs-verification");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("sends the stored referrer once when the profile reports promotedNow", async () => {
    mockRouter.query = { ref: "64e2e0000000000000000bbb" };
    routes["GET /user/profile"] = () => ({ body: { ...ACCOUNT, promotedNow: true } });
    routes["POST /user/catbassadors/referral"] = () => ({ status: 201, body: { credited: true } });
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    await waitFor(() => expect(calls.some((call) => call.path === "/user/catbassadors/referral")).toBe(true));
    const referral = calls.find((call) => call.path === "/user/catbassadors/referral");
    expect(JSON.parse(referral!.body!)).toEqual({ referrerId: "64e2e0000000000000000bbb" });
    await waitFor(() => expect(localStorage.getItem(PENDING_REF_KEY)).toBeNull());
    expect(calls.filter((call) => call.path === "/user/catbassadors/referral")).toHaveLength(1);
  });

  it("a stored referrer is not sent without a promotion", async () => {
    localStorage.setItem(PENDING_REF_KEY, "64e2e0000000000000000bbb");
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("ready"));
    expect(calls.some((call) => call.path === "/user/catbassadors/referral")).toBe(false);
    expect(localStorage.getItem(PENDING_REF_KEY)).toBe("64e2e0000000000000000bbb");
  });

  it("logging out on /game starts a fresh guest", async () => {
    renderProvider("guest", { user: { uid: "acc", isAnonymous: false } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("ready"));
    await act(async () => latest.auth!.signOut());
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    expect(control().anonymousCalls()).toBe(1);
    expect(control().current()?.isAnonymous).toBe(true);
  });

  it("holds toasts while the sheet is open and reads them in its alert region", async () => {
    renderProvider("guest");
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    act(() => {
      void latest.auth!.requireAccount("save-progress");
    });
    await screen.findByRole("heading", { name: "SAVE YOUR CAT" });
    act(() => latest.toast!({ message: "Invite link copied" }));
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(screen.getByTestId("auth-alert").textContent).toBe("Invite link copied");
    expect(screen.getByTestId("auth-alert").getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByRole("button", { name: "Keep playing as guest" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "SAVE YOUR CAT" })).toBeNull());
    // Already shown in the sheet: not played a second time once it closes.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByTestId("toast")).toBeNull();
    // Toasts after the sheet closed render as usual.
    act(() => latest.toast!({ message: "Saved" }));
    await waitFor(() => expect(screen.getByTestId("toast").textContent).toContain("Saved"));
  });
});

describe("FirebaseAuthProvider, optional mode", () => {
  it("never creates a session and never opens the sheet by itself", async () => {
    renderProvider("optional");
    await waitFor(() => expect(latest.auth?.authStatus).toBe("signed-out"));
    expect(control().anonymousCalls()).toBe(0);
    expect(profileCalls()).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(latest.profile).toBeNull();
  });

  it("reuses an existing anonymous session", async () => {
    renderProvider("optional", { user: { uid: "anon-1", isAnonymous: true } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("guest"));
    expect(control().anonymousCalls()).toBe(0);
    expect(profileCalls()).toHaveLength(1);
  });

  it("does not force the verification sheet on an article page", async () => {
    routes["GET /user/profile"] = () => ({ status: 403, body: { code: "EMAIL_UNVERIFIED" } });
    renderProvider("optional", { user: { uid: "u", isAnonymous: false, emailVerified: false } });
    await waitFor(() => expect(latest.auth?.authStatus).toBe("needs-verification"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("passive (the landing): reads the profile but sends no merge retry and no stored referral", async () => {
    mockRouter.pathname = "/";
    sessionStorage.setItem(
      PENDING_MERGE_KEY,
      JSON.stringify({ guestToken: "GUEST_TOKEN", expiresAt: Date.now() + 60_000, targetUid: "acc" })
    );
    localStorage.setItem(PENDING_REF_KEY, "64e2e0000000000000000bbb");
    routes["GET /user/profile"] = () => ({ body: { ...ACCOUNT, promotedNow: true } });
    routes["POST /user/guest/merge"] = () => ({ status: 201, body: { success: true, merged: true, gamesMoved: 3 } });
    routes["POST /user/catbassadors/referral"] = () => ({ status: 201, body: { credited: true } });
    renderProvider("optional", { user: { uid: "acc", isAnonymous: false } }, true);
    await waitFor(() => expect(latest.auth?.authStatus).toBe("ready"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
    // The landing shows no positions, so it does not read them either (Task 6b review #4).
    expect(calls.map((call) => call.path)).toEqual(["/user/profile"]);
    expect(sessionStorage.getItem(PENDING_MERGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(PENDING_REF_KEY)).toBe("64e2e0000000000000000bbb");
  });

  it("sets the session hint while Firebase has a user and clears it when it has none", async () => {
    renderProvider("optional", { user: { uid: "anon-1", isAnonymous: true } });
    await waitFor(() => expect(localStorage.getItem(SESSION_HINT_KEY)).toBe("1"));
    await act(async () => latest.auth!.signOut());
    await waitFor(() => expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull());
  });
});

