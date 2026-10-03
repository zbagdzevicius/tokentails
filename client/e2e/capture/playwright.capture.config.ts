import { defineConfig } from "@playwright/test";
import { CAPTURE_VIEWPORT_NOTE } from "./frames";

/**
 * The reel capture driver (plan G7 "Deterministic capture mode", task 6d). Not part of the e2e
 * suite: run it on purpose against a running dev server.
 *
 *   npx playwright test -c e2e/capture/playwright.capture.config.ts
 *
 *   E2E_BASE_URL       page origin, default http://localhost:3001
 *   E2E_CHROMIUM_PATH  optional Chromium binary (a cached Chrome for Testing)
 *   REEL_FRAMES_DIR    where frames and the determinism report go (scratch)
 *   REEL_CLIPS         comma-separated clip ids to render (default: all)
 *   REEL_DRY_RUN=1     write clips under $REEL_FRAMES_DIR/dry-run, leave public/reel alone
 *
 * Shipping clips need a build with the capture hooks (NEXT_PUBLIC_CAPTURE=1), so frames are
 * stepped from game time 0 and the determinism test can pass; see docs/plans/alignment-log/6d.md.
 *
 * WebGL runs on SwiftShader (software) so frames do not depend on the machine's GPU.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.capture\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60_000,
  reporter: [["list"]],
  outputDir: "../../test-results/capture",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    actionTimeout: 30_000,
    screenshot: "only-on-failure",
    // Desktop landscape, no touch: on a phone profile every clip showed the D-pad, the jump and
    // ability buttons, CLOSE and GO BACK (task 6d review, finding 3). The driver also hides every
    // DOM overlay and crops to the game canvas. Frames are 1920 x 888, encoded at 960 x 444.
    // Keep in step with CAPTURE_VIEWPORT in reel.capture.ts.
    viewport: { width: 960, height: 444 },
    deviceScaleFactor: 2,
    ...CAPTURE_VIEWPORT_NOTE,
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-rasterization", "--force-color-profile=srgb"],
    },
  },
});
