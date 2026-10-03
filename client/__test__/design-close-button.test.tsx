/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CloseButton } from "@/components/shared/CloseButton";
import { __resetLowFxForTests, applyLowFx, isLowFxDevice } from "@/components/ui/lowfx";

jest.mock("@/constants/utils", () => ({
  cdnFile: (path: string) => `https://cdn.test/${path}`,
}));

describe("CloseButton", () => {
  it("is a real button with an accessible name wrapping a decorative image", () => {
    render(<CloseButton onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    const img = button.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("src")).toBe("https://cdn.test/icons/close.webp");
  });

  it("takes a custom label", () => {
    render(<CloseButton onClick={() => {}} label="Close the wheel" />);
    expect(screen.getByRole("button", { name: "Close the wheel" })).toBeTruthy();
  });

  it("is at least 44x44 CSS px and never scaled down itself", () => {
    render(<CloseButton onClick={() => {}} placement="inside" />);
    const button = screen.getByRole("button", { name: "Close" });
    // Pixel sizes, not rem: phones scale the root font size down (globals.scss), so rem-based
    // h-11 would be 35 px at 320 wide.
    expect(button.className).toMatch(/(^|\s)min-h-\[44px\](\s|$)/);
    expect(button.className).toMatch(/(^|\s)min-w-\[44px\](\s|$)/);
    expect(button.className).toMatch(/(^|\s)h-\[44px\](\s|$)/);
    expect(button.className).not.toMatch(/(^|\s)[hw]-11(\s|$)/);
    expect(button.querySelector("img")!.className).not.toMatch(/(^|\s)w-11(\s|$)/);
    expect(button.className).not.toMatch(/(^|\s)(scale-(\d+|\[[^\]]+\]))(\s|$)/);
    expect(button.className).toMatch(/focus-visible:ring-tt-gold-400/);
  });

  it("calls onClick without bubbling to a backdrop handler", () => {
    const onClick = jest.fn();
    const backdrop = jest.fn();
    render(
      <div onClick={backdrop}>
        <CloseButton onClick={onClick} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(backdrop).not.toHaveBeenCalled();
  });

  it("disabled keeps it visible and focusable but aria-disabled and inert", () => {
    const onClick = jest.fn();
    render(<CloseButton onClick={onClick} disabled />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([
    ["inside", /(^|\s)absolute(\s|$)/, /right-2/],
    ["outside", /(^|\s)absolute(\s|$)/, /-right-4/],
    ["viewport", /(^|\s)fixed(\s|$)/, /z-modal-nested/],
    ["sticky", /(^|\s)sticky(\s|$)/, /ml-auto/],
  ] as const)("placement %s", (placement, position, detail) => {
    render(<CloseButton onClick={() => {}} placement={placement} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.getAttribute("data-placement")).toBe(placement);
    expect(button.className).toMatch(position);
    expect(button.className).toMatch(detail);
    expect(button.className).not.toMatch(/z-\[(100000|200000)\]/);
  });

  it("applies safe-area insets for the viewport placement only", () => {
    const { rerender } = render(<CloseButton onClick={() => {}} placement="viewport" />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.getAttribute("style")).toMatch(/safe-area-inset-top/);
    expect(button.getAttribute("style")).toMatch(/safe-area-inset-right/);
    for (const placement of ["inside", "outside", "sticky"] as const) {
      rerender(<CloseButton onClick={() => {}} placement={placement} />);
      expect(screen.getByRole("button", { name: "Close" }).getAttribute("style") ?? "").not.toMatch(
        /safe-area/
      );
    }
  });

  it("defaults to inside and honours an explicit placement (the legacy absolute prop is gone)", () => {
    const { rerender } = render(<CloseButton onClick={() => {}} />);
    expect(screen.getByRole("button").getAttribute("data-placement")).toBe("inside");
    rerender(<CloseButton onClick={() => {}} placement="viewport" />);
    expect(screen.getByRole("button").getAttribute("data-placement")).toBe("viewport");
  });
});

describe("lowfx", () => {
  it("detects Android, Capacitor Android and devices with 4 or fewer cores", () => {
    expect(isLowFxDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)", hardwareConcurrency: 8 })).toBe(true);
    expect(isLowFxDevice({ platform: "android", hardwareConcurrency: 8 })).toBe(true);
    expect(isLowFxDevice({ userAgent: "iPhone", hardwareConcurrency: 4 })).toBe(true);
    expect(isLowFxDevice({ userAgent: "Macintosh", hardwareConcurrency: 10 })).toBe(false);
    expect(isLowFxDevice({ userAgent: "Macintosh" })).toBe(false);
  });

  it("sets the html class once", () => {
    __resetLowFxForTests();
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
    expect(applyLowFx()).toBe(true);
    expect(document.documentElement.classList.contains("lowfx")).toBe(true);
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 16, configurable: true });
    expect(applyLowFx()).toBe(true);
    __resetLowFxForTests();
    expect(applyLowFx()).toBe(false);
    expect(document.documentElement.classList.contains("lowfx")).toBe(false);
  });
});
