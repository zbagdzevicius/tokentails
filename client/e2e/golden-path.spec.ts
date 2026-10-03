import type { Frame, Page, Request } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";
import { copyFindings } from "./fixtures/copy-scan";
import { FIXED_NOW } from "./fixtures/determinism";

/**
 * The north-star first session (plan section 1.3) end to end, task 7b:
 *
 *   landing -> PLAY GAME -> night curtain -> Meet your cat (choose, name, reveal, real cats)
 *   -> Cupid Cat level 1 behind its start gate (decision #96) -> first clear with one
 *   `/live {outcome: 'won'}` -> soft "Save your cat" nudge -> PROGRESS opens on IMPACT with
 *   tier chips -> the picker shows "CATNIP HEIST · NO SIGN-UP" -> /heist loads with no modal
 *   -> the judge path: /impact lists every public claim with value, date, status and source.
 *
 * The anonymous Firebase provider is a deferred console step, so Firebase is faked in the page
 * (`window.__TT_E2E_AUTH__`, dev and E2E builds only) and the backend is answered by `page.route`
 * fixtures that follow the real guards (428 before the guest session, one starter commit).
 *
 * Every step also runs the F11 runtime copy scan (fixtures/copy-scan.ts) over what the player
 * sees, so copy sent by the backend or assembled at run time is held to the same tone and claim
 * rules as the source. With E2E_APP_BUILD=1 (against an app export built with NEXT_PUBLIC_IS_APP=1
 * and NEXT_PUBLIC_E2E=1) the scan adds the app-build rules: no USDC, hashes, explorer, wallet,
 * chain names or "on-chain".
 *
 * Set GOLDEN_SHOTS=<dir> for the screenshot set (evidence only, never compared).
 */

const SHOTS = process.env.GOLDEN_SHOTS || "";
const APP_BUILD = process.env.E2E_APP_BUILD === "1";

const STARTER = {
  _id: "64e2e0000000000000000c01",
  name: "Scout",
  isStarter: true,
  isGuestStarter: true,
  starterBreed: "SCOUT",
  type: "GRASS",
  tier: "COMMON",
  spriteImg: "/cats/starters/scout/sheet.png",
  catImg: "/cats/starters/scout/idle.gif",
  status: { EAT: 0 },
};

const TRANSIENT = {
  isGuest: true,
  transient: true,
  name: "Guest",
  onboarding: { state: "pending" },
  tails: 0,
  catnipChaos: [],
  match3: [],
  seasonEvent: [],
  seasonEventCleared: [],
  codex: [],
  quests: [],
  streak: 0,
  canRedeemLives: true,
  cat: { ...STARTER, _id: "guest-starter" },
  cats: [],
};

const LOOKS: Record<string, string> = { SCOUT: "scout", PINKIE: "pinkie", SHADOW: "shadow", MISTY: "misty", SUNNY: "sunny" };

/** Three real shelter cats to follow (plan 1.3 step 3). */
const FEATURED = [
  { _id: "69b0419cd7d6a7187c9b0752", name: "kretis", status: "WAITING", excerpt: "A true beauty with a charming presence.", catAvatar: "/cats/starters/pinkie/still.png", shelter: { _id: "s1", name: "Rožinė Pėdutė" } },
  { _id: "6987c07e86ebfefc7ff52929", name: "saule", status: "WAITING", excerpt: "A playful little black kitty.", catAvatar: "/cats/starters/shadow/still.png", shelter: { _id: "s1", name: "Rožinė Pėdutė" } },
  { _id: "69a964243ee4d7b657948f1f", name: "Amsis", status: "RECOVERING", excerpt: "A fluffy little soul.", catAvatar: "/cats/starters/misty/still.png", shelter: { _id: "s1", name: "Rožinė Pėdutė" } },
];

const DAY = FIXED_NOW.toISOString().slice(0, 10);
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
    txHash: null,
  },
};

/** The public impact snapshot (GET /impact and the CDN impact.json): a held, custodial rail. */
const SNAPSHOT = {
  _v: 1,
  bucket: `${DAY}T05:00Z`,
  generatedAt: FIXED_NOW.toISOString(),
  asOf: { chain: null, mongo: FIXED_NOW.toISOString() },
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
  rail: { state: "not-deployed", chainId: 5042, splitAddress: null, amountWei: "10000000000000000", dailyBudgetWei: "1000000000000000000", giftsPerDayCap: 100, treatsLeftToday: 0, resetsAt: "2026-10-01T00:00:00.000Z" },
  treats: { confirmedCount: 0, onTheirWayCount: 0, totalConfirmedWei: "0" },
  pledges: { status: "not-started", rows: [] },
  pawSettlements: { count: 0, latest: null, sendEnabled: false },
  rescueGoals: { open: 1, items: [] },
};

