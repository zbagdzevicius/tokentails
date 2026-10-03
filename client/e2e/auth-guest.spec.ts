import type { Page } from "@playwright/test";
import { API_ORIGIN, type BackendMock, expect, gotoAndSettle, openFirstLevel, test } from "./fixtures";

/**
 * Real guest play (plan G1, F5.7): /game opens the game for a new visitor with no sign-in wall, the
 * guest document is created by the first write only, and gated actions open the AuthSheet.
 *
 * Firebase is faked in the page through the NEXT_PUBLIC_E2E auth hook (`window.__TT_E2E_AUTH__`,
 * honoured only in development and E2E builds); every backend call is a real request answered by
 * the `backend` mock. Nothing on the server is bypassed.
 */

const CAT = {
  _id: "64e2e0000000000000000c01",
  name: "Scout",
  isStarter: true,
  isGuestStarter: true,
  type: "GRASS",
  tier: "COMMON",
  spriteImg: "/cats/yellow/sprites/hat-wizard-blue.png",
  catImg: "/logo/logo.webp",
  status: { EAT: 0 },
};
const TRANSIENT = {
  isGuest: true,
  transient: true,
  name: "Guest",
  // "done" so these specs start in the lobby; Meet your cat (pending) has its own spec, e2e/meet-your-cat.spec.ts.
  onboarding: { state: "done" },
  tails: 0,
  catnipChaos: [],
  match3: [],
  cat: { ...CAT, _id: "guest-starter" },
  cats: [],
};
const GUEST = {
  ...TRANSIENT,
  transient: false,
  _id: "64e2e0000000000000000g01",
  cat: CAT,
  cats: [CAT],
  codex: [],
  quests: [],
  streak: 0,
  canRedeemLives: true,
};
const PLAYER = { ...GUEST, isGuest: false, name: "Player", cat: { ...CAT, isGuestStarter: false } };

const isUserToken = (token: string | undefined) => !!token && token.endsWith(".user");

interface GuestBackend {
  sessionCreated: () => boolean;
}

/** A guest backend: transient until POST /user/guest/session, 428 on /live before it. */
function mockGuestBackend(backend: BackendMock, options: { persisted?: boolean } = {}): GuestBackend {
  let session = !!options.persisted;
  backend
    .on("GET", "/user/profile", (request) => {
      if (isUserToken(request.headers()["accesstoken"])) return { body: PLAYER };
      return { body: session ? GUEST : TRANSIENT };
    })
    .on("POST", "/user/guest/session", () => {
      session = true;
      return { status: 201, body: GUEST };
    })
    .on("POST", "/user/catbassadors/live", () =>
      session
        ? { status: 201, body: { ...GUEST, catnipChaos: [3] } }
        : { status: 428, body: { statusCode: 428, code: "GUEST_SESSION_REQUIRED", message: "Start a guest session first" } },
    )
    .on("GET", "/user/catbassadors/lives/redeem", (request) =>
      isUserToken(request.headers()["accesstoken"])
        ? { body: { tails: 5 } }
        : { status: 403, body: { statusCode: 403, code: "GUEST_FORBIDDEN", message: "Create an account to do this" } },
    )
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/cats/, { body: [CAT] })
    .on("GET", /^\/user\/airdrop/, { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } });
  return { sessionCreated: () => session };
}

async function useFakeFirebase(page: Page, config: Record<string, unknown> = {}) {
  await page.addInitScript((value) => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = value;
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  }, config);
}

/** Escape goes to the focused element: wait until a sheet that opened by itself holds focus. */
async function waitForDialogFocus(page: Page) {
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
    .toBe(true);
}

/**
 * Closes a self-opened sheet with Escape. In the landscape project an early synthetic key press
 * sometimes never reaches the page's document (logged: no keydown event at all, with focus inside
 * the dialog), so the press is repeated until a delivered one closes the sheet.
 */
