import { defineConfig } from '@playwright/test';

/**
 * Party play e2e (docs/plans/moba/MULTIPLAYER.md §12.4): the game's production preview built against a local relay
 * harness (backend/test/party-relay.harness.ts: the relay alone, a memory room store, a ticket secret generated at
 * start). Several browser contexts per test (desktop and landscape touch).
 *
 *   ./node_modules/.bin/playwright test -c playwright.mp.config.ts
 *
 * Ports: PAWLEGENDS_MP_PORT (game, default 5402) and PAWLEGENDS_MP_RELAY (relay, default 3107). Kill a leftover
 * `vite preview` on the game port first (strictPort fails loudly).
 */
const PORT = Number(process.env.PAWLEGENDS_MP_PORT ?? 5402);
const RELAY = Number(process.env.PAWLEGENDS_MP_RELAY ?? 3107);
const OUT_DIR = '.e2e-mp-dist';
const vite = './node_modules/.bin/vite';
export const GAME = `http://127.0.0.1:${PORT}`;
export const RELAY_URL = `http://127.0.0.1:${RELAY}`;

export default defineConfig({
  testDir: 'tests/e2e/mp',
  testMatch: /\.spec\.ts$/,
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: GAME,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'mp' }],
  webServer: [
    {
      command: `VITE_PAWLEGENDS_API=${RELAY_URL} ${vite} build --outDir ${OUT_DIR} --emptyOutDir && ${vite} preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
      url: GAME,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // tsconfig-paths: the relay's Quick Play glue reaches shared/client-ip.ts, which imports by the `src/` base path
      command: `cd ../backend && PORT=${RELAY} FRONT_END_URLS=${GAME} ./node_modules/.bin/ts-node --transpile-only -r tsconfig-paths/register test/party-relay.harness.ts`,
      url: `${RELAY_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
