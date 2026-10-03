import type { Page } from "@playwright/test";
import { type BackendMock, expect, test } from "./fixtures";

/**
 * The night intro curtain of /game (plan G14 "Intro", 2.13 row 35): night 900, lifts on
 * readiness within [700 ms, 2.5 s], tap to skip without the tap reaching the lobby, and toasts
 * (z-toast 500) render above it (z-intro 300).
 */

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
  _id: "64e2e0000000000000000g01",
  isGuest: true,
  name: "Guest",
  onboarding: { state: "done" },
  tails: 0,
  catnipChaos: [],
  match3: [],
  cat: CAT,
  cats: [CAT],
};

function mockLobby(backend: BackendMock) {
  backend
    .on("GET", "/user/profile", { body: PLAYER })
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: { position: 12, wouldBe: true } })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", /^\/user\/cats/, { body: [CAT] })
    .on("GET", /^\/user\/airdrop/, { status: 428, body: { code: "GUEST_SESSION_REQUIRED" } });
}

async function useFakeFirebase(page: Page, config: Record<string, unknown> = {}) {
  await page.addInitScript((value) => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = value;
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  }, config);
}

/** Records when the curtain first appears and when it starts to leave (performance.now()). */
async function recordCurtain(page: Page) {
  await page.addInitScript(() => {
    const record: {
      shownAt: number | null;
      leftAt: number | null;
      color: string;
      liftMs: number | null;
      reason: string | null;
      hydratedMs: number | null;
    } = {
      shownAt: null,
      leftAt: null,
      color: "",
      liftMs: null,
      reason: null,
      hydratedMs: null,
    };
    (window as unknown as Record<string, unknown>).__ttCurtain = record;
    const sample = () => {
      const curtain = document.querySelector<HTMLElement>('[data-testid="intro-curtain"]');
      if (curtain) {
        if (record.shownAt === null) record.shownAt = performance.now();
        record.color = getComputedStyle(curtain).backgroundColor;
        if (record.leftAt === null && curtain.dataset.phase !== "shown") record.leftAt = performance.now();
        if (curtain.dataset.hydratedMs) record.hydratedMs = Number(curtain.dataset.hydratedMs);
        if (curtain.dataset.liftMs) {
          record.liftMs = Number(curtain.dataset.liftMs);
          record.reason = curtain.dataset.liftReason || null;
        }
      } else if (record.shownAt !== null && record.leftAt === null) {
        record.leftAt = performance.now();
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const readCurtain = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __ttCurtain: {
            shownAt: number | null;
            leftAt: number | null;
            color: string;
            liftMs: number | null;
            reason: string | null;
            hydratedMs: number | null;
          };
        }
      ).__ttCurtain,
  );

/**
 * The curtain's clock starts at the first paint of the static HTML, and it can only act once React
 * hydrated it. The latest it may lift is therefore the later of the bound and the hydration (the
 * local dev server sometimes hydrates late; a production build does not). Timers also run under
 * the fixtures' installed clock, which lags on a busy dev machine, so the local slack is wide.
 */
const TIMER_SLACK_MS = process.env.CI ? 200 : 4000;
const latestLift = (bound: number, hydratedMs: number | null) => Math.max(bound, hydratedMs ?? 0) + TIMER_SLACK_MS;

test.describe("intro curtain (G14)", () => {
  test.use({ allowUnmocked: true });

  test("is night 900 and lifts once auth is ready, never before 700 ms", async ({ page, backend }) => {
    mockLobby(backend);
    await recordCurtain(page);
    await useFakeFirebase(page, { delayMs: 0 });
    await page.goto("/game", { waitUntil: "load" });
    await expect(page.getByTestId("intro-curtain")).toHaveCount(0, { timeout: 15_000 });
    const curtain = await readCurtain(page);
    expect(curtain.color).toBe("rgb(11, 8, 32)");
    expect(curtain.shownAt).not.toBeNull();
    // Readiness lifts it. On a loaded local dev server the profile can take past 2.5 s, and then
    // the bound lifts it ("max"), which is also correct behaviour; CI asserts the ready path.
    if (process.env.CI) expect(curtain.reason).toBe("ready");
    else expect(["ready", "max"]).toContain(curtain.reason);
    expect(curtain.liftMs).toBeGreaterThanOrEqual(700);
    expect(curtain.liftMs).toBeLessThanOrEqual(latestLift(2500, curtain.hydratedMs));
    const shownFor = (curtain.leftAt as number) - (curtain.shownAt as number);
    expect(shownFor).toBeGreaterThanOrEqual(600);
    await expect(page.getByTestId("intro-curtain")).toHaveCount(0);
    await expect(page.getByTestId("lobby-hero-name")).toHaveText("Scout");
  });

  test("lifts by 2.5 s even when auth never answers", async ({ page, backend }) => {
    mockLobby(backend);
    await recordCurtain(page);
    await useFakeFirebase(page, { delayMs: 60_000 });
    await page.goto("/game", { waitUntil: "load" });
    await expect(page.getByTestId("intro-curtain")).toBeVisible();
    await expect(page.getByTestId("intro-curtain")).toHaveCount(0, { timeout: 10_000 });
    const curtain = await readCurtain(page);
    expect(curtain.reason).toBe("max");
    expect(curtain.liftMs).toBeGreaterThanOrEqual(2500);
    expect(curtain.liftMs).toBeLessThanOrEqual(latestLift(2500, curtain.hydratedMs));
    if (process.env.CI) expect(curtain.hydratedMs ?? 0).toBeLessThan(2500);
  });

  test("a tap skips it and never reaches the lobby below", async ({ page, backend }) => {
    mockLobby(backend);
    // The lobby renders under the curtain (profile ready), but auth "lands" late, so the curtain
    // is still up when we tap where PLAY is.
    await useFakeFirebase(page, { delayMs: 60_000 });
    await page.goto("/game", { waitUntil: "commit" });
    const curtain = page.getByTestId("intro-curtain");
    // Hydrated: the tap handler is attached (the static HTML shows the curtain before that).
    await expect(curtain).toHaveAttribute("data-hydrated", "true", { timeout: 15_000 });
    // Any click or pointerdown that bubbles past the curtain would land here.
    await page.evaluate(() => {
      const leaked: string[] = [];
      (window as unknown as Record<string, unknown>).__ttLeaked = leaked;
      for (const type of ["click", "pointerdown", "pointerup", "mousedown"]) {
        document.addEventListener(type, (event) => leaked.push(`${type}:${(event.target as HTMLElement)?.dataset?.testid || (event.target as HTMLElement)?.tagName}`));
      }
    });
    const viewport = page.viewportSize() as { width: number; height: number };
    // Tap the centre of the screen, where the lobby's hero and PLAY sit.
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await expect(curtain).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => (window as unknown as { __ttLeaked: string[] }).__ttLeaked)).toEqual([]);
    // Nothing below received the tap: no picker, no modal, no sheet.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("CUPID CAT", { exact: true })).toHaveCount(0);
  });

  test("a toast renders above the curtain", async ({ page, backend }) => {
    mockLobby(backend);
    await useFakeFirebase(page, { delayMs: 60_000 });
    await page.goto("/game", { waitUntil: "commit" });
    const curtain = page.getByTestId("intro-curtain");
    await expect(curtain).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => !!(window as unknown as { __ttAuthSheet?: unknown }).__ttAuthSheet);
    await page.evaluate(() =>
      (window as unknown as { __ttAuthSheet: { toast: (text: string) => void } }).__ttAuthSheet.toast("Hello from the toast"),
    );
    const toast = page.getByTestId("toast").first();
    await expect(toast).toBeVisible();
    await expect(curtain).toBeVisible();
    // Hit testing follows paint order. The toast ignores pointer events, so turn them on for
    // the probe: the topmost element at its centre must then be part of the toast.
    const onTop = await toast.evaluate((element) => {
      const probe = document.createElement("style");
      probe.textContent = '[data-testid="toast"], [data-testid="toast"] * { pointer-events: auto !important; }';
      document.head.appendChild(probe);
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      probe.remove();
      return !!hit && element.contains(hit);
    });
    expect(onTop).toBe(true);
  });
});
