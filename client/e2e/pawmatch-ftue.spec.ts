import { readFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
// Type-only: brings in the global `Phaser` namespace for the page.evaluate callbacks.
import type {} from "phaser";
import { expect, gotoAndSettle, openFirstLevel, test, type BackendMock } from "./fixtures";

/**
 * Paw Match first run (plan G10 "Paw Match", G12 "Tutorial rewrite", G14 "Paw Match hint"; task 5c).
 *
 * - Level select on a first visit points at level 1 with START HERE.
 * - The clock does not run before the first valid swap; that swap starts it.
 * - The tutorial plate (hint role, sentence case) sits inside the view and the safe area, and no
 *   two visible HUD boxes overlap; the glove is on screen within 100 ms of the tutorial and never
 *   covers the two glowing cells.
 * - A first valid swap is possible within 10 s by following the glove.
 * - A wrong swap writes "Follow the glow" into the plate with a red stroke.
 *
 * The player is a fake signed-in account (as in modals-b.spec.ts): Firebase's REST endpoints and
 * the backend are answered in the browser. The profile carries `match3Cleared: []`, so level 1 is
 * uncleared and the server rule applies.
 */

const SHOTS =
  process.env.E2E_SHOTS_DIR ||
  "/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/scratchpad/build/5c";
const CDN = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets";
const SAFE_AREA = { top: 47, bottom: 34, left: 0, right: 0 };

const PLAYER = {
  _id: "64e2e0000000000000000c51",
  name: "Luna",
  spriteImg: `${CDN}/EGGY/base.png`,
  catImg: "/cats/starters/scout/idle.gif",
  type: "FIRE",
  tier: "COMMON",
  status: { EAT: 4, PLAY: 4, SLEEP: 4 },
  blessing: null,
  resqueStory: "",
};
const PROFILE = {
  _id: "64e2e0000000000000000p51",
  name: "E2E",
  streak: 0,
  cat: PLAYER,
  cats: [PLAYER],
  quests: [],
  codex: [],
  catnipChaos: [],
  match3: [],
  match3Score: [],
  match3Cleared: [],
  wallets: {},
  airdropRewardsClaimed: [],
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

async function signInFakePlayer(page: Page, backend: BackendMock) {
  const apiKey = firebaseApiKey();
  await page.addInitScript(
    ({ key, user }) => {
      (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
      localStorage.setItem(key, JSON.stringify(user));
    },
    {
      key: `firebase:authUser:${apiKey}:[DEFAULT]`,
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
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: null, levelScore: 0, match3ScoreCount: 0 } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/cat/sale", { body: { tokentails: [], _meta: { _v: 1, generatedAt: "2026-09-30T12:00:00.000Z", shelters: [] } } })
    // The lobby's impact strip (G4): not under test here, so it gets the honest "unavailable" path.
    .on("GET", "/impact", { status: 503, body: { statusCode: 503, message: "Unavailable" } })
    .on("GET", "/impact/me", { status: 503, body: { statusCode: 503, message: "Unavailable" } })
    .on("POST", "/user/catbassadors/live", { body: PROFILE });
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TutorialSnapshot {
  message: string | null;
  messageState: "intro" | "wrong";
  inputKind: "touch" | "mouse";
  reducedMotion: boolean;
  family: string | null;
  stroke: string | null;
  plate: Rect | null;
  text: Rect | null;
  glove: (Rect & { angle: number; visible: boolean; alpha: number }) | null;
  ghosts: number;
  ghostAlphas: number[];
  cellsLanded: boolean;
  gloveDelayMs: number | null;
  hiddenHud: string[];
  move: { from: { row: number; col: number }; to: { row: number; col: number } } | null;
  comboVisible: boolean;
  missionVisible: boolean;
}
interface HudBox {
  key: string;
  text: string;
  family?: string;
  size?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface SceneState {
  timeLeft: number;
  moves: number;
  clockStarted: boolean;
  tutorialActive: boolean;
  tutorial: TutorialSnapshot | null;
  hint: { from: { row: number; col: number }; to: { row: number; col: number } } | null;
  idle: { lastActionAt: number; now: number; nextHintAt: number };
  hud: HudBox[];
  hudMode: string;
  safe: Rect;
  closeZone: Rect;
  boardRect: { x: number; y: number; tileSize: number };
}

/**
 * A HUD text's ink box. Phaser's text bounds are the font's whole line box (about 1.35 em for Bebas
 * Neue), so two stacked lines whose glyphs are 6 px apart still "overlap" by their empty padding.
 * The display faces are caps only: their cap height is about 0.7 em, so 0.85 em around the line's
 * centre keeps a margin that still catches a 2 to 3 px collision (5c review). Nunito (mixed case,
 * descenders) keeps 1.2 em.
 */
function inkBox(box: HudBox): Rect {
  const size = parseFloat(box.size ?? "") || box.h;
  const display = /Bebas|Passion/.test(box.family ?? "");
  const h = Math.min(box.h, size * (display ? 0.85 : 1.2));
  return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function sceneState(page: Page): Promise<SceneState> {
  const raw = await page.evaluate(() => (window as unknown as { render_game_to_text?: () => string }).render_game_to_text?.() ?? "null");
  return JSON.parse(raw) as SceneState;
}

/** Opens Paw Match level 1 from the lobby, through the level list. */
async function openLevelOne(page: Page, opts: { shot?: string } = {}) {
  await gotoAndSettle(page, "/game", 2500);
  await page.getByText("PLAY", { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText("PAW MATCH", { exact: true }).filter({ visible: true }).first().click();
  // First-time routing (G10, GameContext) sends a player with no clears straight to level 1 once the
  // profile is in; a tap before the profile lands still shows the level list with its "Start here"
  // marker. Either way the player reaches level 1's tutorial.
  const startHere = page.getByTestId("match3-start-here").first();
  await expect(startHere.or(page.locator("[data-scene-ready]")).first()).toBeVisible({ timeout: 15_000 });
  if (await startHere.isVisible()) {
    // The level list's first-visit marker, shown when the tap beat the profile.
    await expect(page.getByText("Start here", { exact: true }).first()).toBeVisible();
    if (opts.shot) await page.screenshot({ path: `${SHOTS}/${opts.shot}-levels.png` });
  }
  await openFirstLevel(page, "pawmatch", 15_000);
  await page.waitForFunction(
    () => {
      const hook = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
      if (!hook) return false;
      const state = JSON.parse(hook());
      return state.tutorialActive && state.tutorial?.glove;
    },
    null,
    { timeout: 30_000 },
  );
  // The canvas fades in on tt:scene-ready.
  await expect(page.locator("[data-scene-ready]")).toHaveAttribute("data-scene-ready", "true", { timeout: 5_000 });
}

/** Drags from one cell to another with the mouse, in page coordinates. */
async function dragCells(page: Page, state: SceneState, from: { row: number; col: number }, to: { row: number; col: number }) {
  const canvas = await page.locator("#match3-game-container canvas").boundingBox();
  if (!canvas) throw new Error("no canvas");
  const at = (cell: { row: number; col: number }) => ({
    x: canvas.x + state.boardRect.x + (cell.col + 0.5) * state.boardRect.tileSize,
    y: canvas.y + state.boardRect.y + (cell.row + 0.5) * state.boardRect.tileSize,
  });
  const a = at(from);
  const b = at(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
}

function checkLayout(state: SceneState, viewport: { width: number; height: number }) {
  const t = state.tutorial!;
  expect(t.plate, "the plate is drawn").not.toBeNull();
  const plate = t.plate!;
  // Inside the view and the safe area (above the home indicator, below the notch).
  expect(plate.x).toBeGreaterThanOrEqual(state.safe.x - 0.5);
  expect(plate.y).toBeGreaterThanOrEqual(state.safe.y - 0.5);
  expect(plate.x + plate.w).toBeLessThanOrEqual(Math.min(viewport.width, state.safe.x + state.safe.w) + 0.5);
  expect(plate.y + plate.h).toBeLessThanOrEqual(Math.min(viewport.height, state.safe.y + state.safe.h) + 0.5);
  // The text sits inside its plate (no clipping).
  const text = t.text!;
  expect(text.x).toBeGreaterThanOrEqual(plate.x - 0.5);
  expect(text.y).toBeGreaterThanOrEqual(plate.y - 0.5);
  expect(text.x + text.w).toBeLessThanOrEqual(plate.x + plate.w + 0.5);
  expect(text.y + text.h).toBeLessThanOrEqual(plate.y + plate.h + 0.5);
  // The plate is off the board and away from the X.
  const board = { x: state.boardRect.x, y: state.boardRect.y, w: 8 * state.boardRect.tileSize, h: 8 * state.boardRect.tileSize };
  expect(overlaps(plate, board), "plate over the board").toBe(false);
  expect(overlaps(plate, state.closeZone), "plate under the X").toBe(false);
  // No two visible HUD boxes overlap, and the plate covers none of them.
  const boxes = state.hud.filter((h) => h.key !== "burst").map((h) => ({ ...h, ...inkBox(h) }));
  for (let i = 0; i < boxes.length; i++) {
    expect(overlaps(plate, boxes[i]), `plate over ${boxes[i].key}`).toBe(false);
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i], boxes[j]), `${boxes[i].key} over ${boxes[j].key}: ${JSON.stringify(boxes[i])} ${JSON.stringify(boxes[j])}`).toBe(false);
    }
  }
  // The plate never hides the clock or the score (it may hide only stats that read zero).
  expect(t.hiddenHud).not.toContain("timer");
  expect(t.hiddenHud).not.toContain("score");
  // The glow and the glove show only once the intro drop has landed.
  expect(t.cellsLanded, "tiles on their cells").toBe(true);
  // One message at a time: combo and mission are hidden while the plate shows.
  expect(t.comboVisible).toBe(false);
  expect(t.missionVisible).toBe(false);
  // The hint role: Nunito, sentence case.
  expect(t.family).toMatch(/Nunito/);
  expect(t.message).toMatch(/^[A-Z][a-z]/);
  // The glove: visible within 100 ms, never over the two glowing cells.
  const glove = t.glove!;
  expect(glove.visible).toBe(true);
  expect(glove.alpha).toBeGreaterThan(0.9);
  expect(t.gloveDelayMs).not.toBeNull();
  expect(t.gloveDelayMs!).toBeLessThanOrEqual(100);
  const cell = (c: { row: number; col: number }) => ({
    x: state.boardRect.x + c.col * state.boardRect.tileSize,
    y: state.boardRect.y + c.row * state.boardRect.tileSize,
    w: state.boardRect.tileSize,
    h: state.boardRect.tileSize,
  });
  expect(overlaps(glove, cell(t.move!.from)), "glove over the first cell").toBe(false);
  expect(overlaps(glove, cell(t.move!.to)), "glove over the second cell").toBe(false);
}

test.describe("Paw Match first run", () => {
  let safe: typeof SAFE_AREA | null = null;

  test.beforeEach(async ({ page, backend }) => {
    safe = null;
    if (page.viewportSize()?.width === 390) {
      safe = SAFE_AREA;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: SAFE_AREA } as never);
    }
    await signInFakePlayer(page, backend);
  });

  test("the clock waits for the first valid swap, which the glove makes possible within 10 s", async ({ page }, info) => {
    test.setTimeout(120_000);
    await openLevelOne(page, { shot: `ftue-${info.project.name}` });
    const viewport = page.viewportSize()!;
    const shownAt = Date.now();

    const first = await sceneState(page);
    expect(first.tutorialActive).toBe(true);
    expect(first.clockStarted).toBe(false);
    if (safe) expect(first.safe.y).toBeGreaterThanOrEqual(safe.top);
    checkLayout(first, viewport);
    expect(first.tutorial!.inputKind).toBe(info.project.use.hasTouch ? "touch" : "mouse");
    // Playwright's projects emulate reduced motion: the glove stands still, no ghosts.
    expect(first.tutorial!.reducedMotion).toBe(true);
    expect(first.tutorial!.ghosts).toBe(0);
    // The screenshot, the idle wait and the wrong swap are the test's own detours, so they are left
    // out of the 10 s budget below.
    const detourFrom = Date.now();
    await page.screenshot({ path: `${SHOTS}/ftue-${info.project.name}-tutorial.png` });

    // Not running before the swap.
    await page.waitForTimeout(2500);
    const idle = await sceneState(page);
    expect(idle.timeLeft).toBe(first.timeLeft);
    expect(idle.clockStarted).toBe(false);

    // A wrong swap: "Follow the glow" in the plate, red for 300 ms, the clock still stopped.
    const move = first.tutorial!.move!;
    const wrongFrom = { row: move.from.row === 0 ? 7 : 0, col: move.from.col === 0 ? 7 : 0 };
    const wrongTo = { row: wrongFrom.row, col: wrongFrom.col === 0 ? 1 : 6 };
    await dragCells(page, first, wrongFrom, wrongTo);
    await page.waitForTimeout(80);
    const wrong = await sceneState(page);
    expect(wrong.tutorial!.message).toBe("Follow the glow");
    expect(wrong.tutorial!.stroke?.toLowerCase()).toBe("#b91c1c");
    expect(wrong.clockStarted).toBe(false);
    checkLayout(wrong, viewport);
    await page.waitForTimeout(400);
    expect((await sceneState(page)).tutorial!.stroke?.toLowerCase()).toBe("#111827");

    const detourMs = Date.now() - detourFrom;
    // Follow the glove: the hinted pair.
    await dragCells(page, first, move.from, move.to);
    // The clock starts as soon as the swap lands (before its cascade resolves); the tutorial ends
    // once the cascade settles.
    await page.waitForFunction(
      () => {
        const hook = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
        return !!hook && JSON.parse(hook()).clockStarted === true;
      },
      null,
      { timeout: 10_000 },
    );
    const playerMs = Date.now() - shownAt - detourMs;
    console.log(`[pawmatch-ftue] ${info.project.name}: first valid swap after ${playerMs} ms of player time (detours ${detourMs} ms)`);
    expect(playerMs, "first valid swap within 10 s").toBeLessThan(10_000);
    await page.waitForFunction(
      () => {
        const hook = (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
        return !!hook && JSON.parse(hook()).tutorialActive === false;
      },
      null,
      { timeout: 15_000 },
    );
    const after = await sceneState(page);
    expect(after.moves).toBe(1);
    expect(after.tutorial).toBeNull();
    // No idle hint the moment the plate goes: the idle clock restarts when the cascade ends.
    expect(after.hint).toBeNull();
    // The idle clock was restarted at the end of the cascade (HINT_IDLE_MS is 3.8 s).
    expect(after.idle.nextHintAt - after.idle.now, "idle clock restarted").toBeGreaterThan(3000);
    // The clock now runs.
    await page.waitForTimeout(2300);
    const ticking = await sceneState(page);
    expect(ticking.timeLeft).toBeLessThan(after.timeLeft);
    // The page clock can run ahead of the wall clock on a loaded machine, so the check is in
    // scene time: no hint before the idle delay (HINT_IDLE_MS, 3.8 s) has passed since the last
    // action. Not `now < nextHintAt`: showing a hint moves nextHintAt on by HINT_REPEAT_MS, so that
    // guard also held right after an on-time hint (integration review).
    if (ticking.idle.now - ticking.idle.lastActionAt < 3800) expect(ticking.hint, "no idle hint before the idle delay").toBeNull();
    // The combo and mission lines are back, and the HUD is still clean.
    const keys = ticking.hud.map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(["combo", "mission"]));
    for (let i = 0; i < ticking.hud.length; i++) {
      for (let j = i + 1; j < ticking.hud.length; j++) {
        const a = { ...ticking.hud[i], ...inkBox(ticking.hud[i]) };
        const b = { ...ticking.hud[j], ...inkBox(ticking.hud[j]) };
        if (a.key === "burst" || b.key === "burst") continue;
        expect(overlaps(a, b), `${a.key} over ${b.key}: ${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(false);
      }
    }
    await page.screenshot({ path: `${SHOTS}/ftue-${info.project.name}-running.png` });
  });

  test("an announcement region speaks the tutorial", async ({ page }) => {
    test.setTimeout(90_000);
    await openLevelOne(page);
    const region = page.getByTestId("match3-announcer");
    await expect(region).toHaveAttribute("role", "status");
    await expect(region).toContainText(/glowing tile/);
  });
});

test.describe("Paw Match first run: motion and pixel ratios", () => {
  // One project runs the matrix; the viewport and DPR come from each case.
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-1440", "the matrix runs once, under the desktop project");
  });

  const CASES = [
    { name: "360x740", width: 360, height: 740, touch: true },
    { name: "390x844", width: 390, height: 844, touch: true },
    { name: "844x390", width: 844, height: 390, touch: true },
  ];
  for (const viewport of CASES) {
    for (const dpr of [1, 2]) {
      test.describe(`${viewport.name} @${dpr}x`, () => {
        test.use({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: dpr,
          isMobile: viewport.touch,
          hasTouch: viewport.touch,
          reducedMotion: "no-preference",
        });
        test("plate, glove and ghosts", async ({ page, backend }) => {
          test.setTimeout(90_000);
          // The notch and home indicator at 390x844 here too, so the stack overlay is checked with
          // motion on (5c review).
          if (viewport.width === 390) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: SAFE_AREA } as never);
          }
          await signInFakePlayer(page, backend);
          await openLevelOne(page);
          const state = await sceneState(page);
          if (viewport.width === 390) expect(state.safe.y).toBeGreaterThanOrEqual(SAFE_AREA.top);
          checkLayout(state, { width: viewport.width, height: viewport.height });
          expect(state.tutorial!.reducedMotion).toBe(false);
          expect(state.tutorial!.ghosts).toBe(2);
          // The ghosts never linger behind a glove that has stopped (the hold and the pause
          // between loops): sampled over two loops, a glove that has not moved for 160 ms (more
          // than the longest lag) has no visible ghost.
          const samples: Array<{ t: number; x: number; y: number; alphas: number[] }> = [];
          const until = Date.now() + 3200;
          while (Date.now() < until) {
            const s = (await sceneState(page)).tutorial!;
            samples.push({ t: Date.now(), x: s.glove!.x, y: s.glove!.y, alphas: s.ghostAlphas });
            await page.waitForTimeout(40);
          }
          let stillSince: number | null = null;
          let checkedStill = 0;
          for (let i = 1; i < samples.length; i++) {
            const moved = Math.abs(samples[i].x - samples[i - 1].x) + Math.abs(samples[i].y - samples[i - 1].y) > 0.5;
            stillSince = moved ? null : stillSince ?? samples[i - 1].t;
            if (stillSince !== null && samples[i].t - stillSince > 160) {
              checkedStill++;
              expect(samples[i].alphas, `ghosts behind a still glove at sample ${i}`).toEqual([0, 0]);
            }
          }
          expect(checkedStill, "the glove paused at least once while sampled").toBeGreaterThan(0);
          // Mid-drag frame for the screenshot (the glove moves 260-880 ms into each loop).
          await page.waitForTimeout(600);
          const moving = await sceneState(page);
          checkLayout(moving, { width: viewport.width, height: viewport.height });
          await page.screenshot({ path: `${SHOTS}/ftue-${viewport.name}-dpr${dpr}.png` });
        });
      });
    }
  }
});
