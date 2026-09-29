#!/usr/bin/env node
/**
 * Runs tools/solver.ts for every campaign level (or the ids given): proves the twoCatRequired levels
 * need both cats, plans a clean winning run and writes src/levels/<id>.solution.json.
 * The TypeScript is bundled on the fly with rolldown (a Vite dependency), so no extra tooling is needed.
 *   node tools/solve.mjs              # all levels
 *   node tools/solve.mjs heist-03     # one level
 */
import { build } from 'rolldown';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const dir = mkdtempSync(join(tmpdir(), 'heist-solver-'));
const file = join(dir, 'solver.mjs');
try {
  await build({
    input: join(root, 'tools/solver.ts'),
    platform: 'node',
    output: { file, format: 'esm', codeSplitting: false },
    logLevel: 'warn',
  });
  const mod = await import(pathToFileURL(file).href);
  await mod.main();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
