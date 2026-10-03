/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/FirebaseAuthContext", () => ({}));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { cat: { name: "Scout" } } }),
}));

import { AuthSheet } from "@/components/shared/auth/AuthSheet";
import type { AuthSheetController, SheetView } from "@/context/FirebaseAuthContext";
import { TOAST_DURATION_MS, ToastProvider, useToast, type IToastMessage } from "@/context/ToastContext";

// Held toasts (plan F3.3): shown in the sheet's alert region with their own tone, and not
// played a second time once the sheet closes.

function controller(view: SheetView, open = true): AuthSheetController {
  return {
    sheet: { open, reason: "save-progress", view, back: view },
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
  } as unknown as AuthSheetController;
}

const fireRef: { current: (toast: IToastMessage) => void } = { current: () => undefined };
const fire = (toast: IToastMessage) => fireRef.current(toast);
const Firer = () => {
  const showToast = useToast();
  React.useEffect(() => {
    fireRef.current = showToast;
  }, [showToast]);
  return null;
};

const Harness = ({ open }: { open: boolean }) => (
  <ToastProvider>
    <Firer />
    <AuthSheet controller={controller({ name: "choose" }, open)} />
  </ToastProvider>
);

const toastLayer = () => document.querySelector('[data-testid="toast-live-region"]')?.textContent ?? "";

describe("AuthSheet toast hold", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows a held error toast as an error, and does not replay it after closing", () => {
    const { rerender } = render(<Harness open />);
    act(() => fire({ message: "Could not send the reset email.", isError: true }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Could not send the reset email.");
    expect(alert.getAttribute("data-tone")).toBe("error");
    // Nothing renders on the toast layer while held.
    expect(toastLayer()).toBe("");

    rerender(<Harness open={false} />);
    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(toastLayer()).toBe("");
  });

  it("styles held news as a notice", () => {
    render(<Harness open />);
    act(() => fire({ message: "Check your inbox for a reset link." }));
    expect(screen.getByRole("alert").getAttribute("data-tone")).toBe("notice");
  });

  it("a toast fired while the sheet is closed plays normally", () => {
    render(<Harness open={false} />);
    act(() => fire({ message: "Saved." }));
    expect(toastLayer()).toBe("Saved.");
  });
});
