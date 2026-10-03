import AxeBuilder from "@axe-core/playwright";
import type { Frame, Page, Request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * Catnip Heist in the shell (plan G2 layers 1 and 3, G14): the four-card picker, /heist with the
 * embedded build, and account-linked saves through POST /user/catbassadors/live with the replay.
 *
 * Firebase is faked in the page (`window.__TT_E2E_AUTH__`, development and E2E builds only); every
 * backend call is a real request answered by the `backend` mock. The Heist itself is the built
 * client/public/heist-game (catnip-heist: `npm run build:client`), so a stale build fails here.
 *
 * That shipped build has no QA hooks (they exist only in builds made with VITE_HEIST_QA=1). Tests
 * that win a level with the bundled solution (`__heist.playSolution`) build a QA copy of the same
 * source once per run, into test-results/heist-game-qa, and serve it in place of /heist-game/.
 */

const GUEST_UID = "e2e-heist-guest";
const CAT = {
  _id: "64e2e0000000000000000c01",
  name: "Scout",
  isStarter: true,
  type: "GRASS",
  tier: "COMMON",
  spriteImg: "/cats/yellow/sprites/hat-wizard-blue.png",
  catImg: "/logo/logo.webp",
  status: { EAT: 0 },
};
const GUEST = {
  _id: "64e2e0000000000000000a01",
  isGuest: true,
  transient: false,
  name: "Guest",
  onboarding: { state: "done" },
  tails: 0,
  catnipChaos: [],
  match3: [],
  cat: CAT,
  cats: [CAT],
  codex: [],
  quests: [],
  streak: 0,
  canRedeemLives: true,
  heistScore: [0, 0, 0, 0, 0, 0, 0, 0],
  heistStars: [0, 0, 0, 0, 0, 0, 0, 0],
};
const PLAYER = { ...GUEST, isGuest: false, name: "Player" };

const isUserToken = (token: string | undefined) => !!token && token.endsWith(".user");

/** A persisted guest (and a player after sign-in) whose /live accepts Heist replays. */
function mockBackend(backend: BackendMock) {
  const saves: Array<{ token: string | undefined; body: Record<string, unknown> }> = [];
  backend
    .on("GET", "/user/profile", (request) => ({ body: isUserToken(request.headers()["accesstoken"]) ? PLAYER : GUEST }))
    .on("POST", "/user/catbassadors/live", (request: Request) => {
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>;
      saves.push({ token: request.headers()["accesstoken"], body });
      return { status: 201, body: { ...GUEST, heistScore: [229, 0, 0, 0, 0, 0, 0, 0], heistStars: [7, 0, 0, 0, 0, 0, 0, 0] } };
    })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 3 } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/cats/, { body: [CAT] });
  return { saves };
}

async function fakeFirebase(page: Page, user: Record<string, unknown> | null) {
  await page.addInitScript((value) => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = value;
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  }, user ? { user } : {});
}

/** The embedded Heist, once it booted and the bridge connected (`qa`: its QA hooks are in, ?qa=1). */
async function heistFrame(page: Page, qa = true): Promise<Frame> {
  await expect(page.getByTestId("heist-host")).toHaveAttribute("data-bridge", "ready", { timeout: 90_000 });
  const frame = page.frames().find((candidate) => candidate.url().includes("/heist-game/index.html"));
  expect(frame, "the Heist iframe").toBeTruthy();
  await frame!.waitForFunction(
    (withQa) => (!withQa || !!(window as unknown as { __heist?: unknown }).__heist) && document.getElementById("app")?.dataset.ready === "1",
    qa,
    { timeout: 90_000 }
  );
  return frame!;
}

const HEIST_SRC = path.resolve(process.cwd(), "../catnip-heist");
const QA_OUT = path.resolve(process.cwd(), "test-results/heist-game-qa");

/** Newest modification time of the Heist sources that go into a build. */
function heistSourceStamp(): string {
  let newest = 0;
  const walk = (entry: string) => {
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(entry)) if (name !== "__tests__") walk(path.join(entry, name));
    } else newest = Math.max(newest, stat.mtimeMs);
  };
  for (const entry of ["src", "index.html", "vite.config.ts", "public/manifest.json"]) {
    const full = path.join(HEIST_SRC, entry);
    if (fs.existsSync(full)) walk(full);
  }
  return String(Math.floor(newest));
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Builds the QA copy of the Heist (VITE_HEIST_QA=1, base /heist-game/) unless an up-to-date one
 * exists. Workers share one build: the first takes a directory lock, the others wait for its stamp.
 */
