import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type { Frame, Page } from "@playwright/test";
import sharp from "sharp";
// Type-only: the global `Phaser` namespace for the page.evaluate callbacks.
import type {} from "phaser";
import { expect, gotoAndSettle, openFirstLevel, test, type BackendMock } from "../fixtures";
import { encodeWebm } from "./encode";
import { CAPTURE_VIEWPORT_NOTE, framesForVideoFrame, gameSelector, hideAllButGame } from "./frames";

/**
 * Landing reel capture (plan G7 "Deterministic capture mode" and "Landing reel"; decision #53).
 *
 * Each clip boots one mode in look v1 against page.route fixtures (the shared e2e backend mock and a
 * fake signed-in account, as world-look.spec.ts does), pauses the page clock, then steps it one
 * frame at a time: scripted key presses land on fixed frame numbers, and a viewport screenshot is
 * taken after every step. When the build has 6e's capture hooks (`NEXT_PUBLIC_CAPTURE=1`,
 * `window.__TT_CAPTURE__`) the driver steps Phaser through them instead, with the look seed set.
 * Frames are encoded to WebM (<= 1.5 MB, encode.ts) with a poster from the clip's middle frame,
 * written to `public/reel/<id>-v1.webm|webp`, and listed in `components/reel/reel-manifest.json`
 * (copied to `public/reel/manifest.json`).
 *
 * The determinism check captures the same frames twice in fresh contexts and compares the PNG
 * bytes; the report goes to `$REEL_FRAMES_DIR/determinism.json`.
 */

const CLIENT = resolve(__dirname, "..", "..");
const FRAMES_DIR =
  process.env.REEL_FRAMES_DIR ||
  "/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/scratchpad/build/6d/frames";

const LOOK_VERSION = "v1";
const FPS = 24;
const WIDTH = 960;
const HEIGHT = 444;
const MAX_BYTES = 1.5 * 1024 * 1024;
const CAPTURE_SEED = "reel-v1";
/** Keep in step with playwright.capture.config.ts. */
const CAPTURE_VIEWPORT = { width: 960, height: 444 };
/** REEL_DRY_RUN=1 writes clips to $REEL_FRAMES_DIR/dry-run only: public/reel and the manifest stay as they are. */
const DRY_RUN = process.env.REEL_DRY_RUN === "1";
const OUT_PUBLIC = DRY_RUN ? join(FRAMES_DIR, "dry-run") : join(CLIENT, "public");
const REEL_DIR = join(OUT_PUBLIC, "reel");

const CDN = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets";

type Input = { frame: number; down?: string; up?: string; press?: string };

interface ClipSpec {
  id: string;
  label: string;
  title: string;
  caption: string;
  frames: number;
  /** Frames stepped (inputs at negative frame numbers) before recording starts. */
  warmup?: number;
  /** Boots the mode; resolves when the scene is live. */
  enter: (page: Page) => Promise<Page | Frame>;
  inputs: Input[];
}

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

const PROFILE = {
  _id: "64e2e0000000000000000p01",
  name: "Reel",
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
  const source = readFileSync(join(CLIENT, "context", "FirebaseAuthContext.tsx"), "utf8");
  const match = /apiKey:\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("Firebase apiKey not found in FirebaseAuthContext.tsx");
  return match[1];
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const FAKE_ID_TOKEN = `${b64({ alg: "none", typ: "JWT" })}.${b64({
  exp: 4102444800,
  iat: 1700000000,
  auth_time: 1700000000,
  sub: "reel-uid",
  user_id: "reel-uid",
  aud: "e2e",
  iss: "e2e",
  firebase: { sign_in_provider: "password" },
})}.e2e`;

async function setup(page: Page, backend: BackendMock) {
  const apiKey = firebaseApiKey();
  await page.addInitScript(
    ({ key, user, look, seed }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__TT_E2E__ = true;
      w.__TT_CAPTURE_SEED__ = seed;
      localStorage.setItem(key, JSON.stringify(user));
      localStorage.setItem("tt-look-version", look);
      // Snowfall and other seasonal toggles stay at their defaults (off).
    },
    {
      key: `firebase:authUser:${apiKey}:[DEFAULT]`,
      look: LOOK_VERSION,
      seed: CAPTURE_SEED,
      user: {
        uid: "reel-uid",
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
      return route.fulfill({ json: { users: [{ localId: "reel-uid", email: "player@e2e.invalid", emailVerified: true, providerUserInfo: [] }] } });
    }
    return route.fulfill({ json: { id_token: FAKE_ID_TOKEN, access_token: FAKE_ID_TOKEN, refresh_token: "e2e-refresh", expires_in: "3600" } });
  });
  backend
    .on("GET", "/user/profile", { body: PROFILE })
    .on("GET", "/user/cats", { body: [PLAYER] })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: 1 })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/cat/sale", { body: { tokentails: [], "token-tails": [], "token-tails-2": [], "rozine-pedute": [], _meta: { _v: 1, generatedAt: "2026-09-30T12:00:00.000Z", shelters: [] } } })
    .on("GET", /^\/impact/, { status: 404, body: {} })
    .on("GET", "/shelter/donate/status", { status: 404, body: {} })
    // The reel never saves: a run that ends is answered, nothing is recorded anywhere.
    .on("POST", "/user/catbassadors/live", () => ({ body: PROFILE }));
}

