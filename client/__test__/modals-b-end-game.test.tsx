/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { GameType } from "@/models/game";

/**
 * Task 4d (plan G6 "Overlay migration", G14 "panel max-h with safe areas"): the end-of-run panels
 * are night GameModals. Geometry (fits the viewport, X inside the clip rect) is in
 * e2e/modals-b.spec.ts; this checks behaviour, structure and a11y.
 */

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
// The paw line (task 5e) reads /impact/me through the auth runtime; impact-endgame-profile.test.tsx covers it.
jest.mock("@/components/impact/EndGamePaw", () => ({ EndGamePaw: () => null }));
let mockLevel: string | null = "1";
jest.mock("@/context/GameContext", () => ({ useGame: () => ({ level: mockLevel }) }));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { cat: { catImg: "/cat.png" } } }),
}));

import { EndGameModal } from "@/components/shared/EndGameModal";
import { PixelRescueEndGameModal } from "@/components/shared/PixelRescueEndGameModal";

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
});

beforeEach(() => {
  mockLevel = "1";
});

const stop = (extra: Partial<{ completedLevel: string | null; time: number }> = {}) => ({
  score: 42,
  time: 37.6,
  completedLevel: null,
  ...extra,
});

function renderEndGame(gameType = GameType.MATCH_3, gameStop = stop()) {
  const onClose = jest.fn();
  const tryAgain = jest.fn();
  render(<EndGameModal onClose={onClose} tryAgain={tryAgain} gameType={gameType} gameStop={gameStop} />);
  return { onClose, tryAgain, dialog: screen.getByRole("dialog") };
}

describe("EndGameModal (night GameModal)", () => {
  it("is a labelled dialog with the level summary as its title", () => {
    const { dialog } = renderEndGame();
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toMatch(/^Level 1 • .+ Summary$/);
    expect(dialog.textContent).toContain("collected 42 catnip");
    expect(dialog.textContent).toContain("Played for 37 seconds");
  });

  it("renders on the night panel: PixelFrame, z-modal layer, no legacy overlay classes", () => {
    const { dialog } = renderEndGame();
    expect(dialog.getAttribute("data-surface")).toBe("panel");
    expect(dialog.querySelector('[data-pixel-frame="night"]')).not.toBeNull();
    expect(document.querySelector(".z-modal")).not.toBeNull();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/z-\[100\]|bg-tt-cream\/50|glow-box|border-tt-cream/);
  });

  it("puts the X inside the frame (placement inside), first in the panel", () => {
    const { dialog } = renderEndGame();
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close.getAttribute("data-placement")).toBe("inside");
    expect(dialog.querySelector('[data-pixel-frame="night"]')!.contains(close)).toBe(true);
  });

  it("X, Esc and MEOW BACK close it; PLAY AGAIN retries the same level", async () => {
    const { onClose, tryAgain, dialog } = renderEndGame();
    fireEvent.click(within(dialog).getByRole("button", { name: "PLAY AGAIN" }));
    expect(tryAgain).toHaveBeenCalledWith();
    fireEvent.click(within(dialog).getByRole("button", { name: "MEOW BACK" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
  });

  it("offers NEXT LEVEL after a cleared Paw Match level", () => {
    const { tryAgain, dialog } = renderEndGame(GameType.MATCH_3, stop({ completedLevel: "1" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "NEXT LEVEL" }));
    expect(tryAgain).toHaveBeenCalledWith("2");
  });

  it("hides the time row when no time was played", () => {
    const { dialog } = renderEndGame(GameType.CATNIP_CHAOS, stop({ time: 0 }));
    expect(dialog.textContent).not.toContain("Played for");
  });

  it("caps the cat hero image so a wide catImg cannot spill out of the hero row", () => {
    const { dialog } = renderEndGame();
    const img = dialog.querySelector('img[src="/cat.png"]') as HTMLImageElement;
    expect(img.className).toMatch(/max-w-\[55%\]/);
    expect(img.className).toMatch(/\bobject-contain\b/);
    expect(img.className).toMatch(/\bw-auto\b/);
    expect(img.parentElement!.className).toMatch(/\boverflow-hidden\b/);
  });

  it("has no axe violations", async () => {
    const { dialog } = renderEndGame();
    const result = await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("PixelRescueEndGameModal (shared night panel)", () => {
  it("counts hearts on the same night panel and closes with the X", async () => {
    mockLevel = "11";
    const onClose = jest.fn();
    const tryAgain = jest.fn();
    render(
      <PixelRescueEndGameModal onClose={onClose} tryAgain={tryAgain} gameType={GameType.PIXEL_RESCUE} gameStop={stop()} />,
    );
    const dialog = screen.getByRole("dialog");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("Level 1-1 Summary");
    expect(dialog.textContent).toContain("collected 42 hearts");
    expect(dialog.querySelector('[data-pixel-frame="night"]')).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "PLAY AGAIN" }));
    expect(tryAgain).toHaveBeenCalledWith();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const result = await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
