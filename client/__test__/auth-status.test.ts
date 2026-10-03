import { AccountGate } from "@/context/auth/accountGate";
import {
  deriveAuthStatus,
  isAuthReady,
  isAuthSettled,
  isRegisteredProfile,
} from "@/context/auth/authStatus";
import type { AuthUserSnapshot, FirebasePhase, ProfilePhase, SessionProfile } from "@/context/auth/types";

const anon: AuthUserSnapshot = { uid: "u1", isAnonymous: true, email: null, emailVerified: false, providers: [] };
const google: AuthUserSnapshot = {
  uid: "u1",
  isAnonymous: false,
  email: "p@x.test",
  emailVerified: true,
  providers: ["google.com"],
};
const user = (snapshot: AuthUserSnapshot): FirebasePhase => ({ phase: "user", user: snapshot });
const ready = (profile: Partial<SessionProfile>, seq = 1): ProfilePhase => ({
  phase: "ready",
  profile: profile as SessionProfile,
  seq,
});
const error = (status: number | null, code: string | null): ProfilePhase =>
  ({ phase: "error", status, code } as ProfilePhase);

describe("deriveAuthStatus (F5.7)", () => {
  it("is unknown until Firebase reports", () => {
    expect(deriveAuthStatus("guest", { phase: "pending" }, { phase: "idle" })).toBe("unknown");
    expect(deriveAuthStatus("optional", { phase: "pending" }, { phase: "idle" })).toBe("unknown");
  });

  it("stays unknown on /game while the anonymous sign-in runs, signed-out once it failed", () => {
    expect(deriveAuthStatus("guest", { phase: "none" }, { phase: "idle" })).toBe("unknown");
    expect(deriveAuthStatus("guest", { phase: "none", anonymousFailed: true }, { phase: "idle" })).toBe("signed-out");
  });

  it("is signed-out on optional pages without a user (nothing is created there)", () => {
    expect(deriveAuthStatus("optional", { phase: "none" }, { phase: "idle" })).toBe("signed-out");
  });

  it("is loading-profile while a user waits for GET /user/profile", () => {
    expect(deriveAuthStatus("guest", user(anon), { phase: "loading" })).toBe("loading-profile");
    expect(deriveAuthStatus("optional", user(google), { phase: "idle" })).toBe("loading-profile");
  });

  it("is guest for an anonymous user, a transient profile or a guest document", () => {
    expect(deriveAuthStatus("guest", user(anon), ready({ isGuest: true, transient: true }))).toBe("guest");
    expect(deriveAuthStatus("guest", user(anon), ready({ isGuest: true }))).toBe("guest");
    // An anonymous user is a guest whatever the profile says.
    expect(deriveAuthStatus("optional", user(anon), ready({ isGuest: false }))).toBe("guest");
    expect(deriveAuthStatus("guest", user(google), ready({ isGuest: true }))).toBe("guest");
  });

  it("is ready for a registered account, including a pre-backfill document without isGuest", () => {
    expect(deriveAuthStatus("guest", user(google), ready({ isGuest: false }))).toBe("ready");
    expect(deriveAuthStatus("optional", user(google), ready({}))).toBe("ready");
  });

  it("maps 403 EMAIL_UNVERIFIED to needs-verification and every other failure to profile-error", () => {
    expect(deriveAuthStatus("guest", user(google), error(403, "EMAIL_UNVERIFIED"))).toBe("needs-verification");
    expect(deriveAuthStatus("guest", user(google), error(409, "ACCOUNT_CONFLICT"))).toBe("profile-error");
    expect(deriveAuthStatus("guest", user(google), error(500, null))).toBe("profile-error");
    expect(deriveAuthStatus("guest", user(anon), error(null, null))).toBe("profile-error");
  });

  it("authReady lifts the intro only for a guest or an account with its profile", () => {
    expect(isAuthReady("guest")).toBe(true);
    expect(isAuthReady("ready")).toBe(true);
    (["unknown", "signed-out", "needs-verification", "loading-profile", "profile-error"] as const).forEach((status) =>
      expect(isAuthReady(status)).toBe(false)
    );
    expect(isAuthSettled("unknown")).toBe(false);
    expect(isAuthSettled("profile-error")).toBe(true);
    expect(isAuthSettled("needs-verification")).toBe(true);
    expect(isAuthSettled("loading-profile")).toBe(false);
    expect(isAuthSettled("signed-out")).toBe(true);
  });

  it("on /game, a failed anonymous sign-in and an anonymous guest's profile error still count as ready", () => {
    const none = { phase: "none", anonymousFailed: true } as FirebasePhase;
    const anonUser = user(anon);
    const accountUser = user(google);
    expect(isAuthReady("signed-out", { mode: "guest", firebase: none })).toBe(true);
    expect(isAuthReady("profile-error", { mode: "guest", firebase: anonUser })).toBe(true);
    // An account whose profile failed is not ready: the sheet shows profile-error, non-dismissible.
    expect(isAuthReady("profile-error", { mode: "guest", firebase: accountUser })).toBe(false);
    // Still signing in anonymously: not ready yet.
    expect(isAuthReady("signed-out", { mode: "guest", firebase: { phase: "none" } as FirebasePhase })).toBe(false);
    // Optional pages keep the strict answer.
    expect(isAuthReady("signed-out", { mode: "optional", firebase: none })).toBe(false);
    expect(isAuthReady("profile-error", { mode: "optional", firebase: anonUser })).toBe(false);
    expect(isAuthReady("needs-verification", { mode: "guest", firebase: accountUser })).toBe(false);
  });

  it("isRegisteredProfile rejects guests, transient profiles and nothing", () => {
    expect(isRegisteredProfile(null)).toBe(false);
    expect(isRegisteredProfile({ isGuest: true } as SessionProfile)).toBe(false);
    expect(isRegisteredProfile({ isGuest: false, transient: true } as SessionProfile)).toBe(false);
    expect(isRegisteredProfile({ isGuest: false } as SessionProfile)).toBe(true);
  });
});

