/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

jest.mock("@/components/shared/PixelButton", () => ({
  // The real span variant renders spans only (log 1d); the mock keeps that shape.
  PixelButton: ({ text, as }: { text: string; as?: string }) =>
    as === "span" ? <span data-pixel-button="span">{text}</span> : <button>{text}</button>,
}));
const mockTrack = jest.fn();
jest.mock("@/analytics", () => ({
  analytics: { track: (event: unknown) => mockTrack(event) },
  buildEvent: (name: string, properties: unknown) => ({ name, properties }),
}));
jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
}));

import { teamMembers } from "@/components/landing/Team";
import {
  CREW_CTA_MAX_NAME,
  crewCtaLabel,
  TEAM_EXTRAS,
  TEAM_ORDER,
  TeamSection,
} from "@/components/landing/TeamSection";

describe("TeamSection", () => {
  it("renders one tab per team member", () => {
    render(<TeamSection />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(10);
    expect(tabs).toHaveLength(teamMembers.length);
  });

  it("has presentation data and a single order slot for every member", () => {
    for (const m of teamMembers) {
      expect(TEAM_EXTRAS[m.name]).toBeDefined();
      expect(TEAM_ORDER.filter((n) => n === m.name)).toHaveLength(1);
    }
  });

  it("selects a member on click and shows them in the panel", () => {
    render(<TeamSection />);
    const tab = screen.getAllByRole("tab")[3];
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByRole("heading", { level: 3 }).textContent,
    ).toBe(TEAM_ORDER[3]);
    expect(TEAM_ORDER[3]).toBe("Lukas");
  });

  it("wraps with ArrowRight and jumps with End", () => {
    render(<TeamSection />);
    const tabs = screen.getAllByRole("tab");
    const last = tabs.length - 1;
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[last].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[last]);
    fireEvent.keyDown(tabs[last], { key: "ArrowRight" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("uses a safe rel on every new-tab link", () => {
    const { container } = render(<TeamSection />);
    const tabs = screen.getAllByRole("tab");
    tabs.forEach((tab) => {
      fireEvent.click(tab);
      container.querySelectorAll('a[target="_blank"]').forEach((a) => {
        const rel = a.getAttribute("rel") ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");
      });
    });
  });

  it("renders no outbound links for the cats", () => {
    render(<TeamSection />);
    fireEvent.click(screen.getAllByRole("tab")[TEAM_ORDER.indexOf("Feta")]);
    const panel = screen.getByRole("tabpanel");
    expect(panel.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
  });

  it("stays fully visible without IntersectionObserver", () => {
    const { container } = render(<TeamSection />);
    expect(
      container
        .querySelector('[data-testid="team-section"]')
        ?.getAttribute("data-phase"),
    ).toBe("static");
  });

  it("reveals when only a small slice of a tall section is on screen", () => {
    let cb: IntersectionObserverCallback = () => {};
    let options: IntersectionObserverInit | undefined;
    const original = (window as unknown as { IntersectionObserver?: unknown })
      .IntersectionObserver;
    class FakeIO {
      constructor(c: IntersectionObserverCallback, o?: IntersectionObserverInit) {
        cb = c;
        options = o;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    Object.assign(window, { IntersectionObserver: FakeIO });
    try {
      const { container } = render(<TeamSection />);
      const section = container.querySelector('[data-testid="team-section"]');
      expect(section?.getAttribute("data-phase")).toBe("pre");
      // A landscape phone can only ever show ~20% of the section.
      expect(options?.threshold ?? 0).toBe(0);
      act(() => {
        cb(
          [
            {
              isIntersecting: true,
              intersectionRatio: 0.2,
            } as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver,
        );
      });
      expect(section?.getAttribute("data-phase")).toBe("in");
    } finally {
      Object.assign(window, { IntersectionObserver: original });
    }
  });
  it("puts the roster before the panel in the DOM so Tab goes tab -> panel", () => {
    render(<TeamSection />);
    const tablist = screen.getByRole("tablist");
    const panel = screen.getByRole("tabpanel");
    expect(
      tablist.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(panel.getAttribute("tabindex")).toBe("0");
  });

  it("keeps the previous photo under the new one while switching", () => {
    const { container } = render(<TeamSection />);
    fireEvent.click(screen.getAllByRole("tab")[3]);
    const token = container.querySelector(".team-token");
    const imgs = token?.querySelectorAll("img") ?? [];
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("src")).toBe(
      teamMembers.find((m) => m.name === TEAM_ORDER[0])?.img,
    );
    expect(imgs[1].getAttribute("alt")).toContain("Lukas");
  });

  it("makes no uncited rescue count (F-024 '800+' is off the landing, decision #29)", () => {
    const { container } = render(<TeamSection />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("800+");
    expect(text).not.toMatch(/strays|saved|found a home/i);
  });

  it("labels the crew CTA by player state (2.13 row 34)", () => {
    render(<TeamSection />);
    expect(screen.getByText("MEET YOUR CAT")).toBeTruthy();
    expect(screen.queryByText(/JOIN THE CREW|PLAY TO SAVE/)).toBeNull();
    expect(crewCtaLabel()).toBe("MEET YOUR CAT");
    expect(crewCtaLabel({ signedIn: true, onboardingState: "pending", catName: "Scout" })).toBe("MEET YOUR CAT");
    expect(crewCtaLabel({ signedIn: true, onboardingState: "done", catName: "Scout" })).toBe("SCOUT IS WAITING");
    expect(crewCtaLabel({ signedIn: true, onboardingState: "done", catName: "  " })).toBe("MEET YOUR CAT");
  });

  it("spells out names up to the cap and falls back for longer ones (the button never wraps)", () => {
    expect(CREW_CTA_MAX_NAME).toBe(10);
    expect(crewCtaLabel({ signedIn: true, onboardingState: "done", catName: "Wwwwwwwwww" })).toBe("WWWWWWWWWW IS WAITING");
    expect(crewCtaLabel({ signedIn: true, onboardingState: "done", catName: "Captain Whiskers" })).toBe("YOUR CAT IS WAITING");
    expect(crewCtaLabel({ signedIn: true, onboardingState: "done", catName: "Wwwwwwwwwwwwwwww" })).toBe("YOUR CAT IS WAITING");
  });

  it("passes a named cat to the CTA", () => {
    render(<TeamSection cta={{ signedIn: true, onboardingState: "done", catName: "Miso" }} />);
    expect(screen.getByText("MISO IS WAITING")).toBeTruthy();
  });

  it("is one link with the label as its accessible name and one tab stop (valid HTML)", () => {
    const { container } = render(<TeamSection />);
    const link = screen.getByRole("link", { name: "MEET YOUR CAT" });
    expect(link.getAttribute("href")).toBe("/game?from=landing_crew");
    // No interactive element nested in the link (axe nested-interactive), so Tab stops once.
    expect(link.querySelector("button, a, input, select, textarea, [tabindex]")).toBeNull();
    expect(link.querySelector('[data-pixel-button="span"]')).not.toBeNull();
    expect(container.querySelectorAll("a button, button a, a a")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /MEET YOUR CAT/ })).toBeNull();
  });

  it("follows the player: pending, signed out and a named cat", () => {
    const { rerender } = render(<TeamSection cta={{ signedIn: true, onboardingState: "pending", catName: "Scout" }} />);
    expect(screen.getByRole("link", { name: "MEET YOUR CAT" })).toBeTruthy();
    rerender(<TeamSection cta={{ signedIn: false }} />);
    expect(screen.getByRole("link", { name: "MEET YOUR CAT" })).toBeTruthy();
    rerender(<TeamSection cta={{ signedIn: true, onboardingState: "done", catName: "Miso" }} />);
    expect(screen.getByRole("link", { name: "MISO IS WAITING" }).getAttribute("href")).toBe("/game?from=landing_crew");
  });

  it("carries {from: crew} to /game and tracks nothing on tap (Task 6b review #1)", () => {
    render(<TeamSection />);
    const link = screen.getByRole("link", { name: "MEET YOUR CAT" });
    expect(link.getAttribute("href")).toBe("/game?from=landing_crew");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
