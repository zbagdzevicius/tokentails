/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ANNOUNCE_REFILL_MS, SceneAnnouncer } from "@/components/Match3/SceneAnnouncer";
import { announce, MATCH3_GAME_ID } from "@/components/Match3/sceneSignals";

/**
 * The Paw Match live regions (5c review): a polite `status` and an assertive `alert`, fixed on two
 * elements; a repeated message is cleared and written again so it is read again.
 */
describe("SceneAnnouncer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const mount = () => render(React.createElement(SceneAnnouncer, { game: MATCH3_GAME_ID, testId: "announcer" }));

  it("routes polite and assertive messages to two fixed regions", () => {
    mount();
    const polite = screen.getByTestId("announcer");
    const assertive = screen.getByTestId("announcer-assertive");
    expect(polite.getAttribute("role")).toBe("status");
    expect(polite.getAttribute("aria-live")).toBe("polite");
    expect(assertive.getAttribute("role")).toBe("alert");
    expect(assertive.getAttribute("aria-live")).toBe("assertive");

    act(() => {
      announce(MATCH3_GAME_ID, "Swipe one glowing tile onto the other.");
      announce(MATCH3_GAME_ID, "Follow the glow", "assertive");
      jest.advanceTimersByTime(ANNOUNCE_REFILL_MS);
    });
    expect(polite.textContent).toBe("Swipe one glowing tile onto the other.");
    expect(assertive.textContent).toBe("Follow the glow");
    // The politeness attribute never changes on an element.
    expect(polite.getAttribute("aria-live")).toBe("polite");
  });

  it("clears and rewrites a repeated message so it is announced again", () => {
    mount();
    const assertive = screen.getByTestId("announcer-assertive");
    act(() => {
      announce(MATCH3_GAME_ID, "Follow the glow", "assertive");
      jest.advanceTimersByTime(ANNOUNCE_REFILL_MS);
    });
    expect(assertive.textContent).toBe("Follow the glow");
    act(() => announce(MATCH3_GAME_ID, "Follow the glow", "assertive"));
    expect(assertive.textContent).toBe("");
    act(() => jest.advanceTimersByTime(ANNOUNCE_REFILL_MS));
    expect(assertive.textContent).toBe("Follow the glow");
  });

  it("ignores other games and empty messages", () => {
    mount();
    act(() => {
      announce("purrsuit", "Not for Paw Match");
      announce(MATCH3_GAME_ID, "");
      jest.advanceTimersByTime(ANNOUNCE_REFILL_MS);
    });
    expect(screen.getByTestId("announcer").textContent).toBe("");
  });
});
