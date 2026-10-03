/**
 * @jest-environment jsdom
 */
import React, { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../tailwind.config";

jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
}));

import {
  IToastMessage,
  TOAST_DURATION_MS,
  ToastProvider,
  useToast,
} from "@/context/ToastContext";

// The numeric z-index a class list produces once Tailwind compiles it, or
// null (z-index: auto) when no z-* class resolves: an arbitrary z-[n] value
// or a named token that exists in the Tailwind theme (1c adds auth/toast).
const themeZ = resolveConfig(tailwindConfig).theme.zIndex as Record<string, string>;
const zIndexOf = (className: string): number | null => {
  for (const token of className.split(/\s+/)) {
    const arbitrary = token.match(/^z-\[(\d+)\]$/);
    if (arbitrary) return Number(arbitrary[1]);
    const named = token.match(/^z-([\w-]+)$/);
    if (named && themeZ[named[1]] !== undefined && themeZ[named[1]] !== "auto")
      return Number(themeZ[named[1]]);
  }
  return null;
};

// Guards against a regression where every provider render handed out a new
// toast function and effects depending on it re-fired forever.
let fireRenders = 0;
beforeEach(() => {
  fireRenders = 0;
});

const Fire = ({ toasts }: { toasts: IToastMessage[] }) => {
  const toast = useToast();
  if (++fireRenders > 20) throw new Error("useToast is not stable");
  useEffect(() => {
    toasts.forEach(toast);
  }, [toast, toasts]);
  return null;
};

// Stands in for a modal that hides the rest of the page from assistive tech
// the way Radix Dialog does (aria-hidden on siblings, aria-live exempt).
const ModalOverPage = () => (
  <div role="dialog" aria-modal="true" className="z-auth">
    Sign in
  </div>
);

describe("ToastProvider", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("renders the toast on the toast layer (500), above sign-in", () => {
    render(
      <ToastProvider>
        <ModalOverPage />
        <Fire toasts={[{ message: "Wrong password", isError: true }]} />
      </ToastProvider>
    );
    const toast = screen.getByTestId("toast");
    expect(zIndexOf(toast.className)).toBe(500);
    expect(toast.textContent).toContain("Wrong password");
  });

  it("mirrors the current toast into a polite live region", () => {
    render(
      <ToastProvider>
        <Fire toasts={[{ message: "Password reset email sent" }]} />
      </ToastProvider>
    );
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("aria-atomic")).toBe("true");
    expect(live.className).toContain("sr-only");
    expect(live.textContent).toBe("Password reset email sent");
    // The visual copy is hidden so the text is not read twice.
    expect(screen.getByTestId("toast").getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("keeps the live region mounted and empty between toasts", () => {
    render(
      <ToastProvider>
        <Fire toasts={[]} />
      </ToastProvider>
    );
    expect(screen.getByTestId("toast-live-region").textContent).toBe("");
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("shows queued toasts one after another", () => {
    render(
      <ToastProvider>
        <Fire toasts={[{ message: "First" }, { message: "Second" }]} />
      </ToastProvider>
    );
    const live = screen.getByTestId("toast-live-region");
    expect(live.textContent).toBe("First");
    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(live.textContent).toBe("Second");
    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(live.textContent).toBe("");
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("stays readable while a modal hides the rest of the page", () => {
    // hideOthers is what Radix Dialog (GameModal, F3.3) uses to hide
    // everything outside the open modal from assistive technology.
    const { hideOthers } = jest.requireActual("aria-hidden");
    render(
      <ToastProvider>
        <main>Lobby</main>
        <ModalOverPage />
        <Fire toasts={[{ message: "Saved" }]} />
      </ToastProvider>
    );
    const undo = hideOthers(screen.getByRole("dialog"));
    try {
      expect(screen.getByText("Lobby").getAttribute("aria-hidden")).toBe(
        "true"
      );
      let el: HTMLElement | null = screen.getByTestId("toast-live-region");
      while (el) {
        expect(el.getAttribute("aria-hidden")).not.toBe("true");
        el = el.parentElement;
      }
    } finally {
      undo();
    }
  });
});

describe("overlay layers", () => {
  it("sign-in sits on a real z-index below the toast, not z-index auto", () => {
    // SignIn.tsx was replaced by the AuthSheet (task 3a), a GameModal on the `auth` layer.
    const sheet = fs.readFileSync(
      path.join(__dirname, "../components/shared/auth/AuthSheet.tsx"),
      "utf8"
    );
    expect(sheet).toMatch(/layer="auth"/);
    const modal = fs.readFileSync(path.join(__dirname, "../components/ui/GameModal.tsx"), "utf8");
    const authClass = modal.match(/\bauth:\s*"([^"]+)"/)?.[1];
    expect(authClass).toBeDefined();
    const signInZ = zIndexOf(authClass as string);
    expect(signInZ).toBe(200);
    expect(signInZ).toBeLessThan(500);
  });
});