async function waitForScene(page: Page, key: string) {
  await page.waitForFunction(
    (sceneKey) => {
      const games = ((window as unknown as { __ttGames?: Phaser.Game[] }).__ttGames || []).filter((g) => g.canvas?.isConnected);
      const scene = games.map((g) => g.scene.getScene(sceneKey) as Phaser.Scene & { cat?: unknown }).find(Boolean);
      return !!scene?.sys.isActive() && !!scene.cat;
    },
    key,
    { timeout: 60_000 },
  );
  // Let textures, plates and fonts settle in real time before the clock is paused.
  await page.waitForTimeout(2500);
}

const click = async (page: Page, locator: ReturnType<Page["locator"]>) => {
  await locator.first().click();
  await page.waitForTimeout(800);
};

async function enterHub(page: Page, shelter: boolean) {
  await gotoAndSettle(page, "/game", 2500);
  await click(page, page.locator('img[src*="game/select/home"]'));
  if (shelter) {
    await page.getByRole("button", { name: "SHELTER" }).first().dispatchEvent("click");
    await page.waitForTimeout(800);
  }
  await waitForScene(page, shelter ? "ShelterScene" : "BaseScene");
  return page;
}

async function enterPurrsuit(page: Page) {
  await gotoAndSettle(page, "/game", 2500);
  await click(page, page.getByText("PLAY", { exact: true }));
  await click(page, page.getByText("PURRSUIT", { exact: true }).filter({ visible: true }));
  await waitForScene(page, "CatnipChaosScene");
  return page;
}

async function enterCupid(page: Page) {
  await gotoAndSettle(page, "/game", 2500);
  await click(page, page.getByText("PLAY", { exact: true }));
  await click(page, page.getByText("CUPID CAT", { exact: true }).filter({ visible: true }));
  await openFirstLevel(page, "cupid");
  await waitForScene(page, "PixelRescueScene");
  return page;
}

