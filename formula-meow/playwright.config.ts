import { defineConfig } from '@playwright/test';

// e2e builds into its own outDir and serves on a dedicated port (strictPort fails loudly when busy).
const PORT = Number(process.env.MEOW_E2E_PORT ?? 4395);
const OUT_DIR = '.e2e-dist';
const vite = './node_modules/.bin/vite';
// The GPU on macOS (Metal): SwiftShader loaded a race in 41 s and ran 6–11 ticks/s there, which was what timed out the
// set-piece, a11y and clip specs (playtest, iteration 3; Metal: 0.6 s and 60 ticks/s). Linux CI keeps SwiftShader.
// MEOW_E2E_SWIFTSHADER=1 forces the software renderer anywhere.
const SOFTWARE = process.platform !== 'darwin' || process.env.MEOW_E2E_SWIFTSHADER === '1';
const GL_ARGS = SOFTWARE ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    launchOptions: { args: GL_ARGS },
  },
  webServer: {
    command: `${vite} build --outDir ${OUT_DIR} --emptyOutDir && ${vite} preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