async function pressEscapeToClose(page: Page) {
  await waitForDialogFocus(page);
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

// The sign-in sheet only: other GameModal dialogs (the end-of-run panel, for one) are not a wall.
const sheet = (page: Page) => page.getByRole("dialog").filter({ has: page.locator("[data-auth-view]") });

/**
 * Landing tap to a playable lobby (G1 acceptance: 5 s). CI measures the production build; the local
 * dev server compiles on demand (and while other files change), so it gets a looser bound.
 */
const PLAYABLE_BUDGET_MS = process.env.CI ? 5_000 : 15_000;

async function startCupid(page: Page) {
  await page.getByText("PLAY", { exact: true }).first().click();
  await page.getByText("CUPID CAT", { exact: true }).filter({ visible: true }).first().click();
  await openFirstLevel(page, "cupid");
  await page.waitForFunction(
    () => {
      const games = ((window as unknown as { __ttGames?: Array<{ canvas?: HTMLCanvasElement; scene: { getScenes: (a: boolean) => unknown[] } }> }).__ttGames || []).filter(
        (game) => game.canvas?.isConnected,
      );
      return games.some((game) => game.scene.getScenes(true).length > 0);
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.describe("guest play (G1)", () => {
  test.use({ allowUnmocked: true });
  // Several of these boot a Phaser scene in software WebGL; one at a time keeps them reliable.
  test.describe.configure({ mode: "serial" });

  test("PLAY GAME from the landing opens a playable game (5 s in CI), with no sign-in wall", async ({ page, backend }) => {
    mockGuestBackend(backend);
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/", 500);
    const started = Date.now();
    await page.locator('a[href^="/game"]').first().click();
    await page.waitForURL(/\/game/, { waitUntil: "commit" });
    // The lobby is live: its PLAY control answers, and no dialog covers it.
    const play = page.getByText("PLAY", { exact: true }).first();
    await expect(play).toBeVisible({ timeout: PLAYABLE_BUDGET_MS });
    await expect(page.getByTestId("guest-pill")).toBeVisible({ timeout: PLAYABLE_BUDGET_MS });
    expect(Date.now() - started).toBeLessThan(PLAYABLE_BUDGET_MS);
    await expect(sheet(page)).toHaveCount(0);
    // A mode gives an interactive canvas, still without a sheet.
    await startCupid(page);
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    // Reading the lobby created no guest document: only the first write does (F5.5).
    expect(backend.requests().filter((call) => call.path === "/user/guest/session")).toHaveLength(0);
  });

  test("the first write sends exactly one POST /user/guest/session, then the write", async ({ page, backend }) => {
    const guest = mockGuestBackend(backend);
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/game", 1500);
    await startCupid(page);
    expect(guest.sessionCreated()).toBe(false);

    // The scene's own end-of-run event: GameContext saves it through POST /user/catbassadors/live.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("GAME_STOP", { detail: { score: 3, catnipEarned: 3, time: 12 } })),
    );
    await expect.poll(() => guest.sessionCreated()).toBe(true);
    await expect
      .poll(() => backend.requests().filter((call) => call.path === "/user/catbassadors/live").length)
      .toBe(2);

    const writes = backend
      .requests()
      .filter((call) => call.method !== "GET" && call.method !== "OPTIONS")
      .map((call) => `${call.method} ${call.path}`);
    expect(writes).toEqual([
      "POST /user/catbassadors/live", // 428 GUEST_SESSION_REQUIRED
      "POST /user/guest/session",
      "POST /user/catbassadors/live", // the same save, once more
    ]);
    const lives = backend.requests().filter((call) => call.path === "/user/catbassadors/live");
    expect(lives[1].body).toBe(lives[0].body);
    expect(lives.every((call) => call.headers["accesstoken"]?.startsWith("fb"))).toBe(true);
    await expect(sheet(page)).toHaveCount(0);
  });

  test("the pill keeps clear of the lobby: bottom-left on short landscape screens", async ({ page, backend }) => {
    mockGuestBackend(backend);
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/game", 1500);
    const pill = page.getByTestId("guest-pill").getByRole("button").first();
    await expect(pill).toBeVisible();
    const box = await pill.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    if (viewport.height <= 500) {
      // The top centre holds the logo and the MY HOME card at 844x390.
      expect(box.x).toBeLessThan(viewport.width / 3);
      expect(box.y).toBeGreaterThan(viewport.height / 2);
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  test("?ref on the landing page is kept for the bare /game link (F5.7, any page)", async ({ page, backend }) => {
    mockGuestBackend(backend);
    await useFakeFirebase(page);
    const referrer = "64e2e00000000000000000aa";
    await gotoAndSettle(page, `/?ref=${referrer}`, 500);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("tt.pendingRef"))).toBe(referrer);
    await page.locator('a[href^="/game"]').first().click();
    await page.waitForURL(/\/game/, { waitUntil: "commit" });
    // Stored once; only sent when a profile reports promotedNow (never by a guest).
    expect(await page.evaluate(() => localStorage.getItem("tt.pendingRef"))).toBe(referrer);
    expect(backend.requests().filter((call) => call.path === "/user/catbassadors/referral")).toHaveLength(0);
  });

  test("an anonymous guest whose profile fails to load still gets the pill", async ({ page, backend }) => {
    mockGuestBackend(backend);
    backend.on("GET", "/user/profile", { status: 500, body: { statusCode: 500, message: "boom" } });
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/game", 1500);
    await expect(page.getByTestId("guest-pill")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("guest-pill").getByRole("button").first()).toHaveAccessibleName(/Playing as a guest/);
  });

  test("a claim opens the sheet, and the claim goes through after signing in", async ({ page, backend }) => {
    mockGuestBackend(backend, { persisted: true });
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/game", 1500);
    await page.getByRole("button", { name: "DAILY SPIN" }).click();
    await page.getByRole("button", { name: "SPIN!" }).click();

    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole("heading", { name: "CLAIM YOUR REWARDS" })).toBeVisible();
    // Signing in (the fake links the same uid) resolves requireAccount with a refreshed profile,
    // and the spin is sent once, as the account: WheelModal gates the claim before any request
    // (task 4c), so the guest token never reaches the redeem route.
    await page.evaluate(() => (window as unknown as { __ttE2EAuth: { signIn: () => void } }).__ttE2EAuth.signIn());
    await expect(sheet(page)).toHaveCount(0);
    await expect
      .poll(() =>
        backend
          .requests()
          .filter((call) => call.path === "/user/catbassadors/lives/redeem")
          .map((call) => isUserToken(call.headers["accesstoken"])),
      )
      .toEqual([true]);
  });

  for (const how of ["Escape", "X", "backdrop"] as const) {
    test(`the sheet closes with ${how} and focus returns to the pill`, async ({ page, backend }) => {
      mockGuestBackend(backend);
      await useFakeFirebase(page);
      await gotoAndSettle(page, "/game", 1500);
      const pill = page.getByTestId("guest-pill").getByRole("button").first();
      // On a cold dev server the pill can paint before React hydrates it, and an Enter on the
      // server-rendered button does nothing; press again until the hydrated button answers.
      await expect(async () => {
        await pill.focus();
        await page.keyboard.press("Enter");
        await expect(sheet(page)).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await expect(sheet(page).getByRole("heading", { name: "SAVE YOUR CAT" })).toBeVisible();

      if (how === "Escape") await page.keyboard.press("Escape");
      if (how === "X") await sheet(page).getByRole("button", { name: "Close" }).click();
      if (how === "backdrop") await page.getByTestId("game-modal-scrim").click({ position: { x: 4, y: 4 } });

      await expect(sheet(page)).toHaveCount(0);
      await expect(pill).toBeFocused();
    });
  }

  test("a failed anonymous sign-in shows the fallback state, not a wall", async ({ page, backend }) => {
    mockGuestBackend(backend);
    await useFakeFirebase(page, { anonymous: "fail" });
    await gotoAndSettle(page, "/game", 1500);
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByText("We couldn't start a guest game")).toBeVisible();
    // There is no guest to save: the sign-in title, not "SAVE YOUR CAT" (decision #64).
    await expect(sheet(page).getByRole("heading", { name: "WELCOME TO TOKEN TAILS" })).toBeVisible();
    await expect(sheet(page).getByRole("link", { name: /Catnip Heist/ })).toHaveAttribute("href", "/heist");
    // The subtitle does not contradict the failure body.
    await expect(sheet(page).getByText("Sign in to keep your progress on every device.")).toHaveCount(0);
    // Dismissible: the lobby stays reachable.
    await pressEscapeToClose(page);
    await expect(page.getByText("PLAY", { exact: true }).first()).toBeVisible();
    // The sheet opened by itself, so focus goes to the pill, not <body>.
    const pill = page.getByTestId("guest-pill").getByRole("button").first();
    await expect(pill).toBeFocused();
    // The signed-out pill offers a plain sign-in: no guest (or template cat) to save.
    await pill.click();
    await expect(sheet(page).getByRole("heading", { name: "WELCOME TO TOKEN TAILS" })).toBeVisible();
    await expect(sheet(page).getByText(/Keep Scout/)).toHaveCount(0);
  });

  test("after a failed anonymous sign-in, the sign-in options do not offer guest play", async ({ page, backend }) => {
    mockGuestBackend(backend);
    await useFakeFirebase(page, { anonymous: "fail" });
    await gotoAndSettle(page, "/game", 1500);
    await sheet(page).getByRole("button", { name: "Sign in instead" }).click();
    await expect(sheet(page).getByRole("button", { name: /CONTINUE WITH EMAIL/ })).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Not now" })).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Keep playing as guest" })).toHaveCount(0);
  });

  test("typing 'wasd qz' in the email field over a live Cupid scene keeps every key", async ({ page, backend }) => {
    mockGuestBackend(backend);
    await useFakeFirebase(page);
    await gotoAndSettle(page, "/game", 1500);
    await startCupid(page);
    await page.evaluate(() =>
      (window as unknown as { __ttAuthSheet: { show: (view: unknown) => void } }).__ttAuthSheet.show({
        name: "email",
        tab: "create",
      }),
    );
    const email = sheet(page).getByRole("textbox", { name: "Email" });
    await email.click();
    await page.keyboard.type("wasd qz");
    await expect(email).toHaveValue("wasd qz");
  });
});

test.describe("optional pages never force the sheet (F5.7)", () => {
  test.use({ allowUnmocked: true });

  test("a returning guest on /feed: a forbidden background write opens nothing and creates nothing", async ({ page, backend }) => {
    mockGuestBackend(backend, { persisted: true });
    const forbidden = { status: 403, body: { statusCode: 403, code: "GUEST_FORBIDDEN", message: "Create an account to do this" } };
    backend.on("POST", "/user/entity-metadata", forbidden).on("POST", "/shelter/donate", forbidden);
    await useFakeFirebase(page, { user: { uid: "guest-returning", isAnonymous: true } });
    await gotoAndSettle(page, "/feed", 1500);

    const status = await page.evaluate(
      async (origin) =>
        (
          await fetch(`${origin}/user/entity-metadata`, {
            method: "POST",
            headers: { "Content-Type": "application/json", accesstoken: sessionStorage.getItem("accesstoken") || "" },
            body: JSON.stringify([{ entity: "64e2e0000000000000000e01", type: "ARTICLE" }]),
          })
        ).status,
      API_ORIGIN,
    );
    expect(status).toBe(403);
    await page.waitForTimeout(300);
    await expect(sheet(page)).toHaveCount(0);
    expect(backend.requests().filter((call) => call.path === "/user/guest/session")).toHaveLength(0);

    // A player action on the same page does open it, named by the action.
    void page.evaluate(
      (origin) =>
        fetch(`${origin}/shelter/donate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", accesstoken: sessionStorage.getItem("accesstoken") || "" },
          body: JSON.stringify({ source: "web" }),
        }),
      API_ORIGIN,
    );
    await expect(sheet(page).getByRole("heading", { name: "WELCOME TO TOKEN TAILS" })).toBeVisible();
    await pressEscapeToClose(page);
  });
});
