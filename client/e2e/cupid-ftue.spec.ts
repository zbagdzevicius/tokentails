import type { Locator, Page, Request } from "@playwright/test";
import { mkdirSync } from "fs";
import { type BackendMock, expect, test } from "./fixtures";

/**
 * Cupid Cat first run (plan G10 "Cupid", decision #96), from the Meet your cat hand-off:
 *
 *   - day 1 opens behind the full RunGate; the clock does not count behind it;
 *   - the first input begins the run; the tutorial tour plays and the clock holds through it;
 *   - the starter shield is on (visible chip) and absorbs the first hit;
 *   - a clear sends exactly one `/live` save with `outcome: "won"`;
 *   - PLAY AGAIN shows the pill gate and does not replay the tutorial;
 *   - the gate's Back (and the HUD) stay clickable above the canvas.
 *
 * Firebase is faked in the page (`__TT_E2E_AUTH__`, as in meet-your-cat.spec.ts) and the backend
 * is mocked. Screenshots go to `E2E_SHOTS` when it is set; they are evidence, never compared.
 */

const SHOTS = process.env.E2E_SHOTS || "";

const STARTER_CAT = {
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
  cat: { ...STARTER_CAT, _id: "guest-starter" },
  cats: [],
};

interface CupidBackend {
  lives: () => Array<Record<string, unknown>>;
}

function mockBackend(backend: BackendMock): CupidBackend {
  let session = false;
  let committed: Record<string, unknown> | null = null;
  const lives: Array<Record<string, unknown>> = [];
  let seasonEvent: number[] = [];
  let seasonEventCleared: number[] = [];
  const profile = () => {
    const base = committed
      ? { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat: committed, cats: [committed], onboarding: { state: "done", version: 1 } }
      : session
        ? { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat: STARTER_CAT, cats: [STARTER_CAT] }
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
      const body = JSON.parse(request.postData() || "{}");
      committed = { ...STARTER_CAT, name: body.skipped ? "Scout" : String(body.name || "Scout"), starterBreed: String(body.breed || "SCOUT") };
      return { status: 201, body: { success: true, cat: committed, onboarding: { state: "done", skipped: !!body.skipped, version: 1 } } };
    })
    .on("GET", /^\/blessing\/featured(\?.*)?$/, { body: [] })
    .on("GET", "/blessing/featured/names", { body: { names: [] } })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/cats/, { body: [STARTER_CAT] })
    .on("POST", "/user/catbassadors/live", (request: Request) => {
      const body = JSON.parse(request.postData() || "{}");
      lives.push(body);
      if (body.type === "PIXEL_RESCUE") {
        seasonEvent = [Math.max(seasonEvent[0] ?? 0, Number(body.points) || 0)];
        if (body.outcome === "won") seasonEventCleared = [1];
      }
      return { status: 201, body: profile() };
    })
    .on("GET", /^\/user\/airdrop/, { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } });
  return { lives: () => lives };
}

async function useFakeFirebase(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = {};
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  await page.screenshot({ path: `${SHOTS}/${name}-${size?.width}.png` });
}

interface Snapshot {
  level: string;
  time: number;
  clockBegun: boolean;
  clockRunning: boolean;
  pauseReasons: string[];
  tutorialActive: boolean;
  shieldActive: boolean;
  shieldSource: string | null;
  health: number | null;
  gameEnded: boolean;
  hintsShown: string[];
}

type CupidScene = Phaser.Scene & {
  ftueSnapshot: () => Snapshot;
  takeHazardHit: () => void;
  winGame: () => void;
};

/** Runs `fn` against the live Cupid scene in the page. */
async function withScene<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((body) => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    const game = games.find((g) => g.scene.getScenes(true).some((s) => s.sys.settings.key === "PixelRescueScene"));
    const scene = game?.scene.getScene("PixelRescueScene") as unknown as CupidScene | undefined;
    if (!scene) return null as T;
    return new Function("scene", body)(scene) as T;
  }, fn);
}

