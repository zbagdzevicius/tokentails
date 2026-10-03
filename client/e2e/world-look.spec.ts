import { readFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
// Type-only: brings in the global `Phaser` namespace for the page.evaluate callbacks.
import type {} from "phaser";
import { expect, gotoAndSettle, openFirstLevel, test, type BackendMock } from "./fixtures";

/**
 * G7 world runtime (plan G7 "Camera", "Light and presence", "Render tiers", "Look presets";
 * F10 integer zoom; task 6e).
 *
 *   - Home, Shelter, Purrsuit 1-1 and Cupid 1 boot in look v0 and v1, chosen by the
 *     `tt-look-version` localStorage override (no rebuild), with screenshots of each;
 *   - the camera zoom is an integer in backing pixels and the view never shows void past the
 *     world at 390x844, 844x390 and 1440x900;
 *   - the backing store equals CSS size x capped ratio after a rotation and a keyboard-open
 *     resize (visualViewport shrinks the layout viewport);
 *   - a scripted Purrsuit 1-1 run posts the same `/live` payload under v0 and v1;
 *   - MID frame time is sampled and logged (the reference Android perf gate is deferred).
 *
 * Fake signed-in account as in render-foundation.spec.ts; games are read through the dev/E2E-only
 * `window.__ttGames` hook and the look state through `window.__ttLook`.
 */

const CDN = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets";
// Evidence screenshots, never compared. Locally they go under test-results (git-ignored). CI
// takes none unless E2E_SHOTS_DIR is set: a screenshot of a WebGL page under software rendering
// (swiftshader) takes 20 to 30 s, enough to push a test past its timeout.
const SHOTS =
  process.env.E2E_SHOTS_DIR ||
  (process.env.CI ? "" : join(__dirname, "..", "test-results", "shots", "6e"));
/** The tier cap with ALLOW_DPR_3 off (components/Phaser/look/tier.ts). */
const DPR_CAP = 2;
const LOOK_KEY = "tt-look-version";

type Mode = "home" | "shelter" | "purrsuit" | "cupid";
type LookVersion = "v0" | "v1";

const SCENE: Record<Mode, string> = {
  home: "BaseScene",
  shelter: "ShelterScene",
  purrsuit: "CatnipChaosScene",
  cupid: "PixelRescueScene",
};

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

/** New player (nothing cleared, so PURRSUIT routes to 1-1 and CUPID CAT to day 1), onboarding done. */
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

interface SetupOptions {
  look?: LookVersion;
  liveBodies?: unknown[];
  /** Make localStorage throw on every access (private windows, blocked site data). */
  blockStorage?: boolean;
}

async function setup(page: Page, backend: BackendMock, options: SetupOptions = {}) {
  const apiKey = firebaseApiKey();
  await page.addInitScript(
    ({ key, user, look, lookKey }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__TT_E2E__ = true;
      const log: { type: string; detail: unknown }[] = [];
      w.__runLog = log;
      for (const type of ["RUN_READY", "RUN_BEGIN", "GAME_STOP"]) {
        window.addEventListener(type, (event) => log.push({ type, detail: (event as CustomEvent).detail }));
      }
      localStorage.setItem(key, JSON.stringify(user));
      if (look) localStorage.setItem(lookKey, look);
    },
    {
      key: `firebase:authUser:${apiKey}:[DEFAULT]`,
      look: options.look ?? null,
      lookKey: LOOK_KEY,
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
    .on("GET", "/cat/sale", { body: { tokentails: [], "token-tails": [], "token-tails-2": [], "rozine-pedute": [], _meta: { _v: 1, generatedAt: "2026-09-30T12:00:00.000Z", shelters: [] } } })
    .on("GET", /^\/impact/, { status: 404, body: {} })
    .on("GET", "/shelter/donate/status", { status: 404, body: {} })
    .on("POST", "/user/catbassadors/live", (request) => {
      const body = JSON.parse(request.postData() || "{}");
      options.liveBodies?.push(body);
      const cleared = Array(97).fill(0);
      if (body.outcome === "won") cleared[1] = 1;
      return { body: { ...PROFILE, catnipChaos: [0, body.points], catnipChaosCleared: cleared } };
    });
}

async function enterMode(page: Page, mode: Mode) {
  await gotoAndSettle(page, "/game", 2500);
  const click = async (locator: ReturnType<Page["locator"]>) => {
    await locator.first().click();
    await page.waitForTimeout(800);
  };
  if (mode === "home" || mode === "shelter") {
    await click(page.locator('img[src*="game/select/home"]'));
    if (mode === "shelter") {
      await page.getByRole("button", { name: "SHELTER" }).first().dispatchEvent("click");
      await page.waitForTimeout(800);
    }
  } else {
    await click(page.getByText("PLAY", { exact: true }));
    if (mode === "purrsuit") {
      // A new player is routed straight to 1-1.
      await click(page.getByText("PURRSUIT", { exact: true }).filter({ visible: true }));
    } else {
      await click(page.getByText("CUPID CAT", { exact: true }).filter({ visible: true }));
      await openFirstLevel(page, "cupid");
    }
  }
  await page.waitForFunction(
    (key) => {
      const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
      const scene = games.map((g) => g.scene.getScene(key) as Phaser.Scene & { cat?: unknown }).find(Boolean);
      return !!scene?.sys.isActive() && !!scene.cat;
    },
    SCENE[mode],
    { timeout: 45_000 },
  );
}

interface WorldState {
  backing: { width: number; height: number };
  css: { width: number; height: number };
  viewport: { width: number; height: number; dpr: number };
  ratio: number;
  zoom: number;
  view: { x: number; y: number; width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number } | null;
  look: { version: string; preset: string; tier: string; backdrop: boolean; fireflies: number; halos: number; tiles?: string; glow?: boolean } | null;
}

const readWorld = (page: Page, key: string) =>
  page.evaluate((sceneKey): WorldState | null => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    const game = games.find((g) => g.scene.getScene(sceneKey));
    if (!game) return null;
    const scene = game.scene.getScene(sceneKey);
    const camera = scene.cameras.main;
    const rect = game.canvas.getBoundingClientRect();
    const look = (scene as unknown as { lookState?: () => WorldState["look"] }).lookState?.() ?? null;
    const b = camera.useBounds ? camera.getBounds() : null;
    return {
      backing: { width: game.canvas.width, height: game.canvas.height },
      css: { width: Math.round(rect.width), height: Math.round(rect.height) },
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      ratio: game.registry.get("canvasPixelRatio") as number,
      zoom: camera.zoom,
      view: { x: camera.worldView.x, y: camera.worldView.y, width: camera.worldView.width, height: camera.worldView.height },
      bounds: b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null,
      look,
    };
  }, key);

function expectCrisp(state: WorldState | null) {
  expect(state, "the mode's game is mounted").not.toBeNull();
  const s = state as WorldState;
  const dpr = Math.max(1, Math.min(s.viewport.dpr, DPR_CAP));
  expect(s.ratio).toBe(dpr);
  expect(s.css).toEqual({ width: s.viewport.width, height: s.viewport.height });
  expect(s.backing).toEqual({ width: Math.round(s.viewport.width * dpr), height: Math.round(s.viewport.height * dpr) });
}

/** The view stays inside the camera bounds (a world smaller than the view is centred instead). */
function expectNoVoid(state: WorldState | null) {
  const s = state as WorldState;
  expect(Number.isInteger(s.zoom), `integer camera zoom (got ${s.zoom})`).toBe(true);
  expect(s.bounds, "camera bounds are set").not.toBeNull();
  const b = s.bounds!;
  const eps = 1.01;
  if (s.view.width <= b.width) {
    expect(s.view.x).toBeGreaterThanOrEqual(b.x - eps);
    expect(s.view.x + s.view.width).toBeLessThanOrEqual(b.x + b.width + eps);
  }
  if (s.view.height <= b.height) {
    expect(s.view.y).toBeGreaterThanOrEqual(b.y - eps);
    expect(s.view.y + s.view.height).toBeLessThanOrEqual(b.y + b.height + eps);
  }
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png` });
};

const WORLD_PROJECTS = ["desktop-1440", "mobile-390", "landscape-844"];

test.describe("G7 world look", () => {
  test.describe.configure({ mode: "default" });
  test.use({ allowUnmocked: true });

  test.beforeEach(() => {
    test.skip(!WORLD_PROJECTS.includes(test.info().project.name), "1440x900, 390x844 and 844x390");
  });

  for (const look of ["v0", "v1"] as const) {
    for (const mode of Object.keys(SCENE) as Mode[]) {
      test(`${mode} ${look}: integer zoom, no void at the edges, crisp backing store`, async ({ page, backend }) => {
        test.setTimeout(120_000);
        await setup(page, backend, { look });
        await enterMode(page, mode);
        await page.waitForTimeout(2500);
        const state = await readWorld(page, SCENE[mode]);
        expectCrisp(state);
        if (process.env.E2E_LOOK_BASELINE !== "1") {
          expect(state!.look?.version, "the localStorage override picked the look").toBe(look);
          expectNoVoid(state);
        }
        await shot(page, `${process.env.E2E_LOOK_LABEL || look}-${mode}`);
      });
    }
  }

  test("full motion (no reduced-motion preference): parallax plates stay on the ground line", async ({ page, backend }) => {
    test.setTimeout(150_000);
    test.skip(test.info().project.name !== "desktop-1440", "one viewport");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setup(page, backend, { look: "v1" });
    for (const mode of ["home", "shelter"] as const) {
      await enterMode(page, mode);
      await page.waitForTimeout(1500);
      const state = await readWorld(page, SCENE[mode]);
      expect((state!.look as unknown as { reducedMotion: boolean }).reducedMotion).toBe(false);
      expectNoVoid(state);
      // The procedural near plate (the stand-in for a cropped manifest plate) ends at or below
      // the middle of the view, never over the sky.
      const nearBottom = await page.evaluate(() => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        for (const g of games) {
          for (const scene of g.scene.getScenes(true)) {
            if (!scene.sys.settings.key.startsWith("LookBackdrop")) continue;
            const near = scene.children.list.find(
              (c) => (c as Phaser.GameObjects.TileSprite).texture?.key?.startsWith("look-plate-proc-"),
            ) as Phaser.GameObjects.TileSprite | undefined;
            if (near) return { y: near.y, height: scene.scale.height };
          }
        }
        return null;
      });
      if (nearBottom) expect(nearBottom.y).toBeGreaterThan(nearBottom.height / 2);
      await shot(page, `motion-v1-${mode}`);
    }
  });

  test("rotation and a keyboard-open resize keep the backing store crisp and the view filled", async ({ page, backend }) => {
    test.setTimeout(150_000);
    test.skip(test.info().project.name !== "mobile-390", "a phone viewport");
    await setup(page, backend, { look: "v1" });
    for (const mode of ["home", "purrsuit"] as const) {
      if (mode === "purrsuit") await page.setViewportSize({ width: 390, height: 844 });
      await enterMode(page, mode);
      const key = SCENE[mode];
      for (const next of [
        { width: 844, height: 390 }, // rotate to landscape
        { width: 390, height: 844 }, // and back
        { width: 390, height: 520 }, // the on-screen keyboard shrinks the layout viewport
      ]) {
        await page.setViewportSize(next);
        await expect.poll(async () => (await readWorld(page, key))?.css, { timeout: 30_000 }).toEqual(next);
        await page.waitForTimeout(400);
        const state = await readWorld(page, key);
        expectCrisp(state);
        expectNoVoid(state);
        await shot(page, `resize-${mode}-${next.width}x${next.height}`);
      }
    }
  });

  test("v0 and v1 switch with the localStorage override, no rebuild", async ({ page, backend }) => {
    test.setTimeout(150_000);
    test.skip(test.info().project.name !== "desktop-1440", "one viewport");
    await setup(page, backend);
    // No override: the manifest decides (it ships v1).
    await enterMode(page, "home");
    const manifest = await page.evaluate(() => fetch("/look/manifest.json").then((r) => r.json()));
    let state = await readWorld(page, "BaseScene");
    expect(state!.look!.version).toBe(manifest.lookVersion);
    expect(state!.look).toMatchObject({ preset: "home", backdrop: manifest.lookVersion === "v1" });

    for (const look of ["v0", "v1", "v0"] as const) {
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LOOK_KEY, look]);
      await enterMode(page, "home");
      state = await readWorld(page, "BaseScene");
      expect(state!.look!.version).toBe(look);
      expect(state!.look!.backdrop).toBe(look === "v1");
      expect(state!.look!.tiles).toBe(look === "v1" ? "night" : "v0");
      const textures = await page.evaluate(() => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        const scene = games.map((g) => g.scene.getScene("BaseScene")).find(Boolean) as Phaser.Scene & {
          groundLayer: Phaser.Tilemaps.TilemapLayer;
        };
        return {
          tileset: scene.groundLayer.tileset[0].image?.key ?? null,
          backdrops: scene.game.scene.getScenes(true).filter((s) => s.sys.settings.key.startsWith("LookBackdrop-")).length,
        };
      });
      expect(textures.tileset).toBe(look === "v1" ? "look-tiles-spring-night" : "new-blocks-winter");
      expect(textures.backdrops).toBe(look === "v1" ? 1 : 0);
      if (look === "v1") {
        // Every layer is drawn: from the manifest, or procedurally where the manifest plate has a
        // straight crop edge inside it (the near plates until task 6d re-cuts them).
        const look = state!.look as unknown as { plates: string[]; platesRejected: string[] };
        expect([...look.plates, ...look.platesRejected].sort()).toEqual(["far", "fog", "mid", "near"]);
        expect(look.plates).toEqual(expect.arrayContaining(["far", "mid", "fog"]));
        expect(state!.look!.halos).toBeGreaterThanOrEqual(1);
        expect(state!.look!.fireflies).toBeGreaterThan(0);
        // Glow on the player only on HIGH; MID and LOW draw the halo sprite alone.
        expect(state!.look!.glow).toBe(state!.look!.tier === "HIGH");
        test.info().annotations.push({ type: "look", description: JSON.stringify(state!.look) });
        console.log(`[6e] look ${JSON.stringify(state!.look)}`);
      }
    }
  });

  test("a scripted Purrsuit 1-1 run posts the same /live payload under v0 and v1", async ({ page, backend }) => {
    test.setTimeout(240_000);
    test.skip(test.info().project.name !== "desktop-1440", "one viewport");
    const liveBodies: Array<Record<string, unknown>> = [];
    await setup(page, backend, { liveBodies });
    const payloads: Record<string, Record<string, unknown>> = {};
    const traces: Record<string, SegmentSample[]> = {};
    for (const look of ["v0", "v1"] as const) {
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LOOK_KEY, look]).catch(() => undefined);
      await page.goto("/game", { waitUntil: "load" });
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LOOK_KEY, look]);
      const before = liveBodies.length;
      await enterMode(page, "purrsuit");
      await expect.poll(() => scriptedState(page), { timeout: 30_000 }).toBe("gate");
      expect((await readWorld(page, "CatnipChaosScene"))!.look!.version).toBe(look);
      // Begin the run, play a short scripted input segment on fixed-delta frames, then carry the
      // cat to the flag: same inputs, same frames to the save.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      await page.keyboard.press("Space");
      await expect.poll(() => scriptedState(page), { timeout: 10_000 }).not.toBe("gate");
      traces[look] = await scriptedSegment(page);
      // The segment ends before the first FTUE prompt on 1-1 (it would hold the run).
      expect(await scriptedState(page), "no FTUE prompt held the segment").toBeNull();
      await page.evaluate(() => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        const scene = games.map((g) => g.scene.getScene("CatnipChaosScene")).find(Boolean) as unknown as Phaser.Scene & {
          cat: { sprite: Phaser.Physics.Arcade.Sprite };
          physicsLayer: Phaser.Tilemaps.TilemapLayer;
        };
        const flag = scene.physicsLayer.findTile((tile) => tile.index === 162 || tile.index === 192)!;
        (scene.cat.sprite.body as Phaser.Physics.Arcade.Body).reset(flag.getCenterX(), flag.getCenterY());
      });
      if ((await scriptedState(page)) === "respawn") await page.keyboard.press("Space");
      await expect.poll(() => liveBodies.length, { timeout: 30_000 }).toBe(before + 1);
      payloads[look] = liveBodies[before];
      await shot(page, `payload-${look}-purrsuit-end`);
    }
    // The cat moved under real input with the camera rig, bounds, zoom and look-ahead live, and
    // ended in the same place on the same frames under both looks.
    expect(traces.v0.length).toBeGreaterThan(5);
    expect(traces.v0.some((t) => t.x > traces.v0[0].x + 32), "the cat ran right").toBe(true);
    expect(traces.v0.some((t) => t.vy < 0), "the cat jumped").toBe(true);
    // Zoom is compared too: the rig picks the same k under both looks.
    expect(traces.v1).toEqual(traces.v0);
    console.log(`[6e] scripted segment v0 ${JSON.stringify(traces.v0.at(-1))} v1 ${JSON.stringify(traces.v1.at(-1))}`);
    expect(payloads.v0).toMatchObject({ type: "CATNIP_CHAOS", level: "11", outcome: "won" });
    expect(normalisePayload(payloads.v1)).toEqual(normalisePayload(payloads.v0));
  });

  test("frame time on MID is sampled and logged (the reference-device gate is deferred)", async ({ page, backend }) => {
    test.setTimeout(150_000);
    test.skip(test.info().project.name !== "desktop-1440", "one viewport");
    // MID: 4 cores, 8 GB (look/tier.ts detectTier).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    });
    await setup(page, backend, { look: "v1" });
    const report: Record<string, unknown> = {};
    for (const mode of ["home", "cupid"] as const) {
      await enterMode(page, mode);
      const state = await readWorld(page, SCENE[mode]);
      expect(state!.look!.tier).toBe("MID");
      expect(state!.look!.fireflies).toBe(20);
      expect(state!.look!.glow, "Glow is HIGH only").toBe(false);
      const sample = await page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const times: number[] = [];
            let last = performance.now();
            const tick = (now: number) => {
              times.push(now - last);
              last = now;
              if (times.length < 180) requestAnimationFrame(tick);
              else resolve(times.slice(10));
            };
            requestAnimationFrame(tick);
          }),
      );
      const sorted = [...sample].sort((a, b) => a - b);
      const p = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 10) / 10;
      report[mode] = { frames: sample.length, p50: p(0.5), p95: p(0.95), renderer: "swiftshader (software)" };
    }
    test.info().annotations.push({ type: "frame-time MID", description: JSON.stringify(report) });
    console.log(`[6e] MID frame time ${JSON.stringify(report)}`);
  });
});

/** The Purrsuit scene's hold state ("gate", "respawn", null while running). */
const scriptedState = (page: Page) =>
  page.evaluate(() => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    const scene = games.map((g) => g.scene.getScene("CatnipChaosScene")).find(Boolean) as unknown as
      | { hold: string | null; cat?: unknown }
      | undefined;
    return scene?.cat ? scene.hold : "none";
  });

/** Drops wall-clock fields (none are expected; listed so a future one does not hide a real diff). */
function normalisePayload(body: Record<string, unknown>) {
  const rest = { ...(body ?? {}) };
  delete rest.clientTime;
  delete rest.startedAt;
  return rest;
}


interface SegmentSample {
  frame: number;
  /** World y the cat stood on before the segment. */
  groundY: number;
  /** Offset from the start position. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  zoom: number;
}

/**
 * A scripted input run on fixed-delta frames: the game loop sleeps, Math.random is seeded, and
 * the cat is driven through its own cursor keys (hold right, jump, keep running, release; it stops short of 1-1's first prompt), with
 * the camera rig (zoom, bounds, deadzone, look-ahead) live the whole time. Returns the cat's
 * offset from its start and velocity every 10 frames; the loop and Math.random are restored afterwards.
 */
const scriptedSegment = (page: Page) =>
  page.evaluate((): SegmentSample[] => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    const game = games.find((g) => g.scene.getScene("CatnipChaosScene"))!;
    const scene = game.scene.getScene("CatnipChaosScene") as unknown as Phaser.Scene & {
      cat: { sprite: Phaser.Physics.Arcade.Sprite; cursors: Phaser.Types.Input.Keyboard.CursorKeys };
    };
    const body = scene.cat.sprite.body as Phaser.Physics.Arcade.Body;
    let seed = 0x6e6e;
    const random = Math.random;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const dt = 1000 / 60;
    type KeyState = Phaser.Input.Keyboard.Key & { _justDown: boolean; _justUp: boolean };
    const press = (key: Phaser.Input.Keyboard.Key, time: number) => {
      const k = key as KeyState;
      k.isDown = true;
      k.isUp = false;
      k._justDown = true;
      k.timeDown = time;
    };
    const release = (key: Phaser.Input.Keyboard.Key, time: number) => {
      const k = key as KeyState;
      k.isDown = false;
      k.isUp = true;
      k._justUp = true;
      k.timeUp = time;
    };
    const samples: SegmentSample[] = [];
    const start = { x: 0, y: 0 };
    game.loop.sleep();
    try {
      let time = game.loop.time;
      // Settle on the ground first (the spawn drop is still in flight on some runs, by real
      // time), then start from rest at a whole-pixel x: the same state under v0 and v1.
      for (let i = 0, grounded = 0; i < 240 && grounded < 3; i += 1) {
        time += dt;
        game.step(time, dt);
        grounded = body.blocked.down ? grounded + 1 : 0;
      }
      // x where the spawn drop ended varies a few px with real time before the freeze: the trace
      // is measured from it (y is the ground, the same every run).
      start.x = Math.round(scene.cat.sprite.x);
      start.y = Math.round(scene.cat.sprite.y);
      body.reset(start.x, start.y);
      body.setVelocity(0, 0);
      const { right, up } = scene.cat.cursors;
      for (let frame = 0; frame < 60; frame += 1) {
        if (frame === 0) press(right, time);
        if (frame === 20) press(up, time);
        if (frame === 32) release(up, time);
        if (frame === 50) release(right, time);
        time += dt;
        game.step(time, dt);
        if (frame % 10 === 9) {
          samples.push({
            frame,
            x: Math.round((body.center.x - start.x) * 100) / 100,
            y: Math.round((body.center.y - start.y) * 100) / 100,
            groundY: start.y,
            vx: Math.round(body.velocity.x * 100) / 100,
            vy: Math.round(body.velocity.y * 100) / 100,
            zoom: scene.cameras.main.zoom,
          });
        }
      }
    } finally {
      Math.random = random;
      game.loop.wake();
    }
    return samples;
  });
