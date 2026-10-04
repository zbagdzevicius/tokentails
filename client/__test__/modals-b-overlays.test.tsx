/**
 * @jest-environment jsdom
 */
import React from "react";
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

/**
 * Task 4d (plan G6 "Overlay migration", G14 "Close and modal"): SuccesPaymentModal,
 * ProgressStylePickerModal, VideoPlayer and TailsCardModal are GameModals; the Paw Match X is a
 * viewport CloseButton with the header reserve the scene reads; MysteryBoxCat is on night tokens.
 */

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/components/tailsCard/TailsCard", () => ({
  TailsCard: ({ cat }: { cat: { name: string } }) => <div data-testid="tails-card">{cat.name}</div>,
}));
const mockSetLevel = jest.fn();
let mockLevel: string | null = null;
jest.mock("@/context/GameContext", () => ({
  useGame: () => ({ level: mockLevel, setLevel: mockSetLevel }),
}));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: { match3Score: [] } }) }));
jest.mock("next/dynamic", () => () => {
  const Game = () => <div id="match3-game-container" />;
  return Game;
});
jest.mock("@/components/Match3/Match3Levels", () => ({ Match3Levels: () => <div>levels</div> }));

import { SuccesPaymentModal } from "@/components/shared/SuccesPaymentModal";
import { ProgressStylePickerModal } from "@/components/codex/ProgressStylePickerModal";
import { VideoPlayer } from "@/components/tailsCard/VideoPlayer";
import { TailsCardModal } from "@/components/tailsCard/TailsCardModal";
import Match3, { MATCH3_HEADER_RESERVE_PX, MATCH3_HEADER_RESERVE_VAR } from "@/components/Match3/Match3";
import { PortraitStyle } from "@/features/portrait/components/StylePickerDrawer";
import type { ICat } from "@/models/cats";

const play = jest.fn(() => Promise.resolve());
beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: play });
});
beforeEach(() => {
  mockLevel = null;
  play.mockImplementation(() => Promise.resolve());
});

const a11y = async (root: Element) => {
  const result = await axe.run(root, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => v.id);
};

