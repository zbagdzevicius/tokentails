/**
 * @jest-environment jsdom
 *
 * The landing's Swordcat section (Swordcat plan §12.3 E): on by default on the web, hidden by the
 * `NEXT_PUBLIC_SWORDCAT` kill switch (0/false/no/off) and always in the app build; one link to /swordcat; a treat beat per rail state (present tense only while live); no adoption words, no em
 * dash and no number that is not read live.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { act, fireEvent, render } from "@testing-library/react";

let mockIsApp = false;
jest.mock("@/components/claims/build", () => ({ isAppBuild: () => mockIsApp }));
let mockReduced = false;
jest.mock("@/components/globe/useReducedMotion", () => ({ useReducedMotion: () => mockReduced }));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, subtext }: { text: string; subtext?: string }) => (
    <span>
      {text} {subtext}
    </span>
  ),
}));

import {
  SWORDCAT_SECTION_HREF,
  SWORDCAT_SECTION_LINE,
  SWORDCAT_SECTION_STILL,
  SWORDCAT_SECTION_TREAT_BEAT,
  SWORDCAT_TRAILER,
  SWORDCAT_TRAILER_LABEL,
  swordcatTrailerAllowed,
  swordcatTreatBeat,
  SwordcatSection,
  swordcatSectionEnabled,
} from "@/components/landing/SwordcatSection";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let observerCallback: ObserverCallback | null = null;
class MockObserver {
  constructor(cb: ObserverCallback) {
    observerCallback = cb;
  }
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  takeRecords = () => [];
}
const play = jest.fn(() => Promise.resolve());
const pause = jest.fn();
const load = jest.fn();

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: load });
});

beforeEach(() => {
  observerCallback = null;
  play.mockClear();
  pause.mockClear();
  load.mockClear();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockObserver;
});

afterEach(() => {
  mockIsApp = false;
  mockReduced = false;
  delete process.env.NEXT_PUBLIC_SWORDCAT;
});

const scrollInView = (isIntersecting: boolean) =>
  act(() => {
    observerCallback?.([{ isIntersecting }]);
  });

describe("swordcatSectionEnabled", () => {
  it("is on by default, off with an off value, and never in the app build", () => {
    expect(swordcatSectionEnabled(undefined, false)).toBe(true);
    expect(swordcatSectionEnabled("", false)).toBe(true);
    expect(swordcatSectionEnabled("1", false)).toBe(true);
    for (const off of ["0", "false", "no", "off", " OFF "]) expect(swordcatSectionEnabled(off, false)).toBe(false);
    expect(swordcatSectionEnabled(undefined, true)).toBe(false);
    expect(swordcatSectionEnabled("true", true)).toBe(false);
  });
});

describe("SwordcatSection", () => {
  it("renders with no env set (on by default)", () => {
    expect(process.env.NEXT_PUBLIC_SWORDCAT).toBeUndefined();
    const { getByTestId } = render(<SwordcatSection railState="live" />);
    expect(getByTestId("swordcat-section")).toBeTruthy();
  });

  it("renders nothing with the kill switch (NEXT_PUBLIC_SWORDCAT=0)", () => {
    process.env.NEXT_PUBLIC_SWORDCAT = "0";
    const { container } = render(<SwordcatSection railState="live" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing in the app build, by default or with the flag on", () => {
    mockIsApp = true;
    expect(render(<SwordcatSection railState="live" />).container.innerHTML).toBe("");
    process.env.NEXT_PUBLIC_SWORDCAT = "1";
    expect(render(<SwordcatSection railState="live" />).container.innerHTML).toBe("");
  });

  it("with the flag on: label, title, line and exactly one link; the still while the rail is not live", () => {
    process.env.NEXT_PUBLIC_SWORDCAT = "1";
    const { container, getByTestId } = render(<SwordcatSection railState="paused" />);
    expect(container.textContent).toContain("Early access");
    expect(container.textContent).toContain(SWORDCAT_TITLE);
    expect(container.textContent).toContain(SWORDCAT_SECTION_LINE);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(SWORDCAT_SECTION_HREF);
    expect(SWORDCAT_SECTION_HREF).toBe("/swordcat?from=landing_swordcat");
    const still = getByTestId("swordcat-section-still");
    expect(still.getAttribute("src")).toBe(SWORDCAT_SECTION_STILL);
    expect(still.getAttribute("loading")).toBe("lazy");
    expect(container.querySelector("video")).toBeNull();
  });

  it("shows a treat beat for every rail state, with the custody line only while the rail is live", () => {
    for (const state of ["live", "exhausted", "paused", "not-deployed", null] as const) {
      const { container, unmount } = render(<SwordcatSection railState={state} enabled />);
      const beat = container.querySelector('[data-testid="swordcat-treat-beat"]');
      if (state === "live") {
        expect(beat?.textContent).toBe(SWORDCAT_SECTION_TREAT_BEAT);
        expect(beat?.textContent).toContain("It goes to Pink Paw's wallet.");
      } else {
        expect(beat?.textContent).toBe(swordcatTreatBeat(state));
        expect(beat?.textContent).not.toContain("Token Tails can send");
      }
      unmount();
    }
  });

  it("says no adopt, no em dash, no token and no number", () => {
    const { container } = render(<SwordcatSection railState="live" enabled />);
    const text = container.textContent || "";
    expect(text).not.toMatch(/adopt/i);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/\btoken\b(?! tails)/i);
    expect(text).not.toMatch(/\d/);
  });
});

describe("SwordcatSection trailer", () => {
  it("plays only while the rail is live (open or used up for today)", () => {
    expect(swordcatTrailerAllowed("live")).toBe(true);
    expect(swordcatTrailerAllowed("exhausted")).toBe(true);
    for (const state of ["paused", "not-deployed", null, undefined] as const) {
      expect(swordcatTrailerAllowed(state)).toBe(false);
    }
  });

  it("shows the poster first and attaches no source until the box nears the viewport", () => {
    const { getByTestId, container } = render(<SwordcatSection railState="live" enabled />);
    const video = getByTestId("swordcat-trailer") as HTMLVideoElement;
    expect(video.getAttribute("poster")).toBe(SWORDCAT_TRAILER.poster);
    expect(SWORDCAT_TRAILER.poster).toBe(SWORDCAT_SECTION_STILL);
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.getAttribute("aria-label")).toBe(SWORDCAT_TRAILER_LABEL);
    expect(video.querySelectorAll("source")).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
    // Fixed 16:9 box: no layout shift when the video arrives.
    expect(video.parentElement?.className).toContain("aspect-video");
    expect(container.querySelector('[data-testid="swordcat-section-still"]')).toBeNull();
  });

  it("arms the sources in view, plays, pauses out of view, and the toggle pauses", () => {
    const { getByTestId } = render(<SwordcatSection railState="live" enabled />);
    scrollInView(true);
    const video = getByTestId("swordcat-trailer");
    expect(video.getAttribute("data-armed")).toBe("1");
    expect(Array.from(video.querySelectorAll("source")).map((s) => s.getAttribute("src"))).toEqual([
      SWORDCAT_TRAILER.webm,
      SWORDCAT_TRAILER.mp4,
    ]);
    expect(load).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
    scrollInView(false);
    expect(pause).toHaveBeenCalled();
    scrollInView(true);
    pause.mockClear();
    const toggle = getByTestId("swordcat-trailer-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Pause the trailer");
    fireEvent.click(toggle);
    expect(pause).toHaveBeenCalled();
    expect(toggle.getAttribute("aria-label")).toBe("Play the trailer");
  });

  it("never starts by itself under prefers-reduced-motion; the play button opts in", () => {
    mockReduced = true;
    const { getByTestId } = render(<SwordcatSection railState="live" enabled />);
    scrollInView(true);
    const video = getByTestId("swordcat-trailer");
    expect(video.getAttribute("data-armed")).toBe("0");
    expect(play).not.toHaveBeenCalled();
    const toggle = getByTestId("swordcat-trailer-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Play the trailer");
    fireEvent.click(toggle);
    expect(video.getAttribute("data-armed")).toBe("1");
    expect(play).toHaveBeenCalled();
  });

  it("ships the trailer files under 8 MB each, and app exports prune them", () => {
    const pub = path.resolve(__dirname, "../public");
    for (const file of [SWORDCAT_TRAILER.mp4, SWORDCAT_TRAILER.webm, SWORDCAT_TRAILER.poster]) {
      const size = fs.statSync(path.join(pub, file)).size;
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(8 * 1024 * 1024);
    }
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    for (const file of [SWORDCAT_TRAILER.mp4, SWORDCAT_TRAILER.webm]) expect(prune).toContain(`"${file.slice(1)}"`);
  });

  it("app builds never render it", () => {
    mockIsApp = true;
    const { container } = render(<SwordcatSection railState="live" />);
    expect(container.querySelector("video")).toBeNull();
  });
});