/** Nothing covers `locator`: the hit target at its centre is inside `selector`. */
async function isOnTop(page: Page, locator: Locator, selector: string): Promise<boolean> {
  const box = await locator.boundingBox();
  if (!box) return false;
  return page.evaluate(
    ({ x, y, selector }) => !!document.elementFromPoint(x, y)?.closest(selector),
    { x: box.x + box.width / 2, y: box.y + box.height / 2, selector },
  );
}

const snapshot = (page: Page) => withScene<Snapshot | null>(page, "return scene.ftueSnapshot ? scene.ftueSnapshot() : null;");

/** Meet your cat to the end (no featured cats), which hands off to Cupid Cat day 1. */
async function meetAndHandOff(page: Page) {
  await page.goto("/game", { waitUntil: "load" });
  const dialog = page.getByTestId("meet-your-cat");
  await expect(dialog).toHaveAttribute("data-step", "awaits", { timeout: 30_000 });
  await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByTestId("meet-name-input").fill("Nimbus");
  await page.getByRole("button", { name: "MEET NIMBUS" }).click();
  await expect(dialog).toHaveAttribute("data-step", "reveal", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "CONTINUE" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await expect(dialog).toHaveCount(0);
}

async function waitForReady(page: Page) {
  await expect
    .poll(async () => (await snapshot(page))?.health ?? null, { timeout: 45_000, message: "the cat spawned on day 1" })
    .not.toBeNull();
}

test.describe("Cupid Cat first run (G10)", () => {
  // Cupid Cat is seasonal (January to March, components/game/seasons.ts): run inside its season.
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2027-02-14T12:00:00") });
  });
  test.use({ allowUnmocked: true });

  test("hand-off to day 1: gate, held clock through the tutorial, starter shield, one won save, no tutorial on retry", async ({ page, backend }) => {
    test.setTimeout(180_000);
    const api = mockBackend(backend);
    await useFakeFirebase(page);
    // Meet your cat, then the hand-off opens Cupid Cat day 1 (decision #96).
    await meetAndHandOff(page);
    await waitForReady(page);
    // Level map skipped (first-time routing): no Day tiles behind the gate.
    await expect(page.getByTestId("cupid-level-1")).toHaveCount(0);

    // Full gate on the first visit, with the Cupid copy.
    const gate = page.getByTestId("run-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toHaveAttribute("data-variant", "full");
    await expect(gate).toContainText("Cupid Cat · Day 1");
    await expect(page.getByTestId("cupid-shield-chip")).toContainText("Starter shield");
    await shot(page, "01-gate");

    // Behind the gate the clock does not count.
    const before = await snapshot(page);
    expect(before?.clockBegun).toBe(false);
    expect(before?.shieldActive).toBe(true);
    expect(before?.shieldSource).toBe("starter");
    // Nothing is spent behind the gate: no shield hint yet, no "Replay tutorial" before a tour.
    expect(before?.hintsShown).toEqual([]);
    await expect(page.getByTestId("cupid-replay-tutorial")).toHaveCount(0);
    await page.waitForTimeout(2500);
    expect((await snapshot(page))?.time).toBe(before?.time);

    // The first input begins the run and the tour plays; the clock holds through it.
    await page.keyboard.press("Space");
    await expect(gate).toHaveCount(0);
    await expect.poll(async () => (await snapshot(page))?.tutorialActive, { timeout: 5_000 }).toBe(true);
    const atBegin = await snapshot(page);
    expect(atBegin?.clockBegun).toBe(true);
    expect(atBegin?.pauseReasons).toContain("tutorial");
    await page.waitForTimeout(1200);
    await shot(page, "02-tutorial");
    await page.waitForTimeout(2300);
    const during = await snapshot(page);
    expect(during?.tutorialActive).toBe(true);
    expect(during?.time).toBe(atBegin?.time);

    await expect.poll(async () => (await snapshot(page))?.tutorialActive, { timeout: 40_000 }).toBe(false);
    // Now the clock counts, and the starter-shield line shows once the player can act.
    const afterTour = await snapshot(page);
    expect(afterTour?.pauseReasons).not.toContain("tutorial");
    expect(afterTour?.hintsShown).toContain("shield");
    await expect.poll(async () => (await snapshot(page))?.time ?? 0, { timeout: 5_000 }).toBeLessThan(afterTour!.time);
    await shot(page, "03-playing");

    // A first hit is absorbed by the starter shield: health unchanged, shield gone.
    const health = (await snapshot(page))?.health;
    await withScene(page, "scene.takeHazardHit(); return true;");
    const hit = await snapshot(page);
    expect(hit?.shieldActive).toBe(false);
    expect(hit?.health).toBe(health);
    await expect(page.getByTestId("cupid-shield-chip")).toHaveCount(0);
    // The same hazard on the next frames does not land during the grace window.
    await withScene(page, "scene.takeHazardHit(); return true;");
    expect((await snapshot(page))?.health).toBe(health);

    // A clear sends exactly one /live save, outcome won.
    await withScene(page, "scene.winGame(); return true;");
    await expect.poll(() => api.lives().length, { timeout: 10_000 }).toBe(1);
    await page.waitForTimeout(1000);
    expect(api.lives()).toHaveLength(1);
    expect(api.lives()[0]).toMatchObject({ type: "PIXEL_RESCUE", level: "1", outcome: "won" });
    await shot(page, "04-cleared");

    // PLAY AGAIN: the pill gate, and no tutorial on the retry.
    await page.getByRole("button", { name: "PLAY AGAIN" }).click();
    await expect(gate).toBeVisible({ timeout: 20_000 });
    await expect(gate).toHaveAttribute("data-variant", "pill");
    await waitForReady(page);
    await shot(page, "05-retry-pill");
    await page.keyboard.press("Space");
    await expect(gate).toHaveCount(0);
    await page.waitForTimeout(1500);
    const retry = await snapshot(page);
    expect(retry?.clockBegun).toBe(true);
    expect(retry?.tutorialActive).toBe(false);
    // Cleared now: no starter shield on the retry.
    expect(retry?.shieldActive).toBe(false);

    // "Replay tutorial" is there on request.
    await page.getByTestId("cupid-replay-tutorial").click();
    await expect.poll(async () => (await snapshot(page))?.tutorialActive, { timeout: 5_000 }).toBe(true);
  });

  test("the gate's Back stays clickable above the canvas and returns to the level map with START HERE", async ({ page, backend }) => {
    test.setTimeout(150_000);
    const api = mockBackend(backend);
    await useFakeFirebase(page);
    await meetAndHandOff(page);
    await waitForReady(page);
    const back = page.getByTestId("run-gate-back");
    await expect(back).toBeVisible();
    // Nothing covers it: the hit target at its centre is the button itself.
    expect(await isOnTop(page, back, '[data-testid="run-gate-back"]')).toBe(true);
    // The level's close button sits above the gate and the canvas too.
    const close = page.getByRole("button", { name: "Leave level" });
    await expect(close).toBeVisible();
    expect(await isOnTop(page, close, '[aria-label="Leave level"]')).toBe(true);
    await back.click();
    await expect(page.getByTestId("cupid-level-1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("cupid-start-here")).toHaveText("START HERE");
    await expect(page.getByTestId("cupid-level-2")).toHaveAttribute("data-state", "locked");
    await shot(page, "06-level-map");

    // Mid-run, the close button still answers and takes the player back to the map, no save.
    await page.getByTestId("cupid-level-1").click();
    await waitForReady(page);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await snapshot(page))?.clockBegun, { timeout: 5_000 }).toBe(true);
    expect(await isOnTop(page, close, '[aria-label="Leave level"]')).toBe(true);
    await close.click();
    await expect(page.getByTestId("cupid-level-1")).toBeVisible({ timeout: 10_000 });
    expect(api.lives()).toHaveLength(0);

    // Esc mid-run reaches the level map too (plan G10), and saves nothing.
    await page.getByTestId("cupid-level-1").click();
    await waitForReady(page);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await snapshot(page))?.clockBegun, { timeout: 5_000 }).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cupid-level-1")).toBeVisible({ timeout: 10_000 });
    expect(api.lives()).toHaveLength(0);
  });
});


