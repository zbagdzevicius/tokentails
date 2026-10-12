import type { Page } from "@playwright/test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";
import { copyFindings } from "./fixtures/copy-scan";

/**
 * `/yourcat` (bet #3, docs/plans/yourcat-v2.md §9 B; docs/plans/yourcat-polish.md §14.1), with route
 * mocks only:
 *
 * - upload → working → reveal with the card → download, in one persistent stage and frame; on phones
 *   the Share / Play / More bar sticks to the bottom of the screen;
 * - the 429 copy with and without a code (the own daily cap has its own title and is remembered for
 *   the tab, R2-09); an in-app browser gets the long-press view;
 * - the friend view (`?cat=`), and its quiet 404 fallback to S1 that keeps the UTM parameters;
 * - reduced motion: the cat can still be pet, no burst canvas, the "Your photo" badge;
 * - layout: CLS < 0.05 from S1 to S3; at 390x844 the card's top is at most 560 px and the primary
 *   share action is fully visible with no scroll; at 1440x900 the card, the toggle, the Story pill
 *   and the primary action are inside 900 px, the three actions share one row, and MAKE MY CAT on
 *   the manual pick is inside 900 px; no horizontal overflow at 360, 390, 768 and 1440; the meeting
 *   keeps the portrait, the cat, the shelter frame and its plate apart (360, 390, 768, 1280, 1440), and
 *   the friend view keeps the empty frame, the portrait and the friend's cat apart (360, 390, 768);
 *   the cap screen's primary fits its panel at 1280 and 1440;
 * - the step-out flare is transparent: the four corners of its box show the scene, never black;
 * - LCP (R2-10): the preloaded sky (phones) or a side plate (md+), never lazy, under 2.5 s; the sky's
 *   CSS gradient paints under it; phones never fetch the md+ plates;
 * - the md+ page world (R2-03): a full-bleed sky one screen tall, the stage down to the fold on xl, and
 *   column 2 on its night panel; at 1280 and 1440 the (6x) cat never overlaps column 2 (R2-05);
 * - S6 (the paid return) has the visitor's cat on the stage;
 * - grep: no framer-motion or Phaser import and none of the deleted `/yourcat`-only styles;
 * - the runtime copy scan, and (fixture) every backend call carries a lowercase `fb` accesstoken.
 *
 * Firebase is faked in the page (`window.__TT_E2E_AUTH__`, development and E2E builds only); every
 * backend call is a real request answered by the `backend` mock. Analytics consent is set before the
 * page loads, so the consent banner (a shared component, see docs/YOURCAT.md "Known issues") does not
 * cover the stage.
 */

const RECORD_ID = "64e2e0000000000000000c01";
const SHARE_ID = "AbCdEfGhIjKl";
const CAT = {
  _id: "64e2e0000000000000000ca1",
  name: "My cat",
  type: "FIRE",
  // Same-origin art, so the network guard and the canvas both stay happy.
  spriteImg: "/cats/yellow/sprites/original.png",
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
  shareId: SHARE_ID,
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
const READY = { avatar: { status: "ready", url: "/icons/icon-512.png" } };
const FRIEND_CAT = { name: "Mochi", familyLabel: "Ginger", avatarUrl: "/icons/icon-512.png", spriteImg: CAT.spriteImg };
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
    // Consent answered: the shared banner stays closed (docs/YOURCAT.md "Known issues").
    try {
      window.localStorage.setItem("tt-analytics-consent", "denied");
    } catch {
      // Storage blocked: the banner may show; the layout checks then fail loudly.
    }
  });
}

/** Desktop Chromium may or may not have Web Share; remove it so the download path is deterministic. */
async function withoutWebShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
}

/** Sums `layout-shift` entries without recent input, from page start (buffered). */
async function watchLayoutShift(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ycCls: number };
    w.__ycCls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!entry.hadRecentInput) w.__ycCls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // No Layout Instability API: the sum stays 0.
    }
  });
}

function mockYourcat(
  backend: BackendMock,
  options: {
    me?: unknown;
    upload?: { status: number; body: unknown };
    get?: unknown;
    publicCat?: unknown;
    gallery?: boolean;
    status?: Record<string, unknown>;
  } = {},
) {
  let session = false;
  backend
    .on("GET", "/user/profile", () => ({ body: session ? GUEST : TRANSIENT }))
    .on("POST", "/user/guest/session", () => {
      session = true;
      return { status: 201, body: GUEST };
    })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/yourcat/status", { body: { ...STATUS, ...options.status } })
    .on("GET", "/yourcat/me", { body: { item: options.me ?? null } })
    .on("GET", /^\/yourcat\/public\//, () =>
      options.publicCat ? { body: options.publicCat } : { status: 404, body: { statusCode: 404, code: "YOURCAT_NOT_FOUND", message: "Not found" } },
    )
    .on("POST", "/yourcat", () => options.upload ?? { status: 201, body: view() })
    .on("GET", `/yourcat/${RECORD_ID}`, { body: options.get ?? view(READY) })
    .on("PATCH", `/yourcat/${RECORD_ID}`, { body: view({ name: "Mochi", named: true, ...READY }) })
    .on(
      "GET",
      "/shelter/rozine-pedute/gallery",
      options.gallery === false
        ? { status: 503, body: { statusCode: 503 } }
        : {
            body: {
              atShelter: [
                {
                  id: "64e2e0000000000000000b01",
                  name: "Zare",
                  status: "WAITING",
                  art: "https://cdn.test/zare-art.webp",
                  photo: "https://cdn.test/zare-photo.webp",
                },
              ],
              adopted: [],
            },
          },
    );
}

