import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Headless WebGL: prefer the locally cached headless shell, fall back to full chromium.
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const candidates = [
  join(cache, 'chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  join(cache, 'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
];
const executablePath = process.env.PW_CHROMIUM ?? candidates.find((p) => existsSync(p));

// e2e gets its own build and preview server: a dedicated port and outDir (not dist/, not 4173) so a
// `npm run preview`, a dev server or another checkout's run can neither be reused nor clobbered.
// strictPort makes a busy port fail loudly instead of silently testing someone else's server.
const PORT = Number(process.env.HEIST_E2E_PORT ?? 4391);
const OUT_DIR = '.e2e-dist';
const vite = './node_modules/.bin/vite';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      executablePath,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    // VITE_HEIST_QA=1: the e2e build carries the ?qa=1 hooks (production builds never do).
    command: `VITE_HEIST_QA=1 ${vite} build --outDir ${OUT_DIR} --emptyOutDir && ${vite} preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
