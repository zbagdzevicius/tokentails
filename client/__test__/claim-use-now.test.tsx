/**
 * @jest-environment jsdom
 *
 * useNow (review 3f #6): one shared clock that is re-read hourly and when the page becomes visible
 * again, so STALE chips appear in an app that stays open for days.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { NOW_REFRESH_MS, useNow } from "@/components/claims/useNow";

const Probe = () => {
  const now = useNow();
  return <span data-testid="now">{now ? now.toISOString() : "none"}</span>;
};

describe("useNow", () => {
  afterEach(() => jest.useRealTimers());

  it("re-reads the clock hourly and on visibilitychange", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const { getByTestId, unmount } = render(<Probe />);
    const first = getByTestId("now").textContent;
    expect(first).not.toBe("none");

    jest.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    act(() => {
      jest.advanceTimersByTime(NOW_REFRESH_MS);
    });
    const hourly = getByTestId("now").textContent!;
    expect(hourly).not.toBe(first);
    expect(Date.parse(hourly)).toBeGreaterThanOrEqual(Date.parse("2026-10-03T00:00:00Z"));

    jest.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getByTestId("now").textContent).toBe("2026-10-05T00:00:00.000Z");
    unmount();
  });
});
