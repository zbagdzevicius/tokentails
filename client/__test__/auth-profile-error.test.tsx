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

import { AuthSheet } from "@/components/shared/auth/AuthSheet";
import type { AuthSheetController, SheetView } from "@/context/FirebaseAuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { describeProfileError, profileRetryDelayMs } from "@/context/auth/profileError";
import { ErrorCode } from "@/shared-contracts/errors";

/*
 * Player report (Nov 1): "4th day I see this. project is over?" The card said "Something went wrong on
 * our side... Try again in a moment" for every failure, including refusals a retry never clears.
 */

describe("describeProfileError", () => {
  it("only a 5xx or 429 says 'on our side', and those retry by themselves", () => {
    for (const status of [500, 502, 503, 429]) {
      const copy = describeProfileError({ status, code: null });
      expect(copy).toMatchObject({ kind: "server", primary: "retry", autoRetry: true });
      expect(copy.body).toMatch(/on our side/);
    }
    for (const status of [400, 401, 403, 404, 409]) {
      expect(describeProfileError({ status, code: null }).body).not.toMatch(/on our side/);
    }
  });

  it("no answer: can't reach us, or offline; both retry by themselves", () => {
    expect(describeProfileError({ status: null, code: null })).toMatchObject({
      kind: "network",
      heading: "Can't reach Token Tails",
      autoRetry: true,
    });
    expect(describeProfileError({ status: null, code: null, offline: true })).toMatchObject({
      kind: "offline",
      heading: "You're offline",
      autoRetry: true,
    });
  });

  it("401, ACCOUNT_DELETED and ACCOUNT_MISSING lead with signing in again and never loop", () => {
    for (const code of [null, ErrorCode.ACCOUNT_DELETED, ErrorCode.ACCOUNT_MISSING]) {
      expect(describeProfileError({ status: 401, code })).toMatchObject({
        kind: "signed-out",
        primary: "sign-out",
        autoRetry: false,
      });
    }
    expect(describeProfileError({ status: 401, code: ErrorCode.ACCOUNT_DELETED }).body).toMatch(/was deleted/);
  });

  it("409 GUEST_MERGE_IN_PROGRESS says the progress is being saved and polls", () => {
    expect(describeProfileError({ status: 409, code: ErrorCode.GUEST_MERGE_IN_PROGRESS })).toMatchObject({
      kind: "merging",
      autoRetry: true,
    });
  });

  it("any other refusal shows the server's message and points to support", () => {
    const copy = describeProfileError({
      status: 403,
      code: ErrorCode.EMAIL_DISPOSABLE,
      message: "Use a permanent email address to create an account",
    });
    expect(copy).toMatchObject({ kind: "refused", autoRetry: false });
    expect(copy.body).toBe(
      "Use a permanent email address to create an account. Your cat and your progress are safe. Contact support and we'll sort it out."
    );
  });

  it("the timeout keeps its own copy", () => {
    expect(describeProfileError({ status: null, code: null, timeout: true }).heading).toBe("This is taking too long");
  });
});

describe("profileRetryDelayMs", () => {
  it("backs off 2 s, 5 s, 15 s, 30 s, then every 60 s", () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(profileRetryDelayMs)).toEqual([
      2_000, 5_000, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });
});

function controller(view: SheetView, overrides: Partial<AuthSheetController> = {}): AuthSheetController {
  return {
    sheet: { open: true, reason: "sign-in", view, back: view },
    status: "profile-error",
    user: { uid: "acc-7", isAnonymous: false, email: "p@x.test", emailVerified: true, providers: ["google.com"] },
    mode: "guest",
    message: null,
    messageField: null,
    dismissible: false,
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

describe("profile error card", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("a 503 retries by itself on the backoff schedule and shows the countdown", () => {
    const c = controller({ name: "profile-error", status: 503 });
    renderSheet(c);
    expect(screen.getByTestId("profile-error-retry").textContent).toBe("Retrying in 2s");
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId("profile-error-retry").textContent).toBe("Retrying in 1s");
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(c.retryProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("profile-error-retry").textContent).toBe("Retrying in 5s");
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(c.retryProfile).toHaveBeenCalledTimes(2);
  });

  it("retries at once when the network comes back", () => {
    const c = controller({ name: "profile-error", status: null });
    renderSheet(c);
    expect(screen.getByRole("heading", { name: "Can't reach Token Tails" })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(c.retryProfile).toHaveBeenCalledTimes(1);
  });

  it("a deleted account never auto-retries and leads with signing in again", () => {
    const c = controller({ name: "profile-error", status: 401, code: ErrorCode.ACCOUNT_DELETED });
    renderSheet(c);
    expect(screen.queryByTestId("profile-error-retry")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(c.retryProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "SIGN OUT AND SIGN IN AGAIN" }));
    expect(c.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("profile-error-reference").textContent).toBe("Error 401 · acc-7");
  });

  it("while a retry is loading the card says so and schedules nothing", () => {
    const c = controller({ name: "profile-error", status: 503 }, { status: "loading-profile" });
    renderSheet(c);
    expect(screen.getByTestId("profile-error-retry").textContent).toBe("Retrying…");
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(c.retryProfile).not.toHaveBeenCalled();
  });
});
