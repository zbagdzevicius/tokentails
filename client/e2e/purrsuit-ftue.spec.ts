import { readFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
// Type-only: brings in the global `Phaser` namespace for the page.evaluate callbacks.
import type {} from "phaser";
import { expect, gotoAndSettle, test, type BackendMock } from "./fixtures";

/**
 * Purrsuit first run (plan G10, task 5a):
 *   - a new player lands on 1-1's full start gate (first-time routing), the close X stays
 *     clickable above it, Tab reaches Back, Enter on Back and Esc go to the level map;
 *   - the first input begins the run without a jump;
 *   - at the first spike run the world freezes with "JUMP!"; the next jump clears it, in scripted
 *     trials at 30, 60 and 120 fps (requestAnimationFrame throttled);
 *   - uncleared 1-1 cannot be failed: hits spend a Paw Guard (LIFE_LOST), never end the run;
 *   - the first clear sends exactly one `/live` with `outcome: "won"`.
 *
 * The player is a fake signed-in account (Firebase REST and the backend answered in the browser),
 * as in render-foundation.spec.ts. Scenes are read through the dev/E2E-only `window.__ttGames`
 * hook and the first-run store through `window.__ttFtue`.
 */

const CDN = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets";
const SHOTS =
  process.env.E2E_SHOTS_DIR ||
  "/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/scratchpad/build/5a";
/** Trials per frame rate (the plan's acceptance runs 100; CI keeps the default small). */
const TRIALS = Number(process.env.E2E_PURRSUIT_TRIALS || 3);

const PLAYER = {
  _id: "64e2e0000000000000000c01",
  name: "Luna",
  spriteImg: `${CDN}/EGGY/base.png`,
  catImg: `${CDN}/EGGY/base.png`,
  type: "FIRE",
  tier: "COMMON",
  status: { EAT: 4, PLAY: 4, SLEEP: 4 },
  blessing: null,
  resqueStory: "",
};

/** A new player: nothing played, nothing cleared, onboarding done. */
const PROFILE = {
  _id: "64e2e0000000000000000p01",
  name: "E2E",
  streak: 0,
  cat: PLAYER,
  cats: [PLAYER],
  quests: [],
  codex: [],
  catnipChaos: [],
  catnipChaosCleared: [],
  match3: [],
  wallets: {},
  airdropRewardsClaimed: [],
  onboarding: { state: "done" },
};

function firebaseApiKey(): string {
  const source = readFileSync(join(__dirname, "..", "context", "FirebaseAuthContext.tsx"), "utf8");
  const match = /apiKey:\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("Firebase apiKey not found in FirebaseAuthContext.tsx");
  return match[1];
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const FAKE_ID_TOKEN = `${b64({ alg: "none", typ: "JWT" })}.${b64({
  exp: 4102444800,
  iat: 1700000000,
  auth_time: 1700000000,
  sub: "e2e-uid",
  user_id: "e2e-uid",
  aud: "e2e",
  iss: "e2e",
  firebase: { sign_in_provider: "password" },
})}.e2e`;

interface RunLog {
  type: string;
  detail: unknown;
  t: number;
}

async function setup(page: Page, backend: BackendMock, options: { fps?: number; liveBodies?: unknown[] } = {}) {
  const apiKey = firebaseApiKey();
  await page.addInitScript(
    ({ key, user, fps }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__TT_E2E__ = true;
      const log: { type: string; detail: unknown; t: number }[] = [];
      w.__runLog = log;
      for (const type of ["RUN_READY", "RUN_BEGIN", "GAME_RESTART", "LIFE_LOST", "RUN_HINT", "RUN_HINT_DONE", "GAME_STOP"]) {
        window.addEventListener(type, (event) => log.push({ type, detail: (event as CustomEvent).detail, t: performance.now() }));
      }
      localStorage.setItem(key, JSON.stringify(user));
      if (fps) {
        // Throttled requestAnimationFrame: Phaser's loop runs at `fps` with real timestamps.
        const frame = 1000 / fps;
        let last = performance.now();
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
          const next = Math.max(0, last + frame - performance.now());
          return window.setTimeout(() => {
            last = performance.now();
            callback(last);
          }, next) as unknown as number;
        };
        window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
      }
    },
    {
      key: `firebase:authUser:${apiKey}:[DEFAULT]`,
      fps: options.fps ?? 0,
      user: {
        uid: "e2e-uid",
        email: "player@e2e.invalid",
        emailVerified: true,
        isAnonymous: false,
        providerData: [],
        stsTokenManager: { refreshToken: "e2e-refresh", accessToken: FAKE_ID_TOKEN, expirationTime: 4102444800000 },
        createdAt: "1700000000000",
        lastLoginAt: "1700000000000",
        apiKey,
        appName: "[DEFAULT]",
      },
    },
  );
  await page.route(/googleapis\.com\/v1\/(accounts:lookup|token)/, (route) => {
    if (route.request().url().includes("accounts:lookup")) {
      return route.fulfill({
        json: { users: [{ localId: "e2e-uid", email: "player@e2e.invalid", emailVerified: true, providerUserInfo: [] }] },
      });
    }
    return route.fulfill({
      json: { id_token: FAKE_ID_TOKEN, access_token: FAKE_ID_TOKEN, refresh_token: "e2e-refresh", expires_in: "3600" },
    });
  });
  backend
    .on("GET", "/user/profile", { body: PROFILE })
    .on("GET", "/user/cats", { body: [PLAYER] })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: 1 })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    // The lobby's impact strip (other tasks): not part of this spec.
    .on("GET", /^\/impact/, { status: 404, body: {} })
    // The end-of-run panel's rescue-treat chip (other tasks).
    .on("GET", "/shelter/donate/status", { status: 404, body: {} })
    .on("POST", "/user/catbassadors/live", (request) => {
      const body = JSON.parse(request.postData() || "{}");
      options.liveBodies?.push(body);
      const cleared = Array(97).fill(0);
      if (body.outcome === "won") cleared[1] = 1;
      return { body: { ...PROFILE, catnipChaos: [0, body.points], catnipChaosCleared: cleared } };
    });
}

