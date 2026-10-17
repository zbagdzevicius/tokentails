/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Returning players (founder ask, 2026-10-17): the "Sign in" entry points, the WELCOME BACK sheet,
 * the last-method hint, the error copy, the wallet in-app browsers and the guest pill on phones.
 */

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { cat: { name: "Scout" } } }),
}));
jest.mock("@/context/FirebaseAuthContext", () => ({}));

import { AuthSheet, emailTabFor, SHEET_TITLES } from "@/components/shared/auth/AuthSheet";
import { GuestPill } from "@/components/shared/auth/GuestPill";
import { AUTH_COPY, mapAuthError, withLastMethodHint } from "@/context/auth/authErrors";
import {
  LAST_METHOD_KEY,
  maskEmail,
  methodFromProviders,
  readLastMethod,
  rememberLastMethod,
} from "@/context/auth/lastMethod";
import { isMergeCooldown, isRetryableMergeError, mergeFailureNote } from "@/context/auth/pendingMerge";
import { externalBrowserLink, isInAppBrowser, signInLink } from "@/context/auth/platform";
import type { AuthSheetController, SheetView } from "@/context/FirebaseAuthContext";
import type { AccountReason } from "@/context/auth/types";
import { ToastProvider } from "@/context/ToastContext";

function controller(
  view: SheetView,
  reason: AccountReason = "returning",
  overrides: Partial<AuthSheetController> = {}
): AuthSheetController {
  return {
    sheet: { open: true, reason, view, back: view },
    status: "guest",
    user: { uid: "u", isAnonymous: true, email: null, emailVerified: false, providers: [] },
    mode: "guest",
    message: null,
    messageField: null,
    dismissible: true,
    appleFirst: false,
    inAppBrowser: false,
    native: false,
    setView: jest.fn(),
    close: jest.fn(),
    oauth: jest.fn(),
    emailSubmit: jest.fn(),
    sendPasswordReset: jest.fn(async () => undefined),
    resend: jest.fn(async () => true),
    checkVerified: jest.fn(async () => false),
    retryProfile: jest.fn(),
    retryGuest: jest.fn(),
    signOut: jest.fn(async () => undefined),
    clearMessage: jest.fn(),
    lastMethod: null,
    switchToSignIn: jest.fn(),
    ...overrides,
  };
}

const renderSheet = (c: AuthSheetController) =>
  render(
    <ToastProvider>
      <AuthSheet controller={c} />
    </ToastProvider>
  );

const brandOrder = () =>
  Array.from(document.querySelectorAll("[data-brand]")).map((node) => node.getAttribute("data-brand"));

beforeEach(() => localStorage.clear());

describe("last sign-in method on this device", () => {
  it("masks the email and never stores the full address", () => {
    expect(maskEmail("zygis@motored.lt")).toBe("z•••@motored.lt");
    expect(maskEmail(" a@b.co ")).toBe("a•••@b.co");
    expect(maskEmail("not-an-email")).toBeNull();
    expect(maskEmail("@x.com")).toBeNull();
    expect(maskEmail(null)).toBeNull();
    rememberLastMethod("google", "zygis@motored.lt");
    expect(localStorage.getItem(LAST_METHOD_KEY)).not.toContain("zygis");
    expect(readLastMethod()).toEqual({ provider: "google", emailHint: "z•••@motored.lt" });
  });

  it("reads safely: nothing, garbage, an unknown provider or blocked storage give no hint", () => {
    expect(readLastMethod()).toBeNull();
    localStorage.setItem(LAST_METHOD_KEY, "{not json");
    expect(readLastMethod()).toBeNull();
    localStorage.setItem(LAST_METHOD_KEY, JSON.stringify({ provider: "facebook" }));
    expect(readLastMethod()).toBeNull();
    // A full address that slipped in is not shown as a hint.
    localStorage.setItem(LAST_METHOD_KEY, JSON.stringify({ provider: "email", emailHint: "full@address.com" }));
    expect(readLastMethod()).toEqual({ provider: "email", emailHint: null });
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readLastMethod()).toBeNull();
    spy.mockRestore();
    const setSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberLastMethod("apple", null)).not.toThrow();
    setSpy.mockRestore();
  });

  it("picks the method from the account's providers, keeping the stored one when it still applies", () => {
    expect(methodFromProviders([])).toBeNull();
    expect(methodFromProviders(["password", "google.com"])).toBe("email");
    expect(methodFromProviders(["password", "google.com"], { provider: "google", emailHint: null })).toBe("google");
    expect(methodFromProviders(["apple.com"], { provider: "google", emailHint: null })).toBe("apple");
  });
});

