import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";
import { FIXED_NOW } from "./fixtures/determinism";

/**
 * Impact in the lobby (plan G4 "Client", 2.13 row 29; task 5e):
 * - the RESCUE tile opens PROGRESS and asks for the IMPACT tab (`tt:progress-tab`);
 * - MEET SHELTER CATS opens the Shelter scene in one tap (a button on phones, a tile from md up);
 * - the lobby does not scroll at 390x844 and 360x740;
 * - axe passes on the lobby and on /shelter-payouts;
 * - no in-app link from the lobby or the footer is a 404 (the retired /airdrop, /giveaway and /box
 *   links redirect).
 *
 * Firebase is faked through `__TT_E2E_AUTH__`; the backend and the CDN snapshot are mocked.
 * Set LOBBY_SHOTS=<dir> to save screenshots (task evidence; nothing is compared).
 */

const SHOTS = process.env.LOBBY_SHOTS || "";
const AXE_RULES = ["button-name", "nested-interactive", "image-alt", "color-contrast", "link-name", "aria-allowed-attr"];

const CAT = {
  _id: "64e2e0000000000000000c01",
  name: "Scout",
  isStarter: true,
  starterBreed: "SCOUT",
  type: "GRASS",
  tier: "COMMON",
  spriteImg: "/cats/starters/scout/sheet.png",
  catImg: "/cats/starters/scout/idle.gif",
  status: { EAT: 0 },
};
const PLAYER = {
  _id: "64e2e0000000000000000u01",
  isGuest: false,
  name: "Player",
  onboarding: { state: "done" },
  tails: 120,
  spent: 0,
  catnipChaos: [],
  match3: [],
  cat: CAT,
  cats: [CAT],
  codex: [],
  quests: [],
  streak: 3,
  canRedeemLives: true,
};

// The page clock is pinned at FIXED_NOW (fixtures), so the paw day and the countdown read from it.
const NOW = FIXED_NOW;
const DAY = NOW.toISOString().slice(0, 10);
const SETTLES = new Date(Date.parse(`${DAY}T00:00:00Z`) + 86_400_000 + 30 * 60_000).toISOString();

const IMPACT_ME = {
  treats: { confirmedCount: 0, onTheirWayCount: 0, totalConfirmedWei: "0", lastConfirmedAt: null },
  instantTreat: { eligible: false, reason: "account-too-new", eligibleAt: null },
  paws: {
    today: {
      day: DAY,
      qualifyingRuns: 1,
      runsNeeded: 2,
      remaining: 1,
      earned: false,
      eligibility: { eligible: true, reason: null, eligibleAt: null },
      settlesAt: SETTLES,
      message: "1 more run for today's paw",
    },
    lifetime: 3,
    latestSettlement: null,
    proof: null,
  },
  pledge: null,
};

const SNAPSHOT = {
  _v: 1,
  bucket: `${DAY}T05:00Z`,
  generatedAt: NOW.toISOString(),
  asOf: { chain: null, mongo: NOW.toISOString() },
  sources: { chain: "not-deployed", mongo: "ok" },
  money: { custody: "held-by-token-tails", bySymbol: {}, byBucket: {}, eventCount: 0, lastTxHash: null },
  chain: { chainId: 5042, contract: null, fromBlock: null, lastScannedBlock: null },
  players: { registeredAllTime: 1200, active30d: null },
  heists: { verified: null },
  shelters: { total: 1, partners: 1, countries: ["LT"], items: [{ slug: "rozine-pedute", name: "Pink Paw", countryCode: "LT", partnerStatus: "active", role: "partner", handoverStatus: "held-by-token-tails", publicWallet: null }] },
  rescueCats: { total: 10, adopted: 4 },
  outcomes: { published: 0, items: [] },
  rail: { state: "not-deployed", chainId: 5042, splitAddress: null, amountWei: "10000000000000000", dailyBudgetWei: "1000000000000000000", giftsPerDayCap: 100, treatsLeftToday: 0, resetsAt: NOW.toISOString() },
  treats: { confirmedCount: 0, onTheirWayCount: 0, totalConfirmedWei: "0" },
  pledges: { status: "not-started", rows: [] },
  pawSettlements: { count: 0, latest: null, sendEnabled: false },
  rescueGoals: { open: 0, items: [] },
};