/**
 * Judge path (plan section 6.1, decision #96): `game_loaded` to the first clear of Cupid level 1,
 * target <= 90 s median. Opt-in (`CUPID_JUDGE=1`): it plays the whole level once, about a minute.
 *
 * A scripted player drives the real cursor keys of the scene (no teleports, no hit skipping): it
 * reads the gate for READ_MS, presses Space, sits through the full first-visit tutorial, then
 * follows a hand-made route of standing points (heart, cage, portal). The result is logged in
 * docs/plans/alignment-log/5b.md. A human is slower than the route and faster than nothing; the
 * number is a floor for a competent first-timer who already knows the way, not a median.
 */
const JUDGE_READ_MS = 2000;

/** In-page route follower. y is the cat's standing centre on each platform. */
const JUDGE_BOT = `// Cupid judge-path bot: follows standing targets [{x, y, hold?, wait?, jd?}] with real key presses on the
// scene's cursor keys (the same Key objects the keyboard drives). y is the cat's standing centre.
(scene) => {
  const bot = { targets: [], i: 0, log: [], trace: [], done: false, upUntil: 0, landedAt: 0, waitUntil: 0 };
  window.__cupidBot = bot;
  const origStop = scene.pushStop.bind(scene);
  scene.pushStop = (reason) => { bot.stop = { reason, t: Math.round(scene.time.now), i: bot.i, clock: scene.clock.elapsed, left: scene.clock.time }; return origStop(reason); };
  const set = (key, down) => {
    if (!key) return;
    if (down && !key.isDown) { key.isDown = true; key.isUp = false; key._justDown = true; key._justUp = false; key.timeDown = scene.time.now; }
    else if (!down && key.isDown) { key.isDown = false; key.isUp = true; key._justUp = true; key._justDown = false; }
  };
  const solidAt = (wx, wy) => {
    const g = scene.groundLayer.getTileAtWorldXY(wx, wy);
    const p = scene.platformsLayer.getTileAtWorldXY(wx, wy);
    return !!((g && g.collides) || (p && p.collides));
  };
  scene.events.on("preupdate", () => {
    const c = scene.cat;
    if (!c || !c.sprite || !c.sprite.body || !bot.targets.length || bot.done) {
      if (c && c.cursors) { set(c.cursors.left, false); set(c.cursors.right, false); set(c.cursors.up, false); }
      return;
    }
    const s = c.sprite, b = s.body, now = scene.time.now;
    const ground = b.blocked.down;
    const t = bot.targets[bot.i];
    const dx = t.x - s.x;
    if (ground && !bot.wasGround) bot.landedAt = now;
    bot.wasGround = ground;
    if (ground && Math.abs(dx) < (t.tol || 18) && Math.abs(s.y - t.y) < 10) {
      if (!bot.waitUntil) bot.waitUntil = now + (t.wait || 0);
      if (now >= bot.waitUntil && (!t.until || t.until(scene))) {
        bot.log.push({ i: bot.i, t: Math.round(now), x: Math.round(s.x), y: Math.round(s.y) });
        bot.i++; bot.waitUntil = 0;
        if (bot.i >= bot.targets.length) { bot.done = true; return; }
      }
      set(c.cursors.left, false); set(c.cursors.right, false); set(c.cursors.up, false);
      return;
    }
    bot.waitUntil = 0;
    const dir = Math.sign(dx);
    const near = Math.abs(dx) < (ground ? 8 : 10);
    set(c.cursors.right, !near && dir > 0);
    set(c.cursors.left, !near && dir < 0);
    const above = s.y - t.y > 8;
    const jd = t.jd || 150;
    const edgeAhead = ground && Math.abs(dx) > 40 && !solidAt(s.x + dir * 22, s.y + 24) && t.y <= s.y + 4;
    const blocked = ground && ((dir > 0 && b.blocked.right) || (dir < 0 && b.blocked.left));
    const wantJump = ground && now - bot.landedAt > 40 && ((above && Math.abs(dx) < jd) || edgeAhead || blocked || t.wall);
    if (wantJump && now >= bot.upUntil) bot.upUntil = now + (t.hold || 300);
    if (t.wall && !ground && (b.blocked.left || b.blocked.right)) bot.upUntil = Math.max(bot.upUntil, now + 120);
    set(c.cursors.up, now < bot.upUntil);
  });
  scene.time.addEvent({ delay: 100, loop: true, callback: () => { const c = scene.cat; if (c && c.sprite) bot.trace.push([Math.round(c.sprite.x), Math.round(c.sprite.y), c.sprite.body && c.sprite.body.blocked.down ? 1 : 0, bot.i]); } });
  return true;
}
`;