describe("error copy for returning players", () => {
  const err = (code: string) => ({ code });

  it("keeps wrong password and no such user neutral, and points to the reset", () => {
    for (const code of ["auth/wrong-password", "auth/user-not-found", "auth/invalid-credential"]) {
      expect(mapAuthError(err(code))).toEqual({ message: AUTH_COPY.credentials, field: "password" });
    }
    expect(AUTH_COPY.credentials).toMatch(/Forgot password\?/);
  });

  it("maps account-exists-with-different-credential and stays silent on a closed popup", () => {
    expect(mapAuthError(err("auth/account-exists-with-different-credential"))?.message).toBe(AUTH_COPY.otherMethod);
    expect(mapAuthError(err("auth/popup-blocked"))?.message).toBe(AUTH_COPY.popupBlocked);
    expect(mapAuthError(err("auth/popup-closed-by-user"))).toBeNull();
  });

  it("names the method this device used last when an email sign-in fails", () => {
    const copy = mapAuthError(err("auth/invalid-credential"));
    const google = withLastMethodHint(copy, err("auth/invalid-credential"), { provider: "google" });
    expect(google?.message).toMatch(/Last time on this device you used Google: try "Continue with Google"\./);
    expect(withLastMethodHint(copy, err("auth/invalid-credential"), { provider: "email" })).toBe(copy);
    expect(withLastMethodHint(copy, err("auth/invalid-credential"), null)).toBe(copy);
    const network = mapAuthError(err("auth/network-request-failed"));
    expect(withLastMethodHint(network, err("auth/network-request-failed"), { provider: "apple" })).toBe(network);
    expect(withLastMethodHint(null, err("auth/popup-closed-by-user"), { provider: "apple" })).toBeNull();
  });
});

describe("in-app browsers", () => {
  const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

  it.each([
    ["MetaMask", `${android} MetaMaskMobile`],
    ["Trust Wallet", `${phone} Trust/4.0`],
    ["Trust Wallet (Android)", `${android} TrustWallet/8.0`],
    ["Phantom", `${phone} Phantom/ios`],
    ["Coinbase Wallet", `${phone} CoinbaseWallet/28.0`],
    ["Coinbase browser", `${android} CoinbaseBrowser/3.0`],
    ["OKX", `${android} OKApp/(OKEx/6.80.0)`],
    ["Binance", `${phone} BNC/2.90.0`],
    ["Binance (Android)", `${android} Binance/2.90`],
  ])("detects the %s browser", (_name, userAgent) => {
    expect(isInAppBrowser({ userAgent })).toBe(true);
  });

  it("leaves Safari, Chrome and the Capacitor app alone", () => {
    expect(isInAppBrowser({ userAgent: `${phone} Safari/604.1` })).toBe(false);
    expect(isInAppBrowser({ userAgent: android })).toBe(false);
    expect(isInAppBrowser({ userAgent: `${android} MetaMaskMobile`, platform: "android" })).toBe(false);
  });
});

