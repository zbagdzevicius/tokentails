/**
 * @jest-environment jsdom
 *
 * ProofDrawer (plan G11): a GameModal bottom sheet that closes on Esc, the backdrop and the
 * Android back button, names the claim, shows status, dates and the source (web only), passes axe.
 */
import React, { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import axe from "axe-core";
import { ProofDrawer } from "@/components/claims/ProofDrawer";
import { FACTS } from "@/lib/facts.generated";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));

let mockNative = false;
const mockBackListeners: (() => void)[] = [];
const mockRemove = jest.fn();
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mockNative },
}));
jest.mock("@capacitor/app", () => ({
  App: {
    addListener: jest.fn(async (_: string, fn: () => void) => {
      mockBackListeners.push(fn);
      return { remove: mockRemove };
    }),
  },
}));
jest.mock("@capacitor/browser", () => ({
  Browser: { open: jest.fn(async () => undefined) },
}));

const NOW = new Date("2026-10-01T12:00:00Z");

function Harness({ isApp = false }: { isApp?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <ProofDrawer
        open={open}
        onOpenChange={setOpen}
        fact={FACTS["F-011"]}
        text={FACTS["F-011"].display}
        isApp={isApp}
        now={NOW}
      />
    </>
  );
}

afterEach(() => {
  mockNative = false;
  mockBackListeners.length = 0;
});

describe("ProofDrawer", () => {
  it("is a named dialog with the status, dates, source and the /impact link", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", {
      name: "About this number",
    });
    expect(dialog.textContent).toContain("180K+ on X (Sep 2026)");
    expect(dialog.querySelector('[data-chip="verified"]')).not.toBeNull();
    expect(dialog.textContent).toContain("27 Sep 2026");
    expect(dialog.textContent).toContain("Check by");
    expect(
      dialog.querySelector('a[href="https://x.com/tokentails"]')
    ).not.toBeNull();
    // The check-only API mirror never shows as the source.
    expect(dialog.querySelector('a[href*="fxtwitter"]')).toBeNull();
    expect(dialog.querySelector('a[href="/impact#F-011"]')).not.toBeNull();
    expect(dialog.getAttribute("data-surface")).toBe("sheet");
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("closed")
    );
  });

  it("closes on the backdrop", async () => {
    render(<Harness />);
    await screen.findByRole("dialog");
    const scrim = screen.getByTestId("game-modal-scrim");
    fireEvent.pointerDown(scrim);
    fireEvent.pointerUp(scrim);
    fireEvent.click(scrim);
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("closed")
    );
  });

  it("closes on the Android back button in the native app", async () => {
    mockNative = true;
    render(<Harness isApp />);
    await screen.findByRole("dialog");
    await waitFor(() => expect(mockBackListeners).toHaveLength(1));
    act(() => mockBackListeners[0]());
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("closed")
    );
    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
  });

  it("shows no source link and opens the web page in app builds", async () => {
    render(<Harness isApp />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector('a[href^="https://"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: /tokentails\.com\/impact/i })
    ).toBeTruthy();
  });

  it("has no axe violations", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog");
    const results = await axe.run(dialog, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
