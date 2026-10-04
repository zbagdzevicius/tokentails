/**
 * @jest-environment jsdom
 */
/**
 * The game picker (plan G2 layer 1, G14): four cards with Catnip Heist behind its flag, a full page
 * load to /heist, the Purrsuit CLASSIC tag instead of the "no new levels" notice, GameModal (X on
 * the frame post), and axe on the open picker.
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

import {
  GameSelectModal,
  gameCards,
  heistPickerEnabled,
  HEIST_PICKER_HREF,
} from "@/components/shared/GameSelectModal";
import { GameType } from "@/models/game";

// These tests cover the Cupid Cat flows, so they run inside its season (January to March).
jest.mock("@/components/game/seasons", () => ({
  ...jest.requireActual("@/components/game/seasons"),
  isCupidSeason: () => true,
}));


function open(props: Partial<React.ComponentProps<typeof GameSelectModal>> = {}) {
  const onClose = jest.fn();
  const setGameType = jest.fn();
  const navigate = jest.fn();
  render(<GameSelectModal onClose={onClose} setGameType={setGameType} navigate={navigate} showHeist {...props} />);
  return { onClose, setGameType, navigate, dialog: screen.getByRole("dialog") };
}

describe("heistPickerEnabled (decision #15)", () => {
  it("is on in development and off in production unless NEXT_PUBLIC_HEIST_PICKER says otherwise", () => {
    expect(heistPickerEnabled(undefined, "development")).toBe(true);
    expect(heistPickerEnabled(undefined, "test")).toBe(true);
    expect(heistPickerEnabled(undefined, "production", "")).toBe(false);
    expect(heistPickerEnabled(undefined, "production", "1")).toBe(true);
    expect(heistPickerEnabled("0", "production", "1")).toBe(false);
    expect(heistPickerEnabled("1", "production")).toBe(true);
    expect(heistPickerEnabled("true", "production")).toBe(true);
    expect(heistPickerEnabled("0", "development")).toBe(false);
    expect(heistPickerEnabled("off", "development")).toBe(false);
  });
});

describe("gameCards", () => {
  it("lists four cards with the Heist last, three without it", () => {
    expect(gameCards(true).map((card) => card.title)).toEqual(["CUPID CAT", "PURRSUIT", "PAW MATCH", "CATNIP HEIST"]);
    expect(gameCards(false).map((card) => card.title)).toEqual(["CUPID CAT", "PURRSUIT", "PAW MATCH"]);
    const heist = gameCards(true)[3];
    expect(heist).toMatchObject({ href: HEIST_PICKER_HREF, badge: "NO SIGN-UP" });
    expect(heist.type).toBeUndefined();
    expect(gameCards(true)[1].tag).toBe("CLASSIC");
  });
});

describe("GameSelectModal", () => {
  it("shows four cards in a GameModal, the Heist as a link with its badge", () => {
    const { dialog } = open();
    expect(within(dialog).getByRole("heading", { name: "Choose your adventure" })).toBeTruthy();
    const cards = within(dialog).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    const heist = within(dialog).getByRole("link", { name: "CATNIP HEIST · NO SIGN-UP" });
    expect(heist.getAttribute("href")).toBe("/heist?from=picker");
    expect(within(dialog).getByRole("button", { name: "PURRSUIT · CLASSIC" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "PAW MATCH" })).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/no new levels/i);
  });

  it("opens the Heist with a full page load and never picks a Phaser mode for it", () => {
    const { navigate, setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByRole("link", { name: /CATNIP HEIST/ }));
    expect(navigate).toHaveBeenCalledWith("/heist?from=picker");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves Ctrl/Cmd/Shift/Alt and middle clicks on the Heist card to the browser", () => {
    const { navigate, dialog } = open();
    const link = within(dialog).getByRole("link", { name: /CATNIP HEIST/ });
    // Records what the card did, then stops jsdom's own (unimplemented) link navigation.
    const seen: boolean[] = [];
    const after = (event: Event) => {
      seen.push(event.defaultPrevented);
      event.preventDefault();
    };
    window.addEventListener("click", after);
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
    }
    window.removeEventListener("click", after);
    expect(seen).toEqual([false, false, false, false, false]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("sizes the card titles without a transform shrink on phones", () => {
    const { dialog } = open();
    expect(dialog.innerHTML).not.toMatch(/scale-\[0\.78\]/);
  });

  it("picks a Phaser mode in place and closes", () => {
    const { setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "PAW MATCH" }));
    expect(setGameType).toHaveBeenCalledWith(GameType.MATCH_3);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides the Heist card when the flag is off", () => {
    const { dialog } = open({ showHeist: false });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("closes from the X, which is pinned to the frame's corner post", () => {
    const { onClose, dialog } = open();
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close.parentElement).toBe(dialog);
    expect(dialog.className).toContain("[&>button[data-placement]]:!right-0");
    expect(dialog.className).toContain("[&>button[data-placement]]:!top-0");
    // The frame border is the X's size (44 px, 64 px from lg), so the X covers the post.
    const frame = screen.getByTestId("game-select-frame");
    expect(frame.className).toMatch(/border-\[44px\].*lg:border-\[64px\]/);
    expect(dialog.className).not.toMatch(/\bscale-90\b/);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations for names, nesting and images", async () => {
    open();
    const result = await axe.run(document.body, {
      runOnly: { type: "rule", values: ["button-name", "link-name", "nested-interactive", "aria-dialog-name", "image-alt", "list", "listitem"] },
    });
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