async function enterHeist(page: Page) {
  await gotoAndSettle(page, "/heist", 3000);
  await expect(page.getByTestId("heist-host")).toHaveAttribute("data-bridge", "ready", { timeout: 90_000 });
  const frame = page.frames().find((candidate) => candidate.url().includes("/heist-game/"));
  if (!frame) throw new Error("the Heist iframe did not load");
  await frame.waitForFunction(() => document.getElementById("app")?.dataset.ready === "1", undefined, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  // Through the title screen, the crew picker (two cats) and the level briefing, whichever show.
  const visible = (locator: ReturnType<Frame["locator"]>) => locator.filter({ visible: true }).first();
  for (let i = 0; i < 10; i++) {
    const start = visible(frame.getByRole("button", { name: /start heist/i }));
    const go = visible(frame.getByRole("button", { name: /^go!?$/i }));
    const play = visible(frame.getByRole("button", { name: /^(play|start)\b/i }));
    const moreCats = visible(frame.getByText(/choose \d+ more cat/i));
    if (await go.isVisible().catch(() => false)) {
      await go.click();
      await page.waitForTimeout(1500);
      break;
    }
    if (await moreCats.isVisible().catch(() => false)) {
      await visible(frame.getByText("Charles", { exact: true })).click();
    } else if ((await start.isVisible().catch(() => false)) && (await start.isEnabled())) {
      await start.click();
    } else if (await play.isVisible().catch(() => false)) {
      await play.click();
    } else break;
    await page.waitForTimeout(1500);
  }
  // Keys go to the iframe: focus its canvas.
  await frame.locator("canvas").first().focus().catch(() => {});
  await frame.evaluate(() => (document.querySelector("canvas") as HTMLCanvasElement | null)?.focus?.());
  await page.waitForTimeout(1000);
  return page;
}

const CLIPS: ClipSpec[] = [
  {
    id: "home",
    label: "Home",
    title: "Your cat at home under a moonlit sky",
    // The caption says only what the clip shows (task 6d review, finding 3).
    caption: "Home: your rescue cat lives here, under a moonlit sky.",
    frames: 96,
    enter: (page) => enterHub(page, false),
    // Short walks either side of the start, so the cat stays in frame (the Home camera has walls).
    inputs: [
      { frame: 6, down: "ArrowRight" },
      { frame: 22, press: "Space" },
      { frame: 34, up: "ArrowRight" },
      { frame: 40, down: "ArrowLeft" },
      { frame: 64, press: "Space" },
      { frame: 76, up: "ArrowLeft" },
    ],
  },
  {
    id: "purrsuit",
    label: "Purrsuit",
    title: "Purrsuit level 1-1: the cat runs and jumps for catnip",
    caption: "Purrsuit: run, jump and collect catnip across night worlds.",
    frames: 108,
    warmup: 6,
    enter: enterPurrsuit,
    inputs: [
      { frame: -5, press: "Space" },
      { frame: 30, press: "Space" },
      { frame: 58, press: "Space" },
      { frame: 84, press: "Space" },
    ],
  },
  {
    id: "cupid",
    label: "Cupid Cat",
    title: "Cupid Cat day 1: a rose-lit night platformer",
    caption: "Cupid Cat: a daily level with a starter shield for new players.",
    frames: 96,
    // The start tap, then the intro pan to the caged cat and back, before recording.
    warmup: 110,
    enter: enterCupid,
    inputs: [
      { frame: -108, press: "Space" },
      { frame: 2, down: "ArrowRight" },
      { frame: 30, press: "Space" },
      { frame: 62, press: "Space" },
      { frame: 92, up: "ArrowRight" },
    ],
  },
  {
    id: "shelter",
    label: "Shelter",
    title: "The shelter at dusk, with cats waiting for a home",
    caption: "Shelter: meet the cats waiting for a home.",
    frames: 84,
    enter: (page) => enterHub(page, true),
    inputs: [
      { frame: 6, down: "ArrowRight" },
      { frame: 50, press: "Space" },
      { frame: 80, up: "ArrowRight" },
    ],
  },
  {
    id: "heist",
    label: "Catnip Heist",
    title: "Catnip Heist: sneak through a voxel level and grab the catnip",
    // Task 4b shipped G2 layer 3 (Heist scores reach the account), so the caption may say so.
    caption: "Catnip Heist: play in the browser, no sign-up. Scores save to your account when you sign in.",
    frames: 96,
    enter: enterHeist,
    inputs: [
      { frame: 4, down: "ArrowUp" },
      { frame: 40, up: "ArrowUp" },
      { frame: 42, down: "ArrowRight" },
      { frame: 70, up: "ArrowRight" },
      { frame: 72, down: "ArrowUp" },
      { frame: 94, up: "ArrowUp" },
    ],
  },
];

const selected = (process.env.REEL_CLIPS || "").split(",").map((s) => s.trim()).filter(Boolean);
const CLIPS_TO_RUN = selected.length ? CLIPS.filter((c) => selected.includes(c.id)) : CLIPS;

async function act(page: Page, input: Input) {
  if (input.down) await page.keyboard.down(input.down);
  if (input.up) await page.keyboard.up(input.up);
  if (input.press) {
    await page.keyboard.down(input.press);
    await stepOnce(page);
    await page.keyboard.up(input.press);
  }
}

let useHooks = false;
/** Game frames (60 Hz) owed but not yet stepped: `step()` floors its count, so carry the fraction. */
let owedFrames = 0;

async function stepOnce(page: Page) {
  if (useHooks) {
    const { step, owed } = framesForVideoFrame(owedFrames, FPS);
    owedFrames = owed;
    // 60 Hz game frames, so physics runs at its usual step and the clip plays at real speed
    // (task 6d review, finding 5: step(2.5) was floored to 2, which ran the game at 80%).
    await page.evaluate((frames) => {
      const api = (window as unknown as { __TT_CAPTURE__?: { step: (n: number, dt: number) => number } }).__TT_CAPTURE__;
      api?.step(frames, 1000 / 60);
    }, step);
  }
  // Timers, requestAnimationFrame and performance.now all follow the paused page clock.
  await page.clock.runFor(Math.round(1000 / FPS));
}

/**
 * The on-screen rectangle of the game (the largest visible canvas, or the Heist iframe), so the
 * clip never shows letterbox bands or page chrome around it.
 */
async function gameArea(page: Page, clip: ClipSpec) {
  const selector = gameSelector(clip.id);
  const box = await page.evaluate((sel) => {
    let best: { x: number; y: number; width: number; height: number } | null = null;
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      const x = Math.max(0, r.left);
      const y = Math.max(0, r.top);
      const width = Math.min(window.innerWidth, r.right) - x;
      const height = Math.min(window.innerHeight, r.bottom) - y;
      if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) best = { x, y, width, height };
    }
    return best;
  }, selector);
  return box ?? undefined;
}

