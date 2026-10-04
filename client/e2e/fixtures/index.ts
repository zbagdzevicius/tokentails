/**
 * The client e2e test object (plan F1). Import `test` and `expect` from here, not from
 * `@playwright/test`, so every test gets:
 *
 *   - a mocked backend (`backend`): unmocked calls and wrong auth headers fail the test (opt out of
 *     the first with `test.use({ allowUnmocked: true })`);
 *   - a network guard (`network`): third-party hosts not on the allowlist are aborted, and any
 *     request to a production API host fails the test;
 *   - a fixed clock and a seeded `Math.random`;
 *   - a failure when the page throws an uncaught error (`pageerror`), unless the test sets
 *     `test.use({ allowPageErrors: true })` and asserts on `pageErrors` itself.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { authHeaderViolations, BackendMock } from "./backend";
import { NetworkGuard } from "./network";
import { DEFAULT_RANDOM_SEED, FIXED_NOW, makeDeterministic } from "./determinism";

export interface E2EOptions {
  /** Start instant of the page clock. */
  now: Date;
  /** Seed for `Math.random`. */
  randomSeed: number;
  /** Skip the automatic "no uncaught page errors" check. */
  allowPageErrors: boolean;
  /** Skip the automatic "every backend call was mocked" check. */
  allowUnmocked: boolean;
}

export interface E2EFixtures {
  network: NetworkGuard;
  backend: BackendMock;
  /** Uncaught errors the page threw, in order. */
  pageErrors: Error[];
}

export const test = base.extend<E2EOptions & E2EFixtures>({
  now: [FIXED_NOW, { option: true }],
  randomSeed: [DEFAULT_RANDOM_SEED, { option: true }],
  allowPageErrors: [false, { option: true }],
  allowUnmocked: [false, { option: true }],

  network: [
    async ({ page, baseURL }, use) => {
      const network = new NetworkGuard(baseURL || "http://localhost:3001");
      await network.install(page);
      await use(network);
      expect(network.forbidden(), "requests reached a production API host").toEqual([]);
    },
    { auto: true },
  ],

  // Depends on `network` so its route is registered later and therefore runs first for the API origin.
  backend: [
    async ({ page, network, allowUnmocked }, use) => {
      void network;
      const backend = new BackendMock();
      await backend.install(page);
      await use(backend);
      if (!allowUnmocked) {
        expect(
          backend.unmocked().map((call) => `${call.method} ${call.path}`),
          "backend calls without a mock",
        ).toEqual([]);
      }
      expect(authHeaderViolations(backend.requests()), "backend auth headers").toEqual([]);
    },
    { auto: true },
  ],

  pageErrors: [
    async ({ page, allowPageErrors }, use) => {
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await use(errors);
      if (!allowPageErrors) {
        expect(
          errors.map((error) => error.message),
          "the page threw uncaught errors",
        ).toEqual([]);
      }
    },
    { auto: true },
  ],

  page: async ({ page, now, randomSeed }, use) => {
    await makeDeterministic(page, { now, seed: randomSeed });
    await use(page);
  },
});

export { expect };

/**
 * Opens `path` and waits for the `load` event plus a short settle. Dev servers keep HMR sockets
 * open, so `networkidle` never fires locally.
 */
export async function gotoAndSettle(page: Page, path: string, settleMs = 1500): Promise<void> {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(settleMs);
}

/** The level map's first-level control and the in-level marker, per routed mode. */
const FIRST_LEVEL = {
  cupid: {
    entry: (page: Page) => page.locator('img[alt="Day 1"]').first(),
    // Day 1's start gate (PixelRescue) is HTML over the canvas; its line follows the input (hints.startLine).
    inLevel: (page: Page) => page.getByText(/^(tap|click|press space) to start$/i).first(),
  },
  pawmatch: {
    entry: (page: Page) => page.getByRole("button", { name: "PLAY LEVEL 1" }).first(),
    // Match3.tsx renders this wrapper only once a level is open.
    inLevel: (page: Page) => page.locator("[data-scene-ready]").first(),
  },
} as const;

/**
 * Call right after tapping a mode's tile: ends on that mode's first level. First-time routing (plan
 * G10; GameContext and PixelRescue) opens level 1 directly for a player with no clears once the
 * profile is in, while a tap before the profile lands still shows the level map. Either is a
 * correct product path, so this accepts both and picks level 1 from the map when it shows.
 */
export async function openFirstLevel(page: Page, mode: keyof typeof FIRST_LEVEL, timeout = 30_000): Promise<"map" | "routed"> {
  const entry = FIRST_LEVEL[mode].entry(page);
  await expect(entry.or(FIRST_LEVEL[mode].inLevel(page)).first()).toBeVisible({ timeout });
  if (await entry.isVisible()) {
    await entry.click();
    return "map";
  }
  return "routed";
}

export { BackendMock, API_ORIGIN, authHeaderViolations, type RecordedCall } from "./backend";
export { NetworkGuard, hostMatches, DEFAULT_ALLOWED_HOSTS, FORBIDDEN_API_HOSTS } from "./network";
export * from "./contracts";
export { CUPID_SEASON_NOW, DEFAULT_RANDOM_SEED, FIXED_NOW, seedMathRandom } from "./determinism";