/** Day 1 route: up the right staircase to the heart, down to the cage, back over the top to the portal room. */
const DAY1_ROUTE = `[{x:128,y:-236},{x:272,y:-300},{x:464,y:-364},{x:624,y:-428},{x:784,y:-492},{x:944,y:-556},{x:1136,y:-620},{x:1328,y:-684},{x:1600,y:-684},{x:1900,y:-748},{x:2128,y:-684},{x:2290,y:-588},{x:2400,y:-492},{x:2544,y:-428},{x:2672,y:-492},{x:2768,y:-556},{x:2660,y:-492},{x:2540,y:-428},{x:2478,y:-268},{x:2320,y:-268},{x:2160,y:-332,tol:30,until:(s)=>s.catsRescued>=1},{x:2030,y:-236},{x:1900,y:-204},{x:1790,y:-140},{x:1650,y:-140},{x:1504,y:-204},{x:1344,y:-268},{x:1216,y:-332},{x:1088,y:-396},{x:960,y:-460},{x:784,y:-492},{x:624,y:-428},{x:464,y:-364},{x:272,y:-300},{x:80,y:-364},{x:-96,y:-396},{x:-256,y:-460},{x:-384,y:-524},{x:-780,y:-524},{x:-834,y:-300,tol:12},{x:-575,y:-300}]`;

