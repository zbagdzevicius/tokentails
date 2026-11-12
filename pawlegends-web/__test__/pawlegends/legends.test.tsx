/**
 * @jest-environment jsdom
 */
/**
 * `/legends`: the landing A/B arm B (the scroll-lane-map landing). It must say only what the game does (the facts are
 * read from the game's source here), ship every file it loads and no inlined pictures, carry its arm to the game
 * (`lv=B`), report it on view (a fixed dwell, the same as arm A) and on play clicks, and share as itself (og:url `/legends`).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import React, { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const replace = jest.fn(() => Promise.resolve(true));
const mockRouter = { replace, pathname: "/legends", query: {} as Record<string, string>, isReady: true };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
const seoProps = jest.fn();
jest.mock("@/components/seo/SeoHead", () => ({ SeoHead: (props: unknown) => (seoProps(props), null) }));
const mockStop = jest.fn();
const mockStart = jest.fn((...args: unknown[]) => (void args, mockStop));
jest.mock("@/components/pawlegends/legends/motion", () => ({ startLegendsMotion: (...a: unknown[]) => mockStart(...a) }));
jest.mock("gsap", () => ({ gsap: {} }));
for (const name of ["ScrollTrigger", "SplitText", "CustomEase", "DrawSVGPlugin", "Physics2DPlugin", "Flip", "MotionPathPlugin", "ScrambleTextPlugin"]) {
  jest.doMock(`gsap/${name}`, () => ({ [name]: {} }));
}
const mockPushes: Array<Record<string, unknown>> = [];
jest.mock("@/analytics/gtm", () => ({ gtm: { push: (d: Record<string, unknown>) => (mockPushes.push(d), true), start: () => () => {} } }));
const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({ analytics: { init: jest.fn(), track: (e: unknown) => mockTrack(e) } }));

import LegendsPage, { LEGENDS_SEO } from "@/pages/legends";
import LegendsMotion from "@/components/pawlegends/legends/LegendsMotion";
import { LEGENDS_FACTS } from "@/components/pawlegends/legends/facts";
import { LEGENDS_CTA, LEGENDS_FILES, LEGENDS_FONT, legendsMarkup } from "@/components/pawlegends/legends/markup";
import { LANDING_FONT } from "@/components/pawlegends/landing/markup";
import { countWord, gridHeroes, landingCats, landingDogs, liveRoster, newcomers } from "@/components/pawlegends/landing/roster";
import { ctaOf, LANDING_VIEW_DWELL_MS, landingVariantOf, useLandingVariant, variantPlayHref } from "@/components/pawlegends/landingVariant";
import { PAWLEGENDS_PLAY_QUERY_KEYS } from "@/components/pawlegends/routes";
import { ANALYTICS_DEFER_MAX_MS, LANDING_READY_EVENT } from "@/components/GoogleTagManager";
import { PRELOAD_FONT_FILES } from "@/components/typography/fonts.generated";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { preloadFontsFor, watchesChunksFor } = require("@/pages/_document");

const GAME = join(__dirname, "../../../pawlegends/src");
const read = (p: string) => readFileSync(join(GAME, p), "utf8");
const num = (re: RegExp, src: string) => Number(re.exec(src)?.[1]);

const ENV = { ...process.env };
afterEach(() => {
  cleanup();
  process.env = { ...ENV };
  mockRouter.query = {};
  replace.mockClear();
  seoProps.mockClear();
});

describe("/legends landing", () => {
  it("renders the lane page with today's roster, og:url /legends and noindex", async () => {
    render(<LegendsPage />);
    const root = screen.getByTestId("legends-landing");
    expect(root.classList.contains("lgb")).toBe(true);
    expect(root.querySelector("h1")?.getAttribute("aria-label")).toBe("Pawlegends");
    const grid = gridHeroes();
    expect(root.querySelectorAll("#grid .slot")).toHaveLength(grid.length);
    expect(root.querySelectorAll("#grid .hc.dog")).toHaveLength(grid.filter((h) => h.side === "dog").length);
    expect(root.textContent).toContain(`${countWord(liveRoster().length)} legends, live now.`);
    expect(root.textContent).toContain(`${countWord(landingCats().length)} cats and ${countWord(landingDogs().length).toLowerCase()} dogs`);
    expect(root.textContent).toContain(`All ${grid.length}`);
    expect(root.querySelectorAll(".next li")).toHaveLength(newcomers().length);
    expect(root.querySelectorAll(".tower")).toHaveLength(LEGENDS_FACTS.towersPerTeam);
    expect(root.querySelectorAll(".twi i")).toHaveLength(LEGENDS_FACTS.towersPerTeam);
    expect(root.textContent).toContain("No PvP.");
    // og:url comes from `path`: a shared /legends link must send its clicks to arm B, not to /
    expect(seoProps).toHaveBeenCalledWith(expect.objectContaining({ path: "/legends", noindex: true }));
    expect(LEGENDS_SEO.image.url).toBe("/pawlegends/og.jpg");
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });

  it("says nothing the game does not do", () => {
    const text = legendsMarkup();
    // the preview's claims that were not true, or not checked
    expect(text).not.toMatch(/One lane\./);
    expect(text).not.toMatch(/Twelve legends|Ten cats and two dogs|All 12/);
    expect(text).not.toMatch(/PvP isn.t here yet/);
    expect(text).not.toMatch(/\$\s?\d|half of each|goes to the Pink Paw/i);
    expect(text).not.toMatch(/Live match/);
    expect(text).not.toMatch(/players|downloads|rated|reviews/i);
  });

  it("links every play button to the game page with a from tag and lv=B, never the raw build", () => {
    const html = legendsMarkup();
    for (const [key, href] of Object.entries(LEGENDS_CTA)) {
      expect(href).toBe(`/play?from=legends_${key}&lv=B`);
      expect(html).toContain(`href="${href}" data-cta="legends_${key}"`);
      expect(`legends_${key}`).toMatch(/^[a-z0-9_-]{1,24}$/);
    }
    expect(html).not.toContain("pawlegends-game");
    expect(html).not.toMatch(/https?:\/\/tokentails\.com\//);
    expect(html).not.toContain("cdnjs");
    expect(html).toContain('href="/terms"');
  });

  it("inlines no pictures or fonts and ships every file it loads", () => {
    const html = legendsMarkup();
    expect(html).not.toMatch(/data:(image|font)\/[a-z0-9+]+;base64/);
    expect(html.length).toBeLessThan(60_000);
    expect(LEGENDS_FONT).toBe(LANDING_FONT);
    for (const f of LEGENDS_FILES) expect(existsSync(join(__dirname, "../../public", f))).toBe(true);
    for (const m of Array.from(html.matchAll(/(?:src|href)="(\/pawlegends\/landing\/[^"]+)"/g))) expect(LEGENDS_FILES).toContain(m[1]);
  });

  it("states the game's own facts (read from its source)", () => {
    const api = read("sim/api.ts");
    const map = read("data/map.ts");
    const timeline = read("data/timeline.ts");
    expect(num(/SLOTS_PER_TEAM\s*=\s*(\d+)/, api)).toBe(LEGENDS_FACTS.teamSize);
    expect(num(/heroesPerTeam:\s*(\d+)/, map)).toBe(LEGENDS_FACTS.teamSize);
    // the Classic map (the landing describes Classic; sim v22 made LANES a per-map `let`)
    const lanes = /const C_LANES[^=]*=\s*Object\.freeze\(\[([^\]]*)\]/.exec(map)?.[1] ?? "";
    expect(lanes.split(",").filter((s) => s.trim()).length).toBe(LEGENDS_FACTS.lanes);
    const spots = /const C_TOWER_SPOTS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(map)?.[1] ?? "";
    expect((spots.match(/tier:/g) ?? []).length).toBe(LEGENDS_FACTS.towersPerTeam);
    expect(num(/towers:\s*(\d+)/, map)).toBe(LEGENDS_FACTS.towersPerTeam * 2);
    // a party seats COOP_HUMANS (MAX_HUMANS became the 5v5 PvP wire width in PROTO 4)
    expect(num(/COOP_HUMANS\s*=\s*(\d+)/, read("net/proto.ts"))).toBe(LEGENDS_FACTS.partyMax);
    const hz = num(/TICK_HZ\s*=\s*(\d+)/, timeline);
    expect(num(/safetyEnd:\s*(\d+)/, timeline) / hz / 60).toBe(LEGENDS_FACTS.matchCapMinutes);
    expect(num(/barrierDrop:\s*(\d+)/, timeline) / hz).toBe(LEGENDS_FACTS.gateSeconds);
    const flags = readFileSync(join(__dirname, "../../components/pawlegends/flags.ts"), "utf8");
    expect(num(/PARTY_CODE = \/\^\[[^\]]+\]\{(\d+)\}\$\//, flags)).toBe(LEGENDS_FACTS.roomCodeLength);
  });

  it.each([["party", "K7QX2M"], ["dare", "9ix.0.0.1.c0"], ["from", "home_hub_pawlegends"]])(
    "sends ?%s= on to the game with the whole query",
    async (key, value) => {
      mockRouter.query = { [key]: value, utm_source: "x" };
      const { container } = render(<LegendsPage />);
      expect(container.querySelector(".lgb")).toBeNull();
      await Promise.resolve();
      expect(replace).toHaveBeenCalledWith({ pathname: "/play", query: { [key]: value, utm_source: "x" } });
    }
  );

  it("redirects game keys on the server, preloads only its own fonts and watches its motion chunk", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../../next.config.js");
    const rules: { source: string; has?: { type: string; key: string }[]; destination: string; permanent: boolean }[] =
      await config.redirects();
    for (const key of PAWLEGENDS_PLAY_QUERY_KEYS) {
      expect(rules).toContainEqual({ source: "/legends", has: [{ type: "query", key }], destination: "/play", permanent: false });
    }
    expect(rules.some((r) => r.source === "/legends" && !r.has)).toBe(false);
    expect(preloadFontsFor("/legends")).toEqual(PRELOAD_FONT_FILES.filter((f: string) => f.includes("/nunito-")));
    expect(watchesChunksFor("/legends")).toBe(true);
  });
});

describe("the /legends motion chunk", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("starts the engine in a task of its own and stops it on unmount", () => {
    mockStart.mockClear();
    mockStop.mockClear();
    const div = document.createElement("div");
    const ref = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
    ref.current = div;
    const view = render(<LegendsMotion rootRef={ref} />);
    expect(mockStart).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0][0]).toBe(div);
    expect(Object.keys(mockStart.mock.calls[0][1] as object)).toEqual(
      expect.arrayContaining(["gsap", "ScrollTrigger", "SplitText", "CustomEase", "DrawSVGPlugin", "Physics2DPlugin", "Flip", "MotionPathPlugin"])
    );
    view.unmount();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

describe("landing A/B arm reporting", () => {
  const ric = window.requestIdleCallback;
  beforeAll(() => {
    window.requestIdleCallback = ((cb: IdleRequestCallback) => (cb({} as IdleDeadline), 1)) as typeof window.requestIdleCallback;
  });
  afterAll(() => {
    window.requestIdleCallback = ric;
  });
  beforeEach(() => {
    mockPushes.length = 0;
    mockTrack.mockClear();
  });

  it("builds and reads the arm on play links", () => {
    expect(variantPlayHref("legends_hero", "B")).toBe("/play?from=legends_hero&lv=B");
    expect(landingVariantOf("?from=legends_hero&lv=B")).toBe("B");
    expect(landingVariantOf("?lv=a")).toBe("A");
    expect(landingVariantOf("?lv=C")).toBeNull();
    expect(landingVariantOf("")).toBeNull();
    const a = document.createElement("a");
    a.setAttribute("data-cta", "legends_final");
    const inner = document.createElement("span");
    a.appendChild(inner);
    expect(ctaOf(inner)).toBe("legends_final");
    a.setAttribute("data-cta", "<x>");
    expect(ctaOf(inner)).toBeNull();
    expect(ctaOf(document.body)).toBeNull();
  });

  it("reports B on view after the fixed dwell, never on the intro's ready signal or a scroll", () => {
    jest.useFakeTimers();
    try {
      render(<LegendsPage />);
      act(() => {
        window.dispatchEvent(new Event(LANDING_READY_EVENT));
        window.dispatchEvent(new Event("scroll"));
        jest.advanceTimersByTime(LANDING_VIEW_DWELL_MS - 1);
      });
      expect(mockPushes).toEqual([]);
      expect(mockTrack).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(mockPushes).toEqual([expect.objectContaining({ event: "landing_variant_view", landing_variant: "B", landing_path: "/" })]);
      expect(mockTrack).toHaveBeenCalledWith({ name: "pawlegends_landing_view", properties: { landing_variant: "B" } });
      act(() => {
        jest.advanceTimersByTime(LANDING_VIEW_DWELL_MS * 3);
      });
      expect(mockPushes.filter((d) => d.event === "landing_variant_view")).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a play click before the dwell sends the view first, then the click, and the view only once", () => {
    jest.useFakeTimers();
    try {
      render(<LegendsPage />);
      const cta = screen.getByTestId("legends-landing").querySelector('a[data-cta="legends_final"]') as HTMLAnchorElement;
      cta.addEventListener("click", (e) => e.preventDefault());
      fireEvent.click(cta);
      // the click also goes out under a plain name for GTM triggers (pawlegends_play_click / pawlegends_app_store_click)
      expect(mockPushes.map((d) => d.event)).toEqual(["landing_variant_view", "landing_variant_cta", "pawlegends_play_click"]);
      expect(mockPushes[2]).toEqual(expect.objectContaining({ landing_variant: "B", cta: "legends_final" }));
      expect(mockPushes[1]).toEqual(expect.objectContaining({ landing_variant: "B", cta: "legends_final" }));
      expect(mockTrack).toHaveBeenCalledWith({ name: "pawlegends_landing_cta", properties: { landing_variant: "B", cta: "legends_final" } });
      act(() => {
        jest.advanceTimersByTime(LANDING_VIEW_DWELL_MS * 2);
      });
      expect(mockPushes.filter((d) => d.event === "landing_variant_view")).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("arm A counts its view by the same rule (the same dwell, not its intro)", () => {
    expect(LANDING_VIEW_DWELL_MS).toBe(ANALYTICS_DEFER_MAX_MS);
    jest.useFakeTimers();
    try {
      const root = document.createElement("div");
      document.body.appendChild(root);
      const ref = { current: root };
      const Probe = () => {
        useLandingVariant(ref, "A");
        return null;
      };
      render(<Probe />);
      act(() => {
        window.dispatchEvent(new Event(LANDING_READY_EVENT));
        jest.advanceTimersByTime(LANDING_VIEW_DWELL_MS - 1);
      });
      expect(mockPushes).toEqual([]);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(mockPushes).toEqual([expect.objectContaining({ event: "landing_variant_view", landing_variant: "A" })]);
      root.remove();
    } finally {
      jest.useRealTimers();
    }
  });
});