describe("guest merge after signing in to an existing account", () => {
  const COOLDOWN = "This account already saved guest progress in the last 30 days";

  it("the 30-day limit (429) is a gentle note, never a retry promise", () => {
    expect(isMergeCooldown(429, COOLDOWN)).toBe(true);
    expect(isRetryableMergeError(429, null, COOLDOWN)).toBe(false);
    const note = mergeFailureNote(429, false, COOLDOWN);
    expect(note).toMatch(/You're in your account/);
    expect(note).toMatch(/last 30 days/);
    expect(note).not.toMatch(/try again/);
    expect(mergeFailureNote(503, true)).toMatch(/try again while this tab stays open/);
    expect(mergeFailureNote(409, false)).toMatch(/another account/);
  });

  it("a 429 from the general rate limiter is retried, not reported as the 30-day limit", () => {
    expect(isMergeCooldown(429, "ThrottlerException: Too Many Requests")).toBe(false);
    expect(isMergeCooldown(429, null)).toBe(false);
    expect(isRetryableMergeError(429, null, "ThrottlerException: Too Many Requests")).toBe(true);
    expect(isRetryableMergeError(429, null)).toBe(true);
    const note = mergeFailureNote(429, true, "Request failed with status 429");
    expect(note).toMatch(/try again while this tab stays open/);
    expect(note).not.toMatch(/30 days/);
  });
});

describe("AuthSheet, returning mode", () => {
  it("is titled WELCOME BACK and opens email on Sign in; the save sheet opens on Create account", () => {
    expect(SHEET_TITLES.returning).toBe("WELCOME BACK");
    expect(emailTabFor("returning", true)).toBe("sign-in");
    expect(emailTabFor("save-progress", true)).toBe("create");
    expect(emailTabFor("save-progress", false)).toBe("sign-in");

    const c = controller({ name: "choose" });
    const { unmount } = renderSheet(c);
    expect(screen.getByRole("heading", { name: "WELCOME BACK" })).toBeTruthy();
    expect(screen.getByText(/Sign in the way you did before/)).toBeTruthy();
    // Already the returning sheet: no switch to itself.
    expect(screen.queryByTestId("returning-switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /SIGN IN WITH EMAIL/ }));
    expect(c.setView).toHaveBeenCalledWith({ name: "email", tab: "sign-in" });
    unmount();

    const save = controller({ name: "choose" }, "save-progress");
    renderSheet(save);
    fireEvent.click(screen.getByRole("button", { name: /CONTINUE WITH EMAIL/ }));
    expect(save.setView).toHaveBeenCalledWith({ name: "email", tab: "create" });
    expect(screen.getByTestId("returning-switch").textContent).toContain("Already have an account?");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(save.switchToSignIn).toHaveBeenCalledTimes(1);
  });

  it("email: one Sign in form with Forgot password and 'New here? Create an account'", () => {
    const c = controller({ name: "email", tab: "sign-in" });
    renderSheet(c);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in with email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SIGN IN" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(c.setView).toHaveBeenCalledWith({ name: "reset", email: "" });
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(c.setView).toHaveBeenCalledWith({ name: "email", tab: "create", email: "" });
  });

  it("puts the method this device used last first, ringed and tagged, and says so", () => {
    const { unmount } = renderSheet(
      controller({ name: "choose" }, "returning", { lastMethod: { provider: "apple", emailHint: "z•••@motored.lt" } })
    );
    expect(brandOrder()).toEqual(["apple", "google"]);
    expect(screen.getByTestId("last-method").textContent).toBe("Last time on this device you used Apple (z•••@motored.lt).");
    expect(screen.getAllByTestId("last-used-tag")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Continue with Apple.*used last time/ })).toBeTruthy();
    unmount();

    const email = controller({ name: "choose" }, "returning", { lastMethod: { provider: "email", emailHint: null } });
    renderSheet(email);
    expect(screen.getByTestId("last-method").textContent).toBe("Last time on this device you used email.");
    // Email first, before Google and Apple.
    const buttons = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    const emailIndex = buttons.findIndex((text) => /SIGN IN WITH EMAIL/.test(text));
    const googleIndex = buttons.findIndex((text) => /Continue with Google/.test(text));
    expect(emailIndex).toBeGreaterThanOrEqual(0);
    expect(emailIndex).toBeLessThan(googleIndex);
  });

  it("in-app browser: no Google or Apple, Copy link copies a link that opens this sign-in again", async () => {
    const writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSheet(controller({ name: "choose" }, "returning", { inAppBrowser: true }));
    expect(document.querySelectorAll("[data-brand]")).toHaveLength(0);
    expect(screen.getByTestId("in-app-notice").textContent).toMatch(/Safari or Chrome/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(writeText).toHaveBeenCalledWith(signInLink(window.location.href));
    expect(String((writeText.mock.calls[0] as unknown[])[0])).toContain("signin=1");
    expect(screen.getByRole("button", { name: /Link copied/ })).toBeTruthy();
    // Announced politely, and no link that only opens another tab inside the wallet (jsdom is not Android).
    expect(screen.getByTestId("in-app-copied").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByTestId("in-app-copied").textContent).toMatch(/Link copied/);
    expect(screen.queryByTestId("in-app-open")).toBeNull();
  });

  it("in-app browser after Google last time: says Google is blocked here and makes Copy link the main action", () => {
    renderSheet(
      controller({ name: "choose" }, "returning", {
        inAppBrowser: true,
        lastMethod: { provider: "google", emailHint: null },
      })
    );
    expect(screen.getByTestId("last-method").textContent).toMatch(/used Google\..*doesn't work in this app's browser/);
    expect(screen.getByRole("button", { name: /COPY LINK/ })).toBeTruthy();
  });

  it("switching from the save sheet to sign in keeps keyboard focus inside the options", () => {
    const save = controller({ name: "choose" }, "save-progress");
    const { rerender } = renderSheet(save);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    rerender(
      <ToastProvider>
        <AuthSheet controller={{ ...save, sheet: { ...save.sheet, reason: "returning" } }} />
      </ToastProvider>
    );
    expect(document.activeElement?.closest("[data-brand]")?.getAttribute("data-brand")).toBe("google");
  });

  it("an old account with an unverified email: says it is theirs, shows the email, Resend and another sign-in", async () => {
    const c = controller({ name: "verify-email", email: "zygis@motored.lt", justSent: false }, "returning", {
      user: { uid: "acc", isAnonymous: false, email: "zygis@motored.lt", emailVerified: false, providers: ["password"] },
      status: "needs-verification",
    });
    renderSheet(c);
    expect(screen.getByText(/This is your account from before/)).toBeTruthy();
    // In full: the player's own address, so a typo is visible.
    expect(screen.getByTestId("verify-email-hint").textContent).toBe("zygis@motored.lt");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend email" }));
    });
    expect(c.resend).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use a different sign-in" }));
    expect(c.signOut).toHaveBeenCalled();
  });
});

