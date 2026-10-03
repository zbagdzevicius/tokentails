import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { mkdirSync } from "fs";
import { type BackendMock, expect, test } from "./fixtures";

/**
 * Meet your cat (plan G3, founder item 3) end to end, with Firebase faked in the page
 * (`window.__TT_E2E_AUTH__`) and every backend call answered by the `backend` mock.
 *
 * A fresh guest gets the transient template profile with `onboarding.state: "pending"`. The
 * starter commit returns 428 until `POST /user/guest/session` ran, exactly like the real guard.
 *
 * Screenshots of every step go to `E2E_SHOTS` when it is set (task 4a evidence); nothing is
 * compared, so they never fail a run.
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
  cat: { ...STARTER_CAT, _id: "guest-starter" },
  cats: [],
};

const FEATURED = [
  { _id: "69b0419cd7d6a7187c9b0752", name: "kretis", status: "WAITING", excerpt: "A true beauty with a charming presence.", catAvatar: "/cats/starters/pinkie/still.png", shelter: { _id: "s1", name: "Rožinė Pėdutė" } },
  { _id: "6987c07e86ebfefc7ff52929", name: "saule", status: "WAITING", excerpt: "A playful little black kitty.", catAvatar: "/cats/starters/shadow/still.png", shelter: { _id: "s1", name: "Rožinė Pėdutė" } },
  { _id: "69a964243ee4d7b657948f1f", name: "Amsis", status: "RECOVERING", excerpt: "A fluffy little soul.", catAvatar: "/cats/starters/misty/still.png", shelter: { _id: "s1", name: "Rožinė Pėdutė" } },
];

const LOOKS: Record<string, string> = {
  SCOUT: "scout",
  PINKIE: "pinkie",
  SHADOW: "shadow",
  MISTY: "misty",
  SUNNY: "sunny",
};

interface MeetBackend {
  commits: () => Array<Record<string, unknown>>;
  following: () => string[];
}

/**
 * A guest backend for the ceremony. `starter` overrides the commit answer (409, a name error).
 */
function mockMeetBackend(
  backend: BackendMock,
  options: {
    starter?: (body: Record<string, unknown>) => { status: number; body: unknown } | null;
    done?: boolean;
    /** The finished account's cat name (default Scout). */
    doneName?: string;
    /** Delay every `POST /user/starter` answer. */
    starterDelayMs?: number;
    /** What `GET /blessing/featured` returns (default three cats). */
    featured?: unknown[];
  } = {},
): MeetBackend {
  // A finished account already has its guest document.
  let session = !!options.done;
  let committed: Record<string, unknown> | null = null;
  const commits: Array<Record<string, unknown>> = [];
  let following: string[] = [];
  const profile = () => {
    if (options.done) {
      const cat = { ...STARTER_CAT, name: options.doneName || STARTER_CAT.name };
      return { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat, cats: [cat], onboarding: { state: "done" } };
    }
    if (committed) {
      return { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat: committed, cats: [committed], onboarding: { state: "done", version: 1 } };
    }
    return session ? { ...TRANSIENT, transient: false, _id: "64e2e0000000000000000g01", cat: STARTER_CAT, cats: [STARTER_CAT] } : TRANSIENT;
  };
  backend
    .on("GET", "/user/profile", () => ({ body: profile() }))
    .on("POST", "/user/guest/session", () => {
      session = true;
      return { status: 201, body: profile() };
    })
    .on("POST", "/user/starter", async (request: Request) => {
      if (options.starterDelayMs) await new Promise((resolve) => setTimeout(resolve, options.starterDelayMs));
      if (!session) {
        return { status: 428, body: { statusCode: 428, code: "GUEST_SESSION_REQUIRED", message: "Start a guest session first" } };
      }
      const body = JSON.parse(request.postData() || "{}");
      commits.push(body);
      const override = options.starter?.(body);
      if (override) return override;
      if (committed) return { status: 409, body: { statusCode: 409, code: "STARTER_LOCKED", message: "Your starter cat is already chosen" } };
      const breed = String(body.breed || "SCOUT");
      const look = LOOKS[breed] || "scout";
      const name = body.skipped ? "Scout" : String(body.name);
      committed = {
        ...STARTER_CAT,
        isGuestStarter: true,
        name,
        starterBreed: breed,
        starterLockedAt: "2026-09-30T12:00:00.000Z",
        catImg: `/cats/starters/${look}/idle.gif`,
        spriteImg: `/cats/starters/scout/sheet.png`,
      };
      return {
        status: 201,
        body: { success: true, cat: committed, onboarding: { state: "done", skipped: !!body.skipped, version: 1 } },
      };
    })
    .on("GET", /^\/blessing\/featured(\?.*)?$/, { body: options.featured ?? FEATURED })
    .on("GET", "/blessing/featured/names", { body: { names: FEATURED.map((cat) => cat.name) } })
    .on("POST", /^\/user\/following\/[^/]+$/, (request: Request) => {
      const id = new URL(request.url()).pathname.split("/").pop() as string;
      following = Array.from(new Set([...following, id]));
      return { status: 201, body: { success: true, following } };
    })
    .on("DELETE", /^\/user\/following\/[^/]+$/, (request: Request) => {
      const id = new URL(request.url()).pathname.split("/").pop() as string;
      following = following.filter((value) => value !== id);
      return { body: { success: true, following } };
    })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/cats/, { body: [STARTER_CAT] })
    .on("POST", "/user/catbassadors/live", { status: 201, body: profile() })
    .on("GET", /^\/user\/airdrop/, { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } });
  return { commits: () => commits, following: () => following };
}

