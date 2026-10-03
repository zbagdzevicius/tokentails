#!/usr/bin/env node
// Vendors the Heist sim into the backend (plan G2 layer 2). `POST /user/catbassadors/live` replays
// Heist runs with exactly this code, so the backend never re-implements a rule.
//
//   npm run vendor-sim          # rebuild backend/src/vendor/heist-sim/
//   npm run vendor-sim:check    # CI: exit 1 when the vendored copy differs from a fresh build
//   npm run vendor-sim:check-remote -- <backend url>
//                               # deploy gate: exit 1 unless that backend serves this exact sim
//                               # (GET /user/catbassadors/heist-sim), so the Heist site never goes
//                               # live ahead of the backend that verifies its runs (review 3b #1)
//
// What it does:
// 1. A Vite library build (Rolldown underneath; Vite is already a dev dependency) of
//    src/sim/server.ts and everything it imports (the sim, the 8 level files, the cat ids from
//    public/assets/manifest.json) into one ES module. No minification, so a diff stays readable.
//    `import.meta.env` is defined empty: the deploy URLs in src/types.ts are browser-only and
//    tree-shaken away.
// 2. Writes it to backend/src/vendor/heist-sim/heist-sim.bundle.ts behind `/* eslint-disable */`
//    and `// @ts-nocheck`. It is a .ts file on purpose: `nest build` (tsc, no allowJs) compiles
//    it into dist/ with everything else, and ts-jest loads it in specs, with no build config change.
// 3. Writes index.ts, the typed facade the backend imports (types below mirror src/sim/server.ts;
//    the facade's behaviour is pinned by backend/src/user/heist/heist-sim.spec.ts).
// 4. Writes heist-sim.sha256.json: sha256 of the bundle and of the facade, the sim version, the
//    level ids and the tool versions. The backend spec re-hashes the files, so a hand edit of the
//    vendored copy fails the backend tests too.
//
// The build is deterministic (same sources, same Vite) so `--check` compares bytes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Vite derives import.meta.env.DEV/PROD from NODE_ENV, and test runners set it to `test`. Pin it so
// the bundle is byte-identical wherever the script runs (CI, vitest, a shell).
process.env.NODE_ENV = 'production';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = resolve(root, '..');
const entry = join(root, 'src', 'sim', 'server.ts');
const outDir = join(repo, 'backend', 'src', 'vendor', 'heist-sim');
const check = process.argv.includes('--check');
const remoteFlag = process.argv.indexOf('--check-remote');
const remote = remoteFlag >= 0 ? process.argv[remoteFlag + 1] || process.env.HEIST_BACKEND_URL : undefined;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const viteVersion = JSON.parse(readFileSync(join(root, 'node_modules', 'vite', 'package.json'), 'utf8')).version;

const MANIFEST = join(root, 'public', 'assets', 'manifest.json');

/**
 * JSON modules as one `JSON.parse("...")` string each, not as object literals:
 * - the asset manifest is cut to `{cats: [{id}]}`. The sim reads only the cat ids (CAT_IDS), so 50 KB
 *   of sprite-sheet metadata stays out of the backend; ids and order are unchanged (the backend spec
 *   compares them to the manifest);
 * - the level and solution files keep every field, minified into a string literal. Thousands of
 *   lines of object literal would make the backend's typed ESLint run take minutes on this file.
 */
function jsonAsStrings() {
  return {
    name: 'heist-json-as-strings',
    enforce: 'pre',
    load(id) {
      const path = resolve(id.split('?')[0]);
      if (!path.endsWith('.json')) return null;
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const value = path === MANIFEST ? { cats: data.cats.map((cat) => ({ id: cat.id })) } : data;
      const named = path === MANIFEST ? 'export const cats = data.cats;\n' : '';
      return {
        code: `const data = JSON.parse(${JSON.stringify(JSON.stringify(value))});\n${named}export default data;\n`,
        moduleType: 'js',
      };
    },
  };
}

