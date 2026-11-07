/**
 * @jest-environment jsdom
 */
/**
 * Load speed of the `/pawlegends` landing: analytics waits for the intro, the motion chunk starts in a task of its
 * own and stops on unmount, tiles and screenshots ship smaller copies, and the page preloads only the fonts it draws.
 */
import { existsSync } from "fs";
import { join } from "path";
import React, { createRef } from "react";
import { act, render } from "@testing-library/react";

const mockStop = jest.fn();
const mockStart = jest.fn((...args: unknown[]) => (void args, mockStop));
jest.mock("@/components/pawlegends/landing/motion", () => ({ startLandingMotion: (...a: unknown[]) => mockStart(...a) }));
jest.mock("gsap", () => ({ gsap: {} }));
for (const name of ["ScrollTrigger", "SplitText", "CustomEase", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin"]) {
  jest.doMock(`gsap/${name}`, () => ({ [name]: {} }));
}
const mockRouteHandlers: Array<(path: string) => void> = [];
const mockRouterEvents = {
  on: (_: string, f: (path: string) => void) => mockRouteHandlers.push(f),
  off: (_: string, f: (path: string) => void) => mockRouteHandlers.splice(mockRouteHandlers.indexOf(f), 1),
};
jest.mock("next/router", () => ({ useRouter: () => ({ events: mockRouterEvents }) }));
const mockPushes: Array<Record<string, unknown>> = [];
const mockGtmStart = jest.fn(() => () => {});
jest.mock("@/analytics/gtm", () => ({ gtm: { push: (d: Record<string, unknown>) => (mockPushes.push(d), true), start: () => mockGtmStart() } }));
jest.mock("@/analytics", () => ({ analytics: { init: jest.fn() } }));

import LandingMotion from "@/components/pawlegends/landing/LandingMotion";
import { LANDING_FILES, landingMarkup, TILE_PORTRAIT_WIDTH } from "@/components/pawlegends/landing/markup";
import { afterLandingReady, ANALYTICS_DEFER_MAX_MS, GoogleTagManager, LANDING_READY_EVENT } from "@/components/GoogleTagManager";
import { MotionFailed } from "@/components/pawlegends/landing/PawlegendsLanding";
import {
  CHUNK_ERROR_COUNT,
  CHUNK_ERROR_EVENT,
  CHUNK_ERROR_WATCH,
  guardMotionChunk,
  MOTION_CHUNK_WAIT_MS,
} from "@/components/pawlegends/landing/motionChunk";
import { PRELOAD_FONT_FILES } from "@/components/typography/fonts.generated";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { preloadFontsFor, watchesChunksFor } = require("@/pages/_document");

beforeEach(() => {
  jest.useFakeTimers();
  mockStart.mockClear();
  mockStop.mockClear();
});
afterEach(() => jest.useRealTimers());

describe("analytics on the landing (afterLandingReady)", () => {
  const ric = window.requestIdleCallback;
  beforeAll(() => {
    // jsdom has no requestIdleCallback: run at once so the tests see the start.
    window.requestIdleCallback = ((cb: IdleRequestCallback) => (cb({} as IdleDeadline), 1)) as typeof window.requestIdleCallback;
  });
  afterAll(() => {
    window.requestIdleCallback = ric;
  });

  it("starts once when the intro says it is ready", () => {
    const start = jest.fn();
    afterLandingReady(start);
    expect(start).not.toHaveBeenCalled();
    window.dispatchEvent(new Event(LANDING_READY_EVENT));
    window.dispatchEvent(new Event(LANDING_READY_EVENT));
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS * 2);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("starts on the first tap or key, or after the cap", () => {
    const tap = jest.fn();
    afterLandingReady(tap);
    window.dispatchEvent(new Event("pointerdown"));
    expect(tap).toHaveBeenCalledTimes(1);
    const late = jest.fn();
    afterLandingReady(late);
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS - 1);
    expect(late).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("starts at once, without waiting for an idle moment, when the page is hidden first (a quick bounce)", () => {
    const start = jest.fn();
    afterLandingReady(start);
    const vis = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      expect(start).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event(LANDING_READY_EVENT));
      jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS * 2);
      expect(start).toHaveBeenCalledTimes(1);
    } finally {
      vis.mockRestore();
    }
  });

  it("never starts after its cleanup", () => {
    const start = jest.fn();
    const cancel = afterLandingReady(start);
    cancel();
    window.dispatchEvent(new Event(LANDING_READY_EVENT));
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS * 2);
    expect(start).not.toHaveBeenCalled();
  });
});