interface GoldenBackend {
  lives: () => Array<Record<string, unknown>>;
  commits: () => Array<Record<string, unknown>>;
  writes: () => string[];
}

/**
 * One guest backend for the whole session: the transient template profile until
 * `POST /user/guest/session`, one starter commit, then `/live` saves that record the clear.
 */
function mockGoldenBackend(backend: BackendMock): GoldenBackend {
  let session = false;
  let committed: Record<string, unknown> | null = null;
  const lives: Array<Record<string, unknown>> = [];
  const commits: Array<Record<string, unknown>> = [];
  let seasonEvent: number[] = [];
  let seasonEventCleared: number[] = [];
  const profile = () => {
    const base = committed
      ? { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat: committed, cats: [committed], onboarding: { state: "done", version: 1 } }
      : session
        ? { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat: STARTER, cats: [STARTER] }
        : TRANSIENT;
    return { ...base, seasonEvent, seasonEventCleared, seasonEventCount: seasonEvent.reduce((a, b) => a + b, 0) };
  };
  backend
    .on("GET", "/user/profile", () => ({ body: profile() }))
    .on("POST", "/user/guest/session", () => {
      session = true;
      return { status: 201, body: profile() };
    })
    .on("POST", "/user/starter", (request: Request) => {
      if (!session) return { status: 428, body: { statusCode: 428, code: "GUEST_SESSION_REQUIRED", message: "Start a guest session first" } };
      const body = JSON.parse(request.postData() || "{}");
      commits.push(body);
      if (committed) return { status: 409, body: { statusCode: 409, code: "STARTER_LOCKED", message: "Your starter cat is already chosen" } };
      const breed = String(body.breed || "SCOUT");
      committed = {
        ...STARTER,
        name: body.skipped ? "Scout" : String(body.name),
        starterBreed: breed,
        starterLockedAt: FIXED_NOW.toISOString(),
        catImg: `/cats/starters/${LOOKS[breed] || "scout"}/idle.gif`,
      };
      return { status: 201, body: { success: true, cat: committed, onboarding: { state: "done", skipped: !!body.skipped, version: 1 } } };
    })
    .on("GET", /^\/blessing\/featured(\?.*)?$/, { body: FEATURED })
    .on("GET", "/blessing/featured/names", { body: { names: FEATURED.map((cat) => cat.name) } })
    .on("POST", /^\/user\/following\/[^/]+$/, { status: 201, body: { success: true, following: [] } })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/cats/, () => ({ body: committed ? [committed] : [STARTER] }))
    // The only score writer (CLAUDE.md): every save in this session must come through here.
    .on("POST", "/user/catbassadors/live", (request: Request) => {
      const body = JSON.parse(request.postData() || "{}");
      lives.push(body);
      if (body.type === "PIXEL_RESCUE") {
        seasonEvent = [Math.max(seasonEvent[0] ?? 0, Number(body.points) || 0)];
        if (body.outcome === "won") seasonEventCleared = [1];
      }
      return { status: 201, body: profile() };
    })
    .on("GET", /^\/user\/airdrop/, { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } })
    .on("GET", "/user/token-status", { body: { mode: "POINTS", tgeAt: null } })
    .on("GET", "/impact", { body: SNAPSHOT })
    .on("GET", /^\/rescue-goals(\?.*)?$/, { body: [OPEN_GOAL, DELIVERED_GOAL] })
    .on("GET", "/rescue-goals/pledges/me", { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } });
  return {
    lives: () => lives,
    commits: () => commits,
    writes: () =>
      backend
        .requests()
        .filter((call) => call.method !== "GET" && call.method !== "OPTIONS")
        .map((call) => `${call.method} ${call.path}`),
  };
}

async function routeStatic(page: Page) {
  await page.route(/\/impact\/impact\.json$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SNAPSHOT) }),
  );
  await page.route(/delivered-e2e\.webp$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#3a2f6b"/><circle cx="200" cy="150" r="70" fill="#ffcc55"/></svg>',
    }),
  );
}

