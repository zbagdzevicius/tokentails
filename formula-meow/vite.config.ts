import { defineConfig } from 'vite';

/**
 * Deploy path (Vite `base`). Relative by default; `npm run build:client` sets MEOW_BASE=/formula-meow-game/ (served
 * at /meow-race through client/next.config.js rewrites, GDD 8.3). Any spelling is normalised to one leading and one
 * trailing slash.
 */
export function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value || value === '.' || value === './') return './';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.endsWith('/') ? value : `${value}/`;
  const path = value.replace(/^\.\//, '').split('/').filter(Boolean).join('/');
  return path ? `/${path}/` : '/';
}

export default defineConfig({
  envPrefix: ['VITE_'],
  base: normalizeBase(process.env.MEOW_BASE),
  server: { port: 5175, host: '127.0.0.1', strictPort: true },
  preview: { port: 4175, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            // the clip encoder stays a lazy chunk (its own group keeps rolldown's runtime helpers out of it)
            { name: 'mediabunny', test: /node_modules[\\/]mediabunny[\\/]/ },
          ],
        },
      },
    },
  },
});
