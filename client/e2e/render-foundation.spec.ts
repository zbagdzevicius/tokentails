import { readFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
// Type-only: brings in the global `Phaser` namespace for the page.evaluate callbacks.
import type {} from "phaser";
import { expect, gotoAndSettle, openFirstLevel, test, type BackendMock } from "./fixtures";

/**
 * F10 render foundation and G13 step 6 (plan F10, G7 "Render tiers", G13; task 2e).
 *
 * For every Phaser mode (Home, Shelter, Purrsuit, Cupid Cat, Paw Match):
 *   - the canvas backing store is CSS size x capped ratio (min(devicePixelRatio, 2), decision #84),
 *     its CSS size is the viewport, and `canvasPixelRatio` is in the game registry;
 *   - it still is after a viewport resize (the LOOK_RESIZE handler);
 *   - the scene runs (a cat is spawned where the mode has one, the loop keeps stepping) with zero
 *     `pageerror` (the fixtures fail the test on any).
 * Shelter: two storefront cats with the same name keep distinct id-keyed sprites, and a cat whose
 * sheet 404s is skipped and reported in NPC_SPAWNED instead of spawning on `__MISSING`.
 *
 * The player is a fake signed-in account: Firebase's REST endpoints and the backend are answered in
 * the browser, so no real account, token or database row is involved. The games are read through
 * the dev/E2E-only `window.__ttGames` hook in `components/Phaser/look/makeGameConfig.ts`.
 */

const CDN = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets";
const MISSING_SPRITE = `${CDN}/E2E_MISSING_404/base.png`;
// Evidence screenshots, never compared. Locally they go under test-results (git-ignored). CI
// takes none unless E2E_SHOTS_DIR is set: a screenshot of a WebGL page under software rendering
// (swiftshader) takes 20 to 30 s, enough to push a test past its timeout.
const SHOTS =
  process.env.E2E_SHOTS_DIR ||
  (process.env.CI ? "" : join(__dirname, "..", "test-results", "shots"));
/** Served from EGGY's sheet after a delay (the Home double-send test). */
const SLOW_SPRITE = `${CDN}/E2E_SLOW/base.png`;
/** Same as the tier cap in components/Phaser/look/tier.ts with ALLOW_DPR_3 off. */
const DPR_CAP = 2;

type Mode = "home" | "shelter" | "purrsuit" | "cupid" | "pawmatch";

const SCENE: Record<Mode, string> = {
  home: "BaseScene",
  shelter: "ShelterScene",
  purrsuit: "CatnipChaosScene",
  cupid: "PixelRescueScene",
  pawmatch: "Match3Scene",
};

interface TestCat {
  _id: string;
  name: string;
  spriteImg: string;
  catImg: string;
  type: string;
  tier: string;
  status: { EAT: number; PLAY: number; SLEEP: number };
  blessing: null;
  resqueStory: string;
}

const cat = (id: string, name: string, sprite: string): TestCat => ({
  _id: id,
  name,
  spriteImg: sprite.startsWith("http") ? sprite : `${CDN}/${sprite}/base.png`,
  catImg: `${CDN}/EGGY/base.png`,
  type: "FIRE",
  tier: "COMMON",
  status: { EAT: 4, PLAY: 4, SLEEP: 4 },
  blessing: null,
  resqueStory: "",
});

const PLAYER = cat("64e2e0000000000000000c01", "Luna", "EGGY");
const OWNED = [PLAYER, cat("64e2e0000000000000000c02", "Luna", "SABLE"), cat("64e2e0000000000000000c03", "Obi", "OBI")];
const STOREFRONT = {
  tokentails: [],
  "token-tails": [cat("64e2e0000000000000000s01", "Luna", "CHARMIE"), cat("64e2e0000000000000000s02", "Luna", "NOELLE")],
  "token-tails-2": [cat("64e2e0000000000000000s03", "Mo", "LAVA")],
  "rozine-pedute": [cat("64e2e0000000000000000s04", "Ghost", MISSING_SPRITE), cat("64e2e0000000000000000s05", "Pip", "EGGY")],
};

const PROFILE = {
  _id: "64e2e0000000000000000p01",
  name: "E2E",
  streak: 0,
  cat: PLAYER,
  cats: OWNED,
  quests: [],
  codex: [],
  catnipChaos: [1, 2, 3],
  match3: [],
  wallets: {},
  airdropRewardsClaimed: [],
};

/** The client's public Firebase web config key (from source, not env), used as the auth storage key. */
function firebaseApiKey(): string {
  const source = readFileSync(join(__dirname, "..", "context", "FirebaseAuthContext.tsx"), "utf8");
  const match = /apiKey:\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("Firebase apiKey not found in FirebaseAuthContext.tsx");
  return match[1];
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** An unsigned ID token the Firebase SDK accepts from its own storage (it never verifies it client-side). */
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
      const spawned: unknown[] = [];
      (window as unknown as Record<string, unknown>).__npcSpawned = spawned;
      window.addEventListener("NPC_SPAWNED", (event) => spawned.push((event as CustomEvent).detail));
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
  await page.route(MISSING_SPRITE, (route) => route.fulfill({ status: 404, body: "not found" }));

  backend
    .on("GET", "/user/profile", { body: PROFILE })
    .on("GET", "/user/cats", { body: OWNED })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: 1 })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/cat/sale", { body: { ...STOREFRONT, _meta: { _v: 1, generatedAt: "2026-09-30T12:00:00.000Z", shelters: [] } } })
    // A Purrsuit run can end on its own (an auto-runner with no input); the save goes to /live.
    .on("POST", "/user/catbassadors/live", { body: PROFILE });
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
      // In landscape phones the mobile-controls bar covers this HTML button (known layout issue,
      // reported in docs/plans/alignment-log/2e.md); the test is about the canvas, so click it directly.
      await page.getByRole("button", { name: "SHELTER" }).first().dispatchEvent("click");
      await page.waitForTimeout(800);
    }
  } else {
    await click(page.getByText("PLAY", { exact: true }));
    if (mode === "purrsuit") {
      await click(page.getByText("PURRSUIT", { exact: true }).filter({ visible: true }));
      await click(page.getByText("1-2", { exact: true }));
    } else if (mode === "cupid") {
      await click(page.getByText("CUPID CAT", { exact: true }).filter({ visible: true }));
      await openFirstLevel(page, "cupid");
      await page.waitForTimeout(800);
    } else {
      await click(page.getByText("PAW MATCH", { exact: true }).filter({ visible: true }));
      await openFirstLevel(page, "pawmatch");
      await page.waitForTimeout(800);
    }
  }
  await page.waitForFunction(
    (scene) => {
      const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
      return games.some((g) => g.scene.getScenes(true).some((s) => s.sys.settings.key === scene));
    },
    SCENE[mode],
    { timeout: 30_000 },
  );
}

