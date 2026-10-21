// `npm run review:v3`: the set-piece review (iteration 3). Own outDir and port (5600–6999, away from the founder's 5175).
import base from '../playwright.config';
import path from 'node:path';
const PORT = Number(process.env.MEOW_REVIEW_PORT ?? 6131);
const vite = './node_modules/.bin/vite';
export default {
  ...base,
  testDir: '.',
  testMatch: /v3\.review\.spec\.ts/,
  timeout: 480_000,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    ...(base.webServer as object),
    command: `${vite} build --outDir .review-v3-dist --emptyOutDir && ${vite} preview --outDir .review-v3-dist --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    cwd: path.resolve(import.meta.dirname, '..'),
  },
};
