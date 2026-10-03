import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

/**
 * Client end-to-end tests (plan F1).
 *
 * Locally the tests run against the dev server you already have (`npm run dev`, or the one on
 * :3001); there is no `webServer`, so a run never starts a second Next server. In CI
 * (`CI=true`) Playwright serves the production build made by the workflow with `next start`.
 *
 *   E2E_BASE_URL       page origin under test, default http://localhost:3001
 *   E2E_API_URL        backend origin the fixtures mock, default http://localhost:3005
 *                      (the `NEXT_PUBLIC_BE_URL` the client was built with)
 *   E2E_CHROMIUM_PATH  optional Chromium binary, e.g. a locally cached Chrome for Testing
 *
 * Determinism (clock, Math.random, mocked backend, no animations) lives in `e2e/fixtures`.
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001";
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;
const isCI = !!process.env.CI;

/** The four viewports every UI gap is checked at (F1). Chromium only: WebGL runs through ANGLE. */
const projects: PlaywrightTestConfig["projects"] = [
  {
    name: "mobile-390",
    use: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "mobile-360",
    use: {
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "landscape-844",
    use: {
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "desktop-1440",
    use: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    },
  },
];

/**
 * CI runs a subset so the job fits in about 25 minutes on a 4-core runner with software WebGL:
 * every test on mobile-390 (the primary target), plus, on desktop-1440, the few functional checks
 * that run on no other project (tagged `@ci-desktop`: the server-side meta check, the link crawl,
 * account and guest flows). Locally, and in CI with `E2E_ALL_PROJECTS=1`, all four projects run,
 * including the desktop-only matrices (AuthSheet widths, Paw Match DPR, Purrsuit frame rates,
 * world look) that are too slow for the CI budget.
 */
const ciSubset = isCI && process.env.E2E_ALL_PROJECTS !== "1";
const ciProjects: PlaywrightTestConfig["projects"] = projects
  .filter((project) => project.name === "mobile-390" || project.name === "desktop-1440")
  .map((project) => (project.name === "desktop-1440" ? { ...project, grep: /@ci-desktop/ } : project));

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css" },
  },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // CI: 2 workers on the 4-core runner. Each worker's Chromium renders WebGL on the CPU
  // (swiftshader), and 4 workers starved the page enough to time tests out without finishing sooner.
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  use: {
    baseURL,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "dark",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: isCI ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  projects: ciSubset ? ciProjects : projects,
  webServer: isCI
    ? {
        command: `npx next start -p ${new URL(baseURL).port || "3001"}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