interface RenderState {
  scene: string;
  backing: { width: number; height: number };
  css: { width: number; height: number };
  viewport: { width: number; height: number; dpr: number };
  ratio: unknown;
  cameraZoom: number;
  frame: number;
  hasCat: boolean;
}

const readState = (page: Page, scene: string) =>
  page.evaluate((key): RenderState | null => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    const game = games.find((g) => g.scene.getScenes(true).some((s) => s.sys.settings.key === key));
    if (!game) return null;
    const active = game.scene.getScene(key) as Phaser.Scene & { cat?: unknown };
    const rect = game.canvas.getBoundingClientRect();
    return {
      scene: key,
      backing: { width: game.canvas.width, height: game.canvas.height },
      css: { width: Math.round(rect.width), height: Math.round(rect.height) },
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      ratio: game.registry.get("canvasPixelRatio"),
      cameraZoom: active.cameras.main.zoom,
      frame: game.loop.frame,
      hasCat: !!active.cat,
    };
  }, scene);

function expectCrispBackingStore(state: RenderState | null) {
  expect(state, "the mode's game is mounted").not.toBeNull();
  const s = state as RenderState;
  const dpr = Math.max(1, Math.min(s.viewport.dpr, DPR_CAP));
  expect(s.ratio).toBe(dpr);
  expect(s.css).toEqual({ width: s.viewport.width, height: s.viewport.height });
  expect(s.backing).toEqual({
    width: Math.round(s.viewport.width * dpr),
    height: Math.round(s.viewport.height * dpr),
  });
}

/** The connected game's loop frame, or null when no game is mounted. */
const loopFrame = (page: Page) =>
  page.evaluate(() => {
    const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
    return games.length ? games[0].loop.frame : null;
  });

