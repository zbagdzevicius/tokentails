/**
 * @jest-environment jsdom
 */
/**
 * Honesty rules of `/yourcat` (bet #3, docs/plans/yourcat-v2.md §1 "Honesty rules", §9 B): the rendered
 * page with S5 and the Pink Paw switch visible together, plus every card string, says nothing about
 * donations, shares of sales or shelter support, no counts, ratings or reviews, and no duration until it
 * is measured. The app build shows the notice with no price and no upload input.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { YourcatStatusView, YourcatView } from "@/models/yourcat";

const api = {
  status: jest.fn(),
  upload: jest.fn(),
  manual: jest.fn(),
  me: jest.fn(),
  get: jest.fn(),
  rename: jest.fn(),
  remove: jest.fn(),
  portraitCheckout: jest.fn(),
  ensureGuest: jest.fn(async () => undefined),
  prefetchAppCheck: jest.fn(),
};
jest.mock("@/api/yourcat-api", () => ({ YOURCAT_API: api, YourcatRequestError: class extends Error {} }));
jest.mock("@/components/yourcat/shareCard", () => ({
  renderShareCard: jest.fn(async () => new Blob(["png"], { type: "image/png" })),
  warmCardFonts: () => undefined,
  cardFileName: () => "tokentails-cat-story.png",
}));
jest.mock("@/components/yourcat/pinkPawPick", () => ({
  ...jest.requireActual("@/components/yourcat/pinkPawPick"),
  fetchPinkPawCandidates: jest.fn(async () => [{ name: "Judas", image: "/yourcat/pink-paw/judas-card.webp" }]),
}));
jest.mock("@/analytics", () => ({ analytics: { track: jest.fn() }, reportAppError: jest.fn() }));
jest.mock("@/components/GoogleTagManager", () => ({ trackEvent: jest.fn() }));
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

import { allStaticCopy, CARD_TEXT, DURATION_MEASURED, s1Body, S1 } from "@/components/yourcat/copy";
import { YourCatPage } from "@/components/yourcat/YourCatPage";

const BANNED = [
  "donat",
  "feeds",
  "every purchase",
  "proceeds",
  "% to",
  "goes to",
  "supports the shelter",
  "rescued",
  "waiting for a home",
  "reviews",
  "rated",
];

const STATUS: YourcatStatusView = {
  enabled: true,
  uploadsOpen: true,
  appCheckEnforced: true,
  limits: { maxBytes: 10485760, types: ["image/jpeg"] },
  families: [{ family: "BLACK", label: "Black", spriteImg: "https://cdn.test/assets/BLACK/base.png" }],
  portrait: { enabled: true, priceCents: 1400, currency: "EUR", styles: ["highness", "monarch", "aristocrat", "commander"] },
};

const RECORD: YourcatView = {
  id: "64e2e0000000000000000c02",
  name: "Mochi",
  named: true,
  family: "BLACK",
  familyLabel: "Black",
  cat: { _id: "c2", name: "Mochi", type: "FIRE", spriteImg: "https://cdn.test/assets/BLACK/base.png", catImg: "https://cdn.test/assets/BLACK/base/GROOMING.gif" },
  avatar: { status: "ready", url: "https://cdn.test/a.png" },
  photo: { stored: true, deleteAfter: "2026-11-10T00:00:00.000Z" },
  portrait: { status: "none", style: null, url: null },
  createdAt: "2026-10-11T10:00:00.000Z",
};

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Visible text plus accessible names (alt, aria-label, placeholder), lower-cased. */
function pageCopy(): string {
  const parts = [document.body.textContent || ""];
  document.querySelectorAll("[alt],[aria-label],[placeholder],[title]").forEach((el) => {
    for (const attr of ["alt", "aria-label", "placeholder", "title"]) {
      const value = el.getAttribute(attr);
      if (value) parts.push(value);
    }
  });
  return parts.join("\n").toLowerCase();
}

function expectHonest(text: string) {
  for (const phrase of BANNED) expect({ phrase, found: text.includes(phrase) }).toEqual({ phrase, found: false });
  expect(text).not.toMatch(/30 seconds/);
  // No counts of users, cats, portraits, ratings or reviews; no countdowns or "limited time".
  expect(text).not.toMatch(/\b\d[\d,.]*\+?\s*(users|players|cats|portraits|people|owners)\b/);
  expect(text).not.toMatch(/limited time|ends in|hurry|only today|\d+\s*(stars?|★)/);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  api.ensureGuest.mockImplementation(async () => undefined);
  api.status.mockResolvedValue(STATUS);
  Object.assign(URL, { createObjectURL: jest.fn(() => "blob:card"), revokeObjectURL: jest.fn() });
});

describe("rendered copy", () => {
  it("S3 with S5 and the Pink Paw switch visible together is honest", async () => {
    api.me.mockResolvedValue(RECORD);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByRole("switch", { name: "With Judas from Pink Paw" })).toBeTruthy();
    expect(screen.getByTestId("yourcat-upsell")).toBeTruthy();
    // The delete dialog too.
    fireEvent.click(screen.getByRole("button", { name: "Delete my photo" }));
    expectHonest(pageCopy());
  });

  it("S1 with the privacy panel open is honest and names no duration", async () => {
    api.me.mockResolvedValue(null);
    render(<YourCatPage isApp={false} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "How we handle photos" }));
    expect(screen.getByRole("heading", { name: "How we handle your photo" })).toBeTruthy();
    expectHonest(pageCopy());
    expect(screen.getByText(S1.body)).toBeTruthy();
  });

  it("every string in copy.ts and the card text is honest", () => {
    // S1.duration is the measured-duration sentence, gated by DURATION_MEASURED (next test).
    const strings = allStaticCopy().filter((text) => text !== S1.duration);
    const card = Object.values(CARD_TEXT).map((v) => (typeof v === "function" ? v("Ginger") : v));
    expectHonest([...strings, ...card].join("\n").toLowerCase());
  });

  it("the duration appears only once it is measured", () => {
    expect(DURATION_MEASURED).toBe(false);
    expect(s1Body()).not.toMatch(/30 seconds/);
    expect(s1Body(true)).toMatch(/In about 30 seconds\./);
  });
});

describe("app build", () => {
  it("shows the browser notice, no price and no upload input", async () => {
    render(<YourCatPage isApp />);
    await flush();
    expect(screen.getByTestId("yourcat-app-notice")).toBeTruthy();
    expect(
      screen.getByText("Making your cat from a photo works in your browser. Open tokentails.com/yourcat on your phone or computer."),
    ).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/€|EUR|\$\d/);
    expect(api.status).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });
});
