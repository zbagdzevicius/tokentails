/**
 * @jest-environment jsdom
 *
 * The landing's Catnip Heist section: media, lazy and motion-aware playback, the rail-aware third
 * beat, the CTA, the kill switch, and the Pink Paw de-duplication helper of the globe section.
 */
import React from "react";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { act, fireEvent, render } from "@testing-library/react";

let mockIsApp = false;
jest.mock("@/components/claims/build", () => ({ isAppBuild: () => mockIsApp }));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, subtext }: { text: string; subtext?: string }) => (
    <span>
      {text} {subtext}
    </span>
  ),
}));
let mockReduced = false;
jest.mock("@/components/globe/useReducedMotion", () => ({ useReducedMotion: () => mockReduced }));

import {
  HEIST_LEVEL_COUNT,
  HEIST_NO_SIGNUP_NOTE,
  HEIST_NO_SIGNUP_NOTE_APP,
  HEIST_REEL,
  HEIST_SECTION_HREF,
  HeistSection,
  heistReelAllowed,
  heistSectionEnabled,
  heistTreatBeat,
} from "@/components/landing/HeistSection";
import {
  PINK_PAW_LANDING_NAME,
  isPinkPawShelter,
  landingShelterEntries,
} from "@/components/landing/shelterNames";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let observerCallback: ObserverCallback | null = null;
const observe = jest.fn();
const disconnect = jest.fn();

class MockObserver {
  constructor(cb: ObserverCallback) {
    observerCallback = cb;
  }
  observe = observe;
  disconnect = disconnect;
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
  mockIsApp = false;
  mockReduced = false;
  observerCallback = null;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockObserver;
});

const scrollInView = (isIntersecting: boolean) =>
  act(() => {
    observerCallback?.([{ isIntersecting }]);
  });

