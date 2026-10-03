import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";
import { type BackendMock, expect, gotoAndSettle, openFirstLevel, test } from "./fixtures";
import { FIXED_NOW } from "./fixtures/determinism";

/**
 * PROGRESS restructure (plan G5 "PROGRESS restructure", G4 IMPACT tab; task 6a):
 * - PROGRESS opens on IMPACT; the lobby RESCUE tile lands on IMPACT;
 * - the season band shows 22:00 UTC on the 8th in the viewer's local time;
 * - a give goes through the confirm sheet ("giving never lowers your rank") and re-sends the same
 *   pledge id after an interruption;
 * - the treat card sends a treat and shows "on its way";
 * - the Tails explainer opens on a menu, never over a running scene;
 * - axe is clean on the IMPACT tab;
 * - under an app build (E2E_APP_BUILD=1, against an app export) no USDC, explorer, hash or wallet
 *   text shows and token-status is never requested.
 *
 * Firebase is faked through `__TT_E2E_AUTH__`; the backend is mocked. Set PROGRESS_SHOTS=<dir> to
 * save screenshots (task evidence; nothing is compared).
 */

const SHOTS = process.env.PROGRESS_SHOTS || "";
const APP_BUILD = process.env.E2E_APP_BUILD === "1";
const AXE_RULES = ["button-name", "nested-interactive", "aria-dialog-name", "image-alt", "color-contrast", "link-name", "aria-allowed-attr"];

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
  tails: 2400,
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

const NOW = FIXED_NOW; // 2026-09-30T12:00Z
const DAY = NOW.toISOString().slice(0, 10);
const FREEZE_AT = "2026-10-08T22:00:00.000Z";
const ANCHOR_AT = "2026-10-09T00:00:00.000Z";

const PROGRESSION = {
  eligible: false,
  eligibilityCriteria: [{ id: "cats", label: "Own 1 cat", description: "Adopt a cat", current: 1, target: 1, met: true }],
  metrics: {
    collectiblesOwned: 1,
    tierCounts: { common: 1, rare: 0, epic: 0, legendary: 0 },
    rareOrAbove: 0,
    epicOrAbove: 0,
    questsCompleted: 0,
    streak: 3,
    tails: 2400,
    tailsEarned: 2400,
    tailsGiven: 600,
    goalsHelped: 1,
    packPurchases: 0,
    portraitPurchases: 0,
    totalPurchases: 0,
    additionalLegendaryCards: 0,
    legendaryStashBonusPercent: 0,
    legendaryStashBonusMultiplier: 1,
    collectibleLevel: 1,
    scoreBreakdown: { catScore: 1, questScore: 0, streakScore: 3, tailsScore: 2, rescueScore: 6 },
  },
  gamification: {
    xp: 10,
    level: 1,
    nextLevelXp: 100,
    levelProgress: 10,
    title: "Kitten Scout",
    comboMultiplier: 1,
    streakBonusTails: 5,
    dailyChallenges: [],
    milestones: [],
    nextMilestoneId: null,
    potentialBonusTails: 0,
  },
  tiers: [],
  currentTierId: null,
  nextTierId: "EXPLORER",
  unlockedUnlockables: [],
  claimedUnlockables: [],
  totalClaimedTiers: 0,
  totalClaimedChallenges: 0,
  totalClaimedMilestones: 0,
  season: { freezeAt: FREEZE_AT, resetAt: "2026-10-08T23:00:00.000Z", anchorAt: ANCHOR_AT, startedAt: "2026-09-09T00:00:00.000Z", frozen: false },
};

