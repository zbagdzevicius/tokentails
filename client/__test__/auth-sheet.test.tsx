/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { cat: { name: "Scout" } } }),
}));
jest.mock("@/context/FirebaseAuthContext", () => ({}));

import {
  AuthSheet,
  reasonLine,
  RESEND_COOLDOWN_S,
  SHEET_TITLES,
  SUPPORT_URL,
  supportUrl,
  VERIFY_POLL_MS,
} from "@/components/shared/auth/AuthSheet";
import type { AuthSheetController, SheetView } from "@/context/FirebaseAuthContext";
import { ToastProvider } from "@/context/ToastContext";

function controller(view: SheetView, overrides: Partial<AuthSheetController> = {}): AuthSheetController {
  return {
    sheet: { open: true, reason: "save-progress", view, back: view },
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

describe("AuthSheet", () => {
  it("names itself by reason (decision #64) and speaks to the player's cat", () => {
    renderSheet(controller({ name: "choose" }));
    expect(screen.getByRole("heading", { name: "SAVE YOUR CAT" })).toBeTruthy();
    expect(screen.getByText(/Keep Scout, your runs and your Tails/)).toBeTruthy();
    expect(SHEET_TITLES["claim-rewards"]).toBe("CLAIM YOUR REWARDS");
    expect(SHEET_TITLES["sign-in"]).toBe("WELCOME TO TOKEN TAILS");
  });

  it("choose: Google first by default, Apple first on Apple devices, guest option and legal links", () => {
    const { unmount } = renderSheet(controller({ name: "choose" }));
    expect(brandOrder()).toEqual(["google", "apple"]);
    expect(screen.getByRole("button", { name: "Keep playing as guest" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeTruthy();
    unmount();
    renderSheet(controller({ name: "choose" }, { appleFirst: true }));
    expect(brandOrder()).toEqual(["apple", "google"]);
  });

  it("calls oauth synchronously from the click (no await before the popup)", () => {
    const c = controller({ name: "choose" });
    renderSheet(c);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(c.oauth).toHaveBeenCalledWith("google");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Apple" }));
    expect(c.oauth).toHaveBeenCalledWith("apple");
  });

  it("hides Google and Apple in a social app's browser", () => {
    renderSheet(controller({ name: "choose" }, { inAppBrowser: true }));
    expect(brandOrder()).toEqual([]);
    expect(screen.getByTestId("in-app-notice")).toBeTruthy();
    expect(screen.getByRole("button", { name: /CONTINUE WITH EMAIL/ })).toBeTruthy();
  });

  it("is not dismissible when the controller says so (verification, profile error)", () => {
    renderSheet(controller({ name: "profile-error" }, { dismissible: false }));
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByRole("button", { name: "TRY AGAIN" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("email: labelled inputs with autocomplete, and no silent failure", () => {
    const c = controller({ name: "email", tab: "create" });
    renderSheet(c);
    const email = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(email.type).toBe("email");
    expect(email.autocomplete).toBe("email");
    expect(password.autocomplete).toBe("new-password");

    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "CREATE ACCOUNT" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address.");
    expect(email.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(email, { target: { value: "  p@x.test " } });
    fireEvent.change(password, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "CREATE ACCOUNT" }));
    expect(screen.getByRole("alert").textContent).toBe("Use at least 6 characters for your password.");
    expect(c.emailSubmit).not.toHaveBeenCalled();

    fireEvent.change(password, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "CREATE ACCOUNT" }));
    expect(c.emailSubmit).toHaveBeenCalledWith("create", "p@x.test", "123456");
  });

  it("email: the show-password toggle and the tabs", () => {
    const c = controller({ name: "email", tab: "sign-in" });
    renderSheet(c);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.autocomplete).toBe("current-password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    expect(password.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("tab", { name: "Sign in" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    expect(c.setView).toHaveBeenCalledWith(expect.objectContaining({ name: "email", tab: "create" }));
  });

  it("email tabs follow the ARIA tabs pattern: one Tab stop, arrows and Home/End switch", () => {
    const c = controller({ name: "email", tab: "sign-in" });
    renderSheet(c);
    const signIn = screen.getByRole("tab", { name: "Sign in" });
    const create = screen.getByRole("tab", { name: "Create account" });
    expect(signIn.getAttribute("tabindex")).toBe("0");
    expect(create.getAttribute("tabindex")).toBe("-1");
    signIn.focus();
    fireEvent.keyDown(signIn, { key: "ArrowRight" });
    expect(c.setView).toHaveBeenLastCalledWith(expect.objectContaining({ name: "email", tab: "create" }));
    expect(document.activeElement).toBe(create);
    fireEvent.keyDown(signIn, { key: "End" });
    expect(c.setView).toHaveBeenLastCalledWith(expect.objectContaining({ tab: "create" }));
    (c.setView as jest.Mock).mockClear();
    fireEvent.keyDown(signIn, { key: "Home" });
    expect(c.setView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(signIn);
  });

  it("CONTINUE WITH EMAIL: a guest creates an account, anyone else signs in", () => {
    const guest = controller({ name: "choose" });
    const { unmount } = renderSheet(guest);
    fireEvent.click(screen.getByRole("button", { name: /CONTINUE WITH EMAIL/ }));
    expect(guest.setView).toHaveBeenCalledWith({ name: "email", tab: "create" });
    unmount();
    // The fallback sheet's "Sign in instead": guest mode, but no Firebase user exists.
    const returning = controller({ name: "choose" }, { user: null, status: "signed-out" });
    renderSheet(returning);
    fireEvent.click(screen.getByRole("button", { name: /CONTINUE WITH EMAIL/ }));
    expect(returning.setView).toHaveBeenCalledWith({ name: "email", tab: "sign-in" });
  });

  it("has exactly one alert region, carrying the controller's message", () => {
    renderSheet(controller({ name: "choose" }, { message: "Too many tries. Wait a minute, then try again." }));
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toBe("Too many tries. Wait a minute, then try again.");
  });

  it("verify-email without a fresh email: resend is available at once", () => {
    const c = controller({ name: "verify-email", email: "p@x.test" });
    renderSheet(c);
    const resend = screen.getByRole("button", { name: "Resend email" }) as HTMLButtonElement;
    expect(resend.disabled).toBe(false);
    expect(screen.queryByText(/We sent a link/)).toBeNull();
  });

  it("verify-email just after sending: resend waits 60 s, and the sheet polls every 5 s", async () => {
    jest.useFakeTimers();
    try {
      const c = controller({ name: "verify-email", email: "p@x.test", justSent: true });
      renderSheet(c);
      expect(screen.getByText("p@x.test")).toBeTruthy();
      const resend = screen.getByRole("button", { name: /Resend email in 60 s/ }) as HTMLButtonElement;
      expect(resend.disabled).toBe(true);
      // The ticking label is not a live region; only the end of the cooldown is announced.
      expect(resend.getAttribute("aria-live")).toBeNull();
      expect(resend.closest("[aria-live]")).toBeNull();
      expect(screen.getByTestId("resend-ready").textContent).toBe("");
      await act(async () => {
        jest.advanceTimersByTime(VERIFY_POLL_MS);
      });
      expect(c.checkVerified).toHaveBeenCalledWith(true);
      for (let i = 0; i < RESEND_COOLDOWN_S; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      const ready = screen.getByRole("button", { name: "Resend email" }) as HTMLButtonElement;
      expect(ready.disabled).toBe(false);
      expect(screen.getByTestId("resend-ready").textContent).toBe("You can resend the email now.");
      await act(async () => {
        fireEvent.click(ready);
      });
      expect(c.resend).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: /Resend email in 60 s/ })).toBeTruthy();
      expect(screen.getByTestId("resend-ready").textContent).toBe("");
      fireEvent.click(screen.getByRole("button", { name: "I'VE VERIFIED, CONTINUE" }));
      expect(c.checkVerified).toHaveBeenCalledWith(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("fallback offers a retry, sign-in and the Heist", () => {
    const c = controller({ name: "fallback" });
    renderSheet(c);
    fireEvent.click(screen.getByRole("button", { name: "TRY AGAIN" }));
    expect(c.retryGuest).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Play Catnip Heist now, no sign-up" }).getAttribute("href")).toBe("/heist");
  });

  it("sign-in tab: a too-short password says so, still without revealing whether the account exists", () => {
    const c = controller({ name: "email", tab: "sign-in" });
    renderSheet(c);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "p@x.test" } });
    fireEvent.click(screen.getByRole("button", { name: "SIGN IN" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter your password.");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "SIGN IN" }));
    expect(screen.getByRole("alert").textContent).toBe("That password looks too short. Check it and try again.");
    expect(c.emailSubmit).not.toHaveBeenCalled();
  });

  it("the subtitle never contradicts a failure view, and names no cat without a user", () => {
    expect(reasonLine("sign-in", undefined, "fallback")).toBe("");
    expect(reasonLine("save-progress", "Scout", "profile-error")).toBe("");
    expect(reasonLine("save-progress", "Scout", "conflict")).toBe("");
    expect(reasonLine("save-progress", "Scout", "choose")).toMatch(/Keep Scout/);
    const { unmount } = renderSheet(controller({ name: "fallback" }, { user: null, status: "signed-out" }));
    expect(screen.queryByText(/Sign in to keep your progress/)).toBeNull();
    unmount();
    renderSheet(controller({ name: "choose" }, { user: null, status: "signed-out" }));
    expect(screen.queryByText(/Keep Scout/)).toBeNull();
    expect(screen.getByText(/Keep your cat, your runs/)).toBeTruthy();
  });

  it("conflict shows a support reference before signing out, and the mail carries it", () => {
    expect(supportUrl(null)).toBe(SUPPORT_URL);
    expect(supportUrl("abc 1")).toBe(`${SUPPORT_URL}&body=Reference%3A%20abc%201`);
    renderSheet(controller({ name: "conflict" }, { user: { uid: "guest-uid-42", isAnonymous: true, email: null, emailVerified: false, providers: [] } }));
    expect(screen.getByTestId("conflict-reference").textContent).toBe("guest-uid-42");
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe(
      `${SUPPORT_URL}&body=Reference%3A%20guest-uid-42`
    );
  });

  it("a sheet that opened by itself returns focus to the guest pill when it closes", async () => {
    const pill = document.createElement("div");
    pill.setAttribute("data-testid", "guest-pill");
    const pillButton = document.createElement("button");
    pill.appendChild(pillButton);
    document.body.appendChild(pill);
    const c = controller({ name: "fallback" }, { user: null, status: "signed-out" });
    const { rerender } = renderSheet(c);
    (document.activeElement as HTMLElement | null)?.blur?.();
    rerender(
      <ToastProvider>
        <AuthSheet controller={{ ...c, sheet: { ...c.sheet, open: false } }} />
      </ToastProvider>
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(document.activeElement).toBe(pillButton);
    pill.remove();
  });

  it("merged shows what moved", () => {
    renderSheet(controller({ name: "merged", gamesMoved: 3, tailsCredited: 120 }));
    expect(screen.getByText("3 runs")).toBeTruthy();
    expect(screen.getByText("+120 Tails")).toBeTruthy();
  });

  it("perches one static hero cat and drops the old meme GIFs (decision #65)", () => {
    renderSheet(controller({ name: "choose" }));
    expect(screen.getAllByTestId("auth-hero-cat")).toHaveLength(1);
    expect(document.querySelectorAll('img[src*="meme-cats"]').length).toBe(0);
  });
});
