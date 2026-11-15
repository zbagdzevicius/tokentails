/**
 * gaps5 polish 1: every literal `import('…')` in the game's own sources becomes `__plRetry(() => import('…'))`
 * (src/app/chunkRetry.ts `retryImport`), so a lazy chunk that fails to load is tried once more before the crash card.
 * Runs after Vite's TypeScript transform (a plugin without `enforce`), so `typeof import('…')` types are gone by then.
 * The split stays: the bundler still sees a literal `import('…')` inside the arrow.
 */
import path from 'node:path';

const DYN_IMPORT = /(?<![\w$.])import\(\s*(['"])([^'"\n]+)\1\s*\)/g;

/** Wrap the literal dynamic imports of one module. Returns null when there is nothing to wrap. Pure. */
export function wrapDynamicImports(code, helperPath) {
  if (!code.includes('import(')) return null;
  let n = 0;
  const out = code.replace(DYN_IMPORT, (_m, q, spec) => {
    n++;
    return `__plRetry(() => import(${q}${spec}${q}))`;
  });
  if (!n) return null;
  return `import { retryImport as __plRetry } from ${JSON.stringify(helperPath)};\n${out}`;
}

/** The Vite plugin: the game's `src/` modules only (never node_modules, never the helper itself). */
export function chunkRetryPlugin(srcDir) {
  const helper = path.join(srcDir, 'app', 'chunkRetry.ts');
  const norm = (p) => p.split(path.sep).join('/');
  return {
    name: 'pawlegends-chunk-retry',
    transform(code, id) {
      const file = norm(id.split('?')[0]);
      // the sim (src/sim/**) is never touched: it is hashed and vendored as written
      if (!file.startsWith(norm(srcDir) + '/') || file.startsWith(norm(srcDir) + '/sim/') || file === norm(helper) || !/\.(ts|js|mjs)$/.test(file)) return null;
      const out = wrapDynamicImports(code, norm(helper));
      return out === null ? null : { code: out, map: null };
    },
  };
}