const SHELTER = { _id: "64e2e0000000000000000s01", name: "Pink Paw", slug: "rozine-pedute", image: null, country: "Lithuania", countryCode: "LT" };
const OPEN_GOAL = {
  id: "64e2e0000000000000000g01",
  title: "Winter food for 20 cats",
  description: "Two months of dry food for the cats in the winter room.",
  deliverable: "Dry food, 2 months",
  image: null,
  shelter: SHELTER,
  status: "OPEN",
  expired: false,
  targetTails: 10000,
  raisedTails: 4200,
  remainingTails: 5800,
  pledgeCount: 12,
  endsAt: null,
  filledAt: null,
  createdAt: "2026-09-10T00:00:00.000Z",
  delivery: null,
  cancelledAt: null,
};
const DELIVERED_GOAL = {
  ...OPEN_GOAL,
  id: "64e2e0000000000000000g02",
  title: "Vaccines for the kitten room",
  deliverable: "12 vaccines",
  status: "DELIVERED",
  raisedTails: 5000,
  targetTails: 5000,
  remainingTails: 0,
  filledAt: "2026-09-20T00:00:00.000Z",
  delivery: {
    photoUrl: "https://tokentails.fra1.cdn.digitaloceanspaces.com/goals/delivered-e2e.webp",
    receiptSha256: "3f2a9c5e1b7d4a60c8e2f1b3a5d7c9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b41e",
    note: "Delivered with the shelter team.",
    deliveredAt: "2026-09-25T10:00:00.000Z",
    txHash: "0x" + "ab".repeat(32),
  },
};

const MY_GIVES = {
  pledges: [],
  daily: { cap: 5000, used: 0, left: 5000, resetsAt: "2026-10-01T00:00:00.000Z" },
  balance: { tails: 2400 },
  totals: { tailsGiven: 600, goalsHelped: 1, monthTailsGiven: 600, monthGoalsHelped: 1 },
  eligibility: { eligible: true, reason: null, eligibleAt: null, open: true },
  limits: { min: 10, max: 5000 },
  badges: [{ id: "TREAT_GIVER", earned: false, confirmedTreats: 2, needed: 5, seasonStartedAt: "2026-09-09T00:00:00.000Z" }],
};

const IMPACT_ME = {
  treats: { confirmedCount: 2, onTheirWayCount: 0, totalConfirmedWei: "20000000000000000", lastConfirmedAt: null },
  instantTreat: { eligible: true, reason: null, eligibleAt: null },
  paws: {
    today: {
      day: DAY,
      qualifyingRuns: 1,
      runsNeeded: 2,
      remaining: 1,
      earned: false,
      eligibility: { eligible: true, reason: null, eligibleAt: null },
      settlesAt: new Date(Date.parse(`${DAY}T00:00:00Z`) + 86_400_000 + 30 * 60_000).toISOString(),
      message: "1 more run for today's paw",
    },
    lifetime: 3,
    latestSettlement: null,
    proof: null,
  },
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
  shelters: {
    total: 1,
    partners: 1,
    countries: ["LT"],
    items: [{ slug: "rozine-pedute", name: "Pink Paw", countryCode: "LT", partnerStatus: "active", role: "partner", handoverStatus: "held-by-token-tails", publicWallet: null }],
  },
  rescueCats: { total: 10, adopted: 4 },
  outcomes: { published: 0, items: [] },
  rail: { state: "live", chainId: 5042, splitAddress: null, amountWei: "10000000000000000", dailyBudgetWei: "1000000000000000000", giftsPerDayCap: 100, treatsLeftToday: 40, resetsAt: "2026-10-01T00:00:00.000Z" },
  treats: { confirmedCount: 30, onTheirWayCount: 0, totalConfirmedWei: "300000000000000000" },
  pledges: { status: "not-started", rows: [] },
  pawSettlements: { count: 0, latest: null, sendEnabled: false },
  rescueGoals: { open: 1, items: [] },
};

interface Calls {
  pledges: Array<{ amount: number; pledgeId: string }>;
  treats: number;
}