describe("requireAccount resolution rules (AccountGate)", () => {
  const registered = { _id: "a", isGuest: false } as SessionProfile;
  const guest = { _id: "g", isGuest: true } as SessionProfile;

  it("resolves signed-in only for a profile fetched after the request, whose isGuest is false", async () => {
    const gate = new AccountGate();
    const result = gate.request("save-progress", 4);
    // The profile already in memory (seq 4) never counts, even if registered.
    expect(gate.offerProfile(registered, 4)).toBe(false);
    // A refreshed guest profile does not resolve it either.
    expect(gate.offerProfile(guest, 5)).toBe(false);
    expect(gate.offerProfile({ isGuest: false, transient: true } as SessionProfile, 6)).toBe(false);
    expect(gate.pending).toBe(true);
    expect(gate.offerProfile(registered, 7)).toBe(true);
    await expect(result).resolves.toBe("signed-in");
    expect(gate.pending).toBe(false);
  });

  it("resolves dismissed when the sheet closes", async () => {
    const gate = new AccountGate();
    const result = gate.request("claim-rewards", 0);
    gate.dismiss();
    await expect(result).resolves.toBe("dismissed");
    // Nothing is pending afterwards, so a late profile resolves nothing.
    expect(gate.offerProfile(registered, 9)).toBe(false);
  });

  it("shares one sheet and one result between concurrent callers; the first names the sheet", async () => {
    const gate = new AccountGate();
    const first = gate.request("claim-rewards", 1);
    const second = gate.request("save-progress", 3);
    expect(gate.reason).toBe("claim-rewards");
    // The window starts at the first caller: a profile fetched after it counts for both.
    expect(gate.offerProfile(registered, 2)).toBe(true);
    await expect(Promise.all([first, second])).resolves.toEqual(["signed-in", "signed-in"]);
    expect(gate.reason).toBeNull();
  });

  it("starts a fresh window for a new request after settling", async () => {
    const gate = new AccountGate();
    const first = gate.request("save-progress", 1);
    gate.dismiss();
    await first;
    const second = gate.request("save-progress", 10);
    expect(gate.offerProfile(registered, 5)).toBe(false);
    expect(gate.offerProfile(registered, 11)).toBe(true);
    await expect(second).resolves.toBe("signed-in");
  });
});
