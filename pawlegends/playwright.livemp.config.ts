import { defineConfig } from '@playwright/test';
// s7 verify: two browser contexts against the LIVE game and the production relay (no harness).
export default defineConfig({
  testDir: 'tests/e2e/mp',
  testMatch: /\.live\.ts$/,
  timeout: 900_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'https://pawlegends.app', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } },
  projects: [{ name: 'live' }],
});