/** Lobby -> PLAY -> PURRSUIT. A new player goes straight to 1-1 (first-time routing). */
async function openPurrsuit(page: Page) {
  await gotoAndSettle(page, "/game", 2500);
  await page.getByText("PLAY", { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText("PURRSUIT", { exact: true }).filter({ visible: true }).first().click();
}

const runLog = (page: Page) => page.evaluate(() => (window as unknown as { __runLog: RunLog[] }).__runLog.slice());
const count = async (page: Page, type: string) => (await runLog(page)).filter((entry) => entry.type === type).length;

interface CatState {
  x: number;
  y: number;
  grounded: boolean;
  hold: string | null;
  freezeX: number;
  firstSpike: { x0: number; x1: number } | null;
  paused: boolean;
}

const catState = (page: Page) =>
  page.evaluate((): CatState | null => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    const scene = games.map((g) => g.scene.getScene("CatnipChaosScene")).find(Boolean) as unknown as
      | (Phaser.Scene & {
          cat?: { sprite: Phaser.Physics.Arcade.Sprite };
          hold: string | null;
          firstSpikeFreezeX: number;
          firstSpike: { x0: number; x1: number } | null;
        })
      | undefined;
    if (!scene?.cat?.sprite?.body) return null;
    const body = scene.cat.sprite.body as Phaser.Physics.Arcade.Body;
    return {
      x: scene.cat.sprite.x,
      y: scene.cat.sprite.y,
      grounded: body.blocked.down,
      hold: scene.hold,
      freezeX: scene.firstSpikeFreezeX,
      firstSpike: scene.firstSpike,
      paused: scene.physics.world.isPaused,
    };
  });

async function waitForGate(page: Page) {
  await expect(page.getByTestId("run-gate")).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await catState(page))?.hold, { timeout: 30_000 }).toBe("gate");
}

/** Restarts the level in place (GAME_RESTART) and waits for the new attempt's RUN_READY. */
async function restartLevel(page: Page) {
  const ready = await count(page, "RUN_READY");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("GAME_RESTART", { detail: { isRestart: true } })));
  await expect.poll(() => count(page, "RUN_READY"), { timeout: 30_000 }).toBe(ready + 1);
  await expect.poll(async () => (await catState(page))?.hold, { timeout: 10_000 }).toBe("gate");
}

/** Space on the page body (not on a control). */
async function pressJump(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.down("Space");
  await page.waitForTimeout(60);
  await page.keyboard.up("Space");
}