async function choosePhoto(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await chooser).setFiles({ name: "cat.jpg", mimeType: "image/jpeg", buffer: PHOTO });
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** The page's primary share action: Share where Web Share takes files, else Download. */
const primaryShare = (page: Page) => page.getByRole("button", { name: /^(Share|Download)$/ });

test.describe("/yourcat", () => {
  test("upload → working → reveal with the card → download, in one stage @ci-desktop", async ({ page, backend }) => {
    mockYourcat(backend);
    await useFakeFirebase(page);
    await withoutWebShare(page);
    await gotoAndSettle(page, "/yourcat");
    await expect(page.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeVisible();
    // S1: the canonical lockup in the page's own header, the chip, the empty frame, the example cat.
    await expect(page.getByRole("link", { name: "Token Tails" }).first()).toBeVisible();
    await expect(page.getByText("One photo · Free · No sign-up")).toBeVisible();
    await expect(page.getByTestId("yourcat-transform")).toHaveAttribute("data-mode", "empty");
    // Page coordinates: on a short landscape screen the click on "Choose a photo" scrolls the page.
    const frameTop = () =>
      page.getByTestId("yourcat-frame").evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
    const frameY = await frameTop();

    await choosePhoto(page);
    await expect(page.getByTestId("yourcat-transform")).toHaveAttribute("data-mode", /working|reveal/);
    // The photo hangs in the same frame at the same place (the frame never moves between S1 and S2).
    expect(await frameTop()).toBeCloseTo(frameY, 0);
    await expect(page.getByRole("heading", { name: "Meet your cat." })).toBeVisible({ timeout: 15_000 });
    expect(await page.getByTestId("yourcat-stage").count()).toBe(1);

    // The upload went out after the guest session, with the Firebase token.
    const calls = backend.requests().map((call) => `${call.method} ${call.path}`);
    expect(calls.indexOf("POST /user/guest/session")).toBeGreaterThan(-1);
    expect(calls.indexOf("POST /user/guest/session")).toBeLessThan(calls.indexOf("POST /yourcat"));
    const upload = backend.requests().find((call) => call.method === "POST" && call.path === "/yourcat");
    expect(upload?.headers["accesstoken"]).toMatch(/^fb/);

    const download = page.getByRole("button", { name: "Download" });
    await expect(download).toBeEnabled({ timeout: 15_000 });
    if (isPhone(page)) {
      // Phones: Share / Play / More stick to the bottom of the screen once the card exists.
      await expect(page.getByTestId("yourcat-actions")).toHaveCSS("position", "fixed");
      await expect(download).toBeInViewport();
      await expect(page.getByRole("link", { name: "Play as your cat" })).toBeInViewport();
    }
    const saved = page.waitForEvent("download");
    await download.click();
    expect((await saved).suggestedFilename()).toMatch(/^tokentails-.+-(story|post)\.png$/);
    expect(await copyFindings(page, "/yourcat", { app: false })).toEqual([]);
  });

  test("the More sheet: Story/Post, Download and Copy link; Escape closes it and returns focus", async ({ page, backend }) => {
    test.skip(!isPhone(page), "the sheet is the phone layout");
    mockYourcat(backend, { me: view({ name: "Mochi", named: true, ...READY }) });
    await useFakeFirebase(page);
    await withoutWebShare(page);
    await gotoAndSettle(page, "/yourcat");
    await expect(page.getByRole("heading", { name: "Meet Mochi." })).toBeVisible();
    const more = page.getByRole("button", { name: "More" });
    await expect(more).toBeVisible({ timeout: 15_000 });
    await more.click();
    const sheet = page.getByRole("dialog", { name: "More ways to share" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("radio", { name: "Story" })).toBeChecked();
    await expect(sheet.getByRole("button", { name: "Download" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test("a daily cap shows its own copy and the one way forward", async ({ page, backend }) => {
    mockYourcat(backend, {
      upload: { status: 429, body: { statusCode: 429, code: "YOURCAT_IP_DAILY_CAP", message: "cap" } },
    });
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/yourcat");
    await choosePhoto(page);
    // R2-09 adds the way forward after the reason ("Your cat can still join the game…").
    await expect(page.getByTestId("yourcat-page").getByRole("alert")).toContainText("You have made all your AI cats for today.");
    // The visitor's own daily cap has its own title (copy `ownCapTitle`), not the failure one.
    await expect(page.getByRole("heading", { level: 1, name: "That's today's AI cats" })).toBeVisible();
    await expect(page.getByTestId("yourcat-meter-text")).toHaveText("Stopped");
    await page.getByRole("button", { name: "Pick your cat's look yourself" }).click();
    // The cap is remembered for this tab and day (R2-09): the manual pick offers no new photo.
    await expect(page.getByRole("heading", { level: 1, name: "Pick your cat's look" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to the photo" })).toHaveCount(0);
  });

  test("the cap screen's PICK YOUR CAT'S LOOK YOURSELF fits its panel at 1280 and 1440", async ({ page, backend }) => {
    test.skip(isPhone(page), "the xl side column (phones: the failure-actions test and the unit test)");
    mockYourcat(backend, {
      upload: { status: 429, body: { statusCode: 429, code: "YOURCAT_IP_DAILY_CAP", message: "cap" } },
    });
    await useFakeFirebase(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAndSettle(page, "/yourcat");
    await choosePhoto(page);
    const button = page.getByRole("button", { name: "Pick your cat's look yourself" });
    // The cap is remembered for the tab (R2-09), so the second width resizes the same screen.
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(button).toBeVisible();
      const fit = await button.evaluate((node) => {
        const panel = node.closest('[data-testid="yourcat-failure"]') as HTMLElement;
        const b = node.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        return { inside: b.left >= p.left && b.right <= p.right, narrower: b.width <= p.width, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect({ width: viewport.width, ...fit }).toEqual({ width: viewport.width, inside: true, narrower: true, scroll: 0 });
    }
  });

  test("a plain burst limit shows its own copy, with Try again held", async ({ page, backend }) => {
    mockYourcat(backend, {
      upload: { status: 429, body: { statusCode: 429, message: "ThrottlerException: Too Many Requests" } },
    });
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/yourcat");
    await choosePhoto(page);
    await expect(page.getByTestId("yourcat-page").getByRole("alert")).toHaveText("Too many tries at once. Please wait a moment and try again.");
    await expect(page.getByRole("button", { name: "Try again" })).toBeDisabled();
  });

  test("a failure shows the reason and both actions in the first viewport", async ({ page, backend }) => {
    test.skip(!isPhone(page) || (page.viewportSize()?.height ?? 0) < 800, "the first phone viewport (390x844)");
    mockYourcat(backend, { upload: { status: 422, body: { statusCode: 422, code: "YOURCAT_NO_CAT", message: "no cat" } } });
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/yourcat");
    await choosePhoto(page);
    const alert = page.getByTestId("yourcat-page").getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Try another photo" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Pick your cat's look yourself" })).toBeInViewport({ ratio: 1 });
  });

  test.describe("the friend view", () => {
    test("a shared link shows the friend's cat, pettable, beside the empty frame", async ({ page, backend }) => {
      mockYourcat(backend, { publicCat: FRIEND_CAT });
      await useFakeFirebase(page);
      await gotoAndSettle(page, `/yourcat?cat=${SHARE_ID}&utm_source=share&utm_medium=card`);
      await expect(page.getByRole("heading", { level: 1, name: "Mochi says hi." })).toBeVisible();
      await expect(page.getByTestId("yourcat-friend-empty")).toContainText("Your cat here");
      await expect(page.getByTestId("yourcat-transform")).toHaveAttribute("data-mode", "settled");
      await page.getByRole("button", { name: "Pet Mochi" }).click();
      await expect(page.getByTestId("yourcat-petcat-caption").first()).toHaveText("Mochi purrs.");
      await expect(page.getByRole("button", { name: "Choose a photo" })).toBeVisible();
      // The public read carries no accesstoken.
      const read = backend.requests().find((call) => call.path === `/yourcat/public/${SHARE_ID}`);
      expect(read?.headers["accesstoken"]).toBeUndefined();
    });

    test("a 404 drops ?cat quietly, keeps the UTMs and shows S1", async ({ page, backend }) => {
      mockYourcat(backend);
      await useFakeFirebase(page);
      await gotoAndSettle(page, `/yourcat?cat=${SHARE_ID}&utm_source=share&utm_content=story`);
      await expect(page.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeVisible();
      await expect.poll(() => new URL(page.url()).search).toBe("?utm_source=share&utm_content=story");
      await expect(page.getByTestId("yourcat-page").getByRole("alert")).toHaveCount(0);
    });
  });

  test.describe("the step-out flare", () => {
    test.use({ reducedMotion: "no-preference" });

    test("is a transparent WebP: the four corners of its box are not black", async ({ page, backend }) => {
      mockYourcat(backend, { get: view(READY) });
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/yourcat");
      await choosePhoto(page);
      // The flare plays once for 900 ms: read its box in the same frame it appears, then grab it.
      const found = await page.waitForFunction(
        () => {
          const el = document.querySelector<HTMLImageElement>('[data-testid="yourcat-flare"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          // Page coordinates: on a short landscape phone (844x390) the stage sits below the fold.
          return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, src: el.currentSrc || el.src, blend: getComputedStyle(el).mixBlendMode };
        },
        undefined,
        { timeout: 15_000, polling: 16 },
      );
      const box = (await found.jsonValue()) as { x: number; y: number; width: number; height: number; src: string; blend: string };
      const shot = await page.screenshot({ fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: box.height }, scale: "css", animations: "allow" });
      expect(box.src).toMatch(/\/yourcat\/flare\.webp$/);
      expect(box.blend).toBe("normal");
      const corners = await page.evaluate(async (base64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(bitmap, 0, 0);
        const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        const w = bitmap.width - 2;
        const h = bitmap.height - 2;
        return [at(1, 1), at(w, 1), at(1, h), at(w, h)];
      }, shot.toString("base64"));
      // The old GIF drew a pure black box (#000) over the stage; the night page itself is never #000.
      for (const [r, g, b] of corners) expect(r + g + b).toBeGreaterThan(20);
    });
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the cat can still be pet, there is no burst canvas, and the photo badge shows", async ({ page, backend }) => {
      // S2 holds for the pixel portrait (R2-01): the first poll answers it ready, then S3 starts.
      mockYourcat(backend, { get: view(READY) });
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/yourcat");
      await page.evaluate(() => {
        const w = window as unknown as { __ycBurst: boolean };
        w.__ycBurst = false;
        new MutationObserver(() => {
          if (document.querySelector('[data-testid="yourcat-burst"]')) w.__ycBurst = true;
        }).observe(document.body, { childList: true, subtree: true });
      });
      await choosePhoto(page);
      await expect(page.getByRole("heading", { name: "Meet your cat." })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("yourcat-photo-badge")).toBeVisible({ timeout: 5_000 });
      const pet = page.getByRole("button", { name: "Pet your cat" });
      await expect(pet).toBeVisible({ timeout: 5_000 });
      await pet.click();
      await expect(page.getByTestId("yourcat-petcat-caption").first()).toHaveText("Your cat purrs.");
      expect(await page.evaluate(() => (window as unknown as { __ycBurst: boolean }).__ycBurst)).toBe(false);
    });
  });

  test.describe("layout", () => {
    test.use({ reducedMotion: "no-preference" });

    test("no layout shift from S1 to S3, and the card and the actions in reach", async ({ page, backend }) => {
      mockYourcat(backend);
      await useFakeFirebase(page);
      await withoutWebShare(page);
      await watchLayoutShift(page);
      await gotoAndSettle(page, "/yourcat");
      await choosePhoto(page);
      await expect(page.getByRole("heading", { name: "Meet your cat." })).toBeVisible({ timeout: 15_000 });
      await expect(primaryShare(page)).toBeEnabled({ timeout: 15_000 });
      await page.waitForTimeout(800);
      const cls = await page.evaluate(() => (window as unknown as { __ycCls: number }).__ycCls);
      expect(cls).toBeLessThan(0.05);

      const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const card = await page.getByTestId("yourcat-card-preview").boundingBox();
      if (viewport.width === 390 && viewport.height === 844) {
        expect(card?.y ?? 9999).toBeLessThanOrEqual(560);
        await expect(primaryShare(page)).toBeInViewport({ ratio: 1 });
      }
      if (viewport.width === 1440 && viewport.height === 900) {
        const bottom = async (box: { y: number; height: number } | null) => (box ? box.y + box.height : 9999);
        expect(await bottom(card)).toBeLessThanOrEqual(900);
        await expect(page.getByRole("switch")).toBeVisible();
        expect(await bottom(await page.getByRole("switch").boundingBox())).toBeLessThanOrEqual(900);
        expect(await bottom(await page.getByTestId("yourcat-primary").first().boundingBox())).toBeLessThanOrEqual(900);
        // The Story/Post pills sit on the toggle row, inside the first screen (R1-10).
        const story = await page.locator('label:has(input[value="story"])').boundingBox();
        expect(await bottom(story)).toBeLessThanOrEqual(900);
        const toggleRow = await page.getByTestId("yourcat-toggle-row").boundingBox();
        expect(Math.abs((story?.y ?? 0) + (story?.height ?? 0) / 2 - ((toggleRow?.y ?? 0) + (toggleRow?.height ?? 0) / 2))).toBeLessThanOrEqual(4);
        // One left-aligned action row: the primary, Copy link and Play share a line and start at the card's left edge.
        const actions = page.getByTestId("yourcat-actions");
        const centres = await actions.evaluate((row) =>
          Array.from(row.children).map((child) => {
            const r = child.getBoundingClientRect();
            return { left: r.left, mid: r.top + r.height / 2 };
          }),
        );
        expect(centres).toHaveLength(3);
        for (const item of centres) expect(Math.abs(item.mid - centres[0].mid)).toBeLessThanOrEqual(4);
        expect(Math.abs(centres[0].left - (card?.x ?? 0))).toBeLessThanOrEqual(1);
        // The H1 sits 16 px above the card.
        const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
        expect((card?.y ?? 0) - ((h1?.y ?? 0) + (h1?.height ?? 0))).toBeLessThanOrEqual(16);
      }
    });

    test("the manual pick's MAKE MY CAT is inside the first screen at 1440x900", async ({ page, backend }) => {
      test.skip(page.viewportSize()?.width !== 1440 || page.viewportSize()?.height !== 900, "the 1440x900 desktop");
      mockYourcat(backend, { status: { uploadsOpen: false } });
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/yourcat");
      await page.getByRole("button", { name: "Pick your cat's look yourself" }).click();
      const make = page.getByTestId("yourcat-manual-make");
      await expect(make).toBeVisible();
      const box = await make.boundingBox();
      expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
    });

    test("LCP: the painted art or the H1, eager, within 2.5 s; the sky is preloaded and its colours paint first (R2-10)", async ({ page, backend }) => {
      mockYourcat(backend);
      await useFakeFirebase(page);
      await page.addInitScript(() => {
        const w = window as unknown as { __ycLcp: { t: number; tag: string; testId: string | null; url: string; lazy: boolean }[]; __ycFcp: number };
        w.__ycLcp = [];
        w.__ycFcp = -1;
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") w.__ycFcp = entry.startTime;
          }).observe({ type: "paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as { startTime: number; element: Element | null; url: string }[]) {
              const el = entry.element;
              w.__ycLcp.push({
                t: entry.startTime,
                tag: el?.tagName ?? "",
                testId: el?.getAttribute("data-testid") ?? null,
                url: entry.url,
                lazy: el?.getAttribute("loading") === "lazy",
              });
            }
          }).observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          // No LCP API: the list stays empty and the test says so.
        }
      });
      await gotoAndSettle(page, "/yourcat");
      await expect(page.getByRole("heading", { level: 1, name: "Your cat, in the game." })).toBeVisible();
      // The preload is in the server HTML's head, and the sky image is not demoted.
      await expect(page.locator('head link[rel="preload"][as="image"][href="/yourcat/sky.webp"]')).toHaveCount(1);
      const skyId = isPhone(page) ? "yourcat-stage-sky" : "yourcat-page-sky-image";
      const sky = page.getByTestId(skyId);
      await expect(sky).toHaveAttribute("src", "/yourcat/sky.webp");
      expect(await sky.getAttribute("fetchpriority")).toBeNull();
      const layer = isPhone(page) ? page.getByTestId("yourcat-stage-sky-layer") : page.getByTestId("yourcat-page-sky");
      expect(await layer.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
      // Phones never fetch the md+ side plates.
      if (isPhone(page)) {
        const plates = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => /\/yourcat\/plate-/.test(entry.name)).length);
        expect(plates).toBe(0);
      }
      const entries = await page.evaluate(() => (window as unknown as { __ycLcp: { t: number; tag: string; testId: string | null; url: string; lazy: boolean }[] }).__ycLcp);
      expect(entries.length).toBeGreaterThan(0);
      const lcp = entries[entries.length - 1];
      // Pinned: 390x844 → the stage's preloaded sky; 1440x900 → the left side plate (the biggest painted box).
      const allowed = ["/yourcat/sky.webp", "/yourcat/plate-left.webp", "/yourcat/plate-right.webp", "/yourcat/altar-strip.webp"];
      expect({ lcp: lcp.tag === "H1" || allowed.some((url) => lcp.url.endsWith(url)) }).toEqual({ lcp: true });
      expect(lcp.lazy).toBe(false);
      // The art is ready at the first paint (the preload and the eager plates): LCP lands within 500 ms
      // of FCP on any server. The 2.5 s budget is checked on the production build (CI's `next start`);
      // the dev server's first paint waits for its unbundled JS and CSS, so locally it only logs.
      const fcp = await page.evaluate(() => (window as unknown as { __ycFcp: number }).__ycFcp);
      expect(fcp).toBeGreaterThan(0);
      expect(lcp.t - fcp).toBeLessThanOrEqual(500);
      if (process.env.CI) expect(lcp.t).toBeLessThan(2500);
      else test.info().annotations.push({ type: "lcp", description: `${Math.round(lcp.t)} ms (FCP ${Math.round(fcp)} ms), ${lcp.url || lcp.tag}` });
    });

    test("the cat never overlaps column 2 at 1280 and 1440, from the step-out to rest (R2-05)", async ({ page, backend }) => {
      test.skip(isPhone(page), "the xl studio");
      mockYourcat(backend, { me: view({ name: "Mochi", named: true, ...READY }) });
      await useFakeFirebase(page);
      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto("/yourcat", { waitUntil: "load" });
        await expect(page.getByRole("heading", { name: "Meet Mochi." })).toBeVisible();
        // The cat's painted pixels: the sheet's opaque columns over the idle, loaf, sit and walk rows,
        // either facing (mirrored).
        const cols = await page.evaluate(async () => {
          const img = new Image();
          img.src = "/cats/yellow/sprites/original.png";
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 720;
          canvas.height = 480;
          const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, 720, 480).data;
          let min = 48;
          let max = -1;
          for (const row of [4, 6, 8, 9]) {
            for (let y = row * 48; y < row * 48 + 48; y++) {
              for (let x = 0; x < 720; x++) {
                if (data[(y * 720 + x) * 4 + 3] > 20) {
                  min = Math.min(min, x % 48);
                  max = Math.max(max, x % 48);
                }
              }
            }
          }
          return { lo: Math.min(min, 47 - max), hi: Math.max(max, 47 - min) };
        });
        // Sample for 3 s from the test side (the page clock is the fixture's): the step-out spot, the
        // walk and the rest.
        const samples: { left: number; right: number; bottom: number; column: number }[] = [];
        for (let i = 0; i < 30; i++) {
          const sample = await page.evaluate(({ lo, hi }) => {
            // PetCat's root carries the integer scale (`[--s:3] md:[--s:6]`): its box is the 48-cell sprite box.
            const sprite = document.querySelector('[data-testid="yourcat-slot-cat"] [data-testid="yourcat-petcat"]');
            const panel = document.querySelector('[data-testid="yourcat-panel"]')?.getBoundingClientRect();
            const heading = document.querySelector('[data-testid="yourcat-heading"]')?.getBoundingClientRect();
            if (!sprite || !panel || !heading) return null;
            const box = sprite.getBoundingClientRect();
            const scale = box.width / 48;
            return { left: box.left + lo * scale, right: box.left + (hi + 1) * scale, bottom: box.bottom, column: Math.min(panel.left, heading.left) };
          }, cols);
          if (sample) samples.push(sample);
          await page.waitForTimeout(100);
        }
        expect(samples.length).toBeGreaterThan(10);
        for (const sample of samples) {
          expect({ viewport: viewport.width, clear: sample.right <= sample.column }).toEqual({ viewport: viewport.width, clear: true });
          expect(sample.left).toBeGreaterThanOrEqual(0);
          expect(sample.bottom).toBeLessThanOrEqual(viewport.height);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBe(0);
      }
    });

    test("md+: the painted world fills the first screen behind the studio, with no night band under the altar (R2-03)", async ({ page, backend }) => {
      test.skip(isPhone(page), "the md+ page sky");
      mockYourcat(backend);
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/yourcat");
      const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
      const sky = await page.getByTestId("yourcat-page-sky").boundingBox();
      expect(sky?.x).toBe(0);
      expect(sky?.y).toBe(0);
      expect(sky?.width).toBe(viewport.width);
      expect(sky?.height ?? 0).toBeGreaterThanOrEqual(viewport.height);
      // The phone sky inside the stage is off; the side plates and ~18 fireflies are on.
      await expect(page.getByTestId("yourcat-stage-sky-layer")).toBeHidden();
      await expect(page.getByTestId("yourcat-page-plate-left")).toBeVisible();
      expect(await page.getByTestId("yourcat-page-fireflies").locator(".yc-firefly").count()).toBeGreaterThanOrEqual(16);
      if (viewport.width >= 1280) {
        // The stage reaches the bottom of the first screen; column 2 sits on its night panel.
        const stage = await page.getByTestId("yourcat-stage").boundingBox();
        expect(Math.abs((stage?.y ?? 0) + (stage?.height ?? 0) - viewport.height)).toBeLessThanOrEqual(2);
        const panelBg = await page.getByTestId("yourcat-panel").evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(panelBg).not.toBe("rgba(0, 0, 0, 0)");
      }
    });

    test("no horizontal overflow at 360, 390, 768 and 1440", async ({ page, backend }) => {
      // Loops over several viewports; about 40 s on a busy machine.
      test.setTimeout(120_000);
      mockYourcat(backend, { me: view({ name: "Mochi", named: true, ...READY }) });
      await useFakeFirebase(page);
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
        await gotoAndSettle(page, "/yourcat");
        await expect(page.getByRole("heading", { name: "Meet Mochi." })).toBeVisible();
        await page.waitForTimeout(1200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect({ width, overflow }).toEqual({ width, overflow: 0 });
      }
    });
  });

  test.describe("the meeting", () => {
    test.use({ reducedMotion: "no-preference" });

    test("keeps the portrait, the cat, the shelter frame and its plate apart at 360, 390, 768, 1280 and 1440", async ({ page, backend }) => {
      // Loops over several viewports; about 40 s on a busy machine.
      test.setTimeout(120_000);
      mockYourcat(backend, { me: view({ name: "Mochi", named: true, ...READY }) });
      await useFakeFirebase(page);
      const sizes = isPhone(page)
        ? [
            { width: 360, height: 780 },
            { width: 390, height: 844 },
            { width: 768, height: 1024 },
          ]
        : [
            { width: 1280, height: 800 },
            { width: 1440, height: 900 },
          ];
      for (const { width, height } of sizes) {
        await page.setViewportSize({ width, height });
        await gotoAndSettle(page, "/yourcat");
        // A loaded machine (CI, a busy laptop) can take long for the gallery and the frame's slide-in.
        await expect(page.getByTestId("yourcat-shelter-frame")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("yourcat-stage")).toHaveAttribute("data-meeting", "true");
        await expect(page.getByTestId("yourcat-slot-cat").getByTestId("yourcat-petcat")).toHaveAttribute("data-pose", "sit", { timeout: 30_000 });
        type Box = { left: number; right: number; top: number; bottom: number };
        const measure = () =>
          page.evaluate(() => {
            const rect = (selector: string) => {
              const r = document.querySelector(selector)?.getBoundingClientRect();
              return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
            };
            return {
              stage: rect('[data-testid="yourcat-stage"]'),
              portrait: rect('[data-testid="yourcat-slot-frame"] [data-testid="yourcat-frame"]'),
              shelter: rect('[data-testid="yourcat-shelter-frame"]'),
              plate: rect('[data-testid="yourcat-shelter-plate"]'),
              cat: rect('[data-testid="yourcat-slot-cat"] [data-testid="yourcat-petcat-button"]'),
              caption: rect('[data-testid="yourcat-slot-cat"] [data-testid="yourcat-petcat-caption"] span'),
            };
          });
        const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        // Every rule as one list of failures, polled until the walk (700 ms) and the portrait's step
        // back (320 ms) have ended on screen: a starved renderer can draw them late, never wrong.
        const problems = async () => {
          const { stage, portrait, shelter, plate, cat, caption } = await measure();
          if (!stage || !portrait || !shelter || !plate || !cat || !caption) return ["missing boxes"];
          // The painted cat spans columns 12 to ~39 of its 48 px cell when it sits facing left (tail included).
          const unit = (cat.right - cat.left) / 48;
          const body = { ...cat, left: cat.left + 12 * unit, right: cat.left + 39 * unit };
          const out: string[] = [];
          if (shelter.right > body.left) out.push(`shelter frame over the cat (${shelter.right} > ${body.left})`);
          if (body.right > portrait.left) out.push(`cat over the portrait (${body.right} > ${portrait.left})`);
          if (shelter.right >= portrait.left) out.push("shelter frame touches the portrait");
          if (!apart(plate, portrait)) out.push("plate over the portrait");
          if (!apart(caption, plate)) out.push("caption over the plate");
          if (!apart(caption, portrait)) out.push("caption over the portrait");
          if (shelter.left < stage.left) out.push("shelter frame outside the stage");
          if (portrait.right > stage.right) out.push("portrait outside the stage");
          return out;
        };
        await expect.poll(problems, { message: `the meeting at ${width}`, timeout: 15_000, intervals: [250, 500, 1000] }).toEqual([]);
      }
    });
  });

  test.describe("the friend view layout", () => {
    test("keeps the empty frame, the friend's portrait and the friend's cat apart, inside the stage", async ({ page, backend }) => {
      test.skip(!isPhone(page), "phones and 768 (the md+ row is the same rule)");
      mockYourcat(backend, { publicCat: FRIEND_CAT });
      await useFakeFirebase(page);
      for (const { width, height } of [
        { width: 360, height: 780 },
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
      ]) {
        await page.setViewportSize({ width, height });
        await gotoAndSettle(page, `/yourcat?cat=${SHARE_ID}`);
        await expect(page.getByTestId("yourcat-friend-empty")).toBeVisible();
        const problems = () =>
          page.evaluate(() => {
            const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
            const stage = rect('[data-testid="yourcat-stage"]');
            const portrait = rect('[data-testid="yourcat-slot-frame"] [data-testid="yourcat-frame"]');
            const empty = rect('[data-testid="yourcat-friend-empty"]');
            const cat = rect('[data-testid="yourcat-slot-cat"] [data-testid="yourcat-petcat-button"]');
            const caption = rect('[data-testid="yourcat-slot-cat"] [data-testid="yourcat-petcat-caption"] span');
            if (!stage || !portrait || !empty || !cat || !caption) return ["missing boxes"];
            // The idle cat faces right: its painted body spans columns 12 to 36 of its 48 px cell.
            const unit = cat.width / 48;
            const body = { left: cat.left + 12 * unit, right: cat.left + 37 * unit };
            const out: string[] = [];
            if (empty.right > portrait.left) out.push(`empty frame over the portrait (${empty.right} > ${portrait.left})`);
            if (body.left < portrait.right) out.push(`cat over the portrait (${body.left} < ${portrait.right})`);
            if (caption.left < portrait.right && caption.top < portrait.bottom) out.push("caption over the portrait");
            if (empty.left < stage.left) out.push("empty frame outside the stage");
            if (body.right > stage.right || caption.right > stage.right) out.push("cat or caption outside the stage");
            return out;
          });
        // The portrait's step back and the cat's walk-in run on transitions: poll until they end.
        await expect.poll(problems, { message: `the friend view at ${width}`, timeout: 15_000, intervals: [250, 500, 1000] }).toEqual([]);
      }
    });
  });

  test.describe("the consent chip", () => {
    /** A first visit: no stored consent, so the compact chip asks (builds with analytics only). */
    async function firstVisit(page: Page) {
      await page.addInitScript(() => {
        try {
          window.localStorage.removeItem("tt-analytics-consent");
        } catch {
          // Storage blocked: the test skips below when no chip shows.
        }
      });
    }
    /** Buttons, links and fields on screen that the chip's box touches. */
    const coveredByChip = (page: Page) =>
      page.evaluate(() => {
        const chip = document.querySelector('[data-testid="analytics-consent-compact-chip"]')?.getBoundingClientRect();
        if (!chip) return ["no chip"];
        return [...document.querySelectorAll<HTMLElement>("button, a[href], input, [role=switch]")]
          .filter((node) => !node.closest('[data-testid="analytics-consent-compact"]'))
          .filter((node) => {
            const r = node.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0) || r.bottom <= 0 || r.top >= innerHeight) return false;
            if (getComputedStyle(node).visibility === "hidden") return false;
            return r.left < chip.right && r.right > chip.left && r.top < chip.bottom && r.bottom > chip.top;
          })
          .map((node) => (node.innerText || node.getAttribute("aria-label") || node.tagName).slice(0, 40));
      });

    test("sits in the header and covers no control on S1, the cap screen, the manual pick and S3", async ({ page, backend }) => {
      mockYourcat(backend, { upload: { status: 429, body: { statusCode: 429, code: "YOURCAT_IP_DAILY_CAP", message: "cap" } } });
      await useFakeFirebase(page);
      await firstVisit(page);
      await gotoAndSettle(page, "/yourcat");
      const chip = page.getByTestId("analytics-consent-compact");
      test.skip(!(await chip.isVisible()), "this build asks for no analytics consent");
      await expect(page.getByTestId("yourcat-header").getByTestId("analytics-consent-compact")).toBeVisible();
      expect(await coveredByChip(page), "S1").toEqual([]);
      await choosePhoto(page);
      const own = page.getByRole("button", { name: "Pick your cat's look yourself" });
      await expect(own).toBeVisible();
      expect(await coveredByChip(page), "own cap").toEqual([]);
      await own.click();
      await expect(page.getByRole("heading", { level: 1, name: "Pick your cat's look" })).toBeVisible();
      expect(await coveredByChip(page), "manual pick").toEqual([]);
    });

    test("covers no S3 action at any width, and Accept closes it", async ({ page, backend }) => {
      mockYourcat(backend, { me: view({ name: "Mochi", named: true, ...READY }) });
      await useFakeFirebase(page);
      await withoutWebShare(page);
      await firstVisit(page);
      for (const size of [
        { width: 360, height: 780 },
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1280, height: 800 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(size);
        await gotoAndSettle(page, "/yourcat");
        await expect(page.getByRole("heading", { name: "Meet Mochi." })).toBeVisible();
        const chip = page.getByTestId("analytics-consent-compact");
        test.skip(!(await chip.isVisible()), "this build asks for no analytics consent");
        await expect(primaryShare(page)).toBeVisible();
        expect(await coveredByChip(page), `S3 at ${size.width}`).toEqual([]);
      }
      await page.getByTestId("analytics-consent-compact").getByRole("button", { name: "Accept" }).click();
      await expect(page.getByTestId("analytics-consent-compact")).toHaveCount(0);
    });
  });

  test("S6, the paid return: the visitor's cat is on the stage", async ({ page, backend }) => {
    const painting = view({ name: "Mochi", named: true, ...READY, portrait: { status: "painting", style: "highness", url: null } });
    mockYourcat(backend, { me: painting, get: painting });
    await useFakeFirebase(page);
    await gotoAndSettle(page, `/yourcat?paid=1&yc=${RECORD_ID}`);
    await expect(page.getByTestId("yourcat-page")).toHaveAttribute("data-screen", "paid");
    await expect(page.getByTestId("yourcat-slot-cat").getByTestId("yourcat-petcat")).toBeVisible();
  });

  test.describe("in an in-app browser", () => {
    test.use({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
    });

    test("shows the long-press view and no download button", async ({ page, backend }) => {
      mockYourcat(backend, { me: view({ name: "Mochi", named: true, ...READY }) });
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/yourcat");
      await expect(page.getByRole("heading", { name: "Meet Mochi." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
      // The large card and the hint show at once, with no extra tap.
      await expect(page.getByText("Press and hold the card to save it.")).toBeVisible();
      await expect(page.getByText("For more ways to share, open this page in your browser.")).toBeVisible();
      expect(await copyFindings(page, "/yourcat in-app", { app: false })).toEqual([]);
    });
  });

  test("components/yourcat: no framer-motion or Phaser, none of the deleted styles", () => {
    const dir = join(__dirname, "..", "components", "yourcat");
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const file of readdirSync(dir).filter((name) => /\.tsx?$/.test(name))) {
      const source = strip(readFileSync(join(dir, file), "utf8"));
      expect({ file, hit: /["'](framer-motion|phaser)["']/.test(source) }).toEqual({ file, hit: false });
      expect({ file, hit: /\b(GOLD_BUTTON|GHOST_BUTTON|EYEBROW)\b/.test(source) }).toEqual({ file, hit: false });
      if (file !== "copy.ts") expect({ file, hit: source.includes("TOKEN TAILS") }).toEqual({ file, hit: false });
    }
  });
});
