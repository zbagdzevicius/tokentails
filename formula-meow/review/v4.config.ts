// `npm run review:v4`: the iteration 4 final-pass review. Own outDir and port (MEOW_REVIEW_PORT, away from the
// founder's 5175). Screenshots in review/v4/ (gitignored).
import base from '../playwright.config';
import path from 'node:path';
const PORT = Number(process.env.MEOW_REVIEW_PORT ?? 6132);
const vite = './node_modules/.bin/vite';
export default {
  ...base,
  testDir: '.',
  testMatch: /v4\.review\.spec\.ts/,
  timeout: 480_000,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    ...(base.webServer as object),
    command: `${vite} build --outDir .review-v4-dist --emptyOutDir && ${vite} preview --outDir .review-v4-dist --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    cwd: path.resolve(import.meta.dirname, '..'),
  },
};
