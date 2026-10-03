/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { PIXEL_ICON_NAMES, PixelIcon } from "@/components/shared/PixelIcon";
import { CUSTOM_ICONS } from "@/components/shared/icons/custom";
import { PIXELARTICONS } from "@/components/shared/icons/pixelarticons";

describe("PixelIcon", () => {
  it("is decorative by default: aria-hidden, no role, no title", () => {
    const { container } = render(<PixelIcon name="close" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("exposes an accessible name when given a label", () => {
    render(<PixelIcon name="close" label="Close" />);
    const svg = screen.getByRole("img", { name: "Close" });
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(svg.querySelector("title")!.textContent).toBe("Close");
  });

  it("follows the font size and colour by default", () => {
    const { container } = render(
      <PixelIcon name="key" className="text-h6 text-white" />
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("1em");
    expect(svg.getAttribute("height")).toBe("1em");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.getAttribute("class")).toContain("text-h6 text-white");
    expect(svg.getAttribute("data-icon")).toBe("key");
  });

  it("accepts an explicit size", () => {
    const { container } = render(<PixelIcon name="copy" size={24} />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("24");
  });

  it("renders the hand-drawn fallback glyphs", () => {
    const { container } = render(<PixelIcon name="messenger" />);
    expect(container.querySelectorAll("path")).toHaveLength(
      CUSTOM_ICONS.messenger.length
    );
  });

  it.each(PIXEL_ICON_NAMES)("%s has path data on the 24x24 grid", (name) => {
    const { container } = render(<PixelIcon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    const paths = Array.from(svg.querySelectorAll("path"));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const d = path.getAttribute("d")!;
      expect(d).toMatch(/^M/);
      // Pixel art: every coordinate is a whole number within the grid.
      for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
        expect(Number.isInteger(n)).toBe(true);
        expect(Math.abs(n)).toBeLessThanOrEqual(24);
      }
    }
  });

  it("keeps hand-drawn names apart from pixelarticons names", () => {
    const overlap = Object.keys(CUSTOM_ICONS).filter(
      (name) => name in PIXELARTICONS
    );
    expect(overlap).toEqual([]);
  });
});
