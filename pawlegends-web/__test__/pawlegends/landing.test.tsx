/**
 * @jest-environment jsdom
 */
/**
 * `/` is the landing page; `/play` is the game. Game links (party invites, dares, Stripe
 * returns, account emails, `from`) carry a query key that sends them on to the game, on the server
 * (next.config.js) and in the browser (the page). Marketing links stay.
 */
import { existsSync } from "fs";
import { join } from "path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

const replace = jest.fn(() => Promise.resolve(true));
const mockRouter = { replace, pathname: "/", query: {} as Record<string, string>, isReady: true };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
const seoProps = jest.fn();
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: (props: unknown) => (seoProps(props), null) }));
const mockStart = jest.fn(() => jest.fn());
jest.mock("@/components/pawlegends/landing/motion", () => ({ startLandingMotion: (...a: unknown[]) => mockStart(...(a as [])) }));
jest.mock("gsap", () => ({ gsap: {} }));
for (const name of ["ScrollTrigger", "SplitText", "CustomEase", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin"]) {
  jest.doMock(`gsap/${name}`, () => ({ [name]: {} }));
}

import LandingPage, { PAWLEGENDS_LANDING_SEO } from "@/pages/index";
import { CONTINUE_CTA_HREF, HERO_CTA_HREF, LANDING_FILES, landingMarkup } from "@/components/pawlegends/landing/markup";
import { PAWLEGENDS_PLAY_QUERY_KEYS, playHref, wantsGame } from "@/components/pawlegends/routes";
import { gridHeroes, liveRoster, newcomers } from "@/components/pawlegends/landing/roster";

const ENV = { ...process.env };
afterEach(() => {
  cleanup();
  process.env = { ...ENV };
  mockRouter.query = {};
});

describe("/ landing", () => {
  it("renders the hero, the roster count, the party round and noindex meta", async () => {
    render(<LandingPage />);
    const root = screen.getByTestId("pawlegends-landing");
    expect(root.querySelector("h1")?.getAttribute("aria-label")).toBe("Pawlegends");
    expect(root.textContent).toContain(`${liveRoster().length} heroes live`);
    expect(root.textContent).toContain("Squad up");
    expect(root.textContent).toContain("No PvP.");
    const grid = gridHeroes();
    expect(root.querySelectorAll(".grid .tile.cat")).toHaveLength(grid.filter((h) => h.side === "cat").length);
    expect(root.querySelectorAll(".grid .tile.dog")).toHaveLength(grid.filter((h) => h.side === "dog").length);
    expect(root.querySelectorAll(".newdogs .nd")).toHaveLength(newcomers().length);
    expect(seoProps).toHaveBeenCalledWith(expect.objectContaining({ path: "/", noindex: true }));
    expect(PAWLEGENDS_LANDING_SEO.image.url).toBe("/pawlegends/og.jpg");
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });

  it("links every play button to the game page with a from tag, never the raw build", () => {
    const html = landingMarkup();
    expect(HERO_CTA_HREF).toBe("/play?from=landing_hero&lv=A");
    expect(CONTINUE_CTA_HREF).toBe("/play?from=landing_continue&lv=A");
    expect(html).toContain(`href="${HERO_CTA_HREF}"`);
    expect(html).toContain(`href="${CONTINUE_CTA_HREF}"`);
    expect(html).not.toContain("pawlegends-game");
    expect(html).not.toMatch(/https?:\/\/tokentails\.com\/pawlegends/);
    expect(html).not.toContain("cdnjs");
    for (const tag of ["landing_hero", "landing_continue"]) expect(tag).toMatch(/^[a-z0-9_-]{1,24}$/);
  });

  it("ships every file it loads", () => {
    for (const f of LANDING_FILES) {
      expect(existsSync(join(__dirname, "../../public", f))).toBe(true);
    }
  });

  it.each([["party", "K7QX2M"], ["dare", "9ix.0.0.1.c0"], ["checkout", "cancel"], ["from", "home_hub_pawlegends"]])(
    "sends ?%s= on to the game with the whole query",
    async (key, value) => {
      mockRouter.query = { [key]: value, utm_source: "x" };
      const { container } = render(<LandingPage />);
      expect(container.querySelector(".pll")).toBeNull();
      await Promise.resolve();
      expect(replace).toHaveBeenCalledWith({ pathname: "/play", query: { [key]: value, utm_source: "x" } });
    }
  );

  it("keeps marketing links on the landing", () => {
    mockRouter.query = { utm_source: "x", utm_campaign: "launch" };
    render(<LandingPage />);
    expect(replace).not.toHaveBeenCalled();
    expect(wantsGame({ utm_source: "x" })).toBe(false);
  });

  it("redirects on the server for every game key (next.config.js)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../../next.config.js");
    const rules: { source: string; has?: { type: string; key: string }[]; destination: string; permanent: boolean }[] =
      await config.redirects();
    for (const key of PAWLEGENDS_PLAY_QUERY_KEYS) {
      expect(rules).toContainEqual({ source: "/", has: [{ type: "query", key }], destination: "/play", permanent: false });
      // the old tokentails.com landing path too (older share links, the backend Stripe and email links)
      expect(rules).toContainEqual({ source: "/pawlegends", has: [{ type: "query", key }], destination: "/play", permanent: false });
    }
    expect(rules.some((r) => r.source === "/" && !r.has)).toBe(false);
    expect(playHref("picker")).toBe("/play?from=picker");
  });
});
