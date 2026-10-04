import type { Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";
import { FIXED_NOW } from "./fixtures/determinism";

/**
 * Lobby audio (plan G14 "Audio", task 6c):
 * - no music element and no music request before the first user input; the lobby theme loops
 *   after it;
 * - the mute toggle in the lobby HUD persists across reloads;
 * - everything works with localStorage blocked (defaults, changes live for the page);
 * - music pauses while a GameModal is open and resumes after it, except in Settings, which keeps
 *   it playing so the player hears the volume they set;
 * - Settings has the music and effects sliders, mute and the graphics tier, all with names and
 *   44 px targets.
 *
 * Every `new Audio()` is recorded through an init script, so the test reads the real element.
 * Set AUDIO_SHOTS=<dir> to save screenshots (task evidence; nothing is compared).
 */

const SHOTS = process.env.AUDIO_SHOTS || "";

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

function mockBackend(backend: BackendMock) {
  backend
    .on("GET", "/user/profile", { body: PLAYER })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 1 } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/user/cats", { body: [CAT] })
    .on("GET", /^\/user\/airdrop/, { body: {} })
    .on("GET", "/shelter/donate/status", {
      body: { enabled: false, railState: "not-deployed", treatsLeftToday: 0, resetsAt: FIXED_NOW.toISOString() },
    });
}

interface MusicState {
  count: number;
  src: string | null;
  paused: boolean | null;
  volume: number | null;
  loop: boolean | null;
}

async function prepare(page: Page, backend: BackendMock, options: { blockStorage?: boolean } = {}) {
  mockBackend(backend);
  // Snapshots the lobby impact widgets read; empty is fine here.
  await page.route(/\/impact\/impact\.json$/, (route) => route.fulfill({ status: 404, body: "" }));
  await page.addInitScript(
    ({ blockStorage }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__TT_E2E_AUTH__ = { user: { uid: "player-1", isAnonymous: false } };
      w.__TT_E2E__ = true;
      const audios: HTMLAudioElement[] = [];
      w.__audios = audios;
      const NativeAudio = window.Audio;
      // Records every element the page creates; behaves exactly like the native constructor.
      const Recorded = function (this: unknown, src?: string) {
        const el = new NativeAudio(src);
        audios.push(el);
        return el;
      } as unknown as typeof Audio;
      Recorded.prototype = NativeAudio.prototype;
      window.Audio = Recorded;
      if (blockStorage) {
        // Every read and write of the sound and graphics settings throws, as with blocked site
        // data. Only these keys: with all of localStorage blocked the page never boots, because
        // the Stellar Wallets Kit reads localStorage unguarded at module load (reported in the
        // 6c log; not an audio issue).
        const blocked = (key: unknown) => /^(tt:audio|tt-render-tier|gameMusic)/.test(String(key));
        const proto = Storage.prototype;
        const { getItem, setItem, removeItem } = proto;
        const fail = () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        };
        proto.getItem = function (this: Storage, key: string) {
          return blocked(key) ? fail() : getItem.call(this, key);
        };
        proto.setItem = function (this: Storage, key: string, value: string) {
          return blocked(key) ? fail() : setItem.call(this, key, value);
        };
        proto.removeItem = function (this: Storage, key: string) {
          return blocked(key) ? fail() : removeItem.call(this, key);
        };
      }
    },
    { blockStorage: !!options.blockStorage }
  );
}

async function openLobby(page: Page) {
  await gotoAndSettle(page, "/game", 2500);
  await expect(page.getByRole("button", { name: "MY PETS", exact: true })).toBeVisible({ timeout: 30_000 });
}

const music = (page: Page) =>
  page.evaluate((): MusicState => {
    const all = ((window as unknown as { __audios: HTMLAudioElement[] }).__audios || []).filter((a) =>
      /\/music\//.test(a.src)
    );
    const el = all[all.length - 1];
    return {
      count: all.length,
      src: el ? el.src : null,
      paused: el ? el.paused : null,
      volume: el ? el.volume : null,
      loop: el ? el.loop : null,
    };
  });

/** A neutral first input: a tap on the empty sky at the top centre of the lobby. */
async function firstInput(page: Page) {
  const size = page.viewportSize()!;
  await page.mouse.click(size.width / 2, Math.min(60, size.height / 10));
}

