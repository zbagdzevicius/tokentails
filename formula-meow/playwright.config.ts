import { defineConfig } from '@playwright/test';

// e2e builds into its own outDir and serves on a dedicated port (strictPort fails loudly when busy).
const PORT = Number(process.env.MEOW_E2E_PORT ?? 4395);
const OUT_DIR = '.e2e-dist';
const vite = './node_modules/.bin/vite';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `${vite} build --outDir ${OUT_DIR} --emptyOutDir && ${vite} preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
