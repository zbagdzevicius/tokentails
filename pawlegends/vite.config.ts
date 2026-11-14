import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { recordRelease } from './tools/lib/keep-releases.mjs';
import { simSourceHash } from './tools/lib/sim-source-hash.mjs';

/**
 * Party play (MULTIPLAYER.md §2.1): __SIM_HASH__ is the sim source closure's hash, computed from the sources now;
 * __SIM_GOLDEN__ is what `npm run vendor-sim` measured on the vendored backend bundle (src/net/sim-stamp.json). If the
 * sim changed without re-vendoring, the golden self-test fails and the client refuses party play (update_required).
 */
function simDefines(): Record<string, string> {
  let golden = '';
  try {
    golden = (JSON.parse(readFileSync(path.resolve(__dirname, 'src/net/sim-stamp.json'), 'utf8')) as { golden?: string }).golden ?? '';
  } catch {
    golden = '';
  }
  return { __SIM_HASH__: JSON.stringify(simSourceHash()), __SIM_GOLDEN__: JSON.stringify(golden) };
}

/**
 * Deploy path (Vite `base`). Relative by default (`npm run build`). PAWLEGENDS_BASE sets an absolute sub-path or a
 * full URL: `npm run build:client` uses `/pawlegends-game/` (POC.md §2). Any spelling is normalised to one leading and
 * one trailing slash (pattern: bad-cat/vite.config.ts).
 */
export function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value || value === '.' || value === './') return './';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.endsWith('/') ? value : `${value}/`;
  const path = value.replace(/^\.\//, '').split('/').filter(Boolean).join('/');
  return path ? `/${path}/` : '/';
}

const base = normalizeBase(process.env.PAWLEGENDS_BASE);

/**
 * The release watermark on the title screen (src/ui/versionMark.ts): package version, git short sha and the UTC build
 * time, baked in so nothing is fetched. Outside a git checkout the sha is "local".
 */
function buildStamp(): { version: string; sha: string; builtAt: string } {
  let sha = 'local';
  try {
    sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().toLowerCase() || 'local';
  } catch {
    sha = 'local';
  }
  // PAWLEGENDS_BUILD_SHA: tests only (tests/e2e/force-update.spec.ts builds an "older" and a "newer" game)
  if (process.env.PAWLEGENDS_BUILD_SHA && /^[0-9a-z]{4,40}$/.test(process.env.PAWLEGENDS_BUILD_SHA)) sha = process.env.PAWLEGENDS_BUILD_SHA;
  const version = (JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  return { version, sha, builtAt: new Date().toISOString() };
}
const stamp = buildStamp();

function buildDefines(): Record<string, string> {
  return { __PL_BUILD__: JSON.stringify(stamp) };
}

/**
 * Force update (docs/plans/moba/FORCE-UPDATE.md §5.1): `version.json` next to index.html names the live build (its
 * sha, its sim). An open tab asks for it on the title (src/meta/clientPolicy.ts) and reloads to the latest build when
 * it is outdated; the backend reads it for `GET /pawlegends/client-policy?platform=web`. Served `no-cache`
 * (pawlegends-web/next.config.js), like index.html.
 */
function versionJsonPlugin(): Plugin {
  return {
    name: 'pawlegends-version-json',
    apply: 'build',
    generateBundle() {
      const src = readFileSync(path.resolve(__dirname, 'src/sim/version.ts'), 'utf8');
      const simVersion = Number(/SIM_VERSION\s*=\s*(\d+)/.exec(src)?.[1]);
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ sha: stamp.sha, builtAt: stamp.builtAt, version: stamp.version, simVersion })}\n` });
    },
  };
}

/**
 * Embed build only (`npm run build:client` sets PAWLEGENDS_KEEP_RELEASES=3, tools/lib/keep-releases.mjs KEEP_RELEASES): instead of emptying the out dir, keep the
 * previous releases' hashed `build/` files so tabs opened before a redeploy still load their chunks and sim Worker
 * (launch finding R2, tools/lib/keep-releases.mjs). Next serves `/pawlegends-game/build/*` as immutable.
 */
const keepReleases = Number(process.env.PAWLEGENDS_KEEP_RELEASES ?? 0);

/** The sim this build runs, written into build-releases.json for the landing roster (GAME_SIM_VERSION). */
function shippedSim(): { simVersion: number; simHash: string } {
  const src = readFileSync(path.resolve(__dirname, 'src/sim/version.ts'), 'utf8');
  const simVersion = Number(/SIM_VERSION\s*=\s*(\d+)/.exec(src)?.[1]);
  if (!Number.isInteger(simVersion)) throw new Error('vite: SIM_VERSION not found in src/sim/version.ts');
  return { simVersion, simHash: simSourceHash() };
}

function keepReleasesPlugin(count: number): Plugin {
  let outDir = '';
  let publicDir = '';
  return {
    name: 'pawlegends-keep-releases',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
      publicDir = c.publicDir;
    },
    writeBundle(_opts, bundle) {
      const { releases, removed } = recordRelease(outDir, Object.keys(bundle), publicDir, count, shippedSim());
      this.info(`kept ${releases.length} release(s) in build/, removed ${removed.length} stale file(s)`);
    },
  };
}

export default defineConfig({
  // Only VITE_* reaches the page (VITE_EMBED_ORIGINS, VITE_PAWLEGENDS_POSTHOG_KEY, ...).
  envPrefix: ['VITE_'],
  base,
  define: { ...simDefines(), ...buildDefines() },
  server: { port: 5176, host: '127.0.0.1', strictPort: true },
  preview: { port: 4176, host: '127.0.0.1' },
  worker: { format: 'es' },
  plugins: [versionJsonPlugin(), ...(keepReleases > 0 ? [keepReleasesPlugin(keepReleases)] : [])],
  build: {
    emptyOutDir: keepReleases > 0 ? false : undefined,
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // three.js in its own long-cached chunk.
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
