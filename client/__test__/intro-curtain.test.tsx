/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { analytics } from "@/analytics";
import {
  curtainStartedAt,
  INTRO_FADE_MS,
  INTRO_FADE_REDUCED_MS,
  INTRO_MAX_MS,
  INTRO_MIN_MS,
  IntroCurtain,
  introLiftReason,
} from "@/components/game/IntroCurtain";
import { LAYERS } from "@/design/tokens";

/** The /game intro curtain (plan G14 "Intro", 2.13 row 35). */

jest.mock("@/analytics", () => ({ analytics: { track: jest.fn() }, buildEvent: (name: string, properties: unknown) => ({ name, properties }) }));

describe("introLiftReason", () => {
  it("waits for readiness, but at least 700 ms and at most 2.5 s", () => {
    expect(INTRO_MIN_MS).toBe(700);
    expect(INTRO_MAX_MS).toBe(2500);
    expect(introLiftReason({ elapsed: 100, ready: true, tapped: false })).toBeNull();
    expect(introLiftReason({ elapsed: 699, ready: true, tapped: false })).toBeNull();
    expect(introLiftReason({ elapsed: 700, ready: true, tapped: false })).toBe("ready");
    expect(introLiftReason({ elapsed: 2499, ready: false, tapped: false })).toBeNull();
    expect(introLiftReason({ elapsed: 2500, ready: false, tapped: false })).toBe("max");
    expect(introLiftReason({ elapsed: 10, ready: false, tapped: true })).toBe("tap");
  });
});

describe("curtainStartedAt", () => {
  it("counts from the first paint on a full load and from the mount after a client navigation", () => {
    expect(curtainStartedAt(900, 80, true)).toBe(80);
    expect(curtainStartedAt(900, 80, false)).toBe(900);
    expect(curtainStartedAt(900, null, true)).toBe(900);
    expect(curtainStartedAt(50, 80, true)).toBe(50);
  });
});

describe("IntroCurtain", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (analytics.track as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it("is a night-900 status layer on z-intro, between the sheet and the toasts", () => {
    render(<IntroCurtain ready={false} />);
    const curtain = screen.getByTestId("intro-curtain");
    expect(curtain.getAttribute("role")).toBe("status");
    expect(curtain.className).toContain("bg-tt-night-900");
    expect(curtain.className).toContain("z-intro");
    expect(LAYERS.intro).toBeGreaterThan(LAYERS.auth);
    expect(LAYERS.toast).toBeGreaterThan(LAYERS.intro);
    expect(LAYERS.reveal).toBeGreaterThan(LAYERS.intro);
  });

  it("stays at least 700 ms when auth is ready at once, then lifts and reports intro_lifted", async () => {
    const onLift = jest.fn();
    const onGone = jest.fn();
    render(<IntroCurtain ready onLift={onLift} onGone={onGone} />);
    await advance(600);
    expect(onLift).not.toHaveBeenCalled();
    await advance(200);
    expect(onLift).toHaveBeenCalledWith(expect.objectContaining({ reason: "ready" }));
    expect(onLift.mock.calls[0][0].ms).toBeGreaterThanOrEqual(700);
    expect(analytics.track).toHaveBeenCalledWith({ name: "intro_lifted", properties: { ms: expect.any(Number) } });
    expect(screen.getByTestId("intro-curtain").getAttribute("data-phase")).toBe("leaving");
    await advance(INTRO_FADE_MS + 10);
    expect(onGone).toHaveBeenCalled();
    expect(screen.queryByTestId("intro-curtain")).toBeNull();
  });

  it("waits for readiness after the minimum", async () => {
    const onLift = jest.fn();
    const { rerender } = render(<IntroCurtain ready={false} onLift={onLift} />);
    await advance(1200);
    expect(onLift).not.toHaveBeenCalled();
    rerender(<IntroCurtain ready onLift={onLift} />);
    await advance(0);
    expect(onLift).toHaveBeenCalledWith(expect.objectContaining({ reason: "ready" }));
  });

  it("never stays longer than 2.5 s", async () => {
    const onLift = jest.fn();
    render(<IntroCurtain ready={false} onLift={onLift} />);
    await advance(2400);
    expect(onLift).not.toHaveBeenCalled();
    await advance(200);
    expect(onLift).toHaveBeenCalledWith(expect.objectContaining({ reason: "max" }));
  });

  it("a tap skips it and never reaches what is below", async () => {
    const below = jest.fn();
    const onLift = jest.fn();
    render(
      <div onClick={below} onPointerDown={below}>
        <IntroCurtain ready={false} onLift={onLift} />
      </div>,
    );
    const curtain = screen.getByTestId("intro-curtain");
    fireEvent.pointerDown(curtain);
    fireEvent.pointerUp(curtain);
    fireEvent.click(curtain);
    expect(onLift).toHaveBeenCalledWith(expect.objectContaining({ reason: "tap" }));
    expect(below).not.toHaveBeenCalled();
    // Still catching taps while it fades.
    expect(screen.getByTestId("intro-curtain").style.pointerEvents).toBe("auto");
    fireEvent.click(screen.getByTestId("intro-curtain"));
    expect(below).not.toHaveBeenCalled();
  });

  it("a key skips it too", async () => {
    const onLift = jest.fn();
    render(<IntroCurtain ready={false} onLift={onLift} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLift).toHaveBeenCalledWith(expect.objectContaining({ reason: "tap" }));
  });

  it("reduced motion drops the float and the dots, keeping a short fade", async () => {
    const onGone = jest.fn();
    render(<IntroCurtain ready reducedMotion onGone={onGone} />);
    expect(screen.getByTestId("intro-curtain").querySelectorAll(".animate-tt-intro-float, .animate-tt-intro-dot")).toHaveLength(0);
    await advance(INTRO_MIN_MS + 50);
    expect(screen.getByTestId("intro-curtain").getAttribute("data-phase")).toBe("leaving");
    await advance(INTRO_FADE_REDUCED_MS + 10);
    expect(onGone).toHaveBeenCalled();
  });
});

describe("Game.tsx uses the curtain, not the old pinwheel", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "components", "game", "Game.tsx"), "utf8");
  it("has no fixed 2 s brown pinwheel", () => {
    expect(source).not.toMatch(/intro-pinwheel|conic-gradient|#713f12/);
    expect(source).toMatch(/<IntroCurtain/);
    expect(source).toMatch(/authReady \|\| sheetOpen/);
  });
});
