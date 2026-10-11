import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";
import { copyFindings } from "./fixtures/copy-scan";

/**
 * `/yourcat` (bet #3, docs/plans/yourcat-v2.md §9 B): upload → working → reveal with the card →
 * download on desktop; the 429 copy with and without a code; an in-app browser (Instagram) gets the
 * long-press view instead of a download; the runtime copy scan passes; and (fixture) every backend
 * call carries a lowercase `fb` accesstoken.
 *
 * Firebase is faked in the page (`window.__TT_E2E_AUTH__`, development and E2E builds only); every
 * backend call is a real request answered by the `backend` mock.
 */

const RECORD_ID = "64e2e0000000000000000c01";
const CAT = {
  _id: "64e2e0000000000000000ca1",
  name: "My cat",
  type: "FIRE",
  // Same-origin art, so the network guard and the canvas both stay happy.
  spriteImg: "/cats/yellow/sprites/hat-wizard-blue.png",
  catImg: "/logo/logo.webp",
};
const STATUS = {
  enabled: true,
  uploadsOpen: true,
  appCheckEnforced: false,
  limits: { maxBytes: 10485760, types: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] },
  families: [{ family: "YELLOW", label: "Ginger", spriteImg: CAT.spriteImg }],
  portrait: { enabled: true, priceCents: 1400, currency: "EUR", styles: ["highness", "monarch", "aristocrat", "commander"] },
};
const view = (patch: Record<string, unknown> = {}) => ({
  id: RECORD_ID,
  name: "My cat",
  named: false,
  family: "YELLOW",
  familyLabel: "Ginger",
  cat: CAT,
  avatar: { status: "pending", url: null },
  photo: { stored: true, deleteAfter: "2026-11-10T10:00:00.000Z" },
  portrait: { status: "none", style: null, url: null },
  createdAt: new Date().toISOString(),
  ...patch,
});
const GUEST = {
  _id: "64e2e0000000000000000g01",
  isGuest: true,
  transient: false,
  name: "Guest",
  onboarding: { state: "done" },
  tails: 0,
  catnipChaos: [],
  match3: [],
  codex: [],
  quests: [],
  cat: { ...CAT, isStarter: true, isGuestStarter: true },
  cats: [{ ...CAT, isStarter: true, isGuestStarter: true }],
};
const TRANSIENT = { ...GUEST, _id: undefined, transient: true };

/** A 1x1 JPEG. */
const PHOTO = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

async function useFakeFirebase(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = {};
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  });
}

/** Desktop Chromium may or may not have Web Share; remove it so the download path is deterministic. */
async function withoutWebShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
}

function mockYourcat(backend: BackendMock, options: { me?: unknown; upload?: { status: number; body: unknown } } = {}) {
  let session = false;
  backend
    .on("GET", "/user/profile", () => ({ body: session ? GUEST : TRANSIENT }))
    .on("POST", "/user/guest/session", () => {
      session = true;
      return { status: 201, body: GUEST };
    })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/yourcat/status", { body: STATUS })
    .on("GET", "/yourcat/me", { body: { item: options.me ?? null } })
    .on("POST", "/yourcat", () => options.upload ?? { status: 201, body: view() })
    .on("GET", `/yourcat/${RECORD_ID}`, { body: view({ avatar: { status: "ready", url: "/icons/icon-512.png" } }) })
    .on("PATCH", `/yourcat/${RECORD_ID}`, { body: view({ name: "Mochi", named: true }) })
    .on("GET", "/shelter/rozine-pedute/gallery", {
      body: {
        atShelter: [
          {
            id: "64e2e0000000000000000b01",
            name: "Judas",
            status: "WAITING",
            art: "https://cdn.test/judas-art.webp",
            photo: "https://cdn.test/judas-photo.webp",
          },
        ],
        adopted: [],
      },
    });
}

async function choosePhoto(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await chooser).setFiles({ name: "cat.jpg", mimeType: "image/jpeg", buffer: PHOTO });
}

test.describe("/yourcat", () => {
  test("upload → working → reveal with the card → download @ci-desktop", async ({ page, backend }) => {
    mockYourcat(backend);
    await useFakeFirebase(page);
    await withoutWebShare(page);
    await gotoAndSettle(page, "/yourcat");
    await expect(page.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeVisible();
    await choosePhoto(page);
    await expect(page.getByRole("heading", { name: "Meet your cat." })).toBeVisible({ timeout: 15_000 });
    // The upload went out after the guest session, with the confirmation flag.
    const calls = backend.requests().map((call) => `${call.method} ${call.path}`);
    expect(calls.indexOf("POST /user/guest/session")).toBeGreaterThan(-1);
    expect(calls.indexOf("POST /user/guest/session")).toBeLessThan(calls.indexOf("POST /yourcat"));
    const upload = backend.requests().find((call) => call.method === "POST" && call.path === "/yourcat");
    expect(upload?.headers["accesstoken"]).toMatch(/^fb/);

    const download = page.getByRole("button", { name: "Download" });
    await expect(download).toBeEnabled({ timeout: 15_000 });
    const saved = page.waitForEvent("download");
    await download.click();
    expect((await saved).suggestedFilename()).toMatch(/^tokentails-.+-(story|post)\.png$/);
    expect(await copyFindings(page, "/yourcat", { app: false })).toEqual([]);
  });

  test("a daily cap and a plain burst limit show their own copy", async ({ page, backend }) => {
    mockYourcat(backend, {
      upload: { status: 429, body: { statusCode: 429, code: "YOURCAT_IP_DAILY_CAP", message: "cap" } },
    });
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/yourcat");
    await choosePhoto(page);
    await expect(page.getByTestId("yourcat-page").getByRole("alert")).toHaveText("You have made all your AI cats for today.");
    await expect(page.getByRole("button", { name: "Pick your cat's look yourself" })).toBeVisible();

    backend.on("POST", "/yourcat", { status: 429, body: { statusCode: 429, message: "ThrottlerException: Too Many Requests" } });
    await page.getByRole("button", { name: "Pick your cat's look yourself" }).click();
    await page.getByRole("button", { name: "Back to the photo" }).click();
    await choosePhoto(page);
    await expect(page.getByTestId("yourcat-page").getByRole("alert")).toHaveText("Too many tries at once. Please wait a moment and try again.");
    await expect(page.getByRole("button", { name: "Try again" })).toBeDisabled();
  });

  test.describe("in an in-app browser", () => {
    test.use({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
    });

    test("shows the long-press view and no download button", async ({ page, backend }) => {
      mockYourcat(backend, { me: view({ name: "Mochi", named: true, avatar: { status: "ready", url: "/icons/icon-512.png" } }) });
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/yourcat");
      await expect(page.getByRole("heading", { name: "Meet Mochi." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
      // The large card and the hint show at once, with no extra tap.
      await expect(page.getByRole("button", { name: "Save the card" })).toHaveCount(0);
      await expect(page.getByText("Press and hold the card to save it.")).toBeVisible();
      await expect(page.getByText("For more ways to share, open this page in your browser.")).toBeVisible();
      expect(await copyFindings(page, "/yourcat in-app", { app: false })).toEqual([]);
    });
  });
});