test.describe("Purrsuit first run (G10)", () => {
  test.describe.configure({ mode: "default" });

  test("new player: full gate on 1-1, close clickable, Tab and Enter reach Back, Esc goes to the map", async ({ page, backend }) => {
    test.setTimeout(120_000);
    await setup(page, backend);
    await openPurrsuit(page);
    await waitForGate(page);
    const gate = page.getByTestId("run-gate");
    await expect(gate).toHaveAttribute("data-variant", "full");
    await expect(gate).toHaveAttribute("role", "group");
    await expect(gate.getByRole("heading", { name: "Level 1-1" })).toBeVisible();
    await expect(page.getByText(/Paw Guard/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/gate-${test.info().project.name}.png` });

    // The card does not take taps (only Back does); the X above it stays clickable.
    expect(await gate.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    const close = page.getByRole("button", { name: "Leave level" });
    await expect(close).toBeVisible();
    const box = (await close.boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(hit).toBe("Leave level");

    // Tab reaches Back; Enter on it goes to the level map, and the run never began.
    const back = page.getByTestId("run-gate-back");
    for (let i = 0; i < 6 && !(await back.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("purrsuit-level-11")).toBeVisible({ timeout: 15_000 });
    expect(await count(page, "RUN_BEGIN")).toBe(0);
    await expect(page.getByTestId("purrsuit-start-here")).toBeVisible();
    await expect(page.getByTestId("purrsuit-level-01")).toHaveAttribute("data-locked", "true");
    await expect(page.getByTestId("purrsuit-level-12")).toHaveAttribute("data-locked", "true");
    await expect(page.getByText(/coming soon|new levels/i)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/levels-${test.info().project.name}.png`, fullPage: false });

    // Esc at the gate also goes to the map; the close X does too.
    await page.getByTestId("purrsuit-level-11").click();
    await waitForGate(page);
    await expect(page.getByTestId("run-gate")).toHaveAttribute("data-variant", "pill");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("purrsuit-level-11")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("purrsuit-level-11").click();
    await waitForGate(page);
    await page.getByRole("button", { name: "Leave level" }).click();
    await expect(page.getByTestId("purrsuit-level-11")).toBeVisible({ timeout: 15_000 });
  });

  for (const fps of [30, 60, 120]) {
    test(`first spike: the prompted jump clears it at ${fps} fps`, async ({ page, backend }) => {
      test.skip(test.info().project.name !== "desktop-1440" && fps !== 60, "frame-rate trials run once, on desktop");
      test.setTimeout(60_000 + TRIALS * 40_000);
      await setup(page, backend, { fps });
      await openPurrsuit(page);
      await waitForGate(page);

      for (let trial = 0; trial < TRIALS; trial++) {
        if (trial > 0) {
          // A fresh first visit: forget the first-run state and restart the level in place.
          await page.evaluate(() => (window as unknown as { __ttFtue: { reset(): void } }).__ttFtue.reset());
          await restartLevel(page);
        }
        const begins = await count(page, "RUN_BEGIN");
        const lives = await count(page, "LIFE_LOST");
        const start = (await catState(page))!;
        await pressJump(page);
        await expect.poll(() => count(page, "RUN_BEGIN"), { timeout: 10_000 }).toBe(begins + 1);
        // The begin input is consumed: the cat starts running without jumping.
        await page.waitForTimeout(150);
        const afterBegin = (await catState(page))!;
        expect(afterBegin.y, "no jump on the begin input").toBeGreaterThanOrEqual(start.y - 2);

        await expect.poll(async () => (await catState(page))?.hold, { timeout: 20_000 }).toBe("prompt");
        const frozen = (await catState(page))!;
        expect(frozen.paused).toBe(true);
        expect(frozen.x).toBeCloseTo(frozen.freezeX, 3);
        await expect(page.getByTestId("run-hint")).toHaveAttribute("data-hint", "first-spike");
        if (trial === 0) await page.screenshot({ path: `${SHOTS}/prompt-${fps}fps-${test.info().project.name}.png` });

        await pressJump(page);
        const spike = frozen.firstSpike!;
        await expect
          .poll(async () => {
            const state = await catState(page);
            return !!state && state.x > spike.x1 + 24 && state.grounded;
          }, { timeout: 15_000 })
          .toBe(true);
        expect(await count(page, "LIFE_LOST"), `trial ${trial}: no Paw Guard spent on the first spike`).toBe(lives);
      }
    });
  }

  test("uncleared 1-1 cannot be failed; the first clear sends one /live with outcome won", async ({ page, backend }) => {
    test.setTimeout(150_000);
    const liveBodies: unknown[] = [];
    await setup(page, backend, { liveBodies });
    await openPurrsuit(page);
    await waitForGate(page);
    // Skip the first-spike prompt for this test: it is about the hits after it.
    await page.evaluate(() => (window as unknown as { __ttFtue: { markHintDone(m: string, h: string): void } }).__ttFtue.markHintDone("CATNIP_CHAOS", "first-spike"));
    await restartLevel(page);
    await pressJump(page);

    // No input: the cat runs into spikes again and again. Each hit spends a guard; the run goes on.
    for (let hit = 1; hit <= 5; hit++) {
      await expect.poll(() => count(page, "LIFE_LOST"), { timeout: 20_000 }).toBe(hit);
      await expect.poll(async () => (await catState(page))?.hold, { timeout: 5_000 }).toBe("respawn");
      if (hit === 1) await page.screenshot({ path: `${SHOTS}/respawn-${test.info().project.name}.png` });
      await pressJump(page);
    }
    expect(await count(page, "GAME_STOP"), "uncleared 1-1 never ends on a hit").toBe(0);
    await expect(page.getByTestId("paw-guard-hud")).toContainText("×∞");

    // Carry the cat to the flag (the test is about the save, not the gauntlet).
    await page.evaluate(() => {
      const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
      const scene = games.map((g) => g.scene.getScene("CatnipChaosScene")).find(Boolean) as unknown as Phaser.Scene & {
        cat: { sprite: Phaser.Physics.Arcade.Sprite };
        physicsLayer: Phaser.Tilemaps.TilemapLayer;
      };
      // The flag tile (162 or 192) sits on top of the last box.
      const flag = scene.physicsLayer.findTile((tile) => tile.index === 162 || tile.index === 192)!;
      const body = scene.cat.sprite.body as Phaser.Physics.Arcade.Body;
      body.reset(flag.getCenterX(), flag.getCenterY());
    });
    if ((await catState(page))?.hold === "respawn") await pressJump(page);
    await expect.poll(() => liveBodies.length, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(1500);
    expect(liveBodies).toHaveLength(1);
    expect(liveBodies[0]).toMatchObject({ type: "CATNIP_CHAOS", level: "11", outcome: "won" });
    await expect(page.getByTestId("end-game-summary")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${SHOTS}/won-${test.info().project.name}.png` });
  });

  test("a hard death shows the DeathCard; RETRY restarts the level within 300 ms", async ({ page, backend }) => {
    test.setTimeout(120_000);
    test.skip(test.info().project.name !== "desktop-1440" && test.info().project.name !== "mobile-390", "two viewports");
    // 1-1 cleared and 1-2 not: 1-2 has three Paw Guards per attempt.
    const cleared = Array(97).fill(0);
    cleared[1] = 1;
    backend.on("GET", "/user/profile", { body: { ...PROFILE, catnipChaos: [0, 5], catnipChaosCleared: cleared } });
    await setup(page, backend);
    backend.on("GET", "/user/profile", { body: { ...PROFILE, catnipChaos: [0, 5], catnipChaosCleared: cleared } });
    await gotoAndSettle(page, "/game", 2500);
    await page.evaluate(() => (window as unknown as { __ttFtue: { markHintDone(m: string, h: string): void } }).__ttFtue.markHintDone("CATNIP_CHAOS", "first-spike"));
    await page.getByText("PLAY", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByText("PURRSUIT", { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByTestId("purrsuit-level-12")).not.toHaveAttribute("data-locked", "true", { timeout: 15_000 });
    await page.getByTestId("purrsuit-level-12").click();
    await waitForGate(page);
    await expect(page.getByTestId("paw-guard-hud")).toContainText("×3");
    await pressJump(page);
    for (let hit = 1; hit <= 3; hit++) {
      await expect.poll(() => count(page, "LIFE_LOST"), { timeout: 20_000 }).toBe(hit);
      await expect.poll(async () => (await catState(page))?.hold, { timeout: 5_000 }).toBe("respawn");
      await pressJump(page);
    }
    await expect(page.getByTestId("paw-guard-hud")).toContainText("×0");
    await expect(page.getByTestId("death-card")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("death-tip")).not.toBeEmpty();
    await page.screenshot({ path: `${SHOTS}/death-card-${test.info().project.name}.png` });
    const retry = page.getByRole("button", { name: "RETRY" });
    await expect(retry).toBeFocused();
    const readyBefore = await count(page, "RUN_READY");
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press("Enter");
    await expect.poll(() => count(page, "RUN_READY"), { timeout: 5_000 }).toBe(readyBefore + 1);
    const log = await runLog(page);
    const ready = log.filter((entry) => entry.type === "RUN_READY").pop()!;
    const restarts = log.filter((entry) => entry.type === "GAME_RESTART" && entry.t >= t0);
    expect(restarts).toHaveLength(1);
    console.log(`retry -> RUN_READY in ${Math.round(ready.t - t0)} ms`);
    expect(ready.t - t0, "RETRY reaches the next gate in 300 ms").toBeLessThan(300);
    await expect(page.getByTestId("death-card")).toHaveCount(0);
    await expect(page.getByTestId("run-gate")).toHaveAttribute("data-variant", "pill");
    await page.screenshot({ path: `${SHOTS}/retry-pill-${test.info().project.name}.png` });
  });
});
