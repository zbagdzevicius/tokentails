#!/usr/bin/env node
/**
 * Synthetic-player playtest: bundles tools/playtest/cli.ts with rolldown (a Vite dependency, same as
 * tools/solve.mjs) and runs it. All flags are passed through; see `--help`.
 *   npm run playtest:bots                                   # 8 levels x 4 personas x 200 seeds, writes playtest/BOT-REPORT.md
 *   npm run playtest:bots -- --levels heist-02,heist-05 --personas novice --runs 50 --json out.json --no-md
 */
import { build } from 'rolldown';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const dir = mkdtempSync(join(tmpdir(), 'heist-playtest-'));
const file = join(dir, 'playtest.mjs');
try {
  await build({
    input: join(root, 'tools/playtest/cli.ts'),
    platform: 'node',
    output: { file, format: 'esm', codeSplitting: false },
    logLevel: 'warn',
  });
  const mod = await import(pathToFileURL(file).href);
  await mod.main(process.argv.slice(2), file);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