describe("page_view on the landing", () => {
  const setPath = (path: string) => window.history.replaceState(null, "", path);
  beforeEach(() => {
    mockPushes.length = 0;
    mockGtmStart.mockClear();
    setPath("/pawlegends");
  });
  afterAll(() => setPath("/"));
  const views = () => mockPushes.filter((d) => d.event === "page_view").map((d) => d.page_path);

  it.each(["/pawlegends", "/legends"])("%s (an A/B arm) starts on the same rule: not on the intro's ready signal, at the cap", (path) => {
    setPath(path);
    const view = render(<GoogleTagManager />);
    act(() => {
      window.dispatchEvent(new Event(LANDING_READY_EVENT));
    });
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS - 1);
    expect(mockGtmStart).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1 + 200);
    expect(mockGtmStart).toHaveBeenCalledTimes(1);
    expect(views()).toEqual([path]);
    view.unmount();
  });

  it("a landing's first tap starts it at once", () => {
    const view = render(<GoogleTagManager />);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    jest.advanceTimersByTime(200);
    expect(mockGtmStart).toHaveBeenCalledTimes(1);
    expect(views()).toEqual(["/pawlegends"]);
    view.unmount();
  });

  it("afterLandingReady with waitForIntro: false ignores the ready signal", () => {
    const start = jest.fn();
    const cancel = afterLandingReady(start, window, { waitForIntro: false });
    window.dispatchEvent(new Event(LANDING_READY_EVENT));
    expect(start).not.toHaveBeenCalled();
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS);
    expect(start).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("a route change before the start sends the landing's page_view first, then the new page's", () => {
    const view = render(<GoogleTagManager />);
    setPath("/pawlegends/terms");
    mockRouteHandlers.forEach((f) => f("/pawlegends/terms"));
    jest.advanceTimersByTime(200);
    expect(views()).toEqual(["/pawlegends", "/pawlegends/terms"]);
    mockRouteHandlers.forEach((f) => f("/pawlegends"));
    expect(views()).toEqual(["/pawlegends", "/pawlegends/terms", "/pawlegends"]);
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS * 2);
    expect(mockGtmStart).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("starts at once on every other page", () => {
    setPath("/game");
    const view = render(<GoogleTagManager />);
    expect(mockGtmStart).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    expect(views()).toEqual(["/game"]);
    view.unmount();
  });
});

describe("a motion chunk that fails never holds the page (guardMotionChunk)", () => {
  type W = Window & { [CHUNK_ERROR_COUNT]?: number };
  afterEach(() => {
    delete (window as W)[CHUNK_ERROR_COUNT];
  });
  const never = () => new Promise<string>(() => {});

  it("passes the chunk through when it loads", async () => {
    await expect(guardMotionChunk(Promise.resolve("motion"))).resolves.toBe("motion");
    // Its timer is gone: nothing rejects later.
    expect(jest.getTimerCount()).toBe(0);
  });

  it("rejects at once when a chunk script already failed before hydration", async () => {
    (window as W)[CHUNK_ERROR_COUNT] = 1;
    await expect(guardMotionChunk(never())).rejects.toThrow(/failed to load/);
  });

  it("rejects when a chunk script fails later, or after the wait", async () => {
    const later = guardMotionChunk(never());
    window.dispatchEvent(new Event(CHUNK_ERROR_EVENT));
    await expect(later).rejects.toThrow(/failed to load/);
    const slow = guardMotionChunk(never());
    jest.advanceTimersByTime(MOTION_CHUNK_WAIT_MS);
    await expect(slow).rejects.toThrow(/not loaded/);
  });

  it("the head watcher counts failed Next chunk scripts only, on the landing only", () => {
    new Function(CHUNK_ERROR_WATCH)();
    const seen = jest.fn();
    window.addEventListener(CHUNK_ERROR_EVENT, seen);
    const fail = (src: string) => {
      const s = document.createElement("script");
      s.setAttribute("src", src);
      document.head.appendChild(s);
      s.dispatchEvent(new Event("error"));
      s.remove();
    };
    fail("/_next/static/chunks/4187.f35558d6f4235ae1.js");
    fail("https://www.googletagmanager.com/gtm.js");
    expect((window as W)[CHUNK_ERROR_COUNT]).toBe(1);
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(CHUNK_ERROR_EVENT, seen);
    expect(watchesChunksFor("/pawlegends")).toBe(true);
    expect(watchesChunksFor("/game")).toBe(false);
  });

  it("MotionFailed shows the hero and tells analytics the page is ready", () => {
    const root = document.createElement("div");
    root.className = "pll js-intro";
    document.body.appendChild(root);
    const ready = jest.fn();
    window.addEventListener(LANDING_READY_EVENT, ready);
    render(<MotionFailed error={new Error("chunk")} />);
    expect(root.classList.contains("js-intro")).toBe(false);
    expect(ready).toHaveBeenCalledTimes(1);
    window.removeEventListener(LANDING_READY_EVENT, ready);
    root.remove();
  });
});

