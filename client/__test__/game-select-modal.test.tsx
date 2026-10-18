/**
 * @jest-environment jsdom
 */
/**
 * The game picker (plan G2 layer 1, G14): four cards with Catnip Heist behind its flag, a full page
 * load to /heist, the Swordcat card (`SWORDCAT_TITLE`) on by default (its env flags are kill switches), the Purrsuit CLASSIC tag instead of the "no new levels" notice, GameModal (X on
 * the frame post), and axe on the open picker.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

import {
  GameSelectModal,
  gameCards,
  heistPickerEnabled,
  HEIST_PICKER_HREF,
  PAWLEGENDS_CARD_KEY,
  PAWLEGENDS_PICKER_HREF,
  SWORDCAT_CARD_KEY,
  SWORDCAT_PICKER_HREF,
  SWORDCAT_PREVIEW,
} from "@/components/shared/GameSelectModal";
import fs from "fs";
import path from "path";
import { swordcatPickerEnabled } from "@/components/swordcat/flags";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";
import { GameType } from "@/models/game";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";

// These tests cover the Cupid Cat flows, so they run inside its season (January to March).
jest.mock("@/components/game/seasons", () => ({
  ...jest.requireActual("@/components/game/seasons"),
  isCupidSeason: () => true,
}));


function open(props: Partial<React.ComponentProps<typeof GameSelectModal>> = {}) {
  const onClose = jest.fn();
  const setGameType = jest.fn();
  const navigate = jest.fn();
  render(<GameSelectModal onClose={onClose} setGameType={setGameType} navigate={navigate} showHeist showPawlegends={false} {...props} />);
  return { onClose, setGameType, navigate, dialog: screen.getByRole("dialog") };
}

describe("heistPickerEnabled (decision #15)", () => {
  it("is on by default in every build, and NEXT_PUBLIC_HEIST_PICKER=0 hides it", () => {
    expect(heistPickerEnabled(undefined, "development")).toBe(true);
    expect(heistPickerEnabled(undefined, "test")).toBe(true);
    expect(heistPickerEnabled(undefined, "production", "")).toBe(true);
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
  it("shows five cards in a GameModal (the Swordcat card is on by default), the Heist as a link with its badge", () => {
    const { dialog } = open();
    expect(within(dialog).getByRole("heading", { name: "Choose your adventure" })).toBeTruthy();
    const cards = within(dialog).getAllByRole("listitem");
    expect(cards.map((card) => card.getAttribute("data-card"))).toEqual([
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
    ]);
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
    const cards = within(dialog).getAllByRole("listitem");
    expect(cards.map((card) => card.getAttribute("data-card"))).toEqual(["PIXEL_RESCUE", "CATNIP_CHAOS", "MATCH_3", SWORDCAT_CARD_KEY]);
    expect(within(dialog).queryByTestId("game-card-heist")).toBeNull();
    expect(within(dialog).queryByRole("link", { name: /CATNIP HEIST/ })).toBeNull();
    // The only link left is the Swordcat card.
    expect(within(dialog).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([SWORDCAT_PICKER_HREF]);
  });

  it("shows only the three Phaser cards with the Heist and Swordcat cards both off", () => {
    const { dialog } = open({ showHeist: false, showSwordcat: false });
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

describe("Swordcat card (SWORDCAT_TITLE)", () => {
  it("is in the picker by default (NEXT_PUBLIC_SWORDCAT* unset)", () => {
    expect(process.env.NEXT_PUBLIC_SWORDCAT_PICKER).toBeUndefined();
    expect(swordcatPickerEnabled()).toBe(true);
    const { dialog } = open();
    expect(within(dialog).getByTestId("game-card-swordcat").getAttribute("href")).toBe(SWORDCAT_PICKER_HREF);
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(5);
  });

  it("is left out by the kill switch (showSwordcat false, or NEXT_PUBLIC_SWORDCAT_PICKER=0)", () => {
    expect(gameCards(true).map((card) => card.key)).not.toContain(SWORDCAT_CARD_KEY);
    const first = open({ showSwordcat: false });
    expect(within(first.dialog).queryByTestId("game-card-swordcat")).toBeNull();
    expect(within(first.dialog).getAllByRole("listitem")).toHaveLength(4);
    cleanup();
    process.env.NEXT_PUBLIC_SWORDCAT_PICKER = "0";
    try {
      expect(swordcatPickerEnabled()).toBe(false);
      const second = open();
      expect(within(second.dialog).queryByTestId("game-card-swordcat")).toBeNull();
      expect(within(second.dialog).getAllByRole("listitem")).toHaveLength(4);
    } finally {
      delete process.env.NEXT_PUBLIC_SWORDCAT_PICKER;
    }
  });

  it("comes after the Heist when enabled, as a link with no GameType", () => {
    const cards = gameCards(true, new Date(), true);
    expect(cards.map((card) => card.title)).toEqual(["CUPID CAT", "PURRSUIT", "PAW MATCH", "CATNIP HEIST", SWORDCAT_TITLE.toUpperCase()]);
    expect(cards[4]).toMatchObject({
      key: "SWORDCAT",
      href: SWORDCAT_PICKER_HREF,
      badge: "NEW",
      description: "Every cat you save is a real Pink Paw cat",
      image: SWORDCAT_PREVIEW.src,
      previewVariant: "SWORDCAT",
    });
    expect(cards[4].type).toBeUndefined();
    expect(Object.values(GameType)).not.toContain("SWORDCAT");
  });

  it("opens /swordcat with a full page load and keeps the Heist card's test id", () => {
    const { navigate, setGameType, onClose, dialog } = open({ showSwordcat: true });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(5);
    expect(within(dialog).getByTestId("game-card-heist").getAttribute("href")).toBe("/heist?from=picker");
    const card = within(dialog).getByTestId("game-card-swordcat");
    expect(card.getAttribute("href")).toBe("/swordcat");
    expect(card.getAttribute("aria-label")).toBe(`${SWORDCAT_TITLE.toUpperCase()} · NEW`);
    const art = within(dialog).getByTestId("game-card-swordcat-preview");
    expect(art.tagName).toBe("IMG");
    expect(art.getAttribute("src")).toBe(SWORDCAT_PREVIEW.src);
    expect(art.getAttribute("width")).toBe("312");
    expect(art.getAttribute("height")).toBe("218");
    expect(art.getAttribute("alt")).toBe("");
    // Not the old inline pixel cat with the Token Tails ":3" coin.
    expect(card.querySelector("svg")).toBeNull();
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledWith("/swordcat");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has no axe violations with the card shown", async () => {
    open({ showSwordcat: true });
    const result = await axe.run(document.body, {
      runOnly: { type: "rule", values: ["button-name", "link-name", "nested-interactive", "image-alt", "svg-img-alt", "list", "listitem"] },
    });
    expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});

describe("Swordcat card art (SWORDCAT_PREVIEW)", () => {
  it("ships a 2x trailer-frame WebP for the card's 312x218 box", () => {
    const pub = path.resolve(__dirname, "../public");
    expect(SWORDCAT_PREVIEW).toMatchObject({ width: 312, height: 218 });
    expect(SWORDCAT_PREVIEW.src).toMatch(/@2x\.webp$/);
    const buf = fs.readFileSync(path.join(pub, SWORDCAT_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
  });
});

describe("Pawlegends card (POC.md §11.4: web only, kill switches only)", () => {
  it("comes last and opens /pawlegends?from=picker with a full page load, showing a real match frame", () => {
    const { navigate, setGameType, dialog } = open({ showSwordcat: true, showPawlegends: true });
    const items = within(dialog).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[items.length - 1].getAttribute("data-card")).toBe(PAWLEGENDS_CARD_KEY);
    const card = within(dialog).getByTestId("game-card-pawlegends");
    expect(card.getAttribute("href")).toBe(`${PAWLEGENDS_PICKER_HREF}?from=picker`);
    expect(card.getAttribute("aria-label")).toBe(`${PAWLEGENDS_TITLE.toUpperCase()} · NEW`);
    const preview = within(dialog).getByTestId("game-card-pawlegends-preview");
    expect(preview.getAttribute("src")).toBe("/game-select/pawlegends.webp");
    // A missing file falls back to the text tile.
    fireEvent.error(preview);
    expect(within(dialog).getByTestId("game-card-pawlegends-preview").tagName).toBe("SPAN");
    expect(within(dialog).getByTestId("game-card-pawlegends-preview").textContent).toMatch(/3v3/);
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledWith("/pawlegends?from=picker");
    expect(setGameType).not.toHaveBeenCalled();
  });

  it("is left out unless asked for, and gameCards keeps the old order by default", () => {
    const { dialog } = open({ showPawlegends: false });
    expect(within(dialog).queryByTestId("game-card-pawlegends")).toBeNull();
    expect(gameCards(true, new Date("2026-05-01"), true).map((c) => c.key)).not.toContain(PAWLEGENDS_CARD_KEY);
    expect(gameCards(true, new Date("2026-05-01"), true, true).map((c) => c.key).pop()).toBe(PAWLEGENDS_CARD_KEY);
  });
});
