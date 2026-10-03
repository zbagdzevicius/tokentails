/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import Snowfall, { isSnowfallSeason } from "@/components/shared/Snowfall";
import { SKY_DUSK, useBackground } from "@/constants/hooks";
import { GameType } from "@/models/game";

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("Lobby v0 dusk grade (plan G6)", () => {
  it("the Shelter lobby paints the dusk custom property, not the hot-pink bg-10.webp", () => {
    const { result } = renderHook(() => useBackground({ gameType: GameType.SHELTER }));
    expect(result.current.backgroundImage).toBe(SKY_DUSK);
    expect(SKY_DUSK).toBe("var(--tt-sky-dusk)");
    expect(JSON.stringify(result.current)).not.toContain("bg-10.webp");
  });

  it("every scene keeps a night colour behind its image", () => {
    for (const gameType of [GameType.HOME, GameType.SHELTER, GameType.MATCH_3, null]) {
      const { result } = renderHook(() => useBackground({ gameType }));
      expect(result.current.backgroundColor).toBe("rgb(var(--tt-night-900))");
    }
  });
});

describe("Snowfall seasonal toggle (decision #47)", () => {
  const env = process.env.NEXT_PUBLIC_SNOWFALL;
  afterEach(() => {
    if (env === undefined) delete process.env.NEXT_PUBLIC_SNOWFALL;
    else process.env.NEXT_PUBLIC_SNOWFALL = env;
  });

  it("is off by default, all year", () => {
    for (const month of [0, 3, 6, 11]) {
      expect(isSnowfallSeason(new Date(2026, month, 15), undefined)).toBe(false);
    }
  });

  it("turns on with the flag or inside a listed season window (including a year wrap)", () => {
    expect(isSnowfallSeason(new Date(2026, 6, 1), "on")).toBe(true);
    expect(isSnowfallSeason(new Date(2026, 11, 24), "off", [{ from: "12-01", to: "01-06" }])).toBe(false);
    const winter = [{ from: "12-01", to: "01-06" }];
    expect(isSnowfallSeason(new Date(2026, 11, 24), undefined, winter)).toBe(true);
    expect(isSnowfallSeason(new Date(2027, 0, 3), undefined, winter)).toBe(true);
    expect(isSnowfallSeason(new Date(2027, 1, 3), undefined, winter)).toBe(false);
  });

  it("renders nothing by default", () => {
    delete process.env.NEXT_PUBLIC_SNOWFALL;
    mockReducedMotion(false);
    const { container } = render(<Snowfall />);
    expect(container.querySelector(".chamomile-flower")).toBeNull();
  });

  it("renders 50 decorative petals when in season", async () => {
    process.env.NEXT_PUBLIC_SNOWFALL = "on";
    mockReducedMotion(false);
    const { container } = render(<Snowfall />);
    await act(async () => {});
    expect(container.querySelectorAll(".chamomile-flower")).toHaveLength(50);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("respects prefers-reduced-motion even in season", async () => {
    process.env.NEXT_PUBLIC_SNOWFALL = "on";
    mockReducedMotion(true);
    const { container } = render(<Snowfall />);
    await act(async () => {});
    expect(container.querySelector(".chamomile-flower")).toBeNull();
  });
});
