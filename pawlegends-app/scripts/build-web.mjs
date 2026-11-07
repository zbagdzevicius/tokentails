#!/usr/bin/env node
/**
 * Build the web bundle the app ships and updates (docs/plans/moba/APP-STORE.md "Game changes for the app build"):
 *
 * 1. `pawlegends` built for the app: relative base (served from capacitor://localhost), VITE_PAWLEGENDS_APP=1 (no
 *    purchase links, app build locked), the production API for party play, and no PostHog key (the App Store privacy
 *    label has no analytics data; nothing is sent, so there is no consent prompt and no tracking).
 * 2. The shell (src/shell/main.ts) bundled to `www/shell.js` with this bundle's stamp, and loaded before the game.
 * 3. `www/bundle.json`: the stamp (version, seq, compat, simVersion), read by the OTA publish job.
 *
 * Usage: node scripts/build-web.mjs [--seq <n>] [--skip-game]
 *   --seq: publish order (default: UTC yyyymmddHHMMSS now). The bundle version is `<seq>-<git short sha>`.
 *   --skip-game: reuse ../pawlegends/dist-app (shell-only rebuild).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { spkiPem } from './lib/capgo-crypto.mjs';
import { NATIVE_COMPAT, UPDATES_URL, LOCAL_UPDATES_URL, PUBLIC_KEY_PATH, API_ORIGIN } from './lib/app-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const gameDir = resolve(appDir, '../pawlegends');
const www = join(appDir, 'www');
const gameOut = join(gameDir, 'dist-app');

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function utcSeq(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return Number(`${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`);
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: appDir, encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    return 'local';
  }
}

function simVersion() {
  const src = readFileSync(join(gameDir, 'src/sim/version.ts'), 'utf8');
  const v = Number(/SIM_VERSION\s*=\s*(\d+)/.exec(src)?.[1]);
  if (!Number.isInteger(v)) throw new Error('build-web: SIM_VERSION not found in pawlegends/src/sim/version.ts');
  return v;
}

const seq = Number(arg('--seq') ?? utcSeq());
if (!Number.isSafeInteger(seq) || seq <= 0) throw new Error(`build-web: bad --seq ${arg('--seq')}`);
const version = `${seq}-${gitSha()}`;
const stamp = { version, seq, compat: NATIVE_COMPAT, simVersion: simVersion() };

if (!args.includes('--skip-game')) {
  if (!existsSync(join(gameDir, 'node_modules'))) execFileSync('npm', ['ci'], { cwd: gameDir, stdio: 'inherit' });
  const env = {
    ...process.env,
    PAWLEGENDS_BASE: './',
    PAWLEGENDS_KEEP_RELEASES: '0',
    VITE_PAWLEGENDS_APP: '1',
    VITE_PAWLEGENDS_API: API_ORIGIN,
    VITE_PAWLEGENDS_BUILD: `app-${version}`,
    // no analytics in v1 (no analytics data on the privacy label): an empty key wins over any .env file
    VITE_PAWLEGENDS_POSTHOG_KEY: '',
  };
  execFileSync('npx', ['tsc', '--noEmit'], { cwd: gameDir, stdio: 'inherit', env });
  execFileSync('npx', ['vite', 'build', '--outDir', gameOut, '--emptyOutDir'], { cwd: gameDir, stdio: 'inherit', env });
}
if (!existsSync(join(gameOut, 'index.html'))) throw new Error(`build-web: no game build in ${gameOut}`);

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(gameOut, www, { recursive: true });

const publicPem = readFileSync(PUBLIC_KEY_PATH, 'utf8');
await build({
  entryPoints: [join(appDir, 'src/shell/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['safari15'],
  minify: true,
  legalComments: 'none',
  outfile: join(www, 'shell.js'),
  define: {
    __PL_STAMP__: JSON.stringify(stamp),
    __PL_SPKI__: JSON.stringify(spkiPem(publicPem)),
    __PL_UPDATES_URL__: JSON.stringify(UPDATES_URL),
    __PL_LOCAL_UPDATES_URL__: JSON.stringify(LOCAL_UPDATES_URL),
  },
  logLevel: 'warning',
});

const indexPath = join(www, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const tag = '<script src="./shell.js"></script>';
if (!html.includes('</head>')) throw new Error('build-web: index.html has no </head>');
// before the game's module script: the shell's navigator.vibrate exists when the game reads it
writeFileSync(indexPath, html.includes(tag) ? html : html.replace('</head>', `    ${tag}\n  </head>`));
writeFileSync(join(www, 'bundle.json'), `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`build-web: ${version} (compat ${stamp.compat}, sim ${stamp.simVersion}) -> ${www}`);