describe("the landing motion chunk", () => {
  it("shows the finished hero when the engine throws", () => {
    const ref = createRef<HTMLDivElement>();
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    mockStart.mockImplementationOnce(() => {
      throw new Error("SplitText broke");
    });
    const view = render(
      <>
        <div ref={ref} className="pll js-intro" />
        <LandingMotion rootRef={ref} />
      </>
    );
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(ref.current!.classList.contains("js-intro")).toBe(false);
    expect(err).toHaveBeenCalled();
    view.unmount();
    err.mockRestore();
  });

  it("starts in a task after hydration and stops on unmount", () => {
    const ref = createRef<HTMLDivElement>();
    const Host = () => (
      <>
        <div ref={ref} />
        <LandingMotion rootRef={ref} />
      </>
    );
    const view = render(<Host />);
    expect(mockStart).not.toHaveBeenCalled();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0][0]).toBe(ref.current);
    view.unmount();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("does not start when unmounted first", () => {
    const ref = createRef<HTMLDivElement>();
    const view = render(
      <>
        <div ref={ref} />
        <LandingMotion rootRef={ref} />
      </>
    );
    view.unmount();
    jest.runOnlyPendingTimers();
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("landing images and fonts", () => {
  const doc = new DOMParser().parseFromString(landingMarkup(), "text/html");

  it("gives every tile and screenshot a smaller copy that ships, and keeps the hero stills full size", () => {
    const withSet = Array.from(doc.querySelectorAll("img[srcset]"));
    expect(doc.querySelectorAll(".tile img:not([srcset])")).toHaveLength(0);
    expect(withSet.length).toBeGreaterThan(doc.querySelectorAll(".tile img").length);
    for (const img of withSet) {
      expect(img.getAttribute("sizes")).toBeTruthy();
      const files = img.getAttribute("srcset")!.split(",").map((c: string) => c.trim().split(/\s+/)[0]);
      expect(files).toContain(img.getAttribute("src"));
      for (const f of files) {
        expect(LANDING_FILES).toContain(f);
        expect(existsSync(join(__dirname, "../../public", f))).toBe(true);
      }
    }
    for (const still of Array.from(doc.querySelectorAll(".fighter img.still"))) {
      expect(still.getAttribute("fetchpriority")).toBe("high");
      expect(still.hasAttribute("srcset")).toBe(false);
      expect(still.getAttribute("loading")).toBeNull();
    }
  });

  it("tile sizes stay close to the drawn width, so a DPR 3 phone at 390 picks the small copy", () => {
    const sizes = doc.querySelector(".tile img")!.getAttribute("sizes")!;
    // The first matching condition wins: 390 px wide matches (max-width:560px).
    const first = /^\(max-width:560px\) (\d+)vw/.exec(sizes);
    expect(first).not.toBeNull();
    const cssPx = (390 * Number(first![1])) / 100;
    expect(cssPx * 3).toBeLessThanOrEqual(TILE_PORTRAIT_WIDTH);
    // Measured tile width at 390 is 78 px: never below it.
    expect(cssPx).toBeGreaterThanOrEqual(78);
  });

  it("preloads only Nunito on the landing and every brand face elsewhere", () => {
    expect(preloadFontsFor("/pawlegends")).toEqual(PRELOAD_FONT_FILES.filter((f) => f.includes("/nunito-")));
    expect(preloadFontsFor("/pawlegends")).toHaveLength(1);
    expect(preloadFontsFor("/game")).toEqual(PRELOAD_FONT_FILES);
    expect(preloadFontsFor("/pawlegends/play")).toEqual(PRELOAD_FONT_FILES);
  });
});
