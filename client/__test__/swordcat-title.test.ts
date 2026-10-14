/**
 * @jest-environment jsdom
 */
/**
 * The Swordcat title lives in one constant (Swordcat plan TOKENTAILS-PLAN.md §10.4, acceptance 8):
 * `components/swordcat/title.ts`. The page meta, the host and the PLAY picker read it, so a rename
 * (Pink Paw has not yet approved the name) is one edit. The constant is mocked to another name
 * here: every surface must follow it. With no `NEXT_PUBLIC_SWORDCAT*` set, nothing changes.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { render, screen, within } from "@testing-library/react";

const TEST_TITLE = "Test Knight";
const TEST_SUBTITLE = "A Test Adventure";
jest.mock("@/components/swordcat/title", () => ({ SWORDCAT_TITLE: "Test Knight", SWORDCAT_SUBTITLE: "A Test Adventure" }));
jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useOptionalFirebaseAuth: () => undefined,
  FirebaseAuthProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
const replace = jest.fn(() => Promise.resolve(true));
jest.mock("next/router", () => ({ useRouter: () => ({ replace, pathname: "/swordcat", query: {}, isReady: true }) }));
const seoProps = jest.fn();
jest.mock("@/components/seo/SeoHead", () => ({
  SeoHead: (props: unknown) => {
    seoProps(props);
    return null;
  },
}));
jest.mock("@/components/game/seasons", () => ({
  ...jest.requireActual("@/components/game/seasons"),
  isCupidSeason: () => false,
}));

import { GameSelectModal } from "@/components/shared/GameSelectModal";
import { SWORDCAT_FRAME_TESTID, SwordcatHost } from "@/components/swordcat/SwordcatHost";
import SwordcatPage, { SWORDCAT_SEO } from "@/pages/swordcat";

const FLAG_NAMES = ["NEXT_PUBLIC_SWORDCAT", "NEXT_PUBLIC_SWORDCAT_PICKER", "NEXT_PUBLIC_SWORDCAT_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of FLAG_NAMES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  replace.mockClear();
  seoProps.mockClear();
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

afterEach(() => {
  for (const name of FLAG_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function openPicker() {
  render(React.createElement(GameSelectModal, { onClose: jest.fn(), setGameType: jest.fn(), navigate: jest.fn(), showHeist: true }));
  return screen.getByRole("dialog");
}

describe("SWORDCAT_TITLE", () => {
  it("is 'Pink Paw Knight', subtitle 'A Token Tails Adventure' (must match the game's src/core/brand.js)", () => {
    const actual = jest.requireActual("@/components/swordcat/title");
    expect(actual.SWORDCAT_TITLE).toBe("Pink Paw Knight");
    expect(actual.SWORDCAT_SUBTITLE).toBe("A Token Tails Adventure");
  });

  it("is the only place the title is written in the page, host and picker sources", () => {
    const root = path.join(__dirname, "..");
    for (const file of [
      "pages/swordcat.tsx",
      "components/swordcat/SwordcatHost.tsx",
      "components/swordcat/flags.ts",
      "components/swordcat/bridge.ts",
      "components/shared/GameSelectModal.tsx",
    ]) {
      expect(fs.readFileSync(path.join(root, file), "utf8")).not.toMatch(/pink paw knight/i);
    }
  });
});

describe("with the flags on, every surface reads the constant", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SWORDCAT = "1";
    process.env.NEXT_PUBLIC_SWORDCAT_PICKER = "1";
  });

  it("page meta", () => {
    expect(SWORDCAT_SEO.title).toBe(`${TEST_TITLE} - Token Tails`);
    expect(SWORDCAT_SEO.description).toContain(TEST_SUBTITLE);
    render(React.createElement(SwordcatPage));
    expect(replace).not.toHaveBeenCalled();
    expect(seoProps).toHaveBeenCalledWith(expect.objectContaining({ title: `${TEST_TITLE} - Token Tails`, noindex: true }));
    expect(screen.getByTestId(SWORDCAT_FRAME_TESTID).getAttribute("title")).toBe(TEST_TITLE);
  });

  it("host: iframe title and the unavailable line", () => {
    const { unmount } = render(React.createElement(SwordcatHost, { url: "https://swordcat.tokentails.com/", navigate: jest.fn() }));
    expect(screen.getByTestId(SWORDCAT_FRAME_TESTID).getAttribute("title")).toBe(TEST_TITLE);
    unmount();
    render(React.createElement(SwordcatHost, { url: null, navigate: jest.fn() }));
    expect(screen.getByText(`${TEST_TITLE} is not available right now.`)).toBeTruthy();
  });

  it("picker card: title, label and a description with no shelter, impact or money words", () => {
    const dialog = openPicker();
    const card = within(dialog).getByTestId("game-card-swordcat");
    expect(card.getAttribute("aria-label")).toBe(`${TEST_TITLE.toUpperCase()} · NEW`);
    expect(within(card).getAllByText(TEST_TITLE.toUpperCase()).length).toBeGreaterThan(0);
    const description = within(card).getByText("Rescue lost kittens with a tiny knight");
    expect(description.textContent).not.toMatch(/shelter|donat|impact|money|treat|crypto|token|fund|help|save/i);
    expect(within(card).getByTestId("game-card-swordcat-preview")).toBeTruthy();
  });
});

describe("with no NEXT_PUBLIC_SWORDCAT* set, nothing changes", () => {
  it("/swordcat redirects to /game and renders nothing", () => {
    const { container } = render(React.createElement(SwordcatPage));
    expect(container.innerHTML).toBe("");
    expect(replace).toHaveBeenCalledWith("/game");
    expect(seoProps).not.toHaveBeenCalled();
  });

  it("the picker shows no Swordcat card", () => {
    const dialog = openPicker();
    expect(within(dialog).queryByTestId("game-card-swordcat")).toBeNull();
    expect(within(dialog).queryByText(TEST_TITLE.toUpperCase())).toBeNull();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
  });

  it("the picker flag alone does not show the card (it needs the page flag too)", () => {
    process.env.NEXT_PUBLIC_SWORDCAT_PICKER = "1";
    const dialog = openPicker();
    expect(within(dialog).queryByTestId("game-card-swordcat")).toBeNull();
  });
});