async function bundle() {
  const result = await build({
    configFile: false,
    mode: 'production',
    root,
    logLevel: 'silent',
    // Browser-only build-time URLs (src/types.ts) read import.meta.env; nothing here needs them.
    define: { 'import.meta.env': '{}' },
    plugins: [jsonAsStrings()],
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      // The backend compiles the bundle again with its own target (es2017); es2022 keeps class
      // fields native here, so no helper runtime lands in the bundle.
      target: 'es2022',
      lib: { entry, formats: ['es'], fileName: () => 'heist-sim.js' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = outputs.filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`vendor-sim: expected one chunk, got ${chunks.length}`);
  const code = chunks[0].code;
  if (/import\.meta|\bimport\s*\(|\brequire\s*\(|\bwindow\.|\bdocument\.|localStorage/.test(code)) {
    throw new Error('vendor-sim: the bundle reaches for a browser or module-loader API; keep src/sim/server.ts pure');
  }
  if (/^\s*import\s/m.test(code)) throw new Error('vendor-sim: the bundle still imports a module');
  return { code, modules: Object.keys(chunks[0].modules).map((id) => relative(root, id).split('\\').join('/')).sort() };
}

const HEADER = [
  '/* eslint-disable */',
  '// @ts-nocheck',
  '// GENERATED by catnip-heist/scripts/vendor-sim.mjs from catnip-heist/src/sim/server.ts. Do not edit:',
  '// change the Heist sources and run `npm run vendor-sim` in catnip-heist/ (CI runs `vendor-sim:check`).',
  '',
].join('\n');

const facade = (bundleSha256) => `/* eslint-disable */
// GENERATED by catnip-heist/scripts/vendor-sim.mjs. Do not edit; run \`npm run vendor-sim\` in catnip-heist/.
//
// Typed facade over the vendored Heist sim (plan G2 layer 2). The types mirror
// catnip-heist/src/sim/server.ts; backend/src/user/heist/heist-sim.spec.ts pins the behaviour.
import * as bundle from './heist-sim.bundle';

// The bundle is plain JavaScript behind @ts-nocheck; its inferred types are not the contract.
const sim: any = bundle;

export type HeistInputRun = [number, number, number, number];

export interface HeistLevelInfo {
    id: string;
    /** 0-based campaign index: the slot of \`heistScore\` / \`heistStars\` on a user. */
    index: number;
    name: string;
    parTicks: number;
    coins: number;
    /** Highest score a won run can reach. */
    maxScore: number;
    /** Most ticks a replay of this level may have: min(4 x parTicks, MAX_REPLAY_TICKS). */
    tickCap: number;
}

export type HeistVerifyCode = 'HEIST_REPLAY_INVALID' | 'HEIST_NOT_WON' | 'HEIST_TRAILING_INPUT' | 'HEIST_SIM_VERSION';

export interface HeistRunLogInput {
    levelId: string;
    simVersion: number;
    seed: number;
    catIds: readonly string[];
    ticks: number;
    runs: readonly (readonly number[])[];
}

export interface HeistVerifiedRun {
    ok: true;
    levelId: string;
    levelIndex: number;
    ticks: number;
    score: number;
    stars: number;
    coins: number;
    spottedCount: number;
    finalHash: number;
    runs: HeistInputRun[];
}

export interface HeistRejectedRun {
    ok: false;
    code: HeistVerifyCode;
    reason: string;
}

export type HeistVerifyResult = HeistVerifiedRun | HeistRejectedRun;

export interface HeistStarRule {
    bit: number;
    label: string;
    detail: string;
}

export const SIM_VERSION: number = sim.SIM_VERSION;
export const TICK_HZ: number = sim.TICK_HZ;
export const CAMPAIGN_SEED: number = sim.CAMPAIGN_SEED;
export const MAX_REPLAY_TICKS: number = sim.MAX_REPLAY_TICKS;
export const LEVELS: readonly HeistLevelInfo[] = sim.LEVELS;
export const CAT_IDS: readonly string[] = sim.CAT_IDS;
export const STAR_WIN: number = sim.STAR_WIN;
export const STAR_COINS: number = sim.STAR_COINS;
export const STAR_CLEAN: number = sim.STAR_CLEAN;
export const STAR_ALL: number = sim.STAR_ALL;
export const STAR_RULES: readonly HeistStarRule[] = sim.STAR_RULES;
/** sha256 of heist-sim.bundle.ts: which sim this backend replays with (GET /user/catbassadors/heist-sim). */
export const BUNDLE_SHA256 = '${bundleSha256}';

export const verifyRun: (log: unknown) => HeistVerifyResult = sim.verifyRun;
export const checkRunLog: (log: unknown) => HeistLevelInfo | HeistRejectedRun = sim.checkRunLog;
export const canonicalRuns: (runs: readonly (readonly number[])[]) => HeistInputRun[] = sim.canonicalRuns;
export const canonicalLogKey: (
    log: Pick<HeistRunLogInput, 'levelId' | 'simVersion' | 'seed' | 'ticks' | 'runs'>
) => string = sim.canonicalLogKey;
export const levelById: (levelId: unknown) => HeistLevelInfo | undefined = sim.levelById;
export const computeStars: (
    run: { coins: number; ticks: number; spottedCount: number },
    won: boolean,
    level: { coins: readonly unknown[] | number; meta: { parTicks: number } }
) => number = sim.computeStars;
export const starCount: (mask: number) => number = sim.starCount;
`;

async function main() {
  const { code, modules } = await bundle();
  const bundleText = `${HEADER}${code.endsWith('\n') ? code : `${code}\n`}`;
  const { SIM_VERSION, LEVELS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const bundleSha256 = sha256(bundleText);
  const FACADE = facade(bundleSha256);
  const meta = {
    $comment: 'Written by catnip-heist/scripts/vendor-sim.mjs. backend/src/user/heist/heist-sim.spec.ts re-hashes the files.',
    simVersion: SIM_VERSION,
    levels: LEVELS.map((l) => l.id),
    levelCaps: LEVELS.map((l) => l.maxScore),
    files: {
      'heist-sim.bundle.ts': bundleSha256,
      'index.ts': sha256(FACADE),
    },
    modules,
    vite: viteVersion,
  };
  const files = {
    'heist-sim.bundle.ts': bundleText,
    'index.ts': FACADE,
    'heist-sim.sha256.json': `${JSON.stringify(meta, null, 2)}\n`,
  };

  if (remote !== undefined) {
    await checkRemote(remote, SIM_VERSION, bundleSha256);
    return;
  }

  if (check) {
    const drift = Object.entries(files).filter(([name, text]) => {
      const path = join(outDir, name);
      return !existsSync(path) || readFileSync(path, 'utf8') !== text;
    });
    if (drift.length) {
      console.error(`vendor-sim: backend/src/vendor/heist-sim is out of date (${drift.map(([n]) => n).join(', ')}).`);
      console.error('Run `npm run vendor-sim` in catnip-heist/ and commit the result.');
      process.exit(1);
    }
    console.log(`vendor-sim: up to date (sim v${SIM_VERSION}, bundle sha256 ${meta.files['heist-sim.bundle.ts'].slice(0, 12)})`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    const path = join(outDir, name);
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
    writeFileSync(path, text);
    console.log(`vendor-sim: wrote ${relative(repo, path)}`);
  }
  console.log(`vendor-sim: sim v${SIM_VERSION}, ${LEVELS.length} levels, caps ${meta.levelCaps.join(',')}, ${(bundleText.length / 1024).toFixed(1)} KB`);
}

/**
 * Deploy gate (review 3b #1): the backend at `base` must report the same bundle sha256 as a fresh
 * build of this tree. Otherwise every save from the new site would get 400 HEIST_SIM_VERSION or
 * HEIST_REPLAY_INVALID from the old backend. Deploy the backend first whenever the sim changes.
 */
async function checkRemote(base, simVersion, bundleSha256) {
  if (!base) {
    console.error('vendor-sim: --check-remote needs the backend base URL (argument or HEIST_BACKEND_URL)');
    process.exit(2);
  }
  const url = `${base.replace(/\/+$/, '')}/user/catbassadors/heist-sim`;
  let served;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    served = await response.json();
  } catch (error) {
    console.error(`vendor-sim: cannot read ${url}: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  if (served?.bundleSha256 !== bundleSha256) {
    console.error(
      `vendor-sim: ${url} serves sim v${served?.simVersion} (${String(served?.bundleSha256).slice(0, 12)}), ` +
        `this tree builds v${simVersion} (${bundleSha256.slice(0, 12)}). Deploy the backend first.`,
    );
    process.exit(1);
  }
  console.log(`vendor-sim: ${url} serves this sim (v${simVersion}, ${bundleSha256.slice(0, 12)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
