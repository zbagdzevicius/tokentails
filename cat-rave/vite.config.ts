import { defineConfig, searchForWorkspaceRoot } from 'vite';

/**
 * Deploy path (Vite `base`). Relative by default, so a plain `vite build` works from any directory
 * URL with a trailing slash. `npm run build:client` sets RAVE_BASE=/rave/ (built into
 * client/public/rave; client/next.config.js rewrites /rave to /rave/index.html). Any spelling is normalised to one leading and trailing slash.
 */
export function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value || value === '.' || value === './') return './';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.endsWith('/') ? value : `${value}/`;
  const path = value.replace(/^\.\//, '').split('/').filter(Boolean).join('/');
  return path ? `/${path}/` : '/';
}

export default defineConfig({
  // RAVE_API_URL: the Token Tails backend whose public payout index is read (GET /shelter/payouts).
  envPrefix: ['VITE_', 'RAVE_API_URL'],
  base: normalizeBase(process.env.RAVE_BASE),
  server: {
    port: 5180,
    strictPort: false,
    host: '127.0.0.1',
    allowedHosts: ['.trycloudflare.com'],
    // The USDC tab imports ../shelter-rail/src/sdk.mjs (CHECKOUT-SPEC.md section 10); the build can already.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../shelter-rail/src'] },
  },
  preview: { port: 4180, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // three.js in its own long-lived chunk (same split as catnip-heist).
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/](three|postprocessing)[\\/]/ }] },
      },
    },
  },
});
