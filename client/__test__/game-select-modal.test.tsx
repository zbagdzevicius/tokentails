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
  PAWLEGENDS_CARD_KEY,
  PAWLEGENDS_PICKER_DESCRIPTION,
  PAWLEGENDS_PICKER_HREF,
  PAWLEGENDS_PREVIEW,
  RAVE_CARD_KEY,
  SWORDCAT_CARD_KEY,
  SWORDCAT_PICKER_HREF,
  SWORDCAT_PREVIEW,
  MEOW_RUN_CARD_KEY,
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
import { MEOW_RUN_PICKER_DESCRIPTION, MEOW_RUN_PREVIEW, meowRunEntryEnabled } from "@/components/meow-run/entry";
import { GameType } from "@/models/game";
import { PAWLEGENDS_TITLE } from "@/components/pawlegends/title";
import { pawlegendsPickerEnabled } from "@/components/pawlegends/flags";

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
  it("shows ten cards in a GameModal (the Moon Rave first; Swordcat, Bad Cat, Formula Meow, Ultra Cat and Meow Run on by default), the Heist as a link with its badge", () => {
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
      MEOW_RUN_CARD_KEY,
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
      MEOW_RUN_CARD_KEY,
    ]);
    expect(within(dialog).queryByTestId("game-card-heist")).toBeNull();
    expect(within(dialog).queryByRole("link", { name: /CATNIP HEIST/ })).toBeNull();
    // The links left are the Moon Rave, Swordcat, Bad Cat, Formula Meow, Ultra Cat and Meow Run cards.
    expect(within(dialog).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/rave?from=picker",
      SWORDCAT_PICKER_HREF,
      "/badcat?from=picker&utm_source=tt_picker",
      "/meow-race?from=picker",
      "/ultra-cat?from=picker",
      "/meow-run?from=picker",
    ]);
  });

  it("shows only the three Phaser cards with the Moon Rave, Heist, Swordcat, Bad Cat, Formula Meow, Ultra Cat and Meow Run cards all off", () => {
    const { dialog } = open({ showHeist: false, showSwordcat: false, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
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
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(10);
  });

  it("is left out by the kill switch (showSwordcat false, or NEXT_PUBLIC_SWORDCAT_PICKER=0)", () => {
    expect(gameCards(true).map((card) => card.key)).not.toContain(SWORDCAT_CARD_KEY);
    const first = open({ showSwordcat: false, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
    expect(within(first.dialog).queryByTestId("game-card-swordcat")).toBeNull();
    expect(within(first.dialog).getAllByRole("listitem")).toHaveLength(4);
    cleanup();
    process.env.NEXT_PUBLIC_SWORDCAT_PICKER = "0";
    try {
      expect(swordcatPickerEnabled()).toBe(false);
      const second = open({ showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
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
    const { navigate, setGameType, onClose, dialog } = open({ showSwordcat: true, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
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
  it("sits right after the Moon Rave and opens /pawlegends?from=picker with a full page load, showing a teamfight frame", () => {
    const { navigate, setGameType, dialog } = open({ showSwordcat: true, showPawlegends: true });
    const items = within(dialog).getAllByRole("listitem");
    // Every web card in the Cupid season (mocked on): the Moon Rave first, then Pawlegends (the new flagship).
    expect(items.map((item) => item.getAttribute("data-card"))).toEqual([
      RAVE_CARD_KEY,
      PAWLEGENDS_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
      ULTRA_CAT_CARD_KEY,
      MEOW_RUN_CARD_KEY,
    ]);
    const card = within(dialog).getByTestId("game-card-pawlegends");
    expect(card.getAttribute("href")).toBe(`${PAWLEGENDS_PICKER_HREF}?from=picker`);
    expect(card.getAttribute("aria-label")).toBe(`${PAWLEGENDS_TITLE.toUpperCase()} · NEW`);
    const preview = within(dialog).getByTestId("game-card-pawlegends-preview");
    expect(preview.getAttribute("src")).toBe("/game-select/pawlegends-preview@2x.webp");
    expect(preview.getAttribute("alt")).toBe(PAWLEGENDS_PREVIEW.alt);
    expect(within(card).getByText(PAWLEGENDS_PICKER_DESCRIPTION)).toBeTruthy();
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
    expect(gameCards(true, new Date("2026-05-01"), true, true, true).map((c) => c.key)).not.toContain(PAWLEGENDS_CARD_KEY);
    // isCupidSeason is mocked on for this file, so Cupid Cat is in whatever the date.
    expect(gameCards(true, new Date("2026-05-01"), true, true, true, true).map((c) => c.key)).toEqual([
      RAVE_CARD_KEY,
      PAWLEGENDS_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
    ]);
    // Without the Moon Rave it leads the list.
    expect(gameCards(true, new Date("2026-05-01"), true, true, false, true)[0].key).toBe(PAWLEGENDS_CARD_KEY);
    expect(cardHref({ key: PAWLEGENDS_CARD_KEY, href: PAWLEGENDS_PICKER_HREF })).toBe("/pawlegends?from=picker");
  });

  it("sits four to a row from md with eight cards, three to a row with nine, 4 + 3 + 3 with ten (every web card outside the Cupid season) and four to a row with eleven (in it)", () => {
    const eight = open({ showPawlegends: true, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
    const items = within(eight.dialog).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(items[0].className).toContain("md:w-[calc(25%-0.75rem)]");
    expect(items[0].className).not.toContain("max-height:520px");
    cleanup();
    const nine = open({ showPawlegends: true, showFormulaMeow: false, showMeowRun: false });
    const nineItems = within(nine.dialog).getAllByRole("listitem");
    expect(nineItems).toHaveLength(9);
    expect(nineItems[0].className).toContain("md:w-[calc(33.333%-0.75rem)]");
    expect(nineItems[0].className).not.toContain("max-height:520px");
    cleanup();
    // Cupid Cat is mocked on, so dropping one card stands in for the ten web cards outside the season: the
    // grid of eight half-card columns (4 + 3 + 3, the rows of three centred).
    const ten = open({ showPawlegends: true, showMeowRun: false });
    const tenItems = within(ten.dialog).getAllByRole("listitem");
    expect(tenItems).toHaveLength(10);
    expect(screen.getByTestId("game-select-cards").className).toContain("md:grid md:grid-cols-8");
    expect(tenItems[0].className).toContain("md:col-span-2");
    expect(tenItems[0].className).not.toContain("md:w-[calc(");
    cleanup();
    const eleven = open({ showPawlegends: true });
    const all = within(eleven.dialog).getAllByRole("listitem");
    expect(all).toHaveLength(11);
    expect(screen.getByTestId("game-select-cards").className).not.toContain("md:grid");
    expect(all[0].className).toContain("md:w-[calc(25%-0.75rem)]");
    expect(all[0].className).not.toContain("max-height:520px");
  });
});

describe("Pawlegends card: web builds only (pawlegendsPickerEnabled) and its art", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is on in web builds with no env, hidden in app builds, and the kill switches hide it", () => {
    expect(pawlegendsPickerEnabled(false, undefined, undefined)).toBe(true);
    expect(pawlegendsPickerEnabled(true, undefined, undefined)).toBe(false);
    expect(pawlegendsPickerEnabled(false, "0", undefined)).toBe(false);
    expect(pawlegendsPickerEnabled(false, "off", undefined)).toBe(false);
    expect(pawlegendsPickerEnabled(false, undefined, "false")).toBe(false);
    expect(pawlegendsPickerEnabled(false, "1", "1")).toBe(true);
  });

  it("shows by default in a web build (no showPawlegends override) and never in an app build", () => {
    const web = render(<GameSelectModal onClose={jest.fn()} setGameType={jest.fn()} navigate={jest.fn()} />);
    const card = within(screen.getByRole("dialog")).getByTestId("game-card-pawlegends");
    expect(card.getAttribute("href")).toBe("/pawlegends?from=picker");
    web.unmount();
    cleanup();
    // The app build (NEXT_PUBLIC_IS_APP, read at call time): no Pawlegends card, the other app cards stay.
    process.env.NEXT_PUBLIC_IS_APP = "1";
    render(<GameSelectModal onClose={jest.fn()} setGameType={jest.fn()} navigate={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByTestId("game-card-pawlegends")).toBeNull();
    expect(within(dialog).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("ships a 2x in-engine WebP for the card's 312x218 box", () => {
    const pub = path.resolve(__dirname, "../public");
    expect(PAWLEGENDS_PREVIEW).toMatchObject({ width: 312, height: 218 });
    expect(PAWLEGENDS_PREVIEW.src).toMatch(/@2x\.webp$/);
    const buf = fs.readFileSync(path.join(pub, PAWLEGENDS_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
    expect(buf.length).toBeLessThan(40 * 1024);
    expect(fs.existsSync(path.join(pub, "game-select/pawlegends.webp"))).toBe(false);
    // Pruned from the app export like the other web-only picker art (the card never renders there).
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    expect(prune).toContain(`"${PAWLEGENDS_PREVIEW.src.slice(1)}"`);
  });
});

describe("Bad Cat Daily card (no flag, web only)", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is in the picker by default with no env set, before Formula Meow, Ultra Cat and Meow Run, linking to /badcat?from=picker", () => {
    expect(Object.keys(process.env).filter((k) => /BADCAT/i.test(k))).toEqual([]);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 4].getAttribute("data-card")).toBe(BADCAT_CARD_KEY);
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

  it("uses three to a row from md with five, six or nine cards, four to a row with four, seven or eight, and 4 + 3 + 3 with ten", () => {
    const six = open({ showRave: false, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
    const item = within(six.dialog).getAllByRole("listitem")[0];
    expect(item.className).toContain("md:w-[calc(33.333%-0.75rem)]");
    // Six on a short landscape phone: 3 + 3 and the list scrolls (one row of six cut the lines off).
    expect(item.className).not.toContain("max-height:520px");
    cleanup();
    const four = open({ showSwordcat: false, showBadcat: false, showRave: false, showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
    expect(within(four.dialog).getAllByRole("listitem")[0].className).toContain("md:w-[calc(25%-0.75rem)]");
    cleanup();
    // Seven (every card, in the Cupid season): 4 + 3, and no one-row squeeze on short landscape screens.
    const seven = open({ showFormulaMeow: false, showUltraCat: false, showMeowRun: false });
    const first = within(seven.dialog).getAllByRole("listitem")[0];
    expect(within(seven.dialog).getAllByRole("listitem")).toHaveLength(7);
    expect(first.className).toContain("md:w-[calc(25%-0.75rem)]");
    expect(first.className).not.toContain("max-height:520px");
    cleanup();
    // Eight: 4 + 4.
    const eight = open({ showUltraCat: false, showMeowRun: false });
    expect(within(eight.dialog).getAllByRole("listitem")).toHaveLength(8);
    expect(within(eight.dialog).getAllByRole("listitem")[0].className).toContain("md:w-[calc(25%-0.75rem)]");
    cleanup();
    // Nine: 3 + 3 + 3 (5 + 4 squeezed the descriptions).
    const nine = open({ showMeowRun: false });
    expect(within(nine.dialog).getAllByRole("listitem")).toHaveLength(9);
    expect(within(nine.dialog).getAllByRole("listitem")[0].className).toContain("md:w-[calc(33.333%-0.75rem)]");
    cleanup();
    // Ten (every card but Pawlegends, in the Cupid season): 4 + 3 + 3 on the eight-column grid, the first card of
    // each row of three (the 5th and the 8th) one column in.
    const ten = open();
    const tenItems = within(ten.dialog).getAllByRole("listitem");
    expect(tenItems).toHaveLength(10);
    expect(screen.getByTestId("game-select-cards").className).toContain("md:grid md:grid-cols-8");
    expect(tenItems[4].className).toContain("md:[&:nth-child(5)]:col-start-2");
    expect(tenItems[4].className).toContain("md:[&:nth-child(8)]:col-start-2");
    // Phones keep two per row (the flex row, half width each).
    expect(tenItems[0].className).toContain("w-[calc(50%-0.375rem)]");
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

  it("is in the picker by default, before Ultra Cat and Meow Run, linking to /meow-race?from=picker with real game art", () => {
    expect(formulaMeowEntryEnabled(false)).toBe(true);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 3].getAttribute("data-card")).toBe(FORMULA_MEOW_CARD_KEY);
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
    const cards = gameCards(true, new Date(), true, true, true, false, true);
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

  it("is in the picker by default, before Meow Run, linking to /ultra-cat?from=picker with real game art", () => {
    expect(ultraCatEntryEnabled(false)).toBe(true);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 2].getAttribute("data-card")).toBe(ULTRA_CAT_CARD_KEY);
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
    const cards = gameCards(true, new Date(), true, true, true, true, true, true);
    expect(cards.map((card) => card.key)).toEqual([
      RAVE_CARD_KEY,
      PAWLEGENDS_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
      ULTRA_CAT_CARD_KEY,
    ]);
    const card = cards[9];
    expect(card).toMatchObject({ title: "ULTRA CAT", href: "/ultra-cat", previewVariant: "ULTRA_CAT", badge: "NEW" });
    expect(card.type).toBeUndefined();
    expect(Object.values(GameType)).not.toContain(ULTRA_CAT_CARD_KEY);
    expect(card.description).not.toMatch(/\d|\$|USDC|treat|Pink Paw|shelter/i);
    expect(cardHref(card)).toBe("/ultra-cat?from=picker");
    expect(gameCards(true, new Date(), true, true, true, true, true).map((c) => c.key)).not.toContain(ULTRA_CAT_CARD_KEY);
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

describe("Meow Run card (no flag, web only)", () => {
  const envBefore = { ...process.env };
  afterEach(() => {
    process.env = { ...envBefore };
  });

  it("is in the picker by default, last, linking to /meow-run?from=picker with real game art", () => {
    expect(meowRunEntryEnabled(false)).toBe(true);
    const { dialog } = open();
    const items = within(dialog).getAllByRole("listitem");
    expect(items[items.length - 1].getAttribute("data-card")).toBe(MEOW_RUN_CARD_KEY);
    const card = within(dialog).getByTestId("game-card-meow_run");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/meow-run?from=picker");
    expect(card.getAttribute("aria-label")).toBe("MEOW RUN · NEW");
    expect(within(dialog).getByText(MEOW_RUN_PICKER_DESCRIPTION)).toBeTruthy();
    const art = within(dialog).getByTestId("game-card-meow_run-preview");
    expect(art.getAttribute("src")).toBe(MEOW_RUN_PREVIEW.src);
    expect(art.getAttribute("alt")).toBe(MEOW_RUN_PREVIEW.alt);
    expect(MEOW_RUN_PREVIEW.alt.length).toBeGreaterThan(20);
    expect(art.getAttribute("width")).toBe("312");
    expect(art.getAttribute("height")).toBe("218");
  });

  it("opens /meow-run with a full page load and never picks a Phaser mode", () => {
    const { navigate, setGameType, onClose, dialog } = open();
    fireEvent.click(within(dialog).getByTestId("game-card-meow_run"));
    expect(navigate).toHaveBeenCalledWith("/meow-run?from=picker");
    expect(setGameType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("comes after Ultra Cat in gameCards, with no GameType, no numbers and no money claim", () => {
    const cards = gameCards(true, new Date(), true, true, true, true, true, true, true);
    expect(cards.map((card) => card.key)).toEqual([
      RAVE_CARD_KEY,
      PAWLEGENDS_CARD_KEY,
      "PIXEL_RESCUE",
      "CATNIP_CHAOS",
      "MATCH_3",
      "CATNIP_HEIST",
      SWORDCAT_CARD_KEY,
      BADCAT_CARD_KEY,
      FORMULA_MEOW_CARD_KEY,
      ULTRA_CAT_CARD_KEY,
      MEOW_RUN_CARD_KEY,
    ]);
    const card = cards[10];
    expect(card).toMatchObject({ title: "MEOW RUN", href: "/meow-run", previewVariant: "MEOW_RUN", badge: "NEW" });
    expect(card.type).toBeUndefined();
    expect(Object.values(GameType)).not.toContain(MEOW_RUN_CARD_KEY);
    expect(card.description).not.toMatch(/\d|\$|USDC|treat|Pink Paw|shelter/i);
    expect(cardHref(card)).toBe("/meow-run?from=picker");
    expect(gameCards(true, new Date(), true, true, true, true, true, true).map((c) => c.key)).not.toContain(MEOW_RUN_CARD_KEY);
  });

  it("reads differently from Purrsuit, the classic runner", () => {
    const purrsuit = gameCards(true).find((card) => card.key === GameType.CATNIP_CHAOS)!;
    expect(purrsuit.tag).toBe("CLASSIC");
    expect(MEOW_RUN_PICKER_DESCRIPTION).not.toBe(purrsuit.description);
    expect(MEOW_RUN_PICKER_DESCRIPTION).toMatch(/kitten home/i);
    expect(MEOW_RUN_PICKER_DESCRIPTION).toMatch(/vault|wall-run|cloud/i);
  });

  it("is left out of the app build (no /meow-run rewrite there)", () => {
    process.env.NEXT_PUBLIC_IS_APP = "1";
    expect(meowRunEntryEnabled()).toBe(false);
    const { dialog } = open();
    expect(within(dialog).queryByTestId("game-card-meow_run")).toBeNull();
  });

  it("ships a 2x WebP for the card's 312x218 box, pruned from the app export", () => {
    expect(MEOW_RUN_PREVIEW).toMatchObject({ width: 312, height: 218 });
    const buf = fs.readFileSync(path.join(path.resolve(__dirname, "../public"), MEOW_RUN_PREVIEW.src));
    expect(buf.toString("latin1", 0, 4)).toBe("RIFF");
    expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    expect(prune).toContain(`"${MEOW_RUN_PREVIEW.src.slice(1)}"`);
  });

  it("is served by the /meow-run rewrite in next.config.js", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../next.config.js"), "utf8");
    expect(config).toContain('{ source: "/meow-run", destination: `${MEOWRUN}/index.html` }');
    expect(config).toContain('{ source: "/meow-run/:path*", destination: `${MEOWRUN}/:path*` }');
    expect(config).toMatch(/afterFiles: \[[^\]]*\.\.\.meowRunRewrites/);
    // The built game sits where the rewrite points (meow-run: `npm run build:client`, base /meowrun-game/).
    const html = fs.readFileSync(path.resolve(__dirname, "../public/meowrun-game/index.html"), "utf8");
    expect(html).toMatch(/src="\/meowrun-game\/build\/index-[\w-]+\.js"/);
    // Listed in the sitemap (a rewrite, so next-sitemap cannot find it by itself).
    const sitemap = fs.readFileSync(path.resolve(__dirname, "../next-sitemap.config.js"), "utf8");
    expect(sitemap).toContain("{ loc: '/meow-run' }");
  });
});