function ensureQaHeistBuild(): void {
  const stamp = heistSourceStamp();
  const marker = path.join(QA_OUT, ".stamp");
  const fresh = () => fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === stamp;
  if (fresh()) return;
  const lock = `${QA_OUT}.lock`;
  fs.mkdirSync(path.dirname(QA_OUT), { recursive: true });
  for (let waited = 0; ; waited += 500) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch {
      if (fresh()) return;
      // A lock left by a crashed run: take it over after 3 minutes.
      if (waited > 180_000) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      sleep(500);
    }
  }
  try {
    if (fresh()) return;
    execFileSync(path.join(HEIST_SRC, "node_modules/.bin/vite"), ["build", "--outDir", QA_OUT, "--emptyOutDir"], {
      cwd: HEIST_SRC,
      stdio: "pipe",
      env: {
        ...process.env,
        VITE_HEIST_QA: "1",
        HEIST_BASE: "/heist-game/",
        HEIST_PAYOUTS_URL: "/shelter-payouts",
        HEIST_DEPLOYMENTS_URL: "/shelter-payouts/deployments.json",
      },
    });
    fs.writeFileSync(marker, stamp);
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/** Serves the QA build for /heist-game/* on this page (its iframe included). */
async function useQaHeist(page: Page) {
  ensureQaHeistBuild();
  await page.route("**/heist-game/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const relative = decodeURIComponent(pathname.replace(/^\/heist-game\/?/, "")) || "index.html";
    const file = path.join(QA_OUT, relative);
    if (!file.startsWith(QA_OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.continue();
    await route.fulfill({ path: file });
  });
}

const queueOf = (page: Page) => page.evaluate(() => localStorage.getItem("tt.heist.queue.v1"));

test.describe("game picker (G2 layer 1, G14)", () => {
  test.use({ allowUnmocked: true });

  test("shows four cards with the X on the frame post, clear of ABOUT ME, and passes axe", async ({ page, backend }) => {
    mockBackend(backend);
    await fakeFirebase(page, { uid: GUEST_UID, isAnonymous: true });
    const phone = page.viewportSize()!.width < 768;
    if (phone) {
      // A notched phone: env(safe-area-inset-*) is 0 in plain Chromium, so emulate the notch (47 px
      // top, 34 px home indicator) and check the X really clears it.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
    }
    await gotoAndSettle(page, "/game", 2_500);
    if (phone) {
      expect(await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.paddingTop = "env(safe-area-inset-top)";
        document.body.appendChild(probe);
        const top = getComputedStyle(probe).paddingTop;
        probe.remove();
        return top;
      }), "the notch emulation is active").toBe("47px");
    }
    await page.getByText("PLAY", { exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Choose your adventure" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("listitem")).toHaveCount(4);
    await expect(dialog.getByRole("link", { name: "CATNIP HEIST · NO SIGN-UP" })).toHaveAttribute("href", "/heist?from=picker");
    await expect(dialog.getByText("CLASSIC", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/no new levels/i)).toHaveCount(0);

    // X geometry: on the frame's top-right post, inside the viewport, below a 47 px notch, and not
    // over the lobby's ABOUT ME button. Measured once the frame art has loaded.
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="dialog"] img')).every((img) => (img as HTMLImageElement).complete));
    const viewport = page.viewportSize()!;
    const close = (await dialog.getByRole("button", { name: "Close" }).boundingBox())!;
    const frame = (await page.getByTestId("game-select-frame").boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(Math.abs(close.x + close.width - (frame.x + frame.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(close.y - frame.y)).toBeLessThanOrEqual(1);
    expect(close.x).toBeGreaterThanOrEqual(0);
    expect(close.x + close.width).toBeLessThanOrEqual(viewport.width);
    expect(close.y).toBeGreaterThanOrEqual(phone ? 47 : 0);
    expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height - (phone ? 34 : 0) + 1);
    const about = await page.getByText("ABOUT ME", { exact: true }).first().boundingBox();
    if (about) {
      const overlaps =
        close.x < about.x + about.width && close.x + close.width > about.x && close.y < about.y + about.height && close.y + close.height > about.y;
      expect(overlaps, "the picker X overlaps ABOUT ME").toBe(false);
    }
    // Every card is a 44 px tap target or larger.
    for (const card of await dialog.locator("li > a, li > button").all()) {
      const box = (await card.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }

    // The full axe rule set on the dialog (contrast, landmarks, names, focus order ...): no exclusions.
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("tapping the Heist card loads /heist with no modal, and level 1 is playable on the third tap", async ({ page, backend }) => {
    test.setTimeout(180_000);
    mockBackend(backend);
    await fakeFirebase(page, { uid: GUEST_UID, isAnonymous: true });
    await gotoAndSettle(page, "/game", 2_500);
    let taps = 0;
    await page.getByText("PLAY", { exact: true }).first().click();
    taps += 1;
    await page.getByRole("link", { name: /CATNIP HEIST/ }).click();
    taps += 1;
    await page.waitForURL(/\/heist(\?|$)/, { timeout: 60_000 });
    // The shipped build: no QA hooks, and none can be switched on from the URL.
    const frame = await heistFrame(page, false);
    expect(await frame.evaluate(() => "__heist" in window)).toBe(false);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("heist-frame")).toBeVisible();
    await expect(page).toHaveURL(/\/heist$/); // `from=picker` is stripped once read
    // A first-time player lands on the crew pick (a default pair is picked): START plays level 1.
    const start = frame.getByRole("button", { name: "Start heist" });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await start.click();
    taps += 1;
    await expect(frame.locator("section.ch-hud")).toBeVisible({ timeout: 45_000 });
    expect(taps, "taps from the /game lobby to a playable level 1").toBeLessThanOrEqual(3);
  });
});

test.describe("/heist host (G2 layers 1 and 3)", () => {
  test.use({ allowUnmocked: true });
  test.describe.configure({ mode: "serial" });

  test("the server HTML embeds the build, and old URLs move", async ({ request, baseURL }) => {
    const html = await (await request.get(`${baseURL}/heist`)).text();
    expect(html).toMatch(/<iframe[^>]+src="\/heist-game\/index\.html\?embed=1"/);
    // The origin is the build's NEXT_PUBLIC_DOMAIN (http://localhost:3001 in CI, tokentails.com in
    // production), so only the shape and the path are fixed here.
    expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^"/]+\/heist"/);
    const old = await request.get(`${baseURL}/heist/index.html`, { maxRedirects: 0 });
    expect(old.status()).toBe(308);
    expect(old.headers()["location"]).toMatch(/\/heist$/);
    // The Heist's own share image (1200x630), not the generic site one.
    expect(html).toMatch(/<meta property="og:image" content="[^"]*\/game-select\/heist-og\.jpg"/);
    expect(html).toContain('<meta property="og:image:width" content="1200"');
  });

  test("a guest from /game wins level 1 on /heist and it saves under the same uid, with no queue entry", async ({ page, backend }) => {
    test.setTimeout(240_000);
    const { saves } = mockBackend(backend);
    await fakeFirebase(page, { uid: GUEST_UID, isAnonymous: true });
    await gotoAndSettle(page, "/game", 2_000);
    const lobbyToken = await page.evaluate(() => sessionStorage.getItem("accesstoken"));
    expect(lobbyToken).toBe(`fbe2e.${GUEST_UID}.anon`);

    await useQaHeist(page);
    await page.goto("/heist?qa=1", { waitUntil: "load" });
    const frame = await heistFrame(page);
    // The QA hook plays the bundled solution as a real run (embed ignores ?replay without qa=1).
    await frame.evaluate(() => (window as unknown as { __heist: { playSolution(id: string): Promise<unknown> } }).__heist.playSolution("heist-01"));
    await expect(page.getByTestId("heist-save-chip")).toHaveAttribute("data-kind", "saved", { timeout: 30_000 });

    expect(saves).toHaveLength(1);
    expect(saves[0].token).toBe(lobbyToken);
    expect(Object.keys(saves[0].body).sort()).toEqual(["platform", "replay", "type"]);
    expect(saves[0].body.type).toBe("CATNIP_HEIST");
    expect((saves[0].body.replay as { levelId: string; seed: number }).levelId).toBe("heist-01");
    expect((saves[0].body.replay as { seed: number }).seed).toBe(1);
    expect(await queueOf(page)).toBeNull();
    // No other write: Heist runs consume no lives and touch no rewards (decision #17).
    const writes = backend.requests().filter((call) => call.method !== "GET" && call.method !== "OPTIONS");
    expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /user/catbassadors/live"]);
  });

  test("with no Firebase user a win is kept on the device, and drains only after the claim", async ({ page, backend }) => {
    test.setTimeout(240_000);
    const { saves } = mockBackend(backend);
    await fakeFirebase(page, null);
    await useQaHeist(page);
    await page.goto("/heist?qa=1", { waitUntil: "load" });
    const frame = await heistFrame(page);
    await frame.evaluate(() => (window as unknown as { __heist: { playSolution(id: string): Promise<unknown> } }).__heist.playSolution("heist-01"));
    await expect(page.getByTestId("heist-save-chip")).toHaveAttribute("data-kind", "device", { timeout: 30_000 });
    const queued = JSON.parse((await queueOf(page)) || "{}") as { runs?: Array<{ owner: string | null }> };
    expect(queued.runs?.map((run) => run.owner)).toEqual([null]);
    expect(saves).toHaveLength(0);

    // The results screen offers sign-in; the host opens the AuthSheet and pauses the Heist. Wait for
    // the results to be up before tapping (the button exists before it is clickable).
    const signIn = frame.getByTestId("heist-signin");
    await expect(signIn).toBeVisible({ timeout: 30_000 });
    await signIn.click();
    await expect(page.getByRole("dialog", { name: "SAVE YOUR CAT" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("heist-frame")).toHaveAttribute("inert", "");
    await page.evaluate(() => (window as unknown as { __ttE2EAuth: { signIn: () => void } }).__ttE2EAuth.signIn());
    const claim = page.getByRole("dialog", { name: "ADD YOUR HEISTS?" });
    await expect(claim).toBeVisible({ timeout: 20_000 });
    await expect(claim).toContainText("Add 1 heist played on this device to your account?");
    expect(saves).toHaveLength(0); // nothing leaves the device before the answer
    await claim.getByRole("button", { name: "ADD THEM" }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect(isUserToken(saves[0].token)).toBe(true);
    await expect.poll(() => queueOf(page)).toBeNull();
    await expect(page.getByTestId("heist-frame")).not.toHaveAttribute("inert", "");
  });
});