describe("Catnip Heist section", () => {
  it("ships the web encodes and the poster under client/public/landing", () => {
    const pub = path.resolve(__dirname, "../public");
    for (const file of [HEIST_REEL.mp4, HEIST_REEL.webm, HEIST_REEL.poster]) {
      expect(file).toMatch(/^\/landing\/heist-reel.*-v\d+\.(mp4|webm|jpg)$/);
      const stat = fs.statSync(path.join(pub, file));
      expect(stat.size).toBeGreaterThan(10_000);
    }
    // Landing-weight budget: each video stays under 4.5 MB.
    expect(fs.statSync(path.join(pub, HEIST_REEL.mp4)).size).toBeLessThan(4.5 * 1024 * 1024);
    expect(fs.statSync(path.join(pub, HEIST_REEL.webm)).size).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("says 8 heists because the game ships exactly that many levels", () => {
    const levels = fs
      .readdirSync(path.resolve(__dirname, "../../catnip-heist/src/levels"))
      .filter((f) => /^heist-\d+\.json$/.test(f));
    expect(levels).toHaveLength(HEIST_LEVEL_COUNT);
    const { getByTestId } = render(<HeistSection enabled />);
    expect(getByTestId("heist-beats").textContent).toContain(`${HEIST_LEVEL_COUNT} heists`);
  });

  it("renders the headline, three beats, the CTA to /heist and the no sign-up note", () => {
    const { getByTestId, getByRole } = render(<HeistSection enabled />);
    expect(getByRole("heading", { level: 2 }).textContent).toMatch(/Catnip\s+Heist/);
    expect(getByTestId("heist-beats").querySelectorAll("li")).toHaveLength(3);
    expect(getByTestId("heist-beats").textContent).toContain("Sneak & swap");
    const cta = getByTestId("heist-section-cta");
    expect(cta.getAttribute("href")).toBe(HEIST_SECTION_HREF);
    expect(HEIST_SECTION_HREF).toBe("/heist?from=landing_heist");
    expect(cta.getAttribute("aria-label")).toBe("PLAY CATNIP HEIST");
    expect(getByTestId("heist-no-signup").textContent).toBe(HEIST_NO_SIGNUP_NOTE);
  });

  it("attaches no video source until the section comes into view, then plays muted, looped and inline", () => {
    const { getByTestId } = render(<HeistSection enabled reelCleared railState="live" />);
    const video = getByTestId("heist-reel") as HTMLVideoElement;
    expect(video.querySelectorAll("source")).toHaveLength(0);
    expect(video.getAttribute("poster")).toBe(HEIST_REEL.poster);
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(play).not.toHaveBeenCalled();

    scrollInView(true);
    const sources = Array.from(video.querySelectorAll("source"));
    expect(sources.map((s) => [s.getAttribute("src"), s.getAttribute("type")])).toEqual([
      [HEIST_REEL.webm, "video/webm"],
      [HEIST_REEL.mp4, "video/mp4"],
    ]);
    expect(load).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();

    play.mockClear();
    scrollInView(false);
    expect(pause).toHaveBeenCalled();
    // Sources stay once loaded; scrolling back resumes.
    scrollInView(true);
    expect(play).toHaveBeenCalled();
  });

  it("has a pause toggle that stops and resumes the reel", () => {
    const { getByTestId } = render(<HeistSection enabled reelCleared railState="live" />);
    scrollInView(true);
    const toggle = getByTestId("heist-reel-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Pause the showreel");
    pause.mockClear();
    fireEvent.click(toggle);
    expect(pause).toHaveBeenCalled();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    play.mockClear();
    fireEvent.click(toggle);
    expect(play).toHaveBeenCalled();
  });

  it("under reduced motion shows the poster and plays only after the viewer presses play", () => {
    mockReduced = true;
    const { getByTestId } = render(<HeistSection enabled reelCleared railState="live" />);
    scrollInView(true);
    const video = getByTestId("heist-reel");
    expect(video.querySelectorAll("source")).toHaveLength(0);
    expect(video.getAttribute("poster")).toBe(HEIST_REEL.poster);
    expect(play).not.toHaveBeenCalled();
    const toggle = getByTestId("heist-reel-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Play the showreel");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(video.querySelectorAll("source")).toHaveLength(2);
    expect(play).toHaveBeenCalled();
    expect(toggle.getAttribute("aria-label")).toBe("Pause the showreel");
  });

  it("never attaches the reel while it would contradict the third beat or carry an uncleared claim", () => {
    // v1 shows the Chat-Rivari café (F-023): cleared since the founder confirmed it (2026-10-04).
    expect(HEIST_REEL.cleared).toBe(true);
    expect(heistReelAllowed("live")).toBe(true);
    expect(heistReelAllowed("live", false)).toBe(false);
    // A cleared cut plays only on a live rail (the reel says Token Tails sends a treat, now).
    expect(heistReelAllowed("live", true)).toBe(true);
    expect(heistReelAllowed("exhausted", true)).toBe(true);
    for (const state of ["not-deployed", "paused", null, undefined] as const) {
      expect(heistReelAllowed(state, true)).toBe(false);
    }

    const { queryByTestId, getByTestId, rerender } = render(
      <HeistSection enabled reelCleared railState="not-deployed" />
    );
    scrollInView(true);
    expect(queryByTestId("heist-reel")).toBeNull();
    expect(getByTestId("heist-reel-poster").getAttribute("src")).toBe(HEIST_REEL.poster);
    expect(getByTestId("heist-treat-beat").textContent).toMatch(/open soon/);
    // An uncleared cut on a live rail: still the poster.
    rerender(<HeistSection enabled reelCleared={false} railState="live" />);
    expect(queryByTestId("heist-reel")).toBeNull();
  });

  it("loads the poster images lazily", () => {
    const { container } = render(<HeistSection enabled />);
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    for (const img of imgs) expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("app builds show the poster image, never the reel (its end card names the payout layer)", () => {
    mockIsApp = true;
    const { queryByTestId, getByTestId, container } = render(<HeistSection enabled railState="live" />);
    expect(queryByTestId("heist-reel")).toBeNull();
    expect(getByTestId("heist-reel-poster").getAttribute("src")).toBe(HEIST_REEL.poster);
    expect(container.textContent).not.toMatch(/on-?chain/i);
    expect(queryByTestId("heist-payouts-link")).toBeNull();
    // The app runs the game in the app, not a browser.
    expect(getByTestId("heist-no-signup").textContent).toBe(HEIST_NO_SIGNUP_NOTE_APP);
    expect(HEIST_NO_SIGNUP_NOTE_APP).not.toMatch(/browser/i);
  });

  it("app exports prune the reel files and the export check asserts it", () => {
    const script = path.resolve(__dirname, "../scripts/prune-app-export.mjs");
    const src = fs.readFileSync(script, "utf8");
    for (const file of [HEIST_REEL.mp4, HEIST_REEL.webm]) expect(src).toContain(`"${file.slice(1)}"`);
    expect(src).not.toContain(HEIST_REEL.poster.slice(1));
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
    expect(pkg.scripts["build:app"]).toContain("scripts/prune-app-export.mjs");
    expect(fs.readFileSync(path.resolve(__dirname, "../scripts/check-app-export.mjs"), "utf8")).toContain(
      "WEB_ONLY_FILES"
    );

    const out = fs.mkdtempSync(path.join(os.tmpdir(), "app-export-"));
    try {
      fs.mkdirSync(path.join(out, "landing"));
      for (const file of [HEIST_REEL.mp4, HEIST_REEL.webm, HEIST_REEL.poster]) {
        fs.writeFileSync(path.join(out, file), "x");
      }
      execFileSync(process.execPath, [script, out]);
      expect(fs.existsSync(path.join(out, HEIST_REEL.mp4))).toBe(false);
      expect(fs.existsSync(path.join(out, HEIST_REEL.webm))).toBe(false);
      expect(fs.existsSync(path.join(out, HEIST_REEL.poster))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("the third beat follows the treat rail state (L-rail)", () => {
    expect(heistTreatBeat("not-deployed", false)).toMatch(/open soon/);
    expect(heistTreatBeat(null, false)).toMatch(/open soon/);
    expect(heistTreatBeat("live", false)).toBe(
      "Free the shelter cat. Signed-in players can tap and Token Tails sends Pink Paw a small treat, on-chain (wallet held by Token Tails until handover)."
    );
    expect(heistTreatBeat("live", true)).not.toMatch(/on-?chain/i);
    // Treats need an account, and the custody disclosure travels with the claim.
    for (const isApp of [false, true]) {
      expect(heistTreatBeat("live", isApp)).toMatch(/Signed-in players/);
      expect(heistTreatBeat("live", isApp)).toMatch(/held by Token Tails until handover/);
    }
    expect(heistTreatBeat("exhausted", false)).toMatch(/used up/);
    expect(heistTreatBeat("paused", false)).toMatch(/paused/);
    // Only a live rail says money moves now.
    for (const state of ["not-deployed", "paused", "exhausted"] as const) {
      expect(heistTreatBeat(state, false)).not.toMatch(/\bsends\b/);
    }

    const { getByTestId, queryByTestId, rerender } = render(<HeistSection enabled railState="not-deployed" />);
    expect(getByTestId("heist-treat-beat").textContent).toMatch(/open soon/);
    expect(queryByTestId("heist-payouts-link")).toBeNull();
    rerender(<HeistSection enabled railState="live" />);
    expect(getByTestId("heist-payouts-link").getAttribute("href")).toBe("/shelter-payouts");
  });

  it("is on by default (founder override of decision #15, 2026-10-04); NEXT_PUBLIC_HEIST_LANDING_SECTION=0/false/off hides it", () => {
    for (const off of ["0", "false", "OFF", " off "]) {
      expect(heistSectionEnabled(off)).toBe(false);
    }
    for (const on of [undefined, "", "1", "true", " ON ", "yes"]) expect(heistSectionEnabled(on)).toBe(true);
    const { container } = render(<HeistSection enabled={false} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("landing shelter names (Pink Paw = Rožinė pėdutė)", () => {
  it("folds every Pink Paw row into one entry and keeps the others in order", () => {
    const entries = landingShelterEntries([
      { slug: "mil-bigotes", name: "Mil Bigotes" },
      { slug: "rozine-pedute", name: "Rožinė Pėdutė" },
      { slug: "puppy-kitty-nyc", name: "Puppy Kitty NYC" },
      { slug: "pink-paw", name: "Pink Paw" },
      { slug: "x", name: "ROZINE PEDUTE" },
    ]);
    expect(entries.map((e) => e.name)).toEqual(["Mil Bigotes", PINK_PAW_LANDING_NAME, "Puppy Kitty NYC"]);
    expect(PINK_PAW_LANDING_NAME).toBe("Pink Paw (Rožinė pėdutė)");
    expect(entries.filter((e) => e.pinkPaw)).toHaveLength(1);
  });

  it("does not merge distinct shelters that share a name, and drops repeats of one slug", () => {
    expect(isPinkPawShelter({ slug: "paw-patrol", name: "Paw Patrol" })).toBe(false);
    const entries = landingShelterEntries([
      { slug: "happy-paws-es", name: "Happy Paws" },
      { slug: "happy-paws-us", name: "Happy Paws" },
      { slug: "happy-paws-es", name: "Happy  paws" },
      { slug: "c", name: "Mil Bigotes Norte" },
      { slug: "d", name: "" },
    ]);
    expect(entries.map((e) => e.key)).toEqual(["happy-paws-es", "happy-paws-us", "c"]);
  });

  it("the bundled baseline lists Pink Paw exactly once", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const baseline = require("@/public/impact/snapshot.json");
    const entries = landingShelterEntries(baseline.shelters.items);
    expect(entries.filter((e) => /Pink Paw|pėdutė/i.test(e.name))).toHaveLength(1);
  });
});