test.describe("Cupid Cat judge path (G10, section 6.1)", () => {
  test.use({ allowUnmocked: true });

  test("game_loaded to the first clear of day 1 with the scripted route", async ({ page, backend }, testInfo) => {
    test.skip(!process.env.CUPID_JUDGE, "opt-in: CUPID_JUDGE=1 (plays the level once)");
    test.setTimeout(240_000);
    const api = mockBackend(backend);
    await useFakeFirebase(page);
    await page.addInitScript(() => {
      const marks: Record<string, number> = {};
      (window as unknown as { __judge: Record<string, number> }).__judge = marks;
      for (const name of ["GAME_LOADED", "RUN_BEGIN", "GAME_STOP"]) {
        window.addEventListener(name, () => {
          if (marks[name] === undefined) marks[name] = performance.now();
        });
      }
    });
    await meetAndHandOff(page);
    await waitForReady(page);
    await withScene(page, `(${JUDGE_BOT})(scene); window.__cupidBot.targets = ${DAY1_ROUTE}; return true;`);
    await page.waitForTimeout(JUDGE_READ_MS);
    await page.keyboard.press("Space");
    await expect.poll(() => api.lives().length, { timeout: 180_000, intervals: [500] }).toBe(1);
    const marks = await page.evaluate(() => (window as unknown as { __judge: Record<string, number> }).__judge);
    const bot = await page.evaluate(() => {
      const b = (window as unknown as { __cupidBot: { stop?: { reason: string; clock: number }; i: number; trace: number[][] } }).__cupidBot;
      return { stop: b.stop, i: b.i, tail: b.trace.slice(-12) };
    });
    const stop = bot.stop;
    expect(stop?.reason, `route stalled at point ${bot.i}: ${JSON.stringify(bot.tail)}`).toBe("portal");
    const total = (marks.GAME_STOP - marks.GAME_LOADED) / 1000;
    const result = {
      project: testInfo.project.name,
      gameLoadedToClearS: Math.round(total * 10) / 10,
      gameLoadedToRunBeginS: Math.round(((marks.RUN_BEGIN - marks.GAME_LOADED) / 1000) * 10) / 10,
      runClockS: stop?.clock,
    };
    console.log(`[cupid-judge] ${JSON.stringify(result)}`);
    expect(total, "judge path target: first clear within 90 s of game_loaded").toBeLessThanOrEqual(90);
  });
});
