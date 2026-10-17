/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

// Known issue KI-19: the banner appeared only with a PostHog key and never named Google Tag Manager,
// so a build with only NEXT_PUBLIC_GTM_ID could never be accepted (and GTM never loaded), and a build
// with both asked about game counts while GA received portrait purchase events. CR2-04: the PostHog
// sentence also named only game counts, while PostHog receives the /yourcat steps with UTM tags.
const mockState = {
  posthog: false,
  gtm: false,
  consent: "unset" as "unset" | "granted" | "denied",
};
const mockSetConsent = jest.fn(async (state: "granted" | "denied") => {
  mockState.consent = state;
});

jest.mock("@/analytics", () => ({
  CONSENT_OPEN_EVENT: "tt-analytics-consent-open",
  openConsentSettings: jest.fn(),
  analytics: {
    get enabled() {
      return mockState.posthog;
    },
    getConsent: () => mockState.consent,
    setConsent: (state: "granted" | "denied") => mockSetConsent(state),
  },
}));
jest.mock("@/analytics/gtm", () => ({
  gtm: {
    get enabled() {
      return mockState.gtm;
    },
  },
}));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, onClick }: { text: string; onClick?: () => void }) => (
    <button onClick={onClick}>{text}</button>
  ),
}));

import {
  AnalyticsConsentBanner,
  AnalyticsSettingsButton,
  AnalyticsSettingsLink,
  COMPACT_LEAD_SHORT,
  consentCopy,
} from "@/components/shared/AnalyticsConsentBanner";

beforeEach(() => {
  mockState.posthog = false;
  mockState.gtm = false;
  mockState.consent = "unset";
  mockSetConsent.mockClear();
});

