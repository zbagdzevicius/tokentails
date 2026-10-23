/**
 * @jest-environment jsdom
 */
/**
 * The game picker (plan G2 layer 1, G14): the Moon Rave card first (web only), the Phaser cards, Catnip
 * Heist behind its flag with a full page load to /heist, the Swordcat card (`SWORDCAT_TITLE`) on by default (its env flags are kill switches), the Purrsuit CLASSIC tag instead of the "no new levels" notice, GameModal (X on
 * the frame post), and axe on the open picker.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));

import {
  BADCAT_CARD_KEY,
  cardHref,
  FORMULA_MEOW_CARD_KEY,
  GameSelectModal,
  gameCards,
  heistPickerEnabled,
  HEIST_PICKER_HREF,
  RAVE_CARD_KEY,
  SWORDCAT_CARD_KEY,
  SWORDCAT_PICKER_HREF,
  SWORDCAT_PREVIEW,
  ULTRA_CAT_CARD_KEY,
} from "@/components/shared/GameSelectModal";
import fs from "fs";
import path from "path";
import { swordcatPickerEnabled } from "@/components/swordcat/flags";
import { BADCAT_PREVIEW, badcatEntryEnabled } from "@/components/badcat/entry";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";
import { RAVE_PICKER_DESCRIPTION, RAVE_PREVIEW, raveEntryEnabled } from "@/components/rave/entry";
import { RAVE_SECTION_HREF } from "@/components/landing/RaveSection";
import {
  FORMULA_MEOW_PICKER_DESCRIPTION,
  FORMULA_MEOW_PREVIEW,
  formulaMeowEntryEnabled,
} from "@/components/formula-meow/entry";
import { ULTRA_CAT_PICKER_DESCRIPTION, ULTRA_CAT_PREVIEW, ultraCatEntryEnabled } from "@/components/ultra-cat/entry";
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
  it("shows nine cards in a GameModal (the Moon Rave first; Swordcat, Bad Cat, Formula Meow and Ultra Cat on by default), the Heist as a link with its badge", () => {
    const { dialog } = open();
    expect(within(dialog).getByRole("heading", { name: "Choose your adventure" })).toBeTruthy();
    const cards = within(dialog).getAllByRole("listitem");
    expect(cards.map((card) => card.getAttribute("data-card"))).toEqual([
      RAVE_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
      ULTRA_CAT_CARD_KEY,
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
    expect(cards.map((card) => card.getAttribute("data-card"))).toEqual([
      RAVE_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
      ULTRA_CAT_CARD_KEY,
    ]);
    expect(within(dialog).queryByTestId("game-card-heist")).toBeNull();
    expect(within(dialog).queryByRole("link", { name: /CATNIP HEIST/ })).toBeNull();
    // The links left are the Moon Rave, Swordcat, Bad Cat, Formula Meow and Ultra Cat cards.
    expect(within(dialog).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/rave?from=picker",
      SWORDCAT_PICKER_HREF,
      "/badcat?from=picker&utm_source=tt_picker",
      "/meow-race?from=picker",
      "/ultra-cat?from=picker",
    ]);
  });

  it("shows only the three Phaser cards with the Moon Rave, Heist, Swordcat, Bad Cat, Formula Meow and Ultra Cat cards all off", () => {
    const { dialog } = open({ showHeist: false, showSwordcat: false, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false });
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
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(9);
  });

  it("is left out by the kill switch (showSwordcat false, or NEXT_PUBLIC_SWORDCAT_PICKER=0)", () => {
    expect(gameCards(true).map((card) => card.key)).not.toContain(SWORDCAT_CARD_KEY);
    const first = open({ showSwordcat: false, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false });
    expect(within(first.dialog).queryByTestId("game-card-swordcat")).toBeNull();
    expect(within(first.dialog).getAllByRole("listitem")).toHaveLength(4);
    cleanup();
    process.env.NEXT_PUBLIC_SWORDCAT_PICKER = "0";
    try {
      expect(swordcatPickerEnabled()).toBe(false);
      const second = open({ showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false });
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
    const { navigate, setGameType, onClose, dialog } = open({ showSwordcat: true, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false });
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

describe("Bad Cat Daily card (no flag, web only)", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is in the picker by default with no env set, before Formula Meow and Ultra Cat, linking to /badcat?from=picker", () => {
    expect(Object.keys(process.env).filter((k) => /BADCAT/i.test(k))).toEqual([]);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 3].getAttribute("data-card")).toBe(BADCAT_CARD_KEY);
    const card = within(dialog).getByTestId("game-card-badcat");
    expect(card.getAttribute("href")).toBe("/badcat?from=picker&utm_source=tt_picker");
    expect(card.getAttribute("aria-label")).toBe("BAD CAT DAILY · NEW");
    const art = within(dialog).getByTestId("game-card-badcat-preview");
    expect(art.getAttribute("src")).toBe(BADCAT_PREVIEW.src);
    expect(art.getAttribute("width")).toBe("312");
    expect(art.getAttribute("height")).toBe("218");
    expect(art.getAttribute("alt")).toBe("");
  });

  it("opens /badcat with a full page load and never picks a Phaser mode", () => {
    const { navigate, setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByTestId("game-card-badcat"));
    expect(navigate).toHaveBeenCalledWith("/badcat?from=picker&utm_source=tt_picker");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("comes after Swordcat in gameCards, with no GameType and no money claim", () => {
    const cards = gameCards(true, new Date(), true, true);
    expect(cards.map((card) => card.key)).toEqual([
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
    ]);
    const card = cards[5];
    expect(card).toMatchObject({ href: "/badcat", previewVariant: "BADCAT", badge: "NEW" });
    expect(card.type).toBeUndefined();
    expect(card.description).not.toMatch(/\$|USDC|treat|Pink Paw|shelter/i);
  });

  it("is left out of the app build (no /badcat rewrites there)", () => {
    process.env.NEXT_PUBLIC_IS_APP = "1";
    expect(badcatEntryEnabled()).toBe(false);
    const { dialog } = open();
    expect(within(dialog).queryByTestId("game-card-badcat")).toBeNull();
  });

  it("ships a 2x WebP for the card's 312x218 box", () => {
    const buf = fs.readFileSync(path.join(path.resolve(__dirname, "../public"), BADCAT_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
  });

  it("uses three to a row from md with five, six or nine cards, four to a row with four, seven or eight", () => {
    const six = open({ showRave: false, showFormulaMeow: false, showUltraCat: false });
    const item = within(six.dialog).getAllByRole("listitem")[0];
    expect(item.className).toContain("md:w-[calc(33.333%-0.75rem)]");
    // Six on a short landscape phone: 3 + 3 and the list scrolls (one row of six cut the lines off).
    expect(item.className).not.toContain("max-height:520px");
    cleanup();
    const four = open({ showSwordcat: false, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false });
    expect(within(four.dialog).getAllByRole("listitem")[0].className).toContain("md:w-[calc(25%-0.75rem)]");
    cleanup();
    // Seven (every card, in the Cupid season): 4 + 3, and no one-row squeeze on short landscape screens.
    const seven = open({ showFormulaMeow: false, showUltraCat: false });
    const first = within(seven.dialog).getAllByRole("listitem")[0];
    expect(within(seven.dialog).getAllByRole("listitem")).toHaveLength(7);
    expect(first.className).toContain("md:w-[calc(25%-0.75rem)]");
    expect(first.className).not.toContain("max-height:520px");
    cleanup();
    // Eight (every card but Ultra Cat in the Cupid season, or every card outside it): 4 + 4.
    const eight = open({ showUltraCat: false });
    expect(within(eight.dialog).getAllByRole("listitem")).toHaveLength(8);
    expect(within(eight.dialog).getAllByRole("listitem")[0].className).toContain("md:w-[calc(25%-0.75rem)]");
    cleanup();
    // Nine (every card, in the Cupid season): 3 + 3 + 3 (5 + 4 squeezed the descriptions).
    const nine = open();
    expect(within(nine.dialog).getAllByRole("listitem")).toHaveLength(9);
    expect(within(nine.dialog).getAllByRole("listitem")[0].className).toContain("md:w-[calc(33.333%-0.75rem)]");
  });
});

describe("Moon Rave card (no flag, web only)", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is in the picker by default with no env set, first, linking to /rave?from=picker", () => {
    expect(raveEntryEnabled(false)).toBe(true);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[0].getAttribute("data-card")).toBe(RAVE_CARD_KEY);
    const card = within(dialog).getByTestId("game-card-rave");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/rave?from=picker");
    expect(card.getAttribute("aria-label")).toBe("MOON RAVE · NEW");
    expect(within(dialog).getByText(RAVE_PICKER_DESCRIPTION)).toBeTruthy();
    const art = within(dialog).getByTestId("game-card-rave-preview");
    expect(art.getAttribute("src")).toBe(RAVE_PREVIEW.src);
    expect(art.getAttribute("width")).toBe("312");
    expect(art.getAttribute("height")).toBe("218");
    expect(art.getAttribute("alt")).toBe("");
  });

  it("links to the same /rave page as the landing section, tagged with the picker as its source", () => {
    expect(cardHref({ key: RAVE_CARD_KEY, href: "/rave" })).toBe("/rave?from=picker");
    expect(RAVE_SECTION_HREF).toBe("/rave?from=landing_rave");
  });

  it("opens /rave with a full page load and never picks a Phaser mode", () => {
    const { navigate, setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByTestId("game-card-rave"));
    expect(navigate).toHaveBeenCalledWith("/rave?from=picker");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("comes first in gameCards, before Cupid Cat, with no GameType", () => {
    const cards = gameCards(true, new Date(), true, true, true);
    expect(cards.map((card) => card.key)).toEqual([
      RAVE_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
    ]);
    expect(cards[0]).toMatchObject({ title: "MOON RAVE", href: "/rave", previewVariant: "RAVE", badge: "NEW" });
    expect(cards[0].type).toBeUndefined();
    expect(Object.values(GameType)).not.toContain(RAVE_CARD_KEY);
    // The $1 = 1 dancing cat rule, with Token Tails or the giver as the subject.
    expect(cards[0].description).toMatch(/\$1/);
    expect(cards[0].description).toMatch(/Token Tails|you/);
    expect(cards[0].description).not.toMatch(/adopt|token(?! tails)/i);
    // Left out unless asked for.
    expect(gameCards(true, new Date(), true, true).map((card) => card.key)).not.toContain(RAVE_CARD_KEY);
  });

  it("is left out of the app build (no /rave rewrite there)", () => {
    process.env.NEXT_PUBLIC_IS_APP = "1";
    expect(raveEntryEnabled()).toBe(false);
    const { dialog } = open();
    expect(within(dialog).queryByTestId("game-card-rave")).toBeNull();
    expect(within(dialog).queryByRole("link", { name: /MOON RAVE/ })).toBeNull();
  });

  it("ships a 2x WebP for the card's 312x218 box", () => {
    expect(RAVE_PREVIEW).toMatchObject({ width: 312, height: 218 });
    const buf = fs.readFileSync(path.join(path.resolve(__dirname, "../public"), RAVE_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
    // The app export prunes it (the card never renders there).
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    expect(prune).toContain(`"${RAVE_PREVIEW.src.slice(1)}"`);
  });
});

describe("Formula Meow card (no flag, web only)", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is in the picker by default, before Ultra Cat, linking to /meow-race?from=picker with real game art", () => {
    expect(formulaMeowEntryEnabled(false)).toBe(true);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 2].getAttribute("data-card")).toBe(FORMULA_MEOW_CARD_KEY);
    const card = within(dialog).getByTestId("game-card-formula_meow");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/meow-race?from=picker");
    expect(card.getAttribute("aria-label")).toBe("FORMULA MEOW · NEW");
    expect(within(dialog).getByText(FORMULA_MEOW_PICKER_DESCRIPTION)).toBeTruthy();
    const art = within(dialog).getByTestId("game-card-formula_meow-preview");
    expect(art.getAttribute("src")).toBe(FORMULA_MEOW_PREVIEW.src);
    expect(art.getAttribute("width")).toBe("312");
    expect(art.getAttribute("height")).toBe("218");
    expect(art.getAttribute("alt")).toBe("");
  });

  it("opens /meow-race with a full page load and never picks a Phaser mode", () => {
    const { navigate, setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByTestId("game-card-formula_meow"));
    expect(navigate).toHaveBeenCalledWith("/meow-race?from=picker");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("comes after Bad Cat in gameCards, with no GameType, no numbers and no money claim", () => {
    const cards = gameCards(true, new Date(), true, true, true, true);
    expect(cards.map((card) => card.key)).toEqual([
      RAVE_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
    ]);
    const card = cards[7];
    expect(card).toMatchObject({ title: "FORMULA MEOW", href: "/meow-race", previewVariant: "FORMULA_MEOW", badge: "NEW" });
    expect(card.type).toBeUndefined();
    expect(Object.values(GameType)).not.toContain(FORMULA_MEOW_CARD_KEY);
    expect(card.description).not.toMatch(/\d|\$|USDC|treat|Pink Paw|shelter/i);
    expect(gameCards(true, new Date(), true, true, true).map((c) => c.key)).not.toContain(FORMULA_MEOW_CARD_KEY);
  });

  it("is left out of the app build (no /meow-race rewrite there)", () => {
    process.env.NEXT_PUBLIC_IS_APP = "1";
    expect(formulaMeowEntryEnabled()).toBe(false);
    const { dialog } = open();
    expect(within(dialog).queryByTestId("game-card-formula_meow")).toBeNull();
  });

  it("ships a 2x WebP for the card's 312x218 box, pruned from the app export", () => {
    expect(FORMULA_MEOW_PREVIEW).toMatchObject({ width: 312, height: 218 });
    const buf = fs.readFileSync(path.join(path.resolve(__dirname, "../public"), FORMULA_MEOW_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    expect(prune).toContain(`"${FORMULA_MEOW_PREVIEW.src.slice(1)}"`);
  });

  it("is served by the /meow-race rewrite in next.config.js", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../next.config.js"), "utf8");
    expect(config).toContain('{ source: "/meow-race", destination: `${MEOW}/index.html` }');
    expect(config).toMatch(/afterFiles: \[[^\]]*\.\.\.meowRaceRewrites/);
    // Listed in the sitemap (a rewrite, so next-sitemap cannot find it by itself).
    const sitemap = fs.readFileSync(path.resolve(__dirname, "../next-sitemap.config.js"), "utf8");
    expect(sitemap).toContain("{ loc: '/meow-race' }");
  });
});

describe("Ultra Cat card (no flag, web only)", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is in the picker by default, last, linking to /ultra-cat?from=picker with real game art", () => {
    expect(ultraCatEntryEnabled(false)).toBe(true);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 1].getAttribute("data-card")).toBe(ULTRA_CAT_CARD_KEY);
    const card = within(dialog).getByTestId("game-card-ultra_cat");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/ultra-cat?from=picker");
    expect(card.getAttribute("aria-label")).toBe("ULTRA CAT · NEW");
    expect(within(dialog).getByText(ULTRA_CAT_PICKER_DESCRIPTION)).toBeTruthy();
    const art = within(dialog).getByTestId("game-card-ultra_cat-preview");
    expect(art.getAttribute("src")).toBe(ULTRA_CAT_PREVIEW.src);
    expect(art.getAttribute("alt")).toBe(ULTRA_CAT_PREVIEW.alt);
    expect(art.getAttribute("width")).toBe("312");
    expect(art.getAttribute("height")).toBe("218");
  });

  it("opens /ultra-cat with a full page load and never picks a Phaser mode", () => {
    const { navigate, setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByTestId("game-card-ultra_cat"));
    expect(navigate).toHaveBeenCalledWith("/ultra-cat?from=picker");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("comes after Formula Meow in gameCards, with no GameType, no numbers and no money claim", () => {
    const cards = gameCards(true, new Date(), true, true, true, true, true);
    expect(cards.map((card) => card.key)).toEqual([
      RAVE_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
      ULTRA_CAT_CARD_KEY,
    ]);
    const card = cards[8];
    expect(card).toMatchObject({ title: "ULTRA CAT", href: "/ultra-cat", previewVariant: "ULTRA_CAT", badge: "NEW" });
    expect(card.type).toBeUndefined();
    expect(Object.values(GameType)).not.toContain(ULTRA_CAT_CARD_KEY);
    expect(card.description).not.toMatch(/\d|\$|USDC|treat|Pink Paw|shelter/i);
    expect(cardHref(card)).toBe("/ultra-cat?from=picker");
    expect(gameCards(true, new Date(), true, true, true, true).map((c) => c.key)).not.toContain(ULTRA_CAT_CARD_KEY);
  });

  it("is left out of the app build (no /ultra-cat rewrite there)", () => {
    process.env.NEXT_PUBLIC_IS_APP = "1";
    expect(ultraCatEntryEnabled()).toBe(false);
    const { dialog } = open();
    expect(within(dialog).queryByTestId("game-card-ultra_cat")).toBeNull();
  });

  it("ships a 2x WebP for the card's 312x218 box, pruned from the app export", () => {
    expect(ULTRA_CAT_PREVIEW).toMatchObject({ width: 312, height: 218 });
    const buf = fs.readFileSync(path.join(path.resolve(__dirname, "../public"), ULTRA_CAT_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    expect(prune).toContain(`"${ULTRA_CAT_PREVIEW.src.slice(1)}"`);
  });

  it("is served by the /ultra-cat rewrite in next.config.js", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../next.config.js"), "utf8");
    expect(config).toContain('{ source: "/ultra-cat", destination: `${ULTRA}/index.html` }');
    expect(config).toMatch(/afterFiles: \[[^\]]*\.\.\.ultraCatRewrites/);
    // The built game sits where the rewrite points (ultra-cat: `npm run build:client`).
    expect(fs.existsSync(path.resolve(__dirname, "../public/ultracat-game/index.html"))).toBe(true);
    // Listed in the sitemap (a rewrite, so next-sitemap cannot find it by itself).
    const sitemap = fs.readFileSync(path.resolve(__dirname, "../next-sitemap.config.js"), "utf8");
    expect(sitemap).toContain("{ loc: '/ultra-cat' }");
  });
});