describe("SuccesPaymentModal", () => {
  it("is a night panel dialog on the nested layer that closes on X and Esc", async () => {
    const close = jest.fn();
    render(<SuccesPaymentModal close={close} />);
    const dialog = screen.getByRole("dialog", { name: "Payment received" });
    expect(dialog.querySelector('[data-pixel-frame="night"]')).not.toBeNull();
    expect(document.querySelector(".z-modal-nested")).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(/z-\[120\]|from-purple-300/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    expect(await a11y(dialog)).toEqual([]);
  });
});

describe("ProgressStylePickerModal", () => {
  it("opens a night sheet, marks the selection, picks a style and closes", async () => {
    const onStyleChange = jest.fn();
    render(<ProgressStylePickerModal selectedStyle={PortraitStyle.MONARCH} onStyleChange={onStyleChange} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: /Pick style/i });
    // The entry point is a 44 px target with readable text, not the old 9 px label.
    expect(trigger.className).toMatch(/min-h-\[44px\]/);
    expect(trigger.className).toMatch(/\btext-p5\b/);
    expect(trigger.className).not.toMatch(/text-\[9px\]/);
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Select style" });
    expect(dialog.getAttribute("data-surface")).toBe("sheet");
    expect(document.querySelector(".z-modal-nested")).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(/z-\[230\]|z-\[240\]|from-yellow-100/);
    expect(within(dialog).getByRole("button", { name: /Monarch/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).getByRole("button", { name: /Commander/ }).getAttribute("aria-pressed")).toBe("false");
    expect(await a11y(dialog)).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: /Commander/ }));
    expect(onStyleChange).toHaveBeenCalledWith(PortraitStyle.COMMANDER);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("VideoPlayer", () => {
  it("renders nothing while idle", () => {
    render(<VideoPlayer isPlaying={false} onEnded={jest.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a full-size art dialog; the X skips to the reveal, and onEnded runs once", async () => {
    const onEnded = jest.fn();
    render(<VideoPlayer isPlaying onEnded={onEnded} />);
    const dialog = screen.getByRole("dialog", { name: "Opening your pack" });
    expect(dialog.getAttribute("data-surface")).toBe("art");
    expect(document.body.innerHTML).not.toMatch(/z-\[9999\]/);
    await waitFor(() => expect(play).toHaveBeenCalled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.ended(dialog.querySelector("video")!);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("continues the flow when the browser cannot play the video", async () => {
    play.mockImplementation(() => Promise.reject(new Error("no vp9")));
    const onEnded = jest.fn();
    render(<VideoPlayer isPlaying onEnded={onEnded} />);
    await waitFor(() => expect(onEnded).toHaveBeenCalledTimes(1));
  });
});

describe("TailsCardModal", () => {
  const cat = { _id: "c1", name: "Luna", tier: "COMMON", blessing: null } as unknown as ICat;

  it("is an art dialog named after the cat, on the nested layer, with an outside X", async () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    render(<TailsCardModal {...cat} showSelect profileCatId="other" onSelect={onSelect} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Luna" });
    expect(dialog.getAttribute("data-surface")).toBe("art");
    expect(document.querySelector(".z-modal-nested")).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(/z-\[101\]|bg-tt-cream\/50/);
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close.getAttribute("data-placement")).toBe("outside");
    // Phones pad the card area's top and right so the outside X clears the card corner.
    const content = dialog.querySelector(".pt-6.pr-6");
    expect(content).not.toBeNull();
    expect(content!.className).toMatch(/md:p-4/);
    fireEvent.click(within(dialog).getByRole("button", { name: "USE" }));
    expect(onSelect).toHaveBeenCalled();
    expect(await a11y(dialog)).toEqual([]);
    fireEvent.click(close);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("Match3 close button and header reserve", () => {
  it("uses a 44 px viewport CloseButton that returns to the level list", () => {
    mockLevel = "1";
    render(<Match3 />);
    const close = screen.getByRole("button", { name: "Back to levels" });
    expect(close.getAttribute("data-placement")).toBe("viewport");
    expect(close.className).toMatch(/\bfixed\b/);
    expect(close.className).toMatch(/h-\[44px\]/);
    expect(close.getAttribute("style")).toMatch(/safe-area-inset-top/);
    fireEvent.click(close);
    expect(mockSetLevel).toHaveBeenCalledWith(null);
  });

  it("sets the header reserve custom property the scene reads, overridable by prop", () => {
    mockLevel = "1";
    const { rerender } = render(<Match3 />);
    const wrapper = document.querySelector("[data-header-reserve-right]") as HTMLElement;
    expect(MATCH3_HEADER_RESERVE_PX).toBe(56);
    expect(wrapper.dataset.headerReserveRight).toBe("56");
    expect(wrapper.style.getPropertyValue(MATCH3_HEADER_RESERVE_VAR)).toMatch(/56px/);
    expect(wrapper.contains(document.getElementById("match3-game-container"))).toBe(true);
    rerender(<Match3 headerReservePx={64} />);
    expect(wrapper.style.getPropertyValue(MATCH3_HEADER_RESERVE_VAR)).toMatch(/64px/);
  });

  it("shows no X on the level list", () => {
    act(() => {
      render(<Match3 />);
    });
    expect(screen.queryByRole("button", { name: "Back to levels" })).toBeNull();
  });
});

describe("MysteryBoxCat night surfaces", () => {
  const source = fs.readFileSync(path.join(__dirname, "../components/mystery/MysteryBoxCat.tsx"), "utf8");
  it("uses night and gold tokens, not the cream / pastel / yellow sheet", () => {
    expect(source).not.toMatch(/bg-tt-cream|from-purple-300|to-blue-300|from-yellow-600|border-yellow-900|text-amber-900/);
    expect(source).toMatch(/from-tt-night-600/);
    expect(source).toMatch(/ring-tt-gold-500/);
  });
  it("gives every image an alt", () => {
    const imgs = source.match(/<img[\s\S]*?\/>/g) || [];
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach((img) => expect(img).toMatch(/\balt=/));
  });
});
