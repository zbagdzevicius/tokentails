import { defineConfig } from '@playwright/test';

// s7 verify: the e2e specs against the LIVE game (https://pawlegends.app/pawlegends-game). No web server.
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/mp/**'],
  // s7-live-*.live.ts, and any normal spec named on the command line
  testMatch: /\.(live|spec)\.ts$/,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.LIVE_BASE ?? 'https://pawlegends.app/pawlegends-game',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'landscape', use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ],
});
