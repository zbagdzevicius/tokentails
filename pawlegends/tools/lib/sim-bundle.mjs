/**
 * Bundle a sim entry (src/sim/server.ts, src/sim/index.ts) into one self-contained ES module with Vite, for the Node
 * tools: `headless-match.mjs` imports it, `vendor-sim.mjs` writes it into the backend. Unminified, no imports left.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function bundleSim(entry, fileName = 'pawlegends-sim.js') {
  process.env.NODE_ENV = 'production';
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    mode: 'production',
    root: PKG_ROOT,
    logLevel: 'silent',
    define: { 'import.meta.env': '{}' },
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      lib: { entry: resolve(PKG_ROOT, entry), formats: ['es'], fileName: () => fileName },
      rolldownOptions: { output: { codeSplitting: false }, treeshake: { moduleSideEffects: false } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = outputs.filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`sim-bundle: expected one chunk, got ${chunks.length}`);
  const code = chunks[0].code;
  const bad = /import\.meta|\bimport\s*\(|\brequire\s*\(|\bwindow\.|\bdocument\.|localStorage|indexedDB|navigator\./.exec(code);
  if (bad) throw new Error(`sim-bundle: the bundle reaches for a browser or module-loader API (${bad[0]}); keep src/sim pure`);
  if (/^\s*import\s/m.test(code)) throw new Error('sim-bundle: the bundle still imports a module');
  const modules = Object.keys(chunks[0].modules).map((id) => relative(PKG_ROOT, id).split('\\').join('/')).sort();
  return { code, modules };
}

/** Bundle `entry` and import it (a temp file keyed by the code hash). */
export async function importSim(entry = 'src/sim/index.ts') {
  const { code } = await bundleSim(entry);
  const dir = join(tmpdir(), 'pawlegends-sim');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${createHash('sha256').update(code).digest('hex').slice(0, 16)}.mjs`);
  // Parallel workers bundle the same code: write a private temp file and rename it into place (atomic), so no
  // process ever imports a half-written module.
  if (!existsSync(file)) {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, code);
    renameSync(tmp, file);
  }
  return import(pathToFileURL(file).href);
}