async function shot(page: Page, name: string, project: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}-${project}.png`) });
}

test.describe("lobby audio (G14, task 6c)", () => {
  test.use({ allowUnmocked: true });

  test("no music before the first input; the lobby theme loops after it", async ({ page, backend }, testInfo) => {
    const musicRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/music\//.test(request.url())) musicRequests.push(request.url());
    });
    await prepare(page, backend);
    await openLobby(page);
    await page.waitForTimeout(1000);
    expect(await music(page)).toMatchObject({ count: 0 });
    expect(musicRequests, "music fetched before any input").toEqual([]);

    await firstInput(page);
    await expect.poll(async () => (await music(page)).paused, { timeout: 10_000 }).toBe(false);
    const state = await music(page);
    expect(state.count).toBe(1);
    expect(decodeURI(state.src!)).toContain("/music/Adam Dib - Over the River Through the Woods.mp3");
    expect(state.loop).toBe(true);
    expect(state.volume).toBeCloseTo(0.4);
    await shot(page, "lobby", testInfo.project.name);
  });

  test("the HUD mute toggle pauses music and persists across reloads", async ({ page, backend }) => {
    await prepare(page, backend);
    await openLobby(page);
    const mute = page.getByRole("button", { name: "Mute sound" });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    const box = (await mute.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await firstInput(page);
    await expect.poll(async () => (await music(page)).paused).toBe(false);
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await music(page)).paused).toBe(true);

    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Mute sound" })).toHaveAttribute("aria-pressed", "true", {
      timeout: 30_000,
    });
    await firstInput(page);
    await page.waitForTimeout(800);
    expect((await music(page)).count, "muted: no music element is created").toBe(0);

    await page.getByRole("button", { name: "Mute sound" }).click();
    await expect.poll(async () => (await music(page)).paused).toBe(false);
  });

  test("muting as the very first input never fetches the track", async ({ page, backend }) => {
    const musicRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/music\//.test(request.url())) musicRequests.push(request.url());
    });
    await prepare(page, backend);
    await openLobby(page);
    const mute = page.getByRole("button", { name: "Mute sound" });
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(800);
    expect((await music(page)).count, "no music element").toBe(0);
    expect(musicRequests, "music fetched for a player who only wanted silence").toEqual([]);
    // Unmuting through the same control plays at once: that tap already counted as an input.
    await mute.click();
    await expect.poll(async () => (await music(page)).paused, { timeout: 10_000 }).toBe(false);
  });

  // The lobby redesign (f9d2ce3c) puts them in one row under ABOUT ME, sound outermost and
  // right-aligned with it (components/audio/hudPlacement.ts).
  test("Settings and mute sit in one row under ABOUT ME", async ({ page, backend }) => {
    await prepare(page, backend);
    await openLobby(page);
    const about = (await page.getByRole("button", { name: /ABOUT ME/ }).boundingBox())!;
    const settings = (await page.getByRole("button", { name: "Settings" }).boundingBox())!;
    const mute = (await page.getByRole("button", { name: "Mute sound" }).boundingBox())!;
    const gap = settings.y - (about.y + about.height);
    expect(gap, "gap under ABOUT ME").toBeGreaterThanOrEqual(4);
    expect(gap, "gap under ABOUT ME").toBeLessThanOrEqual(24);
    expect(Math.abs(mute.y - settings.y), "one row").toBeLessThanOrEqual(1);
    const between = mute.x - (settings.x + settings.width);
    expect(between, "settings left of sound").toBeGreaterThanOrEqual(4);
    expect(between, "settings left of sound").toBeLessThanOrEqual(16);
    expect(Math.abs(mute.x + mute.width - (about.x + about.width)), "right edges").toBeLessThanOrEqual(2);
  });

  test("works with storage blocked: defaults, and mute holds for the page", async ({ page, backend }) => {
    await prepare(page, backend, { blockStorage: true });
    await openLobby(page);
    await firstInput(page);
    await expect.poll(async () => (await music(page)).paused, { timeout: 10_000 }).toBe(false);
    expect((await music(page)).volume).toBeCloseTo(0.4);
    const mute = page.getByRole("button", { name: "Mute sound" });
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await music(page)).paused).toBe(true);
    // Nothing was stored, so a reload is back to the defaults (sound on).
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Mute sound" })).toHaveAttribute("aria-pressed", "false", {
      timeout: 30_000,
    });
    // The graphics tier holds for the visit and says it was not stored.
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("dialog", { name: "SETTINGS" }).getByRole("radio", { name: "Low" }).click();
    await expect(page.getByText("Saved for this visit only", { exact: false })).toBeVisible();
  });

  test("music pauses while a GameModal is open, and Settings keeps it playing", async ({ page, backend }, testInfo) => {
    await prepare(page, backend);
    await openLobby(page);
    await firstInput(page);
    await expect.poll(async () => (await music(page)).paused).toBe(false);

    // MY PETS opens the CATS GameModal: the F3.5 suspension pauses DOM audio too.
    await page.getByRole("button", { name: "MY PETS", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(async () => (await music(page)).paused).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await music(page)).paused).toBe(false);

    // Settings: sound and graphics; music keeps playing so the volume can be heard.
    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.getByRole("dialog", { name: "SETTINGS" });
    await expect(settings).toBeVisible();
    await page.waitForTimeout(300);
    expect((await music(page)).paused).toBe(false);

    const slider = settings.getByRole("slider", { name: "Music volume" });
    await expect(slider).toHaveValue("40");
    await slider.fill("70");
    await expect.poll(async () => (await music(page)).volume).toBeCloseTo(0.7);
    await expect(settings.getByRole("slider", { name: "Effects volume" })).toHaveValue("60");
    await expect(settings.getByRole("radiogroup", { name: "Graphics" })).toBeVisible();
    await expect(settings.getByRole("radiogroup", { name: "Reduce motion" })).toBeVisible();
    for (const name of ["Auto", "High", "Low", "System", "Music and effects"]) {
      const control = name === "Music and effects" ? settings.getByRole("switch", { name }) : settings.getByRole("radio", { name });
      const r = (await control.boundingBox())!;
      expect(r.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    await settings.getByRole("radio", { name: "Low" }).click();
    expect(await page.evaluate(() => localStorage.getItem("tt-render-tier"))).toBe("low");
    await expect(settings.getByRole("radio", { name: "Low" })).toHaveAttribute("aria-checked", "true");
    await shot(page, "settings", testInfo.project.name);

    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible({ timeout: 30_000 });
    await firstInput(page);
    await expect.poll(async () => (await music(page)).volume, { timeout: 10_000 }).toBeCloseTo(0.7);
  });

  test("music pauses while the tab is hidden", async ({ page, backend }) => {
    await prepare(page, backend);
    await openLobby(page);
    await firstInput(page);
    await expect.poll(async () => (await music(page)).paused).toBe(false);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(async () => (await music(page)).paused).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(async () => (await music(page)).paused).toBe(false);
  });
});