describe("GuestPill", () => {
  it("shows Guest on phones too (not screen-reader only) and a separate Sign in", () => {
    const onSave = jest.fn();
    const onSignIn = jest.fn();
    render(<GuestPill onSave={onSave} onSignIn={onSignIn} />);
    const status = screen.getByTestId("guest-pill-status");
    expect(status.textContent).toBe("Guest");
    expect(status.className).not.toMatch(/sr-only/);
    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Playing as a guest/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  const asPhone = (phone: boolean) =>
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: phone && query.includes("max-width"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  afterEach(() => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it("phones: a device that signed in before gets one-tap 'Sign in' on the pill", () => {
    asPhone(true);
    rememberLastMethod("google", "zygis@motored.lt");
    const onSave = jest.fn();
    const onSignIn = jest.fn();
    render(<GuestPill onSave={onSave} onSignIn={onSignIn} />);
    expect(screen.getByTestId("guest-pill-status").textContent).toBe("Guest");
    fireEvent.click(screen.getByTestId("guest-pill-main"));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("guest-pill-main").getAttribute("aria-label")).toBe("Playing as a guest. Sign in");
  });

  it("phones: a new device gets 'Save or sign in', which opens the save sheet", () => {
    asPhone(true);
    const onSave = jest.fn();
    render(<GuestPill onSave={onSave} onSignIn={jest.fn()} />);
    expect(screen.getByTestId("guest-pill-main").textContent).toContain("Save or sign in");
    fireEvent.click(screen.getByTestId("guest-pill-main"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("signed out: one Sign in action, no second button", () => {
    render(<GuestPill onSave={jest.fn()} onSignIn={jest.fn()} signedOut />);
    expect(screen.getByTestId("guest-pill-status").textContent).toBe("Not signed in");
    expect(screen.queryByTestId("guest-pill-sign-in")).toBeNull();
  });
});

describe("in-app browser links", () => {
  it("puts signin=1 back on the copied link", () => {
    expect(signInLink("https://tokentails.com/game")).toBe("https://tokentails.com/game?signin=1");
    expect(signInLink("https://tokentails.com/game?from=x")).toBe("https://tokentails.com/game?from=x&signin=1");
    expect(signInLink("https://tokentails.com/game?signin=1")).toBe("https://tokentails.com/game?signin=1");
  });

  it("opens Chrome with an intent on Android only", () => {
    const android = "Mozilla/5.0 (Linux; Android 14) MetaMaskMobile";
    const intent = externalBrowserLink("https://tokentails.com/game?signin=1", android);
    expect(intent).toMatch(/^intent:\/\/tokentails\.com\/game\?signin=1#Intent;scheme=https;package=com\.android\.chrome;/);
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent("https://tokentails.com/game?signin=1")}`);
    expect(externalBrowserLink("https://tokentails.com/game", "Mozilla/5.0 (iPhone) MetaMaskMobile")).toBeNull();
    expect(externalBrowserLink("http://localhost:3000/game", android)).toBeNull();
  });
});

