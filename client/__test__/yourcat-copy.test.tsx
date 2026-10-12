/**
 * @jest-environment jsdom
 */
/**
 * Honesty rules of `/yourcat` (bet #3, docs/plans/yourcat-v2.md §1 "Honesty rules", §9 B): the rendered
 * page with S5 and the Pink Paw switch visible together, plus every card string, says nothing about
 * donations, shares of sales or shelter support, no counts, ratings or reviews, and no duration until it
 * is measured. The app build shows the notice with no price and no upload input. Plus the copy of each
 * state (paused, spent, manual, failed upload, failed delete, late portrait) and the `/yourcat` entry
 * link, which shows only while uploads are open. The quiet meeting with a Pink Paw cat names the cat
 * and "a real cat at Pink Paw" only: no status, location or money words (docs/plans/yourcat-polish.md
 * §4.4). The polish deletes the `/yourcat`-only styles: `components/yourcat` has no framer-motion or
 * Phaser import and no GOLD_BUTTON, GHOST_BUTTON or EYEBROW.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
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
jest.mock("@/api/yourcat-api", () => {
  class YourcatRequestError extends Error {
    constructor(
      readonly status: number,
      readonly kind: string,
      readonly code: string | null,
      readonly serverMessage: string | null,
    ) {
      super("request failed");
      Object.setPrototypeOf(this, YourcatRequestError.prototype);
    }
    get failure() {
      return this.kind === "code" ? { kind: "code", code: this.code } : { kind: this.kind };
    }
  }
  return { YOURCAT_API: api, YourcatRequestError };
});
jest.mock("@/components/yourcat/shareCard", () => ({
  renderShareCard: jest.fn(async () => new Blob(["png"], { type: "image/png" })),
  warmCardFonts: () => undefined,
  preloadCardImages: () => undefined,
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
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  allStaticCopy,
  CARD_TEXT,
  cardText,
  DURATION_MEASURED,
  ENTRY_LINK,
  FRIEND,
  MANUAL,
  PRIVACY,
  PRIVACY_NOTICE_VERSION,
  s1Body,
  S1,
  S2,
  S3,
  S5,
  S6,
  STATUS_COPY,
  titleText,
} from "@/components/yourcat/copy";
import { HEADLINE, Headline } from "@/components/yourcat/brand";
import { PaidState } from "@/components/yourcat/PaidState";
import { YourcatEntryLink } from "@/components/yourcat/YourcatEntryLink";
import { YourCatPage } from "@/components/yourcat/YourCatPage";
import { yourcatEntryEnabled } from "@/components/yourcat/useYourcatAvailable";

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
  shareId: "AbCdEfGhIjKl",
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
  window.sessionStorage.clear();
});

describe("rendered copy", () => {
  it("S3 with S5 and the Pink Paw switch visible together is honest", async () => {
    api.me.mockResolvedValue(RECORD);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByRole("switch", { name: "Put Judas on my card" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Mochi, meet Judas." })).toBeTruthy();
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
    expectHonest(strings.join("\n").toLowerCase());
    // allStaticCopy walks every group, the new ones included.
    for (const text of [S1.chip, S1.frameLabel, FRIEND.body, S2.nameLabel, S2.meter.received, MANUAL.moreLooks, S5.legend, PRIVACY.paragraphs[2]]) {
      expect(strings).toContain(text);
    }
  });

  it("the shelter beat says only the cat's name and 'a real cat at Pink Paw': no status, location or money", () => {
    const beat = [
      titleText(S3.meeting.title("Mochi", "Zare")),
      titleText(S3.meeting.title("your cat", "Zare")),
      S3.meeting.body("Zare"),
      S3.meeting.toggle("Zare"),
      S3.meeting.frameAlt("Zare"),
      S3.shareText("Mochi", "https://tokentails.com/yourcat?cat=x", "Zare"),
      S3.shareText("your cat", "https://tokentails.com/yourcat?cat=x", "Zare"),
      ...Object.values(cardText("Mochi", true, "Ginger", "Zare")).flatMap((v) => (v && typeof v === "object" ? Object.values(v) : [v])),
    ]
      .join("\n")
      .toLowerCase();
    expectHonest(beat);
    for (const word of ["waiting", "adopt", "home", "recover", "sick", "vilnius", "lithuania", "€", "eur", "money", "fund", "help", "save", "price", "pay"]) {
      expect({ word, found: beat.includes(word) }).toEqual({ word, found: false });
    }
    // The €14 stays away from the shelter block: S5 never names the shelter cat.
    expect(S5.body("Mochi", "€14")).not.toMatch(/pink paw|shelter/i);
    expect(S5.body("Mochi", "€14")).toContain("We paint it after you pay");
  });

  it("the share text and the card text follow §4.5 and §9.3", () => {
    const url = "https://tokentails.com/yourcat?cat=AbCdEfGhIjKl&utm_source=share";
    expect(S3.shareText("Mochi", url, "Zare")).toBe(`Mochi is a pixel cat now, and just met Zare, a real cat from Pink Paw. Turn your cat into one: ${url}`);
    expect(S3.shareText("Mochi", url, null)).toBe(`Mochi is a pixel cat now. Turn your cat into one: ${url}`);
    expect(S3.shareText("your cat", url, null)).toBe(`My cat is a pixel cat now. Turn your cat into one: ${url}`);
    expect(cardText("Mochi", true, "Ginger", "Zare")).toEqual({
      wordmark: "TOKEN TAILS",
      link: "tokentails.com/yourcat",
      nameLine: "Mochi & Zare",
      nameFallback: "Mochi",
      subline: "Zare · a real cat at Pink Paw",
      panel: { name: "Zare" },
    });
    // R1-05: the three-line NEW FRIEND block is one line under the title.
    expect(CARD_TEXT.shelterLine("Raudvis")).toBe("Raudvis · a real cat at Pink Paw");
    expect(cardText("", false, "Ginger", "Zare")).toMatchObject({ nameLine: "Ginger cat", subline: "Zare · a real cat at Pink Paw", panel: { name: "Zare" } });
    expect(cardText("Mochi", true, "Ginger", null)).toMatchObject({ nameLine: "Mochi", subline: "Now a pixel cat in Token Tails", panel: null });
  });

  it("the coat line names the base coat, the picked look, or the family label", () => {
    expect(S3.coatLine("Mochi", "YELLOW", "Ginger", false)).toBe("Mochi is in the game. Same ginger coat, new pixel paws.");
    expect(S3.coatLine("Mochi", "YELLOW", "Ginger", true)).toBe("Mochi is in the game, in the ginger look you picked.");
    expect(S3.coatLine("Mochi", "OREO", "Oreo", false)).toBe("Mochi is in the game, with the Oreo look.");
    expect(S3.coatLine("your cat", "BLACK", "Black", false)).toBe("Your cat is in the game. Same black coat, new pixel paws.");
  });

  it("the privacy notice names the share link and its version moved", () => {
    expect(PRIVACY_NOTICE_VERSION).toBe("2026-10-12");
    expect(PRIVACY.paragraphs).toContain(
      "If you share your cat's link, anyone who opens it sees your cat's name and pixel look, never your photo.",
    );
  });

  it("S5's price only ever comes from formatPrice: the copy takes it as an argument", () => {
    expect(S5.button("€17")).toBe("Get the HD portrait · €17");
    expect(S5.body("Mochi", "€17")).toContain("€17, paid once.");
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
    // The way on that works in the app comes first: the game.
    expect(screen.getByRole("heading", { name: "Make your cat in your browser" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Play now" }).getAttribute("href")).toBe("/game");
  });
});

const PHOTO = () => new File([new Uint8Array([255, 216, 255])], "cat.jpg", { type: "image/jpeg" });

async function choose() {
  await act(async () => {
    fireEvent.change(screen.getByTestId("yourcat-file-input"), { target: { files: [PHOTO()] } });
  });
  await flush();
}

describe("states before upload", () => {
  it("paused: the paused line, and a way into the game", async () => {
    api.status.mockResolvedValue({ ...STATUS, enabled: false, uploadsOpen: false });
    api.me.mockResolvedValue(null);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText(STATUS_COPY.disabled)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Play Token Tails" }).getAttribute("href")).toBe("/game");
    expect(screen.queryByText(S1.body)).toBeNull();
  });

  it("spent: one spent line instead of the upload promise, and the manual pick", async () => {
    api.status.mockResolvedValue({ ...STATUS, uploadsOpen: false });
    api.me.mockResolvedValue(null);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText(STATUS_COPY.budgetSpent)).toBeTruthy();
    expect(pageCopy()).not.toMatch(/upload one photo|free, no sign-up/);
    fireEvent.click(screen.getByRole("button", { name: "Pick your cat's look yourself" }));
    await flush();
    // No photo to go back to while uploads are closed.
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to the photo" })).toBeNull();
  });
});

describe("states before upload: the visitor's own cap (R2-09)", () => {
  it("a cap remembered in this tab today shows the spent state with its own line before the next photo", async () => {
    const today = new Date().toISOString().slice(0, 10);
    window.sessionStorage.setItem("tt-yourcat-own-cap", today);
    api.me.mockResolvedValue(null);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText(STATUS_COPY.ownCapSpent)).toBeTruthy();
    expect(screen.queryByText(STATUS_COPY.budgetSpent)).toBeNull();
    expect(screen.queryByText(S1.chip)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole("button", { name: STATUS_COPY.pickYourself })).toBeTruthy();
    expectHonest(pageCopy());
  });
});

describe("S2 failure", () => {
  it("says it failed: heading, the meter, no name field, no 'come back' line, focus on the heading", async () => {
    const { YourcatRequestError } = jest.requireMock("@/api/yourcat-api");
    api.me.mockResolvedValue(null);
    api.upload.mockImplementation(async (_f: Blob, _n: string, options: { onSent?: () => void }) => {
      options.onSent?.();
      throw new YourcatRequestError(422, "code", "YOURCAT_NO_CAT", null);
    });
    render(<YourCatPage isApp={false} />);
    await flush();
    await choose();
    const heading = screen.getByRole("heading", { name: titleText(S2.failedTitle) });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole("heading", { name: titleText(S2.title) })).toBeNull();
    // The meter does not repeat the failure: it reads "Stopped", with the match segment in rust.
    expect(screen.getByTestId("yourcat-meter-text").textContent).toBe(S2.meter.stopped);
    expect(screen.getByTestId("yourcat-meter-1").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("yourcat-meter-2").getAttribute("data-state")).toBe("failed");
    expect(screen.queryByLabelText(S2.nameLabel)).toBeNull();
    expect(screen.queryByText(S2.leave)).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/could not see a cat/);
  });

  it("the first segment fills once the body has left, and the meter's line is a polite live region", async () => {
    api.me.mockResolvedValue(null);
    api.upload.mockImplementation((_f: Blob, _n: string, options: { onSent?: () => void }) => {
      options.onSent?.();
      return new Promise(() => undefined);
    });
    render(<YourCatPage isApp={false} />);
    await flush();
    await choose();
    const line = screen.getByTestId("yourcat-meter-text");
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(line.textContent).toBe("Photo received · Finding the right coat and colours…");
    expect(screen.getByTestId("yourcat-meter-1").getAttribute("data-state")).toBe("done");
    // The only name field of the flow.
    expect(screen.getByLabelText("While you wait: what's their name?")).toBeTruthy();
  });

  it("the visitor's own cap: its own heading, an honest line with no countdown or reset time, Photo unfilled", async () => {
    const { YourcatRequestError } = jest.requireMock("@/api/yourcat-api");
    api.me.mockResolvedValue(null);
    api.upload.mockImplementation(async (_f: Blob, _n: string, options: { onSent?: () => void }) => {
      options.onSent?.();
      throw new YourcatRequestError(429, "code", "YOURCAT_USER_DAILY_CAP", null);
    });
    render(<YourCatPage isApp={false} />);
    await flush();
    await choose();
    expect(titleText(S2.ownCapTitle)).toBe("That's today's AI cats");
    expect(screen.getByRole("heading", { level: 1, name: titleText(S2.ownCapTitle) })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: titleText(S2.failedTitle) })).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(STATUS_COPY.ownCapSpent);
    expect(STATUS_COPY.ownCapSpent).not.toMatch(/\d|tomorrow|midnight|hour|minute|reset|come back|soon/i);
    expect(screen.queryByTestId("yourcat-retry-countdown")).toBeNull();
    expect(screen.getByTestId("yourcat-meter-1").getAttribute("data-state")).toBe("empty");
    expect(screen.getByTestId("yourcat-meter-2").getAttribute("data-state")).toBe("failed");
    expectHonest(pageCopy());
  });

  it("the portrait wait: 'Almost there' and 'Painting your pixel portrait…', nothing invented", async () => {
    jest.useFakeTimers({ now: Date.parse(RECORD.createdAt) });
    try {
      api.me.mockResolvedValue(null);
      api.upload.mockResolvedValue({ ...RECORD, avatar: { status: "pending" as const, url: null } });
      api.get.mockImplementation(() => new Promise(() => undefined));
      render(<YourCatPage isApp={false} />);
      await flush();
      await choose();
      expect(titleText(S2.almostTitle)).toBe("Almost there");
      expect(screen.getByRole("heading", { level: 1, name: "Almost there" })).toBeTruthy();
      expect(screen.getByTestId("yourcat-meter-text").textContent).toBe(S2.meter.painting);
      expect(S2.meter.painting).toBe("Painting your pixel portrait…");
      // No timer, percentage or count while waiting.
      const shown = [
        screen.getByRole("heading", { level: 1 }).textContent,
        screen.getByTestId("yourcat-meter").textContent,
        screen.getByTestId("yourcat-wait").textContent,
      ].join(" ");
      expect(shown).not.toMatch(/\d/);
      expectHonest(pageCopy());
    } finally {
      jest.useRealTimers();
    }
  });

  it("the headlines break on word groups: 'Turning / your cat / into pixels', the glow kept on one line", () => {
    expect(S2.title).toEqual({ before: "Turning ", glow: "your cat", after: " into pixels" });
    expect(titleText(S2.title)).toBe("Turning your cat into pixels");
    expect(S1.title).toEqual({ before: "Your cat, ", glow: "in the game." });
    render(<Headline parts={S2.title} />);
    const glow = document.querySelector("h1 .glow") as HTMLElement;
    expect(glow.textContent).toBe("your cat");
    expect(glow.className).toMatch(/whitespace-nowrap/);
    // Capped at text-h4 (no h3 step at xl), so S1 reads "YOUR CAT, / IN THE GAME." in the 420 px column.
    expect(HEADLINE).toMatch(/md:text-h4/);
    expect(HEADLINE).not.toMatch(/text-h3|text-h2|text-h1/);
  });

  it("the plain 429 shows a countdown on Try again, outside the name and any live region", async () => {
    jest.useFakeTimers();
    try {
      const { YourcatRequestError } = jest.requireMock("@/api/yourcat-api");
      api.me.mockResolvedValue(null);
      api.upload.mockRejectedValue(new YourcatRequestError(429, "rate-limited", null, null));
      render(<YourCatPage isApp={false} />);
      await flush();
      await choose();
      const retry = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
      expect(retry.disabled).toBe(true);
      const countdown = screen.getByTestId("yourcat-retry-countdown");
      expect(countdown.textContent).toBe("in 10s");
      expect(countdown.getAttribute("aria-hidden")).toBe("true");
      expect(countdown.closest("[aria-live]")).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId("yourcat-retry-countdown").textContent).toBe("in 9s");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("S3", () => {
  const manualRecord: YourcatView = {
    ...RECORD,
    avatar: { status: "none", url: null },
    photo: { stored: false, deleteAfter: null },
  };

  it("a manual cat was picked, not matched; with uploads closed, start over promises no photo", async () => {
    api.status.mockResolvedValue({ ...STATUS, uploadsOpen: false });
    api.me.mockResolvedValue(manualRecord);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText(S3.coatLine("Mochi", "BLACK", "Black", true))).toBeTruthy();
    expect(pageCopy()).not.toMatch(/we matched/);
    expect(screen.getByRole("button", { name: "Start over" })).toBeTruthy();
    expect(screen.queryByText(STATUS_COPY.startOver)).toBeNull();
  });

  it("a matched cat still says matched, and start over offers a new photo while uploads are open", async () => {
    api.me.mockResolvedValue(RECORD);
    render(<YourCatPage isApp={false} />);
    await flush();
    expect(screen.getByText(S3.coatLine("Mochi", "BLACK", "Black", false))).toBeTruthy();
    expect(screen.getByRole("button", { name: STATUS_COPY.startOver })).toBeTruthy();
  });

  it("the delete dialog: Keep is the primary, Delete is the quiet rust pill; a failure shows in the dialog and clears on reopen", async () => {
    api.me.mockResolvedValue(RECORD);
    api.remove.mockRejectedValueOnce(new Error("offline"));
    render(<YourCatPage isApp={false} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Delete my photo" }));
    const keep = screen.getByRole("button", { name: "Keep" });
    const remove = screen.getByRole("button", { name: "Delete" });
    expect(keep.closest('[data-testid="yourcat-primary"]')).toBeTruthy();
    expect(document.activeElement).toBe(keep);
    expect(remove.className).toContain("border-tt-rust");
    expect(remove.closest('[data-testid="yourcat-primary"]')).toBeNull();
    await act(async () => {
      fireEvent.click(remove);
    });
    await flush();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(S3.deleteFailed);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(S3.deleteFailed)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete my photo" }));
    expect(screen.getByRole("dialog").querySelector('[role="alert"]')).toBeNull();
  });

  it("a fresh reveal holds the upsell while the free pixel portrait is drawing", async () => {
    jest.useFakeTimers({ now: Date.parse(RECORD.createdAt) });
    try {
      const pending = { ...RECORD, avatar: { status: "pending" as const, url: null } };
      api.me.mockResolvedValue(null);
      api.upload.mockResolvedValue(pending);
      // Still drawing through S2's wait (R2-01): S3 takes the pending path after 25 s.
      api.get.mockResolvedValue(pending);
      render(<YourCatPage isApp={false} />);
      await flush();
      await choose();
      expect(screen.getByRole("heading", { name: titleText(S2.almostTitle) })).toBeTruthy();
      for (let i = 0; i < 26; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
        await flush();
      }
      expect(screen.getByRole("heading", { name: "Meet Mochi." })).toBeTruthy();
      expect(screen.queryByTestId("yourcat-upsell")).toBeNull();
      api.get.mockResolvedValue(RECORD);
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      await flush();
      expect(screen.getByTestId("yourcat-upsell")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("S6", () => {
  const noop = () => undefined;
  it("late: a short heading, the details as body text", () => {
    const painting = { ...RECORD, portrait: { status: "painting" as const, style: "monarch" as const, url: null } };
    render(<PaidState record={painting} name="Mochi" portrait={STATUS.portrait} late onBack={noop} />);
    expect(screen.getByRole("heading", { name: S6.lateTitle })).toBeTruthy();
    expect(screen.getByText(S6.late)).toBeTruthy();
  });

  it("failed: says painting did not work and when it is emailed", () => {
    const failed = { ...RECORD, portrait: { status: "failed" as const, style: "monarch" as const, url: null } };
    render(<PaidState record={failed} name="Mochi" portrait={STATUS.portrait} late={false} onBack={noop} />);
    expect(screen.getByRole("heading", { name: S6.lateTitle })).toBeTruthy();
    expect(screen.getByText(S6.failed)).toBeTruthy();
    expect(S6.failed).toMatch(/did not work/);
    expect(S6.failed).toMatch(/2 working days/);
    expect(S6.failed).toMatch(/refund you in full/);
  });

  describe("Download", () => {
    const ready = { ...RECORD, portrait: { status: "ready" as const, style: "monarch" as const, url: "https://cdn.test/hd.webp" } };
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it("saves the portrait as a file on this page (no cross-origin <a download>)", async () => {
      const blob = new Blob(["img"], { type: "image/webp" });
      global.fetch = jest.fn(async () => ({ ok: true, blob: async () => blob })) as unknown as typeof fetch;
      const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
      render(<PaidState record={ready} name="Mochi" portrait={STATUS.portrait} late={false} onBack={noop} />);
      expect(document.querySelector("a[download]")).toBeNull();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S6.download }));
      });
      await flush();
      expect(global.fetch).toHaveBeenCalledWith("https://cdn.test/hd.webp?cors=1", expect.objectContaining({ mode: "cors" }));
      const saved = (URL.createObjectURL as jest.Mock).mock.calls.map(([file]) => file as File);
      expect(saved[saved.length - 1].name).toBe("tokentails-mochi-portrait.webp");
      expect(click).toHaveBeenCalledTimes(1);
      click.mockRestore();
    });

    it("falls back to a new tab (target=_blank rel=noopener) when the fetch fails", async () => {
      global.fetch = jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch;
      const opened: HTMLAnchorElement[] = [];
      const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        opened.push(this);
      });
      render(<PaidState record={ready} name="Mochi" portrait={STATUS.portrait} late={false} onBack={noop} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S6.download }));
      });
      await flush();
      expect(opened).toHaveLength(1);
      expect(opened[0].href).toBe("https://cdn.test/hd.webp");
      expect(opened[0].target).toBe("_blank");
      expect(opened[0].rel).toBe("noopener");
      // A popup blocker may stop the late open: a plain link to the portrait stays on the page.
      await flush();
      expect(screen.getByRole("link", { name: S6.download }).getAttribute("href")).toBe("https://cdn.test/hd.webp");
      click.mockRestore();
    });
  });
});

describe("components/yourcat after the polish", () => {
  const dir = join(__dirname, "..", "components", "yourcat");
  const files = readdirSync(dir).filter((file) => /\.(tsx?|ts)$/.test(file));
  // Code only: comments may name what was removed.
  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const sources = files.map((file) => ({ file, source: stripComments(readFileSync(join(dir, file), "utf8")) }));

  it("imports no framer-motion and no Phaser", () => {
    for (const { file, source } of sources) {
      expect({ file, hit: /from\s+["'](framer-motion|phaser)["']|import\(["'](framer-motion|phaser)["']\)/.test(source) }).toEqual({ file, hit: false });
    }
  });

  it("has no GOLD_BUTTON, GHOST_BUTTON or EYEBROW, and no live TOKEN TAILS eyebrow", () => {
    for (const { file, source } of sources) {
      expect({ file, hit: /\b(GOLD_BUTTON|GHOST_BUTTON|EYEBROW)\b/.test(source) }).toEqual({ file, hit: false });
      // The card's text wordmark (the logo's load-failure fallback) is the only "TOKEN TAILS" string.
      if (file !== "copy.ts") expect({ file, hit: source.includes("TOKEN TAILS") }).toEqual({ file, hit: false });
    }
    expect(Object.keys(S1)).not.toContain("eyebrow");
  });
});

describe("the /yourcat entry link", () => {
  it("is off unless NEXT_PUBLIC_YOURCAT_ENTRY is set", () => {
    expect(yourcatEntryEnabled(undefined)).toBe(false);
    expect(yourcatEntryEnabled("")).toBe(false);
    expect(yourcatEntryEnabled("1")).toBe(true);
    expect(yourcatEntryEnabled("on")).toBe(true);
  });

  it("shows while /yourcat is on and uploads are open", async () => {
    render(<YourcatEntryLink enabled isApp={false} />);
    await waitFor(() => expect(screen.getByTestId("yourcat-entry")).toBeTruthy());
    const link = screen.getByRole("link", { name: ENTRY_LINK });
    expect(link.getAttribute("href")).toBe("/yourcat");
    expectHonest(ENTRY_LINK.toLowerCase());
    expect(ENTRY_LINK).not.toMatch(/€|\$|free|shelter|now|today/i);
  });

  it("is absent when the status is paused", async () => {
    api.status.mockResolvedValue({ ...STATUS, enabled: false, uploadsOpen: false });
    render(<YourcatEntryLink enabled isApp={false} />);
    await flush();
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("yourcat-entry")).toBeNull();
  });

  it("is absent when the budget is spent, on error, and while loading", async () => {
    api.status.mockResolvedValue({ ...STATUS, uploadsOpen: false });
    const { unmount } = render(<YourcatEntryLink enabled isApp={false} />);
    await flush();
    expect(screen.queryByTestId("yourcat-entry")).toBeNull();
    unmount();

    api.status.mockRejectedValue(new Error("offline"));
    const second = render(<YourcatEntryLink enabled isApp={false} />);
    await flush();
    expect(screen.queryByTestId("yourcat-entry")).toBeNull();
    second.unmount();

    api.status.mockImplementation(() => new Promise(() => undefined));
    render(<YourcatEntryLink enabled isApp={false} />);
    await flush();
    expect(screen.queryByTestId("yourcat-entry")).toBeNull();
  });

  it("asks nothing in the app build or with the flag off", async () => {
    render(<YourcatEntryLink enabled isApp />);
    render(<YourcatEntryLink enabled={false} isApp={false} />);
    await flush();
    expect(api.status).not.toHaveBeenCalled();
    expect(screen.queryByTestId("yourcat-entry")).toBeNull();
  });
});