function mockBackend(backend: BackendMock, options: { interruptFirstGive?: boolean; guest?: boolean } = {}): Calls {
  const calls: Calls = { pledges: [], treats: 0 };
  let raised = OPEN_GOAL.raisedTails;
  const profile = options.guest ? { ...PLAYER, _id: "64e2e0000000000000000u02", isGuest: true, name: "Guest" } : PLAYER;
  backend
    .on("GET", "/user/profile", { body: profile })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 1 } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/user/cats", { body: [CAT] })
    .on("GET", "/user/airdrop/progression", { body: PROGRESSION })
    .on("GET", "/user/token-status", { body: { mode: "POINTS", tgeAt: null } })
    .on("GET", "/impact", { body: SNAPSHOT })
    .on("GET", "/impact/me", { body: IMPACT_ME })
    .on("GET", "/shelter/donate/status", {
      body: { enabled: true, railState: "live", treatsLeftToday: 40, resetsAt: "2026-10-01T00:00:00.000Z" },
    })
    .on("GET", "/shelter/donate/me", () => ({
      body: {
        day: DAY,
        resetsAt: "2026-10-01T00:00:00.000Z",
        today: calls.treats > 0 ? { status: "SENT" } : null,
        confirmedCount: 2,
        onTheirWayCount: calls.treats,
        totalConfirmedWei: "20000000000000000",
        lastConfirmedAt: null,
        eligibility: { eligible: true, reason: null, eligibleAt: null },
      },
    }))
    .on("POST", "/shelter/donate", () => {
      calls.treats += 1;
      return { body: { txHash: "0x" + "cd".repeat(32), chainId: 5042, amountWei: "10000000000000000", explorerUrl: "https://example.invalid/tx" } };
    })
    .on("GET", /^\/rescue-goals(\?.*)?$/, () => ({ body: [{ ...OPEN_GOAL, raisedTails: raised, remainingTails: OPEN_GOAL.targetTails - raised }, DELIVERED_GOAL] }))
    .on("GET", "/rescue-goals/pledges/me", { body: MY_GIVES })
    .on("POST", /^\/rescue-goals\/[^/]+\/pledge$/, (request: Request) => {
      const body = JSON.parse(request.postData() || "{}") as { amount: number; pledgeId: string };
      calls.pledges.push(body);
      if (options.interruptFirstGive && calls.pledges.length === 1) {
        return { status: 503, body: { statusCode: 503, code: "PLEDGE_INTERRUPTED", pledgeId: body.pledgeId } };
      }
      raised += body.amount;
      return {
        body: {
          pledge: { id: "p1", pledgeId: body.pledgeId, goal: OPEN_GOAL.id, amount: body.amount, status: "CONFIRMED", reason: null, firstForGoal: false, createdAt: NOW.toISOString(), confirmedAt: NOW.toISOString(), refundedAt: null },
          replayed: calls.pledges.length > 1,
          goal: { id: OPEN_GOAL.id, status: "OPEN", raisedTails: raised, targetTails: OPEN_GOAL.targetTails, remainingTails: OPEN_GOAL.targetTails - raised },
          balance: { tails: PLAYER.tails - body.amount },
          daily: { cap: 5000, used: body.amount, left: 5000 - body.amount, resetsAt: "2026-10-01T00:00:00.000Z" },
        },
      };
    });
  return calls;
}

async function openLobby(page: Page, backend: BackendMock, options: { interruptFirstGive?: boolean; guest?: boolean; explainerSeen?: boolean } = {}) {
  const calls = mockBackend(backend, options);
  await page.route(/\/impact\/impact\.json$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) })
  );
  await page.route(/delivered-e2e\.webp$/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#3a2f6b"/><circle cx="200" cy="150" r="70" fill="#ffcc55"/></svg>' })
  );
  await page.addInitScript(
    ({ guest, seen }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__TT_E2E_AUTH__ = guest ? { user: { uid: "guest-1", isAnonymous: true } } : { user: { uid: "player-1", isAnonymous: false } };
      w.__TT_E2E__ = true;
      try {
        if (seen) window.localStorage.setItem("tt.tailsExplainer.v1", "1");
      } catch {
        // storage blocked: the explainer shows, which the tests handle
      }
    },
    { guest: !!options.guest, seen: options.explainerSeen !== false }
  );
  await gotoAndSettle(page, "/game", 2500);
  await expect(page.getByTestId("rescue-tile")).toBeVisible({ timeout: 30_000 });
  return calls;
}

const codex = (page: Page) => page.getByRole("dialog", { name: "PROGRESS" });

async function openProgress(page: Page) {
  await page.getByText("PROGRESS", { exact: true }).first().click();
  await expect(codex(page)).toBeVisible();
  await expect(page.getByTestId("impact-tab")).toBeVisible({ timeout: 15_000 });
}

async function shot(page: Page, name: string, project: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}-${project}.png`), fullPage: false });
}

/** The same local formatting SeasonBand uses, in the page's locale and time zone. */
async function pageLocalSeason(page: Page, at: string) {
  return page.evaluate((iso) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${day}, ${time}`;
  }, at);
}