/**
 * A render-loop crash (e.g. a sprite drawing from a removed texture) reaches the console as a
 * TypeError and never fires `pageerror`, so the fixtures' check misses it (2e review). Each test
 * here also fails on console TypeErrors and checks that the loop still steps at the end.
 */
const consoleTypeErrors = new WeakMap<Page, string[]>();

test.describe("F10 render foundation", () => {
  // Paw Match's resize polls were flaky under many parallel workers (2e review). The Phaser
  // modes are heavy (software WebGL), so within a project this file runs its tests one after
  // another ("default", not "serial": a failure does not skip the rest).
  test.describe.configure({ mode: "default" });

  test.beforeEach(async ({ page, backend }) => {
    const errors: string[] = [];
    consoleTypeErrors.set(page, errors);
    page.on("console", (message) => {
      if (message.type() === "error" && /TypeError|Cannot read properties of (null|undefined)/.test(message.text())) {
        errors.push(message.text().slice(0, 300));
      }
    });
    await signInFakePlayer(page, backend);
  });

  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return;
    expect(consoleTypeErrors.get(page) ?? [], "no TypeError reached the console").toEqual([]);
    const start = await loopFrame(page);
    if (start === null) return;
    await expect
      .poll(async () => (await loopFrame(page)) ?? -1, { timeout: 10_000, message: "the game loop still steps" })
      .toBeGreaterThan(start);
  });

  for (const mode of Object.keys(SCENE) as Mode[]) {
    test(`${mode}: backing store is CSS size x capped dpr, before and after a resize, and it plays`, async ({ page }) => {
      test.setTimeout(90_000);
      await enterMode(page, mode);
      const scene = SCENE[mode];

      // It plays: a cat where the mode has one (Purrsuit's auto-runner can end a run on its own,
      // so its cat is checked as soon as it spawns), and the loop keeps stepping.
      if (mode !== "pawmatch") {
        await page.waitForFunction(
          (key) => {
            const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
            const s = games.map((g) => g.scene.getScene(key) as Phaser.Scene & { cat?: unknown }).find(Boolean);
            return !!s?.cat;
          },
          scene,
          { timeout: 30_000 },
        );
      }
      const first = await readState(page, scene);
      expectCrispBackingStore(first);
      // Layout record for every mode at both projects (compare with the pre-F10 shots in the
      // 2e log: same world on screen, only sharper).
      const project = test.info().project.name;
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${mode}-${project}-before.png` });
      await page.waitForTimeout(1500);
      const later = await readState(page, scene);
      expect(later!.frame).toBeGreaterThan(first!.frame);

      // Rotate (or shrink the desktop window) and let the debounced handler run.
      const viewport = page.viewportSize()!;
      const next =
        viewport.width < 800
          ? { width: viewport.height, height: viewport.width }
          : { width: 1024, height: 700 };
      await page.setViewportSize(next);
      // The handler is debounced (150 ms); under a loaded CI runner the timer can run late.
      await expect
        .poll(async () => (await readState(page, scene))?.css.width, { timeout: 30_000 })
        .toBe(next.width);
      const resized = await readState(page, scene);
      expectCrispBackingStore(resized);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${mode}-${project}-after.png` });
      // G7 (task 6e): the world modes re-pick an integer zoom for the new size (pickZoom), so the
      // zoom may change with the size but is always whole backing pixels per art pixel. Paw Match
      // re-fits its board on purpose; Cupid's tour may be mid zoom tween.
      if (mode === "home" || mode === "shelter" || mode === "purrsuit") {
        expect(Number.isInteger(resized!.cameraZoom), `integer zoom (got ${resized!.cameraZoom})`).toBe(true);
        expect(Number.isInteger(later!.cameraZoom), `integer zoom (got ${later!.cameraZoom})`).toBe(true);
      }
    });
  }

  test("shelter: same-name cats keep distinct sprites; a 404 sheet is skipped, not spawned", async ({ page }) => {
    test.setTimeout(90_000);
    await enterMode(page, "shelter");
    // enterMode passes through Home, whose own-cats pass also sends NPC_SPAWNED (scene
    // "BaseScene"); only the Shelter's events count here (2e review).
    await page.waitForFunction(
      () =>
        ((window as unknown as { __npcSpawned?: Array<{ scene?: string }> }).__npcSpawned || []).some(
          (event) => event.scene === "ShelterScene",
        ),
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
      const scene = games.map((g) => g.scene.getScene("ShelterScene")).find(Boolean) as Phaser.Scene & {
        npcCats: Array<{ sprite: Phaser.Physics.Arcade.Sprite; originalData: { _id: string; name: string } }>;
      };
      const npcs = scene.npcCats.filter((npc) => npc.sprite.active);
      return {
        spawned: (
          window as unknown as { __npcSpawned: Array<{ count: number; skipped: number; skippedIds: string[]; scene: string }> }
        ).__npcSpawned.filter((event) => event.scene === "ShelterScene"),
        npcs: npcs.map((npc) => ({
          id: npc.originalData._id,
          name: npc.originalData.name,
          texture: npc.sprite.texture.key,
          source: (npc.sprite.texture.getSourceImage() as HTMLImageElement).src,
          anim: npc.sprite.anims.currentAnim?.key ?? null,
        })),
        missing: scene.children.list.filter(
          (child) => (child as Phaser.GameObjects.Sprite).texture?.key === "__MISSING" && (child as Phaser.GameObjects.Sprite).visible,
        ).length,
        oldNameKeys: scene.textures.getTextureKeys().filter((key) => ["Luna", "Mo", "Pip", "Ghost"].includes(key)),
      };
    });

    const byId = Object.fromEntries(result.npcs.map((npc) => [npc.id, npc]));
    const a = byId["64e2e0000000000000000s01"];
    const b = byId["64e2e0000000000000000s02"];
    expect(a?.name).toBe("Luna");
    expect(b?.name).toBe("Luna");
    expect(a.texture).toMatch(/^npc-64e2e0000000000000000s01-[0-9a-z]{7}$/);
    expect(b.texture).toMatch(/^npc-64e2e0000000000000000s02-[0-9a-z]{7}$/);
    expect(a.source).not.toBe(b.source);
    expect(a.anim?.startsWith(`${a.texture}_`)).toBe(true);
    expect(b.anim?.startsWith(`${b.texture}_`)).toBe(true);
    expect(result.oldNameKeys).toEqual([]);

    // The 404 cat is not on screen and is reported; the others are.
    expect(byId["64e2e0000000000000000s04"]).toBeUndefined();
    const total = result.spawned.reduce(
      (sum, event) => ({ count: sum.count + event.count, skipped: [...sum.skipped, ...event.skippedIds] }),
      { count: 0, skipped: [] as string[] },
    );
    expect(total.skipped).toContain("64e2e0000000000000000s04");
    expect(total.count).toBe(4);
    expect(result.missing).toBe(0);
  });

  test("shelter: leaving it drops its CAT_SPAWN listener (2e review)", async ({ page }) => {
    test.setTimeout(90_000);
    await enterMode(page, "shelter");
    // Count calls on this ShelterScene instance; its CAT_SPAWN listener calls this.spawnCat.
    await page.evaluate(() => {
      const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
      const scene = games.map((g) => g.scene.getScene("ShelterScene")).find(Boolean) as Phaser.Scene & {
        spawnCat: (...args: unknown[]) => unknown;
      };
      const w = window as unknown as Record<string, unknown>;
      w.__oldShelterSpawns = 0;
      const original = scene.spawnCat.bind(scene);
      scene.spawnCat = (...args: unknown[]) => {
        w.__oldShelterSpawns = (w.__oldShelterSpawns as number) + 1;
        return original(...args);
      };
    });
    await page.getByRole("button", { name: "HOME" }).first().dispatchEvent("click");
    await page.waitForFunction(
      () => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        return (
          games.some((g) => g.scene.getScenes(true).some((s) => s.sys.settings.key === "BaseScene")) &&
          !games.some((g) => g.scene.getScene("ShelterScene"))
        );
      },
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(500);
    const pick = cat("64e2e0000000000000000c02", "Luna", "SABLE");
    // Shelter.tsx pushes CAT_SPAWN to the live scene while it mounts; count only from here on.
    await page.evaluate((detail) => {
      (window as unknown as Record<string, unknown>).__oldShelterSpawns = 0;
      window.dispatchEvent(new CustomEvent("CAT_SPAWN", { detail }));
    }, { cat: pick });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __oldShelterSpawns: number }).__oldShelterSpawns)).toBe(0);
  });

  test("home: a re-sent PLAYER_CATS during a load does not double NPCs; a 404 re-skin keeps the cat", async ({ page }) => {
    test.setTimeout(90_000);
    // The new cat's sheet answers slowly, so the second send lands inside the first load pass.
    await page.route(SLOW_SPRITE, async (route) => {
      const response = await route.fetch({ url: `${CDN}/EGGY/base.png` });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({ response });
    });
    await enterMode(page, "home");
    await page.waitForFunction(
      () => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        const s = games.map((g) => g.scene.getScene("BaseScene") as Phaser.Scene & { cat?: unknown }).find(Boolean);
        return !!s?.cat;
      },
      null,
      { timeout: 30_000 },
    );

    const nova = cat("64e2e0000000000000000c09", "Nova", SLOW_SPRITE);
    await page.evaluate(async (npc) => {
      window.dispatchEvent(new CustomEvent("PLAYER_CATS", { detail: { npc } }));
      await new Promise((resolve) => setTimeout(resolve, 60));
      window.dispatchEvent(new CustomEvent("PLAYER_CATS", { detail: { npc } }));
    }, nova);
    await page.waitForTimeout(3500);

    const readHome = () =>
      page.evaluate((id) => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        const scene = games.map((g) => g.scene.getScene("BaseScene")).find(Boolean) as Phaser.Scene & {
          cat?: { sprite: Phaser.Physics.Arcade.Sprite };
          npcCats: Array<{ sprite: Phaser.Physics.Arcade.Sprite; originalData: { _id: string } }>;
        };
        return {
          novaCount: scene.npcCats.filter((npc) => npc.sprite.active && npc.originalData._id === id).length,
          playerActive: !!scene.cat?.sprite.active,
          playerTexture: scene.cat?.sprite.texture.key ?? null,
        };
      }, nova._id);

    const before = await readHome();
    expect(before.novaCount).toBe(1);
    expect(before.playerActive).toBe(true);

    // Re-skin to a sheet that 404s: the current cat stays on screen with its texture.
    await page.evaluate(
      (next) => window.dispatchEvent(new CustomEvent("CAT_SPAWN", { detail: { cat: next } })),
      { ...PLAYER, spriteImg: MISSING_SPRITE },
    );
    await page.waitForTimeout(2500);
    const after = await readHome();
    expect(after.playerActive).toBe(true);
    expect(after.playerTexture).toBe(before.playerTexture);
  });

  test("home: re-sending an on-screen NPC with a new or a 404 sheet never drops its texture", async ({ page }) => {
    test.setTimeout(90_000);
    const SLOW_RESKIN = `${CDN}/E2E_SLOW_RESKIN/base.png`;
    await page.route(SLOW_RESKIN, async (route) => {
      const response = await route.fetch({ url: `${CDN}/OBI/base.png` });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({ response });
    });
    await enterMode(page, "home");
    const owned = OWNED[1];
    const readNpc = () =>
      page.evaluate((id) => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        const game = games[0];
        const scene = game.scene.getScene("BaseScene") as Phaser.Scene & {
          npcCats: Array<{ sprite: Phaser.Physics.Arcade.Sprite; originalData: { _id: string } }>;
        };
        const npcs = scene.npcCats.filter((npc) => npc.sprite.active && npc.originalData._id === id);
        const npc = npcs[0];
        return {
          frame: game.loop.frame,
          count: npcs.length,
          texture: npc?.sprite.texture.key ?? null,
          textureExists: npc ? scene.textures.exists(npc.sprite.texture.key) : false,
          animExists: npc?.sprite.anims.currentAnim ? scene.anims.exists(npc.sprite.anims.currentAnim.key) : null,
          npcKeys: scene.textures.getTextureKeys().filter((key) => key.startsWith(`npc-${id}`)),
        };
      }, owned._id);
    await expect.poll(async () => (await readNpc()).count, { timeout: 30_000 }).toBe(1);
    const before = await readNpc();
    expect(before.texture).toMatch(new RegExp(`^npc-${owned._id}-[0-9a-z]{7}$`));

    // 404 re-skin (the review's PROBE3): the NPC keeps its sheet and the loop keeps stepping.
    await page.evaluate(
      (npc) => window.dispatchEvent(new CustomEvent("PLAYER_CATS", { detail: { npc } })),
      { ...owned, spriteImg: MISSING_SPRITE },
    );
    await page.waitForTimeout(2500);
    const after404 = await readNpc();
    expect(after404.count).toBe(1);
    expect(after404.texture).toBe(before.texture);
    expect(after404.textureExists).toBe(true);
    expect(after404.animExists).not.toBe(false);
    expect(after404.frame).toBeGreaterThan(before.frame);

    // Slow valid re-skin: the old sheet stays drawn for the whole load, then is retired.
    await page.evaluate(
      (npc) => window.dispatchEvent(new CustomEvent("PLAYER_CATS", { detail: { npc } })),
      { ...owned, spriteImg: SLOW_RESKIN },
    );
    await page.waitForTimeout(800);
    const during = await readNpc();
    expect(during.texture).toBe(before.texture);
    expect(during.textureExists).toBe(true);
    expect(during.frame).toBeGreaterThan(after404.frame);
    await expect.poll(async () => (await readNpc()).texture, { timeout: 30_000 }).not.toBe(before.texture);
    const reskinned = await readNpc();
    expect(reskinned.count).toBe(1);
    expect(reskinned.textureExists).toBe(true);
    expect(reskinned.npcKeys).toEqual([reskinned.texture]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-npc-reskin-${test.info().project.name}.png` });
  });

  for (const mode of ["purrsuit", "cupid"] as const) {
    test(`${mode}: switching the cat's skin mid-run restarts with the new cat`, async ({ page }) => {
      test.setTimeout(90_000);
      await enterMode(page, mode);
      const scene = SCENE[mode];
      const playerKey = (key: string) =>
        page.evaluate((sceneKey) => {
          const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
          const s = games.map((g) => g.scene.getScene(sceneKey) as Phaser.Scene & { cat?: { sprite: Phaser.GameObjects.Sprite } }).find(Boolean);
          return s?.cat?.sprite?.active ? s.cat.sprite.texture.key : null;
        }, key);
      await expect.poll(() => playerKey(scene), { timeout: 30_000 }).not.toBeNull();
      const first = await playerKey(scene);

      await page.evaluate(
        (next) => window.dispatchEvent(new CustomEvent("CAT_SPAWN", { detail: { cat: next } })),
        { ...PLAYER, spriteImg: `${CDN}/SABLE/base.png` },
      );
      // Before the fix the restart passed { cat } instead of { detail: { cat } }: no cat came back.
      await expect
        .poll(() => playerKey(scene), { timeout: 30_000 })
        .toMatch(new RegExp(`^player-cat-${PLAYER._id}-`));
      const second = await playerKey(scene);
      expect(second).not.toBe(first);
    });
  }

  test("pawmatch: rotating before the first move rebuilds the board for the new shape", async ({ page }) => {
    test.setTimeout(90_000);
    const viewport = page.viewportSize()!;
    test.skip(viewport.width >= 800, "phones only: a desktop resize keeps its orientation");
    await enterMode(page, "pawmatch");
    await page.waitForTimeout(1500);
    const readBoard = () =>
      page.evaluate(() => {
        const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
        const scene = games.map((g) => g.scene.getScene("Match3Scene")).find(Boolean) as Phaser.Scene & {
          viewWidth: number;
          viewHeight: number;
        };
        return {
          layout: { width: scene.viewWidth, height: scene.viewHeight },
          zoom: scene.cameras.main.zoom,
          ratio: scene.game.registry.get("canvasPixelRatio") as number,
        };
      });
    const portrait = await readBoard();
    expect(portrait.layout).toEqual({ width: viewport.width, height: viewport.height });

    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await expect
      .poll(async () => (await readBoard()).layout.width, { timeout: 30_000 })
      .toBe(viewport.height);
    const landscape = await readBoard();
    // Rebuilt, not letterboxed: the camera is back at 1 CSS unit per CSS pixel.
    expect(landscape.zoom).toBeCloseTo(landscape.ratio, 5);
    await page.waitForTimeout(800);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/pawmatch-rotated-${test.info().project.name}.png` });
  });
});