async function useFakeFirebase(page: Page, config: Record<string, unknown> = {}) {
  await page.addInitScript((value) => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = value;
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  }, config);
}

/**
 * Records, every animation frame, which layer is on top: the curtain, the ceremony or the lobby.
 * `lobbyBeforeMeet` is true if the lobby hero ever showed with neither the curtain nor the
 * ceremony over it before the ceremony first appeared.
 */
async function recordLayers(page: Page) {
  await page.addInitScript(() => {
    const record = { sawCurtain: false, sawMeet: false, lobbyBeforeMeet: false, curtainColor: "" };
    (window as unknown as Record<string, unknown>).__ttLayers = record;
    const sample = () => {
      const curtain = document.querySelector<HTMLElement>('[data-testid="intro-curtain"]');
      // The altar hold (a slow sign-in) is the ceremony's loading state, shown before it opens.
      const meet = document.querySelector('[data-testid="meet-your-cat"], [data-testid="meet-altar-hold"]');
      const lobby = document.querySelector('[data-testid="lobby-hero"]');
      if (curtain) {
        record.sawCurtain = true;
        record.curtainColor = getComputedStyle(curtain).backgroundColor;
      }
      if (meet) record.sawMeet = true;
      if (lobby && !curtain && !meet && !record.sawMeet) record.lobbyBeforeMeet = true;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const dialog = (page: Page) => page.getByTestId("meet-your-cat");

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  // The Next dev-tools badge is dev only and covers the bottom-left corner of the evidence.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
  await page.screenshot({ path: `${SHOTS}/${name}-${size?.width}.png` });
}

async function expectNoSeriousAxe(page: Page, step: string) {
  const result = await new AxeBuilder({ page })
    .include('[data-testid="meet-your-cat"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(
    serious.map((violation) => `${step}: ${violation.id} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`),
  ).toEqual([]);
}

async function step(page: Page, name: string) {
  await expect(dialog(page)).toHaveAttribute("data-step", name, { timeout: 15_000 });
}

/** Waits until a Phaser game has a running scene (the hand-off opened a mode). */
async function waitForScene(page: Page) {
  await page.waitForFunction(
    () => {
      const games = ((window as unknown as { __ttGames?: Array<{ canvas?: HTMLCanvasElement; scene: { getScenes: (a: boolean) => unknown[] } }> }).__ttGames || []).filter(
        (game) => game.canvas?.isConnected,
      );
      return games.some((game) => game.scene.getScenes(true).length > 0);
    },
    undefined,
    { timeout: 45_000 },
  );
}

test.describe("Meet your cat (G3)", () => {
  test.use({ allowUnmocked: true });
  test.describe.configure({ mode: "serial" });

  test("golden path: curtain, altar, choose Misty, name Nimbus, reveal, follow, Nimbus in the lobby, Cupid Cat 1", async ({ page, backend }) => {
    test.setTimeout(120_000);
    const meet = mockMeetBackend(backend);
    await recordLayers(page);
    // The auth report lands after 1.2 s, so the curtain must wait for it (authReady).
    await useFakeFirebase(page, { delayMs: 1200 });
    await page.goto("/game", { waitUntil: "commit" });

    await expect(page.getByTestId("intro-curtain")).toBeVisible({ timeout: 15_000 });
    await shot(page, "01-curtain");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
    const layers = await page.evaluate(() => (window as unknown as { __ttLayers: Record<string, unknown> }).__ttLayers);
    expect(layers.sawCurtain).toBe(true);
    expect(layers.curtainColor).toBe("rgb(11, 8, 32)");
    expect(layers.lobbyBeforeMeet).toBe(false);

    // Loading: the altar background only (no cat, no panel), then "Your cat awaits…".
    const firstStep = await dialog(page).getAttribute("data-step");
    expect(["loading", "awaits"]).toContain(firstStep);
    await step(page, "awaits");
    await expect(page.getByRole("heading", { name: "Your cat awaits…" })).toBeVisible();
    await expect(page.getByTestId("altar-painted-cat")).toBeAttached();
    await expect(page.getByTestId("altar-pixel-cat")).toHaveCSS("opacity", "1", { timeout: 5_000 });
    await shot(page, "02-awaits");
    await expectNoSeriousAxe(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();

    // Choose: Scout preselected, five starters.
    await step(page, "choose");
    await expect(page.getByRole("radio")).toHaveCount(5);
    await expect(page.getByRole("radio", { name: /Scout, The one from the altar/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("All starters play the same. Pick the one you love.")).toBeVisible();
    await shot(page, "03-choose");
    await expectNoSeriousAxe(page, "choose");
    await page.getByTestId("starter-MISTY").click();
    await expect(page.getByTestId("starter-MISTY")).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "CONTINUE" }).click();

    // Name: inline validation, then Nimbus.
    await step(page, "name");
    const input = page.getByTestId("meet-name-input");
    await expect(input).toHaveValue("Misty");
    await input.fill("x");
    await page.getByRole("button", { name: /MEET X|REVEAL/ }).click();
    await expect(page.getByTestId("meet-name-error")).toHaveText("Use at least 2 characters.");
    await expect(dialog(page)).toHaveAttribute("data-step", "name");
    await input.fill("Kretis");
    await expect(page.getByTestId("meet-name-error")).toHaveText("That name is taken. Try another one.");
    await input.fill("Nimbus");
    await expect(page.getByTestId("meet-name-error")).toHaveText("");
    await shot(page, "04-name");
    await expectNoSeriousAxe(page, "name");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();

    // Reveal: "Meet Nimbus!" announced; the commit went through the guest session.
    await step(page, "reveal");
    await expect(page.getByTestId("meet-announce")).toHaveText("Meet Nimbus!");
    await expect(page.getByRole("heading", { name: "Meet Nimbus!" })).toBeVisible();
    await expect.poll(() => meet.commits()).toEqual([{ breed: "MISTY", name: "Nimbus" }]);
    const writes = backend
      .requests()
      .filter((call) => call.method === "POST" && (call.path === "/user/starter" || call.path === "/user/guest/session"))
      .map((call) => call.path);
    expect(writes).toEqual(["/user/starter", "/user/guest/session", "/user/starter"]);
    await page.waitForTimeout(300);
    await shot(page, "05-reveal");
    await expectNoSeriousAxe(page, "reveal");
    await page.getByRole("button", { name: "CONTINUE" }).click();

    // Real cats: follow one, skippable, footer.
    await step(page, "featured");
    await expect(page.getByText("These cats are also in rescue packs")).toBeVisible();
    await expect(page.getByRole("button", { name: "Follow Kretis" })).toBeVisible();
    await page.getByRole("button", { name: "Follow Saule" }).click();
    await expect(page.getByRole("button", { name: "Following Saule" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => meet.following()).toEqual([FEATURED[1]._id]);
    await shot(page, "06-featured");
    await expectNoSeriousAxe(page, "featured");
    await page.getByRole("button", { name: "START PLAYING" }).click();

    // The lobby hero: Nimbus large at an integer scale, then Cupid Cat level 1.
    await expect(dialog(page)).toHaveCount(0);
    const hero = page.getByTestId("lobby-hero-cat");
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Nimbus");
    const scale = Number(await hero.getAttribute("data-scale"));
    expect(Number.isInteger(scale) && scale >= 2).toBe(true);
    const box = await hero.boundingBox();
    expect(box?.width).toBe(48 * scale);
    await expect(hero).toHaveCSS("image-rendering", "pixelated");
    await expect(hero).toHaveAttribute("src", /\/cats\/starters\/misty\//);
    await expect(page.getByTestId("lobby-first-run")).toContainText("Cupid Cat");
    await shot(page, "07-lobby-hero");
    await waitForScene(page);
    await expect(page.locator('img[alt="Day 1"]')).toHaveCount(0);
    await shot(page, "08-cupid-cat-1");
  });

  test("keyboard only: SKIP is first in the focus order, and the whole ceremony completes", async ({ page, backend }) => {
    test.setTimeout(90_000);
    const meet = mockMeetBackend(backend);
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");

    const firstTabbable = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="meet-your-cat"]');
      const items = Array.from(
        root?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') || [],
      ).filter((element) => !element.hasAttribute("disabled"));
      return items[0]?.getAttribute("data-testid");
    });
    expect(firstTabbable).toBe("meet-skip");
    // Each step moves focus to its heading; SKIP sits just before it.
    await expect(page.getByRole("heading", { name: "Your cat awaits…" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("meet-skip")).toBeFocused();

    const tabTo = async (name: RegExp | string) => {
      for (let i = 0; i < 20; i += 1) {
        await page.keyboard.press("Tab");
        const label = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          return (element?.getAttribute("aria-label") || element?.innerText || "").trim();
        });
        // innerText follows text-transform, so compare case-insensitively.
        if (typeof name === "string" ? label.toLowerCase() === name.toLowerCase() : name.test(label)) return;
      }
      throw new Error(`could not tab to ${name}`);
    };

    await tabTo("MEET YOUR CAT");
    await page.keyboard.press("Enter");
    await step(page, "choose");
    await expect(page.getByRole("heading", { name: "Choose your companion" })).toBeFocused();
    await tabTo(/^Scout/);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("starter-MISTY")).toBeFocused();
    await expect(page.getByTestId("starter-MISTY")).toHaveAttribute("aria-checked", "true");
    await tabTo("CONTINUE");
    await page.keyboard.press("Enter");
    await step(page, "name");
    await expect(page.getByTestId("meet-name-input")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Nimbus");
    await page.keyboard.press("Enter");
    await step(page, "reveal");
    // CONTINUE reads SAVING… until the commit answers.
    await expect(page.getByRole("button", { name: "CONTINUE" })).toBeVisible({ timeout: 10_000 });
    await tabTo("CONTINUE");
    await page.keyboard.press("Enter");
    await step(page, "featured");
    await expect(page.getByRole("heading", { name: "Real cats are waiting too" })).toBeFocused();
    await tabTo("Follow Kretis");
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Following Kretis" })).toBeVisible();
    await tabTo("START PLAYING");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => meet.commits()).toEqual([{ breed: "MISTY", name: "Nimbus" }]);
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Nimbus");
  });

  test("SKIP commits the default starter and the ceremony never comes back", async ({ page, backend }) => {
    const meet = mockMeetBackend(backend);
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByTestId("meet-skip").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => meet.commits()).toEqual([{ breed: "SCOUT", skipped: true }]);
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Scout");
    await page.reload({ waitUntil: "load" });
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Scout", { timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("409 STARTER_LOCKED is treated as done", async ({ page, backend }) => {
    mockMeetBackend(backend, {
      starter: () => ({ status: 409, body: { statusCode: 409, code: "STARTER_LOCKED", message: "Your starter cat is already chosen" } }),
    });
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Nimbus");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();
    await step(page, "reveal");
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await step(page, "featured");
    await page.getByRole("button", { name: "START PLAYING" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(/couldn't|error/i)).toHaveCount(0);
  });

  test("a name the server refuses sends the player back to the nameplate with its message", async ({ page, backend }) => {
    mockMeetBackend(backend, {
      starter: (body) =>
        body.name === "Biscuit"
          ? { status: 400, body: { statusCode: 400, code: "NAME_RESERVED", message: "That name is taken. Try another one." } }
          : null,
    });
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Biscuit");
    await page.getByRole("button", { name: "MEET BISCUIT" }).click();
    await step(page, "name");
    await expect(page.getByTestId("meet-name-error")).toHaveText("That name is taken. Try another one.");
  });

  test("on an iOS-sized viewport the nameplate stays visible when the keyboard opens", async ({ page, backend }) => {
    mockMeetBackend(backend);
    await useFakeFirebase(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await step(page, "name");
    // The iOS keyboard (about 336 px on a 390x844 phone) shrinks the visual viewport.
    await page.setViewportSize({ width: 390, height: 844 - 336 });
    await page.waitForTimeout(300);
    const input = page.getByTestId("meet-name-input");
    await expect(input).toBeInViewport({ ratio: 1 });
    const submit = page.locator("#meet-name-submit");
    await expect(submit).toBeInViewport();
    await shot(page, "09-name-keyboard");
  });

  test("/game?meet=1 replays the ceremony for a finished account", async ({ page, backend }) => {
    mockMeetBackend(backend, { done: true });
    await useFakeFirebase(page);
    await page.goto("/game?meet=1", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByTestId("meet-skip").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/game$/);
  });

  test("a slow sign-in (auth after the curtain's 2.5 s cap) holds the altar, never the lobby", async ({ page, backend }) => {
    test.setTimeout(60_000);
    mockMeetBackend(backend);
    await recordLayers(page);
    await useFakeFirebase(page, { delayMs: 4500 });
    await page.goto("/game", { waitUntil: "commit" });
    await expect(page.getByTestId("meet-altar-hold")).toBeVisible({ timeout: 15_000 });
    await shot(page, "00-altar-hold");
    await step(page, "awaits");
    await expect(page.getByTestId("meet-altar-hold")).toHaveCount(0);
    const layers = await page.evaluate(() => (window as unknown as { __ttLayers: Record<string, unknown> }).__ttLayers);
    expect(layers.lobbyBeforeMeet).toBe(false);
  });

  test("a slow sign-in for a finished account drops the altar hold and shows the lobby", async ({ page, backend }) => {
    test.setTimeout(60_000);
    mockMeetBackend(backend, { done: true, doneName: "Whiskers" });
    await useFakeFirebase(page, { delayMs: 4500 });
    await page.goto("/game", { waitUntil: "commit" });
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Whiskers", { timeout: 20_000 });
    await expect(page.getByTestId("meet-altar-hold")).toHaveCount(0);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("SKIP is on top and clickable at the reveal, once the save has answered", async ({ page, backend }) => {
    const meet = mockMeetBackend(backend, { starterDelayMs: 1500 });
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Nimbus");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();
    await step(page, "reveal");
    const skipOnTop = () =>
      page.evaluate(() => {
        const box = document.querySelector('[data-testid="meet-skip"]')!.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !!top?.closest('[data-testid="meet-skip"]');
      });
    expect(await skipOnTop()).toBe(true);
    // While the save runs, SKIP waits with CONTINUE.
    await expect(page.getByTestId("meet-skip")).toBeDisabled();
    await expect(page.getByTestId("meet-skip")).toBeEnabled({ timeout: 10_000 });
    await shot(page, "05b-reveal-skip");
    await page.getByTestId("meet-skip").click();
    await expect(dialog(page)).toHaveCount(0);
    expect(meet.commits()).toEqual([{ breed: "SCOUT", name: "Nimbus" }]);
  });

  test("a late server name refusal with no featured cats comes back to the nameplate", async ({ page, backend }) => {
    const meet = mockMeetBackend(backend, {
      featured: [],
      starterDelayMs: 1500,
      starter: (body) =>
        body.name === "Biscuit"
          ? { status: 400, body: { statusCode: 400, code: "NAME_BLOCKED", message: "Please choose a different name." } }
          : null,
    });
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Biscuit");
    await page.getByRole("button", { name: "MEET BISCUIT" }).click();
    await step(page, "reveal");
    // CONTINUE is held while the save runs, so the refusal cannot be lost.
    await page.locator("#meet-reveal-continue").click({ force: true });
    await step(page, "name");
    await expect(page.getByTestId("meet-name-error")).not.toBeEmpty();
    await page.getByTestId("meet-name-input").fill("Nimbus");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();
    await step(page, "reveal");
    await expect(page.getByRole("button", { name: "CONTINUE" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(meet.commits().map((body) => body.name)).toEqual(["Biscuit", "Nimbus"]);
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Nimbus");
  });

  test("a ?meet=1 replay answered 409 keeps the account's cat in the hero and stays in the lobby", async ({ page, backend }) => {
    mockMeetBackend(backend, {
      done: true,
      doneName: "Whiskers",
      starter: () => ({ status: 409, body: { statusCode: 409, code: "STARTER_LOCKED", message: "Your starter cat is already chosen" } }),
    });
    await useFakeFirebase(page);
    await page.goto("/game?meet=1", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Nimbus");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();
    await step(page, "reveal");
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await step(page, "featured");
    await page.getByRole("button", { name: "START PLAYING" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Whiskers");
    // No hand-off for a replay: the lobby stays, no "Up next", no Cupid Cat.
    await expect(page.getByTestId("lobby-first-run")).toHaveCount(0);
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("lobby-hero")).toBeVisible();
  });
});

test.describe("Meet your cat with motion (G3)", () => {
  test.use({ allowUnmocked: true, reducedMotion: "no-preference" });

  test("the reveal spins only when motion is allowed", async ({ page, backend }) => {
    mockMeetBackend(backend);
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Nimbus");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();
    await step(page, "reveal");
    await expect(page.getByTestId("meet-reveal")).not.toHaveAttribute("data-reduced-motion", "true");
    await expect(page.locator("[data-reveal-sparkle]").first()).toHaveClass(/animate-spin-reveal/);
  });
});

test.describe("Meet your cat under reduced motion (G3)", () => {
  test.use({ allowUnmocked: true, reducedMotion: "reduce" });

  test("the reveal has no spin", async ({ page, backend }) => {
    mockMeetBackend(backend);
    await useFakeFirebase(page);
    await page.goto("/game", { waitUntil: "load" });
    await step(page, "awaits");
    await page.getByRole("button", { name: "MEET YOUR CAT" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await page.getByTestId("meet-name-input").fill("Nimbus");
    await page.getByRole("button", { name: "MEET NIMBUS" }).click();
    await step(page, "reveal");
    await expect(page.getByTestId("meet-reveal")).toHaveAttribute("data-reduced-motion", "true");
    for (const sparkle of await page.locator("[data-reveal-sparkle]").all()) {
      await expect(sparkle).not.toHaveClass(/animate-spin/);
    }
  });
});
