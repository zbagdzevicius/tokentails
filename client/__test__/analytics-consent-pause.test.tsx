/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

// /swordcat: the consent card pauses the full-screen game until the player answers.
const mockState = {
  enabled: true,
  consent: "unset" as "unset" | "granted" | "denied",
};

jest.mock("@/analytics", () => ({
  CONSENT_OPEN_EVENT: "tt-analytics-consent-open",
  openConsentSettings: jest.fn(),
  analytics: {
    get enabled() {
      return mockState.enabled;
    },
    getConsent: () => mockState.consent,
    setConsent: async (state: "granted" | "denied") => {
      mockState.consent = state;
    },
  },
}));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, onClick }: { text: string; onClick?: () => void }) => (
    <button onClick={onClick}>{text}</button>
  ),
}));

import { AnalyticsConsentBanner } from "@/components/shared/AnalyticsConsentBanner";
import * as registry from "@/lib/game/gameRegistry";

beforeEach(() => {
  mockState.enabled = true;
  mockState.consent = "unset";
});
afterEach(() => registry.__resetGameRegistryForTests());

describe("AnalyticsConsentBanner pauseGames (/swordcat)", () => {
  it("pauses the games while the card is open and resumes them on a choice", () => {
    const { unmount } = render(<AnalyticsConsentBanner pauseGames />);
    expect(registry.isGameSuspended()).toBe(true);
    fireEvent.click(screen.getByText("NO THANKS"));
    expect(registry.isGameSuspended()).toBe(false);
    unmount();
  });

  it("leaves games running without pauseGames, once a choice is stored, or when unmounted", () => {
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
