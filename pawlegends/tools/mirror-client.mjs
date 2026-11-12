#!/usr/bin/env node
/**
 * Phase A of the pawlegends-web move (docs/plans/moba/PAWLEGENDS-WEB.md §3): `npm run build:client` writes the embed
 * build to pawlegends-web/public/pawlegends-game (served on pawlegends.app by its own Vercel project), and this copies
 * it verbatim to client/public/pawlegends-game, so tokentails.com/pawlegends keeps serving the same release until the
 * cutover (Phase B). Phase B deletes this script, the client copy and the `&& node tools/mirror-client.mjs` step.
 *
 * Usage: node tools/mirror-client.mjs [--check]   --check: exit 1 if the two folders differ (writes nothing)
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE = join(REPO, 'pawlegends-web/public/pawlegends-game');
export const MIRROR = join(REPO, 'client/public/pawlegends-game');

/** Every file under `dir`, as sorted paths relative to it. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

/** The relative paths that differ between `a` and `b` (missing on one side, or different bytes). */
export function diffTrees(a, b) {
  const left = listFiles(a);
  const right = new Set(listFiles(b));
  const diff = [];
  for (const f of left) {
    if (!right.has(f)) diff.push(f);
    else if (!readFileSync(join(a, f)).equals(readFileSync(join(b, f)))) diff.push(f);
    right.delete(f);
  }
  return [...diff, ...right].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(SOURCE, 'index.html'))) {
    console.error(`mirror-client: no build in ${relative(REPO, SOURCE)} (run npm run build:client first)`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    const diff = diffTrees(SOURCE, MIRROR);
    if (diff.length) {
      console.error(`mirror-client: client/public/pawlegends-game differs from pawlegends-web in ${diff.length} file(s), e.g. ${diff.slice(0, 5).join(', ')}`);
      process.exit(1);
    }
    console.log('mirror-client: client/public/pawlegends-game matches pawlegends-web/public/pawlegends-game');
  } else {
    rmSync(MIRROR, { recursive: true, force: true });
    cpSync(SOURCE, MIRROR, { recursive: true });
    console.log(`mirror-client: copied ${listFiles(SOURCE).length} files to ${relative(REPO, MIRROR)}`);
  }
}
