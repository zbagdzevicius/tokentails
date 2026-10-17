import { defineConfig } from 'vite';

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

export default defineConfig({
  // Only VITE_* reaches the page (VITE_EMBED_ORIGINS, VITE_PAWLEGENDS_POSTHOG_KEY, ...).
  envPrefix: ['VITE_'],
  base,
  server: { port: 5176, host: '127.0.0.1', strictPort: true },
  preview: { port: 4176, host: '127.0.0.1' },
  worker: { format: 'es' },
  build: {
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
