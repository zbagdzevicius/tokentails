/**
 * @jest-environment jsdom
 *
 * The landing gameplay reel (plan G7 "Landing reel"; decision #53): lazy src, muted, looped, a
 * visible pause control (WCAG 2.2.2), aria labels, posters under reduced motion, clips tagged with
 * lookVersion and at most 1.5 MB each, and the Heist caption allowed to say scores save (4b).
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { GameplayReel, hasReelClips, MAX_CLIP_BYTES, REEL_MANIFEST, usableClips, type ReelClip } from "@/components/reel/GameplayReel";
import { CAPTURE_VIEWPORT_NOTE, framesForVideoFrame } from "../e2e/capture/frames";

const CLIENT = path.resolve(__dirname, "..");

const clip = (id: string, extra: Partial<ReelClip> = {}): ReelClip => ({
  id,
  label: id.toUpperCase(),
  title: `${id} gameplay`,
  caption: `${id} caption`,
  src: `reel/${id}-v1.webm`,
  poster: `reel/${id}-v1.webp`,
  width: 960,
  height: 540,
  durationMs: 4000,
  bytes: 900_000,
  lookVersion: "v1",
  ...extra,
});

type IOCallback = (entries: { isIntersecting: boolean }[]) => void;
let observers: IOCallback[] = [];
let reduced = false;

beforeEach(() => {
  observers = [];
  reduced = false;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(cb: IOCallback) {
      observers.push(cb);
    }
    observe() {}
    disconnect() {}
  };
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = jest.fn();
});

const scrollIntoView = () => act(() => observers.forEach((cb) => cb([{ isIntersecting: true }])));

describe("GameplayReel", () => {
  it("has no video src until it scrolls near the viewport, then plays muted and looped", () => {
    render(<GameplayReel clips={[clip("home"), clip("heist")]} />);
    expect(screen.queryByTestId("gameplay-reel-video")).toBeNull();
    expect(screen.getByTestId("gameplay-reel-poster")).toHaveAttribute("src", "/reel/home-v1.webp");
    scrollIntoView();
    const video = screen.getByTestId("gameplay-reel-video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", "/reel/home-v1.webm");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("aria-label", "home gameplay");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("has a visible pause control that stops playback and can resume (WCAG 2.2.2)", () => {
    render(<GameplayReel clips={[clip("home")]} />);
    scrollIntoView();
    const toggle = screen.getByRole("button", { name: "Pause gameplay video" });
    expect(toggle).toBeVisible();
    fireEvent.click(toggle);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    // One state signal: the label flips; no aria-pressed on top of it (6d review, finding 7).
    expect(screen.getByRole("button", { name: "Play gameplay video" })).not.toHaveAttribute("aria-pressed");
    (HTMLMediaElement.prototype.play as jest.Mock).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Play gameplay video" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("shows only the poster under reduced motion until the viewer presses play", () => {
    reduced = true;
    render(<GameplayReel clips={[clip("home")]} />);
    scrollIntoView();
    expect(screen.queryByTestId("gameplay-reel-video")).toBeNull();
    expect(screen.getByRole("img", { name: "home gameplay" })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play gameplay video" }));
    expect(screen.getByTestId("gameplay-reel-video")).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("switches clips through an accessible tablist with arrow keys", () => {
    render(<GameplayReel clips={[clip("home"), clip("purrsuit"), clip("heist", { caption: "Scores save to your account." })]} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[0].id);
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[2]);
    expect(screen.getByTestId("gameplay-reel-caption")).toHaveTextContent("Scores save to your account.");
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getByTestId("gameplay-reel-caption")).toHaveTextContent("purrsuit caption");
  });

  it("tags the section with the clip's lookVersion and renders nothing without clips", () => {
    const { container, rerender } = render(<GameplayReel clips={[clip("home", { lookVersion: "v1" })]} />);
    expect(screen.getByTestId("gameplay-reel")).toHaveAttribute("data-look-version", "v1");
    rerender(<GameplayReel clips={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("drops clips over the 1.5 MB budget or without a poster", () => {
    const manifest = { schemaVersion: 1, lookVersion: "v1", clips: [clip("a"), clip("b", { bytes: MAX_CLIP_BYTES + 1 }), clip("c", { poster: "" })] };
    expect(usableClips(manifest).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("reel manifest (components/reel/reel-manifest.json)", () => {
  it("matches public/reel/manifest.json and every clip file exists within budget", () => {
    expect(REEL_MANIFEST.schemaVersion).toBe(1);
    const publicCopy = path.join(CLIENT, "public", "reel", "manifest.json");
    if (existsSync(publicCopy)) expect(JSON.parse(readFileSync(publicCopy, "utf8"))).toEqual(REEL_MANIFEST);
    for (const c of REEL_MANIFEST.clips) {
      expect(c.lookVersion).toBe(REEL_MANIFEST.lookVersion);
      const file = path.join(CLIENT, "public", c.src);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBe(c.bytes);
      expect(c.bytes).toBeLessThanOrEqual(MAX_CLIP_BYTES);
      expect(existsSync(path.join(CLIENT, "public", c.poster))).toBe(true);
      expect(c.src).toMatch(/-v1\.webm$/);
    }
    // Only clips stepped through the capture hooks ship (6d review, finding 3: page-clock clips
    // drift, and the first batch showed the touch controls). Until they are re-rendered against a
    // NEXT_PUBLIC_CAPTURE=1 build the manifest is empty and the landing mounts no reel.
    for (const c of REEL_MANIFEST.clips as (ReelClip & { steppedBy?: string })[]) expect(c.steppedBy).toBe("__TT_CAPTURE__");
    expect(hasReelClips).toBe(usableClips().length > 0);
    const heist = REEL_MANIFEST.clips.find((c) => c.id === "heist");
    // Decision #53 with the caveat: 4b shipped account-linked Heist saves, so no "not saved yet" copy.
    if (heist) expect(heist.caption).not.toMatch(/aren't saved|not saved/i);
  });
});

describe("capture driver helpers (e2e/capture/frames.ts)", () => {
  it("steps whole 60 Hz frames and carries the fraction, so 24 fps clips play at real speed", () => {
    let owed = 0;
    const steps: number[] = [];
    for (let i = 0; i < 24; i++) {
      const next = framesForVideoFrame(owed, 24);
      steps.push(next.step);
      owed = next.owed;
    }
    expect(steps.slice(0, 4)).toEqual([2, 3, 2, 3]);
    // One second of video is exactly one second of game time (60 frames), not 48.
    expect(steps.reduce((a, b) => a + b, 0)).toBe(60);
    expect(framesForVideoFrame(0, 30).step).toBe(2);
    expect(framesForVideoFrame(0, 60).step).toBe(1);
  });

  it("captures on a desktop profile without touch controls", () => {
    expect(CAPTURE_VIEWPORT_NOTE).toEqual({ isMobile: false, hasTouch: false });
  });
});