function mockBackend(backend: BackendMock) {
  backend
    .on("GET", "/user/profile", { body: PLAYER })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 1 } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/user/cats", { body: [CAT] })
    .on("GET", /^\/user\/airdrop/, { body: {} })
    .on("GET", "/impact", { body: SNAPSHOT })
    .on("GET", "/impact/me", { body: IMPACT_ME })
    .on("GET", "/shelter/donate/status", {
      body: { enabled: false, railState: "not-deployed", treatsLeftToday: 0, resetsAt: NOW.toISOString() },
    });
}

async function openLobby(page: Page, backend: BackendMock) {
  mockBackend(backend);
  await page.route(/\/impact\/impact\.json$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) })
  );
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__TT_E2E_AUTH__ = { user: { uid: "player-1", isAnonymous: false } };
    w.__TT_E2E__ = true;
    w.__progressTabs = [];
    window.addEventListener("tt:progress-tab", (event) => {
      (w.__progressTabs as unknown[]).push((event as CustomEvent).detail);
    });
  });
  await gotoAndSettle(page, "/game", 2500);
  await expect(page.getByTestId("rescue-tile")).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string, project: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}-${project}.png`) });
}

test.describe("lobby impact (G4, task 5e)", () => {
  test.use({ allowUnmocked: true });

  test("RESCUE tile opens PROGRESS on the IMPACT tab", async ({ page, backend }, testInfo) => {
    await openLobby(page, backend);
    await expect(page.getByTestId("rescue-badge")).toHaveText("3");
    await shot(page, "lobby", testInfo.project.name);
    await page.getByTestId("rescue-tile").click();
    await expect(page.getByRole("dialog", { name: "PROGRESS" })).toBeVisible();
    const tabs = await page.evaluate(() => (window as unknown as { __progressTabs: unknown[] }).__progressTabs);
    expect(tabs).toEqual([{ tab: "impact" }]);
  });

  test("MEET SHELTER CATS opens the Shelter in one tap", async ({ page, backend }, testInfo) => {
    await openLobby(page, backend);
    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    const control = wide ? page.getByTestId("shelter-tile") : page.getByTestId("meet-shelter-cats");
    await expect(control).toBeVisible();
    await control.click();
    // The Shelter's own HUD: back to the lobby, or across to Home.
    await expect(page.getByRole("button", { name: "HOME", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("rescue-tile")).toHaveCount(0);
    await shot(page, "shelter", testInfo.project.name);
  });

  test("the lobby has no scroll and the tiles are on screen", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "mobile-360", "desktop-1440"].includes(testInfo.project.name), "Phones and desktop.");
    await openLobby(page, backend);
    const box = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return { sh: el.scrollHeight, sw: el.scrollWidth, h: window.innerHeight, w: window.innerWidth };
    });
    expect(box.sh, "vertical scroll").toBeLessThanOrEqual(box.h + 1);
    expect(box.sw, "horizontal scroll").toBeLessThanOrEqual(box.w + 1);
    // The lobby sits in a fixed container, whose overflow never grows the document: check that no
    // ancestor of the lobby scrolls either.
    const scrollers = await page.getByTestId("lobby-hero").evaluate((node) => {
      const out: string[] = [];
      for (let el: HTMLElement | null = node as HTMLElement; el; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          out.push(`${el.tagName}.${el.className} ${el.scrollHeight}>${el.clientHeight}`);
        }
      }
      return out;
    });
    expect(scrollers, "scrolling lobby ancestors").toEqual([]);
    const wide = box.w >= 768;
    const onScreen = [
      page.getByTestId("rescue-tile"),
      page.getByTestId("lobby-hero-cat"),
      page.getByRole("button", { name: "PLAY", exact: true }),
      page.getByRole("button", { name: "MY PETS", exact: true }),
      page.getByRole("button", { name: "Home", exact: true }),
      wide ? page.getByTestId("shelter-tile") : page.getByTestId("meet-shelter-cats"),
    ];
    for (const control of onScreen) {
      const r = await control.boundingBox();
      const id = control.toString();
      expect(r, id).not.toBeNull();
      expect(r!.x, `${id} left`).toBeGreaterThanOrEqual(0);
      expect(r!.y, `${id} top`).toBeGreaterThanOrEqual(0);
      expect(r!.x + r!.width, `${id} right`).toBeLessThanOrEqual(box.w);
      expect(r!.y + r!.height, `${id} bottom`).toBeLessThanOrEqual(box.h);
    }
    if (box.w >= 768) {
      await expect(page.getByTestId("impact-strip")).toBeVisible();
      await expect(page.getByTestId("impact-strip")).toHaveAttribute("aria-live", "off");
      await expect(page.getByTestId("paw-text").first()).toHaveText("1 more run for today's paw");
      // FIXED_NOW is 12:00 UTC, so today's runs count for about 12 more hours.
      await expect(page.getByTestId("paw-countdown").first()).toHaveText(/^1[12]h \d+m left today/);
      await expect(page.getByTestId("shelter-tile-caption")).toHaveText(/Meet shelter\s*cats/i);
      // One pause stops the lobby's motion: the strip heart and the RESCUE heart.
      await page.getByTestId("impact-strip-pause").click();
      await expect(page.getByTestId("impact-strip-heart")).toHaveAttribute("data-paused", "true");
      await expect(page.getByTestId("rescue-heart")).toHaveAttribute("data-paused", "true");
    } else {
      await expect(page.getByTestId("impact-strip")).toBeHidden();
    }
  });

  test("axe: lobby", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    await openLobby(page, backend);
    const results = await new AxeBuilder({ page })
      .include("[data-testid=lobby-rescue]")
      .include("[data-testid=lobby-hero]")
      .withRules(AXE_RULES)
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      const strip = await new AxeBuilder({ page }).include("[data-testid=impact-strip]").withRules(AXE_RULES).analyze();
      expect(strip.violations.map((v) => v.id)).toEqual([]);
    }
  });

  test("axe: /shelter-payouts", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    mockBackend(backend);
    await gotoAndSettle(page, "/shelter-payouts", 3000);
    await expect(page.getByTestId("payouts-empty").or(page.getByTestId("payouts-totals"))).toBeVisible({ timeout: 20_000 });
    await shot(page, "shelter-payouts", testInfo.project.name);
    const results = await new AxeBuilder({ page }).include("#shelter-payouts").withRules(AXE_RULES).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("no 404 from any in-app link in the lobby or the footer", { tag: "@ci-desktop" }, async ({ page, backend, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "One crawl is enough.");
    await openLobby(page, backend);
    const lobbyLinks = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""));
    await gotoAndSettle(page, "/stats", 1500);
    const footerLinks = await page.$$eval("footer a[href], a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""));
    const internal = Array.from(
      new Set(
        [...lobbyLinks, ...footerLinks, "/airdrop", "/giveaway", "/box", "/old-landing", "/stats", "/impact", "/shelter-payouts"]
          .filter((h) => h.startsWith("/") && !h.startsWith("//"))
          .map((h) => h.split("#")[0])
          .filter(Boolean)
      )
    );
    expect(internal.length).toBeGreaterThan(3);
    const broken: string[] = [];
    for (const href of internal) {
      const res = await page.request.get(new URL(href, baseURL).toString(), { maxRedirects: 5 });
      if (res.status() >= 400) broken.push(`${href} -> ${res.status()}`);
    }
    expect(broken).toEqual([]);
    const airdrop = await page.request.get(new URL("/airdrop", baseURL).toString(), { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(airdrop.status());
    expect(airdrop.headers()["location"]).toMatch(/\/shelter-payouts$/);
  });
});
