/**
 * @jest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { cat: { name: "Scout" } } }),
}));
jest.mock("@/context/FirebaseAuthContext", () => ({}));

import { AuthSheet, reasonLine, sheetTitle, supportUrl } from "@/components/shared/auth/AuthSheet";
import { authBrandFor } from "@/context/auth/brand";
import type { AccountReason } from "@/context/auth/types";
import type { AuthSheetController, SheetView } from "@/context/FirebaseAuthContext";
import { ToastProvider } from "@/context/ToastContext";

// docs/plans/moba/NO-TOKENTAILS.md: on the Paw Legends pages the shared sign-in sheet never names Token Tails.

const REASONS: AccountReason[] = ["save-progress", "claim-rewards", "purchase", "adopt", "give-treat", "share", "support", "sign-in", "returning"];
const TT = /token\s?tails|tokentails|\bTails\b|catnip heist|your cat\b/i;

function controller(view: SheetView, reason: AccountReason): AuthSheetController {
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
    brand: "pawlegends",
  };
}

const sheetText = (): string => {
  const parts = [document.body.textContent ?? ""];
  document.querySelectorAll("a[href]").forEach((a) => parts.push(a.getAttribute("href") ?? ""));
  return parts.join("\n");
};

describe("AuthSheet on the Paw Legends pages", () => {
  it("knows the Paw Legends pages by their page path", () => {
    expect(authBrandFor("/pawlegends")).toBe("pawlegends");
    expect(authBrandFor("/pawlegends/play")).toBe("pawlegends");
    expect(authBrandFor("/legends")).toBe("pawlegends");
    expect(authBrandFor("/game")).toBe("tokentails");
    expect(authBrandFor("/pawlegendsx")).toBe("tokentails");
    expect(authBrandFor(undefined)).toBe("tokentails");
  });

  it("titles and lines never name Token Tails, Tails or a cat to save", () => {
    for (const r of REASONS) {
      expect(sheetTitle(r, "pawlegends")).not.toMatch(TT);
      expect(reasonLine(r, "Scout", "choose", "pawlegends")).not.toMatch(TT);
    }
    expect(sheetTitle("sign-in", "pawlegends")).toBe("SIGN IN");
    expect(sheetTitle("sign-in")).toBe("WELCOME TO TOKEN TAILS");
    expect(supportUrl("ref", "pawlegends")).toContain("subject=Pawlegends%20account");
  });

  const VIEWS: SheetView[] = [
    { name: "choose" },
    { name: "verify-email", email: "a@b.c", justSent: true } as SheetView,
    { name: "merged", gamesMoved: 2, tailsCredited: 40, note: null } as unknown as SheetView,
    { name: "fallback" } as SheetView,
  ];
  it.each(VIEWS.map((v) => [v.name, v] as const))("the %s view shows no Token Tails text or link", (_n, view) => {
    for (const r of ["sign-in", "save-progress", "returning"] as AccountReason[]) {
      const { unmount } = render(
        <ToastProvider>
          <AuthSheet controller={controller(view, r)} />
        </ToastProvider>
      );
      expect(sheetText()).not.toMatch(TT);
      expect(document.querySelector('[data-testid="auth-hero-cat"]')).toBeNull();
      if (view.name === "choose") {
        expect(document.querySelector('a[href="/pawlegends/terms"]')).not.toBeNull();
        expect(document.querySelector('a[href="/pawlegends/privacy"]')).not.toBeNull();
      }
      unmount();
    }
  });
});