test.describe("PROGRESS opens on IMPACT (G5, task 6a)", () => {
  test.use({ allowUnmocked: true, timezoneId: "America/New_York", locale: "en-US" });

  test("PROGRESS opens on the IMPACT tab with every card", async ({ page, backend }, testInfo) => {
    await openLobby(page, backend);
    await openProgress(page);
    await expect(codex(page).getByRole("button", { name: "IMPACT", exact: true })).toBeVisible();
    for (const id of ["season-band", "rescue-goal-card", "treat-card", "todays-paw", "my-impact", "delivered-strip"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId("goal-title")).toHaveText("Winter food for 20 cats");
    await expect(page.getByTestId("my-impact-paws")).toContainText("3");
    await expect(page.getByTestId("delivered-item")).toHaveCount(1);
    await expect(page.getByTestId("tails-small-print")).toContainText("Tails have no cash value");
    // POINTS mode: no VAULT tab.
    await expect(codex(page).getByRole("button", { name: "VAULT", exact: true })).toHaveCount(0);
    // The old speculation copy is gone.
    await expect(codex(page)).not.toContainText(/TGE|AIRDROP COMMAND CENTER|allocation|\$TAILS/i);
    await page.waitForTimeout(1500);
    await shot(page, "impact", testInfo.project.name);
    await page.getByTestId("delivered-strip").scrollIntoViewIfNeeded();
    await shot(page, "impact-lower", testInfo.project.name);
  });

  test("the lobby RESCUE tile lands on IMPACT", async ({ page, backend }) => {
    await openLobby(page, backend);
    await page.getByTestId("rescue-tile").click();
    await expect(codex(page)).toBeVisible();
    await expect(page.getByTestId("impact-tab")).toBeVisible({ timeout: 15_000 });
    // Switching away and reopening from PROGRESS starts on IMPACT again.
    await codex(page).getByRole("button", { name: "REWARDS", exact: true }).click();
    await expect(page.getByTestId("impact-tab")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(codex(page)).toHaveCount(0);
    await openProgress(page);
    await expect(page.getByTestId("impact-tab")).toBeVisible();
    await expect(codex(page).getByRole("button", { name: "IMPACT", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(codex(page).getByRole("button", { name: "REWARDS", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("the season band shows 22:00 UTC on the 8th in local time", async ({ page, backend }) => {
    await openLobby(page, backend);
    await openProgress(page);
    const expected = await pageLocalSeason(page, FREEZE_AT);
    // New York is UTC-4 in October: 22:00 UTC on the 8th is 6 PM on the 8th.
    expect(expected).toMatch(/Oct 8, 06:00\sPM/);
    await expect(page.getByTestId("season-at")).toHaveText(expected);
    await expect(page.getByTestId("season-left")).toHaveText("8d 10h left");
  });

  test("a give: confirm sheet, then the same pledge id after an interruption", async ({ page, backend }, testInfo) => {
    const calls = await openLobby(page, backend, { interruptFirstGive: true });
    await openProgress(page);
    const chip = page.getByTestId("give-chip-1000");
    await expect(chip).toBeEnabled();
    // Layout size, not the box: the modal's open animation scales its content for a moment.
    const size = await chip.evaluate((el) => ({ h: (el as HTMLElement).offsetHeight, w: (el as HTMLElement).offsetWidth }));
    expect(size.h).toBeGreaterThanOrEqual(44);
    expect(size.w).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId("give-chip-max")).toHaveText("MAX 2,400");
    await chip.click();
    const sheet = page.getByRole("dialog", { name: "GIVE TAILS" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("give-rank-line")).toHaveText("Giving never lowers your rank.");
    await shot(page, "give-sheet", testInfo.project.name);
    await sheet.getByTestId("give-confirm").click();
    await expect(sheet).toHaveCount(0, { timeout: 15_000 });
    expect(calls.pledges.length).toBe(2);
    expect(calls.pledges[0].amount).toBe(1000);
    expect(calls.pledges[0].pledgeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(calls.pledges[1].pledgeId).toBe(calls.pledges[0].pledgeId);
  });

  test("the treat card sends a treat and shows it on its way", async ({ page, backend }) => {
    const calls = await openLobby(page, backend);
    await openProgress(page);
    const card = page.getByTestId("treat-card");
    await expect(card.locator("[data-treat-state]")).toHaveAttribute("data-treat-state", "ready");
    await card.getByTestId("treat-send").click();
    await expect(card.locator("[data-treat-state]")).toHaveAttribute("data-treat-state", "on-its-way");
    expect(calls.treats).toBe(1);
  });

  test("a guest sees IMPACT and is asked to save their cat before giving", async ({ page, backend }) => {
    const calls = await openLobby(page, backend, { guest: true });
    await openProgress(page);
    await expect(page.getByTestId("my-impact-guest")).toBeVisible();
    await page.getByTestId("give-chip-100").click();
    const sheet = page.getByRole("dialog", { name: /SAVE YOUR CAT/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Keep playing as guest" }).click();
    await expect(page.getByRole("dialog", { name: "GIVE TAILS" })).toHaveCount(0);
    expect(calls.pledges).toEqual([]);
    expect(backend.requests().filter((c) => c.path === "/rescue-goals/pledges/me")).toEqual([]);
  });

  test("the Tails explainer opens on the menu and once", async ({ page, backend }, testInfo) => {
    await openLobby(page, backend, { explainerSeen: false });
    await openProgress(page);
    const explainer = page.getByTestId("tails-explainer");
    await expect(explainer).toBeVisible();
    await expect(explainer).toContainText("Tails are rescue points");
    await page.waitForTimeout(1200);
    await shot(page, "explainer", testInfo.project.name);
    await explainer.getByTestId("tails-explainer-ok").click();
    await expect(explainer).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(codex(page)).toHaveCount(0);
    await openProgress(page);
    await page.waitForTimeout(400);
    await expect(explainer).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("tt.tailsExplainer.v1"))).toBe("1");
  });

  test("the Tails explainer never opens over a running scene", async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "One run is enough.");
    await openLobby(page, backend, { explainerSeen: false });
    await page.getByRole("button", { name: "PLAY", exact: true }).first().click();
    const pawMatch = page.getByRole("button", { name: /PAW MATCH/i }).first();
    await expect(pawMatch).toBeVisible({ timeout: 15_000 });
    await pawMatch.click();
    await openFirstLevel(page, "pawmatch");
    await expect(page.locator("[data-scene-ready]").first()).toBeVisible({ timeout: 30_000 });
    // No HUD control opens PROGRESS in a level: open it through GameProvider's E2E hook.
    await page.evaluate(() => {
      const hook = (window as unknown as { __TT_E2E_GAME__?: { openModal: (modal: string) => void } }).__TT_E2E_GAME__;
      if (!hook) throw new Error("GameProvider E2E hook missing");
      hook.openModal("CODEX");
    });
    await expect(codex(page)).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId("impact-tab")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tails-explainer")).toHaveCount(0);
  });

  test("axe: IMPACT tab and the give sheet", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    await openLobby(page, backend);
    await openProgress(page);
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).include("[data-testid=impact-tab]").withRules(AXE_RULES).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await page.getByTestId("give-chip-100").click();
    await expect(page.getByRole("dialog", { name: "GIVE TAILS" })).toBeVisible();
    await page.waitForTimeout(500);
    const sheet = await new AxeBuilder({ page }).include("[data-testid=give-sheet]").withRules(AXE_RULES).analyze();
    expect(sheet.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("app build: no chain words in IMPACT and no token-status request", async ({ page, backend }) => {
    test.skip(!APP_BUILD, "Needs an app export (NEXT_PUBLIC_IS_APP) served at E2E_BASE_URL with E2E_APP_BUILD=1.");
    await openLobby(page, backend);
    await openProgress(page);
    await page.waitForTimeout(800);
    const text = await page.getByTestId("impact-tab").innerText();
    expect(text).not.toMatch(/\bUSDC\b|explorer|\bhash\b|SHA-256|\bwallet\b|0x[0-9a-f]{6}|on-?chain/i);
    expect(backend.requests().filter((c) => c.path === "/user/token-status")).toEqual([]);
    await expect(codex(page).getByRole("button", { name: "PET ART", exact: true })).toHaveCount(0);
  });
});
