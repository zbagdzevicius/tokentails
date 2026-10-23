import { defineConfig } from '@playwright/test';

// e2e builds into its own outDir and serves on a dedicated port (strictPort fails loudly when busy).
const PORT = Number(process.env.PAWLEGENDS_E2E_PORT ?? 4396);
const OUT_DIR = '.e2e-dist';
const vite = './node_modules/.bin/vite';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
    // §15 item 2: the sim in a WebKit Worker (Safari's engine). Only the determinism spec runs here.
    {
      name: 'webkit',
      testMatch: /determinism-browser\.spec\.ts$/,
      use: { browserName: 'webkit', viewport: { width: 1280, height: 720 }, launchOptions: {} },
    },
  ],
  webServer: {
    command: `${vite} build --outDir ${OUT_DIR} --emptyOutDir && ${vite} preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
