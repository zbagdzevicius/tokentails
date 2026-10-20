// `npm run review:v2`: builds into its own outDir and port, so it can run next to `npm run e2e`.
import base from '../playwright.config';
import path from 'node:path';
const PORT = 4397;
const vite = './node_modules/.bin/vite';
export default {
  ...base,
  testDir: '.',
  testMatch: /v2\.review\.spec\.ts/,
  timeout: 300_000,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    ...(base.webServer as object),
    command: `${vite} build --outDir .review-dist --emptyOutDir && ${vite} preview --outDir .review-dist --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    cwd: path.resolve(import.meta.dirname, '..'),
  },
};