/** Captures `count` frames of a booted mode with the clock paused. */
async function captureFrames(page: Page, clip: ClipSpec, count = clip.frames): Promise<Buffer[]> {
  // Keys go to the page body, except for the Heist, whose iframe keeps focus.
  if (clip.id !== "heist") await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  useHooks = await page.evaluate(() => !!(window as unknown as { __TT_CAPTURE__?: unknown }).__TT_CAPTURE__);
  owedFrames = 0;
  // Only the game: no touch controls, CLOSE, GO BACK or dev badge in the clip (finding 3).
  await page.evaluate(hideAllButGame, gameSelector(clip.id));
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 100);
  const area = await gameArea(page, clip);
  const frames: Buffer[] = [];
  for (let f = -(clip.warmup ?? 0); f < count; f++) {
    for (const input of clip.inputs.filter((i) => i.frame === f)) await act(page, input);
    await stepOnce(page);
    if (f >= 0) frames.push(await page.screenshot({ animations: "disabled", caret: "hide", clip: area }));
  }
  return frames;
}

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function writeManifest() {
  const clips = CLIPS.map((clip) => {
    const metaPath = join(REEL_DIR, `${clip.id}-${LOOK_VERSION}.json`);
    if (!existsSync(metaPath)) return null;
    return JSON.parse(readFileSync(metaPath, "utf8"));
  }).filter(Boolean);
  const manifest = { schemaVersion: 1, lookVersion: LOOK_VERSION, clips };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!DRY_RUN) writeFileSync(join(CLIENT, "components", "reel", "reel-manifest.json"), text);
  writeFileSync(join(REEL_DIR, "manifest.json"), text);
}

