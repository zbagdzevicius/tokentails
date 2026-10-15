/**
 * @jest-environment jsdom
 *
 * The landing's Swordcat section (Swordcat plan §12.3 E): hidden with the flag off and in the app
 * build; one link to /swordcat; a treat beat per rail state (present tense only while live); no adoption words, no em
 * dash and no number that is not read live.
 */
import React from "react";
import { render } from "@testing-library/react";

let mockIsApp = false;
jest.mock("@/components/claims/build", () => ({ isAppBuild: () => mockIsApp }));
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
  swordcatTreatBeat,
  SwordcatSection,
  swordcatSectionEnabled,
} from "@/components/landing/SwordcatSection";
import { SWORDCAT_TITLE } from "@/components/swordcat/title";

afterEach(() => {
  mockIsApp = false;
  delete process.env.NEXT_PUBLIC_SWORDCAT;
});

describe("swordcatSectionEnabled", () => {
  it("is off by default, on with the flag, and never in the app build", () => {
    expect(swordcatSectionEnabled(undefined, false)).toBe(false);
    expect(swordcatSectionEnabled("0", false)).toBe(false);
    expect(swordcatSectionEnabled("1", false)).toBe(true);
    expect(swordcatSectionEnabled("true", true)).toBe(false);
  });
});

describe("SwordcatSection", () => {
  it("renders nothing with the flag off", () => {
    const { container } = render(<SwordcatSection railState="live" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing in the app build even with the flag on", () => {
    process.env.NEXT_PUBLIC_SWORDCAT = "1";
    mockIsApp = true;
    const { container } = render(<SwordcatSection railState="live" />);
    expect(container.innerHTML).toBe("");
  });

  it("with the flag on: label, title, line, a lazy still and exactly one link", () => {
    process.env.NEXT_PUBLIC_SWORDCAT = "1";
    const { container, getByTestId } = render(<SwordcatSection railState="live" />);
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
        expect(beat?.textContent).toContain("Held by Token Tails for the shelter until handover.");
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
