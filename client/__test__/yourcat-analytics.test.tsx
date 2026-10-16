/**
 * @jest-environment jsdom
 */
/**
 * Growth events of bet #3 (docs/plans/yourcat-v2.md §7.1): exact names, no personal data, dropped
 * without consent, `portrait_paid` once per record (across tabs), `upload_started` on every attempt
 * (a retry included), and the GTM checkout value from the status price.
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
const mockApi = {
  status: jest.fn(),
  upload: jest.fn(),
  manual: jest.fn(),
  me: jest.fn(),
  get: jest.fn(),
  rename: jest.fn(),
  remove: jest.fn(),
  ensureGuest: jest.fn(async () => undefined),
  prefetchAppCheck: jest.fn(),
  publicCat: jest.fn(),
};
jest.mock("@/api/yourcat-api", () => {
  class YourcatRequestError extends Error {
    constructor(
      readonly status: number,
      readonly kind: string,
      readonly code: string | null,
      readonly serverMessage: string | null,
    ) {
      super("x");
      Object.setPrototypeOf(this, YourcatRequestError.prototype);
    }
    get failure() {
      return this.kind === "code" ? { kind: "code", code: this.code } : { kind: this.kind };
    }
  }
  return {
    YOURCAT_API: { ...mockApi, portraitCheckout: (...args: unknown[]) => mockCheckout(...args) },
    YourcatRequestError,
  };
});
jest.mock("@/components/yourcat/shareCard", () => ({
  renderShareCard: jest.fn(async () => new Blob(["png"], { type: "image/png" })),
  warmCardFonts: () => undefined,
  preloadCardImages: () => undefined,
  cardFileName: () => "tokentails-cat-story.png",
}));
jest.mock("@/components/yourcat/pinkPawPick", () => ({
  ...jest.requireActual("@/components/yourcat/pinkPawPick"),
  fetchPinkPawCandidates: jest.fn(async () => []),
}));
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { _id: "u1", isGuest: true, cats: [] }, setProfileUpdate: jest.fn() }),
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
jest.mock("@/context/FirebaseAuthContext", () => ({ useOptionalFirebaseAuth: () => undefined }));
jest.mock("@/features/portrait/components/StylePickerDrawer", () => ({
  PortraitStyle: { HIGHNESS: "highness", MONARCH: "monarch", ARISTOCRAT: "aristocrat", COMMANDER: "commander" },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { firstPaidSighting, PaidState, PAID_SEEN_PREFIX } from "@/components/yourcat/PaidState";
import { PortraitUpsell } from "@/components/yourcat/PortraitUpsell";
import { YourCatPage } from "@/components/yourcat/YourCatPage";
import type { YourcatStatusView, YourcatView } from "@/models/yourcat";

const RECORD: YourcatView = {
  id: "64e2e0000000000000000c01",
  shareId: "AbCdEfGhIjKl",
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
    localStorage.clear();
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

  it("portrait_paid is not reported again from a second tab or a reload (localStorage dedupe)", () => {
    const painting = { ...RECORD, portrait: { status: "painting" as const, style: "monarch" as const, url: null } };
    render(<PaidState record={painting} name="Mochi" portrait={PORTRAIT} late={false} onBack={() => undefined} reportPaid />);
    expect(mockTrack.mock.calls.filter(([event]) => event.name === "portrait_paid")).toHaveLength(1);
    expect(localStorage.getItem(`${PAID_SEEN_PREFIX}${RECORD.id}`)).toBe("1");
    // A second tab: its own sessionStorage, the same localStorage.
    sessionStorage.clear();
    render(<PaidState record={painting} name="Mochi" portrait={PORTRAIT} late={false} onBack={() => undefined} reportPaid />);
    expect(mockTrack.mock.calls.filter(([event]) => event.name === "portrait_paid")).toHaveLength(1);
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });

  it("dedupes without storage too, and never throws", () => {
    const local = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      expect(firstPaidSighting("64e2e0000000000000000c99")).toBe(true);
      expect(firstPaidSighting("64e2e0000000000000000c99")).toBe(false);
    } finally {
      local.mockRestore();
    }
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
    expect(screen.getByRole("button", { name: "Get the HD portrait · €17" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Get the HD portrait · €17" }));
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

describe("upload events", () => {
  const STATUS: YourcatStatusView = {
    enabled: true,
    uploadsOpen: true,
    appCheckEnforced: true,
    limits: { maxBytes: 10485760, types: ["image/jpeg"] },
    families: [{ family: "YELLOW", label: "Ginger", spriteImg: "https://cdn.test/YELLOW/base.png" }],
    portrait: PORTRAIT,
  };

  beforeEach(() => {
    Object.values(mockApi).forEach((fn) => (fn as jest.Mock).mockReset());
    mockApi.ensureGuest.mockImplementation(async () => undefined);
    mockApi.status.mockResolvedValue(STATUS);
    mockApi.me.mockResolvedValue(null);
    mockTrack.mockClear();
    Object.assign(URL, { createObjectURL: jest.fn(() => "blob:photo"), revokeObjectURL: jest.fn() });
  });

  async function flush() {
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it("Try again reports upload_started again, with the same file properties", async () => {
    const { YourcatRequestError } = jest.requireMock("@/api/yourcat-api");
    mockApi.upload.mockRejectedValueOnce(new YourcatRequestError(500, "server", null, null)).mockResolvedValueOnce(RECORD);
    render(<YourCatPage isApp={false} />);
    await flush();
    await act(async () => {
      fireEvent.change(screen.getByTestId("yourcat-file-input"), {
        target: { files: [new File([new Uint8Array([255, 216, 255])], "cat.jpg", { type: "image/jpeg" })] },
      });
    });
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong on our side. Please try again.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await flush();
    expect(mockApi.upload).toHaveBeenCalledTimes(2);
    // S3 shows once the scan pass ends (at most 400 ms after the answer).
    await waitFor(() => expect(screen.getByRole("heading", { name: "Meet Mochi." })).toBeTruthy());
    const names = mockTrack.mock.calls.map(([event]) => event.name);
    expect(names).toEqual(["upload_started", "upload_done", "upload_started", "upload_done"]);
    const started = mockTrack.mock.calls.filter(([event]) => event.name === "upload_started").map(([event]) => event.properties);
    expect(started[1]).toEqual(started[0]);
    expect(started[0]).toEqual(expect.objectContaining({ surface: "yourcat", source: "picker", fileType: "jpeg" }));
  });

  it("card_shared: Download (no Web Share) and Copy link, with the per-cat link in the copied text", async () => {
    mockApi.me.mockResolvedValue(RECORD);
    const writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<YourCatPage isApp={false} />);
    await flush();
    await waitFor(() => expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    await flush();
    const shared = mockTrack.mock.calls.filter(([event]) => event.name === "card_shared").map(([event]) => event.properties);
    expect(shared).toEqual([
      expect.objectContaining({ surface: "yourcat", method: "download", format: "post", withShelterCat: false }),
      expect.objectContaining({ surface: "yourcat", method: "copy-link", format: "none", withShelterCat: false }),
    ]);
    const [text] = writeText.mock.calls[0] as unknown as [string];
    expect(text).toMatch(/^Mochi is a pixel cat now\. Turn your cat into one: .+\/yourcat\?cat=AbCdEfGhIjKl&utm_source=share&utm_medium=link&utm_campaign=yourcat&utm_content=link$/);
    click.mockRestore();
  });
});