test.describe("landing reel capture", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ allowUnmocked: true, allowPageErrors: true });

  for (const clip of CLIPS_TO_RUN) {
    test(`clip: ${clip.id}`, async ({ page, backend, browser }) => {
      await setup(page, backend);
      await clip.enter(page);
      const frames = await captureFrames(page, clip);
      // Shipping clips must be stepped through the hooks from game time 0 (6d review, finding 3).
      if (!DRY_RUN && !useHooks) {
        throw new Error("This build has no capture hooks: run against a NEXT_PUBLIC_CAPTURE=1 build, or set REEL_DRY_RUN=1 to preview");
      }
      const dir = join(FRAMES_DIR, clip.id);
      mkdirSync(dir, { recursive: true });
      frames.forEach((frame, i) => writeFileSync(join(dir, `${String(i).padStart(4, "0")}.png`), frame));

      const { bytes, bitrate, mimeType } = await encodeWebm(browser, frames, { fps: FPS, width: WIDTH, height: HEIGHT, maxBytes: MAX_BYTES });
      mkdirSync(REEL_DIR, { recursive: true });
      const src = `reel/${clip.id}-${LOOK_VERSION}.webm`;
      const poster = `reel/${clip.id}-${LOOK_VERSION}.webp`;
      writeFileSync(join(OUT_PUBLIC, src), bytes);
      await sharp(frames[Math.floor(frames.length / 2)]).resize(WIDTH, HEIGHT, { fit: "cover" }).webp({ quality: 82 }).toFile(join(OUT_PUBLIC, poster));
      const meta = {
        id: clip.id,
        label: clip.label,
        title: clip.title,
        caption: clip.caption,
        src,
        poster,
        width: WIDTH,
        height: HEIGHT,
        durationMs: Math.round((frames.length / FPS) * 1000),
        bytes: bytes.length,
        lookVersion: LOOK_VERSION,
        fps: FPS,
        mimeType,
        bitrate,
        steppedBy: useHooks ? "__TT_CAPTURE__" : "page.clock",
        framesSha256: sha(Buffer.concat(frames.map((f) => Buffer.from(sha(f), "hex")))),
      };
      writeFileSync(join(REEL_DIR, `${clip.id}-${LOOK_VERSION}.json`), `${JSON.stringify(meta, null, 2)}\n`);
      writeManifest();
      expect(bytes.length).toBeLessThanOrEqual(MAX_BYTES);
    });
  }

  test("determinism: two runs give byte-identical frames for a fixed seed", async ({ browser }, testInfo) => {
    const clip = CLIPS.find((c) => c.id === "purrsuit")!;
    const runs: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const context = await browser.newContext({ viewport: CAPTURE_VIEWPORT, deviceScaleFactor: 2, ...CAPTURE_VIEWPORT_NOTE });
      const page = await context.newPage();
      // The same determinism the e2e fixtures apply (fixed clock, seeded Math.random, mocked backend).
      const { makeDeterministic } = await import("../fixtures/determinism");
      const { BackendMock } = await import("../fixtures/backend");
      const { NetworkGuard } = await import("../fixtures/network");
      await new NetworkGuard(testInfo.project.use.baseURL || "http://localhost:3001").install(page);
      const backend = new BackendMock();
      await backend.install(page);
      await makeDeterministic(page);
      await setup(page, backend);
      await clip.enter(page);
      const frames = await captureFrames(page, { ...clip, inputs: clip.inputs.filter((i) => i.frame < 16) }, 16);
      const dir = join(FRAMES_DIR, "determinism", `run-${run}`);
      mkdirSync(dir, { recursive: true });
      frames.forEach((frame, i) => writeFileSync(join(dir, `${String(i).padStart(4, "0")}.png`), frame));
      runs.push(frames.map(sha));
      await context.close();
    }
    const same = runs[0].filter((h, i) => h === runs[1][i]).length;
    const steppedBy = useHooks ? "__TT_CAPTURE__" : "page.clock";
    const report = {
      clip: clip.id,
      frames: runs[0].length,
      identical: same,
      deterministic: same === runs[0].length,
      steppedBy,
      note:
        steppedBy === "page.clock"
          ? "This build has no capture hooks (NEXT_PUBLIC_CAPTURE unset). The page clock is paused only after a real-time boot, so the scene state at frame 0 differs run to run. Byte-identical frames need a NEXT_PUBLIC_CAPTURE=1 build, where __TT_CAPTURE__.step() restarts game time at 0."
          : "Stepped through __TT_CAPTURE__ from game time 0.",
      runs,
    };
    mkdirSync(FRAMES_DIR, { recursive: true });
    writeFileSync(join(FRAMES_DIR, "determinism.json"), `${JSON.stringify(report, null, 2)}\n`);
    // Skip only when the build cannot be deterministic (no hooks). With the hooks a mismatch is a
    // real failure (task 6d review, finding 4: it used to skip on any mismatch).
    if (!report.deterministic && steppedBy === "page.clock") {
      const reason = `no capture hooks in this build (NEXT_PUBLIC_CAPTURE unset): ${same}/${runs[0].length} frames identical; see determinism.json`;
      console.log(`[capture] determinism skipped: ${reason}`);
      testInfo.annotations.push({ type: "skip-reason", description: reason });
      test.skip(true, reason);
    }
    expect(report.deterministic, `${same}/${runs[0].length} frames identical with __TT_CAPTURE__; see determinism.json`).toBe(true);
  });

  test.afterAll(() => {
    if (existsSync(REEL_DIR)) writeManifest();
  });
});
