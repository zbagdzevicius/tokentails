import { defineConfig } from 'vite';

/**
 * Deploy path (Vite `base`). Relative by default (standalone exports, `npm run build`).
 * BADCAT_BASE sets an absolute sub-path or a full URL: `npm run build:client` uses `/badcat-game/`
 * (served top level by the client app through rewrites, GDD 6.6). Any spelling is normalised to one
 * leading and one trailing slash.
 */
export function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value || value === '.' || value === './') return './';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.endsWith('/') ? value : `${value}/`;
  const path = value.replace(/^\.\//, '').split('/').filter(Boolean).join('/');
  return path ? `/${path}/` : '/';
}

const base = normalizeBase(process.env.BADCAT_BASE);

/**
 * Build id for the service worker cache (`sw.js?v=<id>`): BADCAT_BUILD_ID when set (CI), else a timestamp in
 * base 36. Dev serves 'dev' (the worker is not registered in dev).
 */
export function buildIdFor(command: string, raw: string | undefined): string {
  const v = raw?.trim() ?? '';
  if (/^[A-Za-z0-9._-]{1,40}$/.test(v)) return v;
  return command === 'serve' ? 'dev' : Date.now().toString(36);
}

export default defineConfig(({ command }) => ({
  // Only VITE_* reaches the page (config only: VITE_BADCAT_PRESALE_URL, VITE_BADCAT_API_URL, VITE_BADCAT_POSTHOG_KEY,
  // VITE_BADCAT_SHORT_URL, VITE_BADCAT_AUTH_ORIGIN, VITE_BADCAT_TREAT_URL; VITE_BADCAT_QA is dev tooling).
  envPrefix: ['VITE_'],
  base,
  define: {
    'import.meta.env.VITE_BADCAT_BUILD': JSON.stringify(buildIdFor(command, process.env.BADCAT_BUILD_ID)),
  },
  server: { port: 5174, host: '127.0.0.1', strictPort: true, allowedHosts: ['.trycloudflare.com'] },
  preview: { port: 4174, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // three.js in its own long-cached chunk; mediabunny and share/clip/* load lazily (GDD 7.3).
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
}));