async function fakeFirebase(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = {};
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  // The Next dev-tools badge is dev only and covers the bottom-left corner of the evidence.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  await page.screenshot({ path: join(SHOTS, `${name}-${size?.width}.png`) });
}

/** The F11 runtime copy scan of what is on screen now (web rules, plus app rules on app builds). */
async function expectCleanCopy(page: Page, where: string, root?: string) {
  expect(await copyFindings(page, where, { app: APP_BUILD, root }), `copy on ${where}`).toEqual([]);
}

async function withCupid<T>(page: Page, body: string): Promise<T | null> {
  return page.evaluate((fn) => {
    const games = ((window as unknown as { __ttGames?: Array<{ canvas?: HTMLCanvasElement; scene: { getScenes: (a: boolean) => Array<{ sys: { settings: { key: string } } }>; getScene: (k: string) => unknown } }> }).__ttGames || []).filter(
      (g) => g.canvas?.isConnected,
    );
    const game = games.find((g) => g.scene.getScenes(true).some((s) => s.sys.settings.key === "PixelRescueScene"));
    const scene = game?.scene.getScene("PixelRescueScene");
    if (!scene) return null;
    return new Function("scene", fn)(scene);
  }, body) as Promise<T | null>;
}

async function heistFrame(page: Page): Promise<Frame> {
  await expect(page.getByTestId("heist-host")).toHaveAttribute("data-bridge", "ready", { timeout: 90_000 });
  const frame = page.frames().find((candidate) => candidate.url().includes("/heist-game/index.html"));
  expect(frame, "the Heist iframe").toBeTruthy();
  await frame!.waitForFunction(() => document.getElementById("app")?.dataset.ready === "1", undefined, { timeout: 90_000 });
  return frame!;
}

