import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { recordRelease } from './tools/lib/keep-releases.mjs';

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
 * Embed build only (`npm run build:client` sets PAWLEGENDS_KEEP_RELEASES=3, tools/lib/keep-releases.mjs KEEP_RELEASES): instead of emptying the out dir, keep the
 * previous releases' hashed `build/` files so tabs opened before a redeploy still load their chunks and sim Worker
 * (launch finding R2, tools/lib/keep-releases.mjs). Next serves `/pawlegends-game/build/*` as immutable.
 */
const keepReleases = Number(process.env.PAWLEGENDS_KEEP_RELEASES ?? 0);

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
      const { releases, removed } = recordRelease(outDir, Object.keys(bundle), publicDir, count);
      this.info(`kept ${releases.length} release(s) in build/, removed ${removed.length} stale file(s)`);
    },
  };
}

export default defineConfig({
  // Only VITE_* reaches the page (VITE_EMBED_ORIGINS, VITE_PAWLEGENDS_POSTHOG_KEY, ...).
  envPrefix: ['VITE_'],
  base,
  server: { port: 5176, host: '127.0.0.1', strictPort: true },
  preview: { port: 4176, host: '127.0.0.1' },
  worker: { format: 'es' },
  plugins: keepReleases > 0 ? [keepReleasesPlugin(keepReleases)] : [],
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