describe("AnalyticsConsentBanner", () => {
  it("stays hidden when neither PostHog nor GTM is configured", () => {
    render(<AnalyticsConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    render(<AnalyticsSettingsLink />);
    expect(screen.queryByText("Analytics settings")).toBeNull();
  });

  it("asks when only GTM is configured, and names Google Tag Manager and the portrait events", () => {
    mockState.gtm = true;
    render(<AnalyticsConsentBanner />);
    const dialog = screen.getByRole("dialog", { name: "Analytics consent" });
    expect(dialog.textContent).toMatch(/Google Tag Manager/);
    expect(dialog.textContent).toMatch(/Google Analytics/);
    expect(dialog.textContent).toMatch(/purchase/);
    expect(dialog.textContent).toMatch(/cookies/);
    // PostHog is off: the game-count sentence (and its "anonymous" claim) is not shown.
    expect(dialog.textContent).not.toMatch(/game starts/);
    expect(dialog.textContent).not.toMatch(/anonymous/);
  });

  it("ACCEPT stores the choice that GTM waits for", () => {
    mockState.gtm = true;
    render(<AnalyticsConsentBanner />);
    fireEvent.click(screen.getByText("ACCEPT"));
    expect(mockSetConsent).toHaveBeenCalledWith("granted");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names only what PostHog receives when only PostHog is configured", () => {
    mockState.posthog = true;
    render(<AnalyticsConsentBanner />);
    const text = screen.getByRole("dialog").textContent || "";
    expect(text).toMatch(/game starts and finishes/);
    expect(text).not.toMatch(/Google/);
  });

  // CR2-04: PostHog also receives the /yourcat growth events (upload, share, portrait checkout and
  // payment, `upload_started` with UTM tags), scrubbed errors and the sign-in and onboarding steps.
  it("names the /yourcat steps, the portrait purchase and the incoming link in the PostHog sentence", () => {
    const [posthog] = consentCopy(true, false).details;
    expect(posthog).toMatch(/making your cat/);
    expect(posthog).toMatch(/buying a portrait/);
    expect(posthog).toMatch(/the link that brought you here/);
    expect(posthog).toMatch(/app errors/);
    expect(posthog).toMatch(/signing in/);
    expect(posthog).toMatch(/No photo, name or email is sent/);
    expect(posthog).toMatch(/never touches your scores/);
    // No blanket "anonymous" claim: UTM tags and event steps are sent.
    expect(posthog).not.toMatch(/anonymous/);
  });

  it("names both when both are configured", () => {
    const copy = consentCopy(true, true);
    expect(copy.details).toHaveLength(2);
    expect(copy.details.join(" ")).toMatch(/game starts[\s\S]*Google Tag Manager/);
  });

  it("stays closed once a choice is stored", () => {
    mockState.gtm = true;
    mockState.consent = "denied";
    render(<AnalyticsConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers the settings button and link with GTM alone, so consent can be revoked", () => {
    mockState.gtm = true;
    render(
      <>
        <AnalyticsSettingsButton />
        <AnalyticsSettingsLink />
      </>,
    );
    expect(screen.getByText("ANALYTICS")).toBeTruthy();
    expect(screen.getByText("Analytics settings")).toBeTruthy();
  });

  // Polish §15: /yourcat mounts a compact chip so the banner never covers CHOOSE A PHOTO or the
  // S3 share bar. Same consent semantics; the full text is one tap away behind "Details".
  describe("compact variant", () => {
    it("asks in one line with the full text behind Details", () => {
      mockState.posthog = true;
      mockState.gtm = true;
      render(<AnalyticsConsentBanner variant="compact" />);
      const dialog = screen.getByRole("dialog", { name: "Analytics consent" });
      expect(dialog.getAttribute("data-variant")).toBe("compact");
      expect(dialog.textContent).toMatch(/Can we measure how Token Tails is used/);
      const details = screen.getByRole("button", { name: "Details" });
      expect(details.getAttribute("aria-expanded")).toBe("false");
      const panel = document.getElementById(details.getAttribute("aria-controls") || "");
      expect(panel).toBeTruthy();
      expect(panel!.hidden).toBe(true);
      // The details still name everything Accept turns on, and the privacy policy.
      expect(panel!.textContent).toMatch(/game starts and finishes/);
      expect(panel!.textContent).toMatch(/Google Tag Manager/);
      expect(panel!.textContent).toMatch(/Nothing is sent before you accept/);
      expect(screen.getByText("Privacy Policy").getAttribute("href")).toMatch(/privacy-policy/);
      fireEvent.click(details);
      expect(panel!.hidden).toBe(false);
      expect(screen.getByRole("button", { name: "Less" }).getAttribute("aria-expanded")).toBe("true");
    });

    it("Accept and No thanks store the same choice as the full banner", () => {
      mockState.gtm = true;
      const { unmount } = render(<AnalyticsConsentBanner variant="compact" />);
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      expect(mockSetConsent).toHaveBeenCalledWith("granted");
      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();

      mockState.consent = "unset";
      render(<AnalyticsConsentBanner variant="compact" />);
      fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
      expect(mockSetConsent).toHaveBeenLastCalledWith("denied");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("stays closed once a choice is stored, and hidden with nothing configured", () => {
      render(<AnalyticsConsentBanner variant="compact" />);
      expect(screen.queryByRole("dialog")).toBeNull();
      mockState.gtm = true;
      mockState.consent = "granted";
      render(<AnalyticsConsentBanner variant="compact" />);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("reopens from settings and shows the current choice", () => {
      mockState.gtm = true;
      mockState.consent = "granted";
      render(<AnalyticsConsentBanner variant="compact" />);
      act(() => {
        window.dispatchEvent(new Event("tt-analytics-consent-open"));
      });
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toMatch(/Current choice: allowed/);
    });

    it("is part of the host (no fixed layer over the page), with 24 px+ targets and a short phone question", () => {
      mockState.gtm = true;
      render(<AnalyticsConsentBanner variant="compact" />);
      const dialog = screen.getByRole("dialog", { name: "Analytics consent" });
      // Round 2 QA: a fixed chip covered CHOOSE A PHOTO, the cap screen's button and the S3 actions.
      expect(dialog.className).not.toMatch(/\b(fixed|sticky)\b/);
      expect(dialog.className).not.toMatch(/\bbottom-/);
      for (const name of ["No thanks", "Accept", "Details"]) {
        expect(screen.getByRole("button", { name }).className).toContain("min-h-7");
      }
      expect(dialog.textContent).toContain(COMPACT_LEAD_SHORT);
      expect(COMPACT_LEAD_SHORT).toBe("Can we measure how the game is used?");
    });

    it("Escape folds the details; a reopen from settings opens them with the current choice", () => {
      mockState.gtm = true;
      render(<AnalyticsConsentBanner variant="compact" />);
      const details = screen.getByRole("button", { name: "Details" });
      fireEvent.click(details);
      const panel = document.getElementById(details.getAttribute("aria-controls") || "")!;
      expect(panel.hidden).toBe(false);
      fireEvent.keyDown(panel, { key: "Escape" });
      expect(panel.hidden).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      act(() => {
        window.dispatchEvent(new Event("tt-analytics-consent-open"));
      });
      const again = document.getElementById(screen.getByRole("button", { name: "Less" }).getAttribute("aria-controls") || "")!;
      expect(again.hidden).toBe(false);
      expect(again.textContent).toMatch(/Current choice: not allowed/);
    });

    it("the default variant keeps the full banner", () => {
      mockState.gtm = true;
      render(<AnalyticsConsentBanner />);
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("data-variant")).toBeNull();
      expect(screen.getByText("ACCEPT")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
      // Every page but /yourcat: the same fixed bottom card as before the compact variant.
      expect(dialog.className).toBe("fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 pb-safe");
    });
  });
});

describe("AnalyticsConsentBanner pauseGames (/swordcat)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const registry = require("@/lib/game/gameRegistry") as typeof import("@/lib/game/gameRegistry");
  afterEach(() => registry.__resetGameRegistryForTests());

  it("pauses the games while the card is open and resumes them on a choice", () => {
    mockState.gtm = true;
    const { unmount } = render(<AnalyticsConsentBanner pauseGames />);
    expect(registry.isGameSuspended()).toBe(true);
    fireEvent.click(screen.getByText("NO THANKS"));
    expect(registry.isGameSuspended()).toBe(false);
    unmount();
  });

  it("leaves games running without pauseGames, once a choice is stored, or when unmounted", () => {
    mockState.gtm = true;
    const a = render(<AnalyticsConsentBanner />);
    expect(registry.isGameSuspended()).toBe(false);
    a.unmount();
    const b = render(<AnalyticsConsentBanner pauseGames />);
    expect(registry.isGameSuspended()).toBe(true);
    b.unmount();
    expect(registry.isGameSuspended()).toBe(false);
    mockState.consent = "denied";
    render(<AnalyticsConsentBanner pauseGames />);
    expect(registry.isGameSuspended()).toBe(false);
  });
});
