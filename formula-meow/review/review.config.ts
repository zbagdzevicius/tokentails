import base from '../playwright.config';
import path from 'node:path';
export default { ...base, testDir: '.', testMatch: /review\.spec\.ts/, timeout: 300_000, webServer: { ...(base.webServer as object), cwd: path.resolve(import.meta.dirname, '..') } };
