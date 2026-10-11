/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

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
});
