/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/hooks/useImpact", () => ({
  useImpact: () => ({ impact: null, loading: true }),
}));
jest.mock("@/components/impact/ImpactNumbers", () => ({
  ImpactNumbers: () => null,
}));

import { Stats } from "@/components/stats/Stats";
import { NoMore } from "@/components/shared/NoMore";

// Token values (styles/tokens.css) and the brightest pixel of the /stats page art (task 3d review).
const NIGHT_950: Rgb = [7, 5, 26];
const NIGHT_900: Rgb = [11, 8, 32];
const CREAM: Rgb = [252, 236, 187];
const GOLD_400: Rgb = [255, 204, 85];
const STATS_ART_PEACH: Rgb = [255, 163, 131];

type Rgb = [number, number, number];
const lum = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (top: Rgb, alpha: number, under: Rgb): Rgb =>
  top.map((v, i) => alpha * v + (1 - alpha) * under[i]) as Rgb;

describe("night ink on out-of-scope pages (task 3d review)", () => {
  it("/stats puts its title and subtitle on a night-950/70 panel that clears 4.5:1 over the peach art", () => {
    render(<Stats />);
    const panel = screen.getByTestId("stats-header");
    expect(panel.className).toContain("bg-tt-night-950/70");
    expect(panel.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
    const bg = over(NIGHT_950, 0.7, STATS_ART_PEACH);
    expect(contrast(CREAM, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(GOLD_400, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("404 (NoMore tone=night) uses gold and cream ink, not the inherited yellow-900", () => {
    render(<NoMore tone="night" />);
    expect(screen.getByText("No meowr").className).toContain("text-tt-gold-400");
    expect(screen.getByText("To continue press a paw").className).toContain("text-tt-cream");
    expect(contrast(GOLD_400, NIGHT_900)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(CREAM, NIGHT_900)).toBeGreaterThanOrEqual(4.5);
  });

  it("the feed's NoMore keeps inheriting its own ink by default", () => {
    render(<NoMore />);
    expect(screen.getByText("No meowr").className).not.toContain("text-tt-");
  });
});
