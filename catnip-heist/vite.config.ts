import { defineConfig } from 'vite';

// Deploy path. Relative by default (works from any directory URL with a trailing slash); set
// HEIST_BASE to an absolute sub-path for hosting, e.g. HEIST_BASE=/tokentails/heist/ npm run build.
const base = process.env.HEIST_BASE?.trim() || './';

export default defineConfig({
  // Only HEIST_PAYOUTS_URL (the win-screen payouts link) is exposed to the page, as import.meta.env.
  envPrefix: ['VITE_', 'HEIST_PAYOUTS_URL'],
  base: base === './' || base.endsWith('/') ? base : `${base}/`,
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build',
    chunkSizeWarningLimit: 1200,
  },
});
