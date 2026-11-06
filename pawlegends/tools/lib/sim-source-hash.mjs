/**
 * SIM_HASH (docs/plans/moba/MULTIPLAYER.md §2.1): the first 16 hex characters of a sha256 over the sim source closure
 * of src/sim/server.ts (every file it imports, transitively, sorted by path, hashed as `path\0content\0`). Two builds
 * with the same SIM_HASH run the same sim code. Pure fs: Vite's config (`__SIM_HASH__`) and vendor-sim both call it,
 * and tools/vendor-sim.test.mjs checks the closure equals the files Vite actually bundles.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Relative import specifiers of a TS source (static `import ... from`, `export ... from`, and side-effect imports). */
function importsOf(src) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    // `import type` / `export type` pull no code into the bundle
    const stmt = m[0];
    if (/^\s*(?:import|export)\s+type\s/.test(stmt.replace(/^\n/, ''))) continue;
    out.push(m[1]);
  }
  return out;
}

function resolveTs(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, join(base, 'index.ts')]) if (existsSync(c) && !c.endsWith('/')) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* a directory */
    }
  }
  throw new Error(`sim-source-hash: cannot resolve ${spec} from ${relative(PKG_ROOT, from)}`);
}

/** The sorted closure of `entry` (paths relative to the package root). */
export function simClosure(entry = 'src/sim/server.ts', root = PKG_ROOT) {
  const seen = new Set();
  const stack = [resolve(root, entry)];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of importsOf(readFileSync(f, 'utf8'))) stack.push(resolveTs(f, spec));
  }
  return [...seen].map((f) => relative(root, f).split('\\').join('/')).sort();
}

/** SIM_HASH of the sim at `root` (16 hex). */
export function simSourceHash(root = PKG_ROOT, entry = 'src/sim/server.ts') {
  const h = createHash('sha256');
  for (const rel of simClosure(entry, root)) {
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(join(root, rel)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}