test.describe("north-star first session (plan 1.3, task 7b)", () => {
  test.use({ allowUnmocked: true });

  test("landing to Meet your cat, Cupid level 1, first clear, IMPACT, Heist and /impact", async ({ page, backend }) => {
    test.setTimeout(300_000);
    const api = mockGoldenBackend(backend);
    await routeStatic(page);
    await fakeFirebase(page);

    await test.step("1. landing: night sky, the altar tabby, PLAY GAME", async () => {
      await gotoAndSettle(page, "/", 2000);
      const cta = page.getByTestId("hero-cta");
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", "/game?from=landing_hero");
      // The landing reads an existing session only: it creates no guest and writes nothing.
      expect(api.writes()).toEqual([]);
      await shot(page, "01-landing");
      await expectCleanCopy(page, "landing");
      await cta.click();
    });

    await test.step("2. /game: night intro curtain, no sign-in wall", async () => {
      await page.waitForURL(/\/game(\?|$)/, { timeout: 30_000 });
      const curtain = page.getByTestId("intro-curtain");
      const meet = page.getByTestId("meet-your-cat");
      // The curtain hands straight to the altar (never the lobby); a fast machine may already be past it.
      await expect(curtain.or(meet).first()).toBeVisible({ timeout: 20_000 });
      // Read the colour in one shot: the curtain lifts on readiness and may go between two polls.
      const curtainBg = await curtain
        .evaluate((el) => getComputedStyle(el).backgroundColor, undefined, { timeout: 1000 })
        .catch(() => null);
      if (curtainBg !== null) {
        expect(curtainBg).toBe("rgb(11, 8, 32)");
        await shot(page, "02-curtain");
      }
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /#0b0820/i);
      // No sign-in wall: the AuthSheet never opens by itself.
      await expect(page.getByTestId("auth-sheet")).toHaveCount(0);
    });

    await test.step("3. Meet your cat: choose, name, reveal, three real cats", async () => {
      const dialog = page.getByTestId("meet-your-cat");
      await expect(dialog).toHaveAttribute("data-step", "awaits", { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Your cat awaits…" })).toBeVisible();
      await shot(page, "03-awaits");
      await expectCleanCopy(page, "meet: awaits");
      await page.getByRole("button", { name: "MEET YOUR CAT" }).click();

      await expect(dialog).toHaveAttribute("data-step", "choose");
      await expect(page.getByRole("radio")).toHaveCount(5);
      await page.getByTestId("starter-PINKIE").click();
      await shot(page, "04-choose");
      await expectCleanCopy(page, "meet: choose");
      await page.getByRole("button", { name: "CONTINUE" }).click();

      await expect(dialog).toHaveAttribute("data-step", "name");
      await page.getByTestId("meet-name-input").fill("Biscuit");
      await page.getByRole("button", { name: "MEET BISCUIT" }).click();

      await expect(dialog).toHaveAttribute("data-step", "reveal", { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Meet Biscuit!" })).toBeVisible();
      await expect.poll(() => api.commits().filter((c) => !c.skipped)).toEqual([{ breed: "PINKIE", name: "Biscuit" }]);
      await page.waitForTimeout(400);
      await shot(page, "05-reveal");
      await expectCleanCopy(page, "meet: reveal");
      await page.getByRole("button", { name: "CONTINUE" }).click();

      await expect(dialog).toHaveAttribute("data-step", "featured");
      await expect(page.getByRole("button", { name: /^Follow / })).toHaveCount(3);
      await shot(page, "06-real-cats");
      await expectCleanCopy(page, "meet: real cats");
      await page.getByRole("button", { name: "START PLAYING" }).click();
      await expect(dialog).toHaveCount(0);
    });

    await test.step("4. first run: Cupid Cat level 1 behind its start gate (decision #96)", async () => {
      await expect
        .poll(async () => (await withCupid<number | null>(page, "return scene.ftueSnapshot ? scene.ftueSnapshot().health : null;")) ?? null, {
          timeout: 60_000,
          message: "Cupid Cat day 1 booted",
        })
        .not.toBeNull();
      const gate = page.getByTestId("run-gate");
      await expect(gate).toBeVisible();
      await expect(gate).toContainText("Cupid Cat · Day 1");
      await expect(page.getByTestId("cupid-shield-chip")).toContainText("Starter shield");
      await shot(page, "07-cupid-gate");
      await expectCleanCopy(page, "cupid gate");
      await page.keyboard.press("Space");
      await expect(gate).toHaveCount(0);
      await page.waitForTimeout(1500);
      await shot(page, "08-cupid-playing");
    });

    await test.step("5. first clear: one /live save with outcome won, the win card", async () => {
      await withCupid(page, "scene.winGame(); return true;");
      await expect.poll(() => api.lives().length, { timeout: 15_000 }).toBe(1);
      await page.waitForTimeout(1000);
      expect(api.lives()).toHaveLength(1);
      expect(api.lives()[0]).toMatchObject({ type: "PIXEL_RESCUE", level: "1", outcome: "won" });
      const back = page.getByRole("button", { name: "MEOW BACK" });
      await expect(back).toBeVisible({ timeout: 15_000 });
      await shot(page, "09-first-clear");
      await expectCleanCopy(page, "win card");
      await back.click();
    });

    await test.step("6. back in the lobby: the soft Save your cat nudge", async () => {
      // MEOW BACK lands on the Cupid level map; its GO BACK returns to the lobby.
      const leave = page.getByRole("button", { name: /GO BACK|^Leave level$/ }).or(page.getByText("GO BACK", { exact: false })).first();
      for (let i = 0; i < 3 && !(await page.getByTestId("rescue-tile").isVisible()); i += 1) {
        if (await leave.isVisible()) await leave.click();
        await page.waitForTimeout(800);
      }
      await expect(page.getByTestId("rescue-tile")).toBeVisible({ timeout: 30_000 });
      const nudge = page.getByTestId("save-nudge");
      await expect(nudge).toBeVisible({ timeout: 10_000 });
      await expect(nudge).toContainText(/Biscuit|your cat/i);
      // Soft: it never opens the sheet by itself.
      await expect(page.getByTestId("auth-sheet")).toHaveCount(0);
      await shot(page, "10-lobby-nudge");
      await expectCleanCopy(page, "lobby");
    });

    await test.step("7. PROGRESS opens on IMPACT with tier chips", async () => {
      await page.getByText("PROGRESS", { exact: true }).first().click();
      const codex = page.getByRole("dialog", { name: "PROGRESS" });
      await expect(codex).toBeVisible();
      // The first PROGRESS open explains Tails once (on the menu); it does not replace IMPACT.
      const explainer = page.getByTestId("tails-explainer");
      if (await explainer.isVisible().catch(() => false)) await explainer.getByTestId("tails-explainer-ok").click();
      await expect(page.getByTestId("impact-tab")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("goal-title")).toHaveText("Winter food for 20 cats");
      const chips = page.getByTestId("impact-tab").locator("[data-chip]");
      await expect(chips.first()).toBeVisible();
      expect(await chips.count()).toBeGreaterThan(0);
      await shot(page, "11-progress-impact");
      await expectCleanCopy(page, "PROGRESS: IMPACT");
      await page.keyboard.press("Escape");
      await expect(codex).toHaveCount(0);
    });

    await test.step("8. the picker shows CATNIP HEIST · NO SIGN-UP, and /heist opens with no modal", async () => {
      await page.getByText("PLAY", { exact: true }).first().click();
      const picker = page.getByRole("dialog", { name: "Choose your adventure" });
      await expect(picker).toBeVisible();
      const heist = picker.getByRole("link", { name: "CATNIP HEIST · NO SIGN-UP" });
      await expect(heist).toBeVisible();
      await shot(page, "12-picker");
      await expectCleanCopy(page, "game picker");
      await heist.click();
      await page.waitForURL(/\/heist(\?|$)/, { timeout: 60_000 });
      const frame = await heistFrame(page);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByTestId("heist-frame")).toBeVisible();
      await expect(frame.getByRole("button", { name: "Start heist" }).or(frame.locator("section.ch-hud")).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await shot(page, "13-heist");
      // The Heist is a separate build; its run-time copy gets the same scan inside the iframe.
      expect(await copyFindings(frame, "heist", { app: APP_BUILD }), "copy on heist").toEqual([]);
    });

    await test.step("9. judge path: /impact lists every public claim with value, date, status and source", async () => {
      await gotoAndSettle(page, "/impact", 2000);
      await expect(page.getByTestId("impact-page")).toBeVisible();
      const registry = page.getByTestId("claim-registry");
      await registry.scrollIntoViewIfNeeded();
      const rows = registry.locator("[data-claim-row]");
      expect(await rows.count()).toBeGreaterThan(5);
      // The retired "3 taps" claim (decision #75) is gone from the public list.
      await expect(registry.locator('[data-claim-row="P-001"]')).toHaveCount(0);
      await expect(page.getByTestId("tier-legend")).toBeVisible();
      await shot(page, "14-impact");
      await expectCleanCopy(page, "/impact");
    });

    // The whole session wrote scores only through /live (CLAUDE.md: one writer).
    const scoreWrites = api.writes().filter((w) => /score|catbassadors|match|game/i.test(w));
    expect(scoreWrites.every((w) => w === "POST /user/catbassadors/live"), scoreWrites.join(", ")).toBe(true);
  });
});

test.describe("F11 runtime copy scan: /game modals (task 7b)", () => {
  test.use({ allowUnmocked: true });

  // Every lobby modal a player can open, opened through GameProvider's E2E hook, as a guest who
  // finished Meet your cat. What the backend sends is in the fixtures above.
  const MODALS = ["QUESTS", "PACKS", "PROFILE", "LEADERBOARD", "CATS", "INVITE", "CONTROL_SETTINGS", "SUPPORT", "CODEX", "SPIN_WHEEL"];

  test("no tone, rate or (app build) chain words in any lobby modal", async ({ page, backend }) => {
    test.setTimeout(240_000);
    const api = mockGoldenBackend(backend);
    await routeStatic(page);
    // Start as a guest who already met their cat, so the lobby is up.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = { user: { uid: "e2e-copy-guest", isAnonymous: true } };
      (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
      try {
        window.localStorage.setItem("tt.tailsExplainer.v1", "1");
      } catch {
        // storage blocked: the explainer may show, which the scan covers too
      }
    });
    backend.on("GET", "/user/profile", {
      body: { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g09", onboarding: { state: "done" }, cat: STARTER, cats: [STARTER] },
    });
    await gotoAndSettle(page, "/game", 2500);
    await expect(page.getByTestId("rescue-tile")).toBeVisible({ timeout: 30_000 });
    await expectCleanCopy(page, "lobby");

    const problems: string[] = [];
    for (const modal of MODALS) {
      await page.evaluate((m) => (window as unknown as { __TT_E2E_GAME__: { openModal: (x: string | null) => void } }).__TT_E2E_GAME__.openModal(m), modal);
      await page.waitForTimeout(1200);
      problems.push(...(await copyFindings(page, modal, { app: APP_BUILD })));
      if (SHOTS) await shot(page, `copy-${modal.toLowerCase()}`);
      await page.evaluate(() => (window as unknown as { __TT_E2E_GAME__: { openModal: (x: string | null) => void } }).__TT_E2E_GAME__.openModal(null));
      await page.waitForTimeout(300);
    }
    expect(problems).toEqual([]);
    expect(api.lives()).toEqual([]);
  });
});
