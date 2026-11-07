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
jest.mock("next/router", () => ({ useRouter: () => ({ events: { on: jest.fn(), off: jest.fn() } }) }));

import LandingMotion from "@/components/pawlegends/landing/LandingMotion";
import { LANDING_FILES, landingMarkup } from "@/components/pawlegends/landing/markup";
import { afterLandingReady, ANALYTICS_DEFER_MAX_MS, LANDING_READY_EVENT } from "@/components/GoogleTagManager";
import { PRELOAD_FONT_FILES } from "@/components/typography/fonts.generated";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { preloadFontsFor } = require("@/pages/_document");

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

  it("never starts after its cleanup", () => {
    const start = jest.fn();
    const cancel = afterLandingReady(start);
    cancel();
    window.dispatchEvent(new Event(LANDING_READY_EVENT));
    jest.advanceTimersByTime(ANALYTICS_DEFER_MAX_MS * 2);
    expect(start).not.toHaveBeenCalled();
  });
});

describe("the landing motion chunk", () => {
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

  it("preloads only Nunito on the landing and every brand face elsewhere", () => {
    expect(preloadFontsFor("/pawlegends")).toEqual(PRELOAD_FONT_FILES.filter((f) => f.includes("/nunito-")));
    expect(preloadFontsFor("/pawlegends")).toHaveLength(1);
    expect(preloadFontsFor("/game")).toEqual(PRELOAD_FONT_FILES);
    expect(preloadFontsFor("/pawlegends/play")).toEqual(PRELOAD_FONT_FILES);
  });
});
