/**
 * @jest-environment jsdom
 */
/**
 * Growth events of bet #3 (docs/plans/yourcat-v2.md §7.1): exact names, no personal data, dropped
 * without consent, `portrait_paid` once per record, and the GTM checkout value from the status price.
 */
import { createAnalytics, type AnalyticsClient } from "@/analytics/client";
import type { ConsentState } from "@/analytics/consent";
import { buildGrowthEvent, GROWTH_EVENTS, type GrowthEventProperties } from "@/analytics/growth-events";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

const mockTrack = jest.fn();
const mockTrackEvent = jest.fn();
jest.mock("@/analytics", () => ({
  analytics: { track: (...args: unknown[]) => mockTrack(...args) },
  reportAppError: jest.fn(),
}));
jest.mock("@/components/GoogleTagManager", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
const mockCheckout = jest.fn();
jest.mock("@/api/yourcat-api", () => {
  class YourcatRequestError extends Error {
    constructor(
      readonly status: number,
      readonly kind: string,
      readonly code: string | null,
      readonly serverMessage: string | null,
    ) {
      super("x");
    }
  }
  return { YOURCAT_API: { portraitCheckout: (...args: unknown[]) => mockCheckout(...args) }, YourcatRequestError };
});

import { firstPaidSighting, PaidState } from "@/components/yourcat/PaidState";
import { PortraitUpsell } from "@/components/yourcat/PortraitUpsell";
import type { YourcatStatusView, YourcatView } from "@/models/yourcat";

const RECORD: YourcatView = {
  id: "64e2e0000000000000000c01",
  name: "Mochi",
  named: true,
  family: "YELLOW",
  familyLabel: "Ginger",
  cat: { _id: "c1", name: "Mochi", type: "FIRE", spriteImg: "https://cdn.test/YELLOW/base.png", catImg: "https://cdn.test/YELLOW/base/GROOMING.gif" },
  avatar: { status: "ready", url: "https://cdn.test/avatar.png" },
  photo: { stored: true, deleteAfter: "2026-11-10T00:00:00.000Z" },
  portrait: { status: "none", style: null, url: null },
  createdAt: "2026-10-11T10:00:00.000Z",
};
const PORTRAIT: YourcatStatusView["portrait"] = {
  enabled: true,
  priceCents: 1700, // deliberately not 1400: the client must never hard-code the price
  currency: "EUR",
  styles: ["highness", "monarch", "aristocrat", "commander"],
};

const PII_KEYS = ["name", "catName", "url", "photo", "avatar", "id", "userId", "email"];

describe("growth event catalog", () => {
  it("has the exact names", () => {
    expect(GROWTH_EVENTS).toEqual({
      UPLOAD_STARTED: "upload_started",
      UPLOAD_DONE: "upload_done",
      CARD_SHARED: "card_shared",
      PORTRAIT_CHECKOUT_STARTED: "portrait_checkout_started",
      PORTRAIT_PAID: "portrait_paid",
    });
  });

  it("no property key carries personal data", () => {
    const samples: { [K in keyof GrowthEventProperties]: GrowthEventProperties[K] } = {
      upload_started: { surface: "yourcat", source: "picker", fileType: "jpeg", sizeBucket: "1to5mb", resized: true, utmSource: "share" },
      upload_done: { surface: "yourcat", outcome: "ready", family: "YELLOW", avatarStatus: "pending", seconds: 8 },
      card_shared: { surface: "yourcat", format: "story", method: "web-share", withShelterCat: true, avatarStatus: "ready", secondsToReveal: 9 },
      portrait_checkout_started: { surface: "yourcat", style: "monarch", priceCents: 1400, currency: "EUR" },
      portrait_paid: { surface: "yourcat", priceCents: 1400, currency: "EUR", status: "painting" },
    };
    for (const [name, properties] of Object.entries(samples)) {
      const event = buildGrowthEvent(name as keyof GrowthEventProperties, properties as never);
      for (const key of Object.keys(event.properties)) expect(PII_KEYS).not.toContain(key);
    }
    // And the declared shapes themselves (read as text) name none of them.
    const source = readFileSync(join(__dirname, "..", "analytics", "growth-events.ts"), "utf8");
    const declared = source.slice(source.indexOf("export interface GrowthEventProperties"), source.indexOf("export type GrowthEvent ="));
    for (const key of PII_KEYS) expect(declared).not.toMatch(new RegExp(`\\b${key}\\??:`));
  });

  it("growth events are dropped without consent (createAnalytics, fake loader)", async () => {
    const client: jest.Mocked<AnalyticsClient> = {
      capture: jest.fn(),
      register: jest.fn(),
      opt_in_capturing: jest.fn(),
      opt_out_capturing: jest.fn(),
      has_opted_out_capturing: jest.fn(() => false),
      reset: jest.fn(),
    };
    let consent: ConsentState = "unset";
    const load = jest.fn(async () => client);
    const analytics = createAnalytics({
      apiKey: "phc_test",
      load,
      superProperties: () => ({ app: "core", platform: "web", device_tier: "unknown" }),
      readConsent: () => consent,
      writeConsent: (state) => {
        consent = state;
      },
    });
    const event = buildGrowthEvent("card_shared", {
      surface: "yourcat",
      format: "post",
      method: "download",
      withShelterCat: false,
      avatarStatus: "ready",
      secondsToReveal: null,
    });
    analytics.track(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
    await analytics.setConsent("granted");
    analytics.track(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.capture).toHaveBeenCalledWith("card_shared", event.properties);
  });
});

describe("portrait events", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockTrack.mockClear();
    mockTrackEvent.mockClear();
  });

  it("portrait_paid fires once per record", () => {
    const painting = { ...RECORD, portrait: { status: "painting" as const, style: "monarch" as const, url: null } };
    const { rerender, unmount } = render(
      <PaidState record={painting} name="Mochi" portrait={PORTRAIT} late={false} onBack={() => undefined} reportPaid />,
    );
    const ready = { ...painting, portrait: { status: "ready" as const, style: "monarch" as const, url: "https://cdn.test/hd.webp" } };
    rerender(<PaidState record={ready} name="Mochi" portrait={PORTRAIT} late={false} onBack={() => undefined} reportPaid />);
    unmount();
    render(<PaidState record={ready} name="Mochi" portrait={PORTRAIT} late={false} onBack={() => undefined} reportPaid />);
    const paid = mockTrack.mock.calls.filter(([event]) => event.name === "portrait_paid");
    expect(paid).toHaveLength(1);
    expect(paid[0][0].properties).toEqual({ surface: "yourcat", priceCents: 1700, currency: "EUR", status: "painting" });
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith("purchase", expect.objectContaining({ currency: "EUR", value: 17 }));
    expect(firstPaidSighting(RECORD.id)).toBe(false);
  });

  it("does not report on S3 (only the paid return reports)", () => {
    const ready = { ...RECORD, portrait: { status: "ready" as const, style: "monarch" as const, url: "https://cdn.test/hd.webp" } };
    render(<PaidState record={ready} name="Mochi" portrait={PORTRAIT} late={false} onBack={() => undefined} />);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("begin_checkout value is priceCents / 100 from the status (no literal 14)", async () => {
    mockCheckout.mockResolvedValue({ checkoutUrl: "https://checkout.stripe.test/s", orderId: "o1" });
    const navigate = jest.fn();
    render(<PortraitUpsell record={RECORD} name="Mochi" portrait={PORTRAIT} onExists={() => undefined} navigate={navigate} />);
    expect(screen.getByRole("button", { name: "Get the HD portrait for €17" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Get the HD portrait for €17" }));
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.test/s"));
    expect(mockTrackEvent).toHaveBeenCalledWith("begin_checkout", expect.objectContaining({ currency: "EUR", value: 17 }));
    const started = mockTrack.mock.calls.find(([event]) => event.name === "portrait_checkout_started");
    expect(started?.[0].properties).toEqual({ surface: "yourcat", style: "highness", priceCents: 1700, currency: "EUR" });
  });

  it("the client source has no hard-coded portrait price", () => {
    for (const file of ["PortraitUpsell.tsx", "PaidState.tsx", "copy.ts", "YourCatPage.tsx"]) {
      const source = readFileSync(join(__dirname, "..", "components", "yourcat", file), "utf8");
      expect(source).not.toMatch(/€\s?14\b|\b1400\b|value:\s*14\b/);
    }
  });
});
