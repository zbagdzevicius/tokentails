import { defineConfig, type Plugin } from 'vite';

/**
 * Deploy path (Vite `base`). Relative by default (works from any directory URL with a trailing
 * slash). HEIST_BASE sets an absolute sub-path or a full URL: `npm run build:client` uses
 * `/heist-game/` (served by the client app, plan F12) and the Pages workflow `/<repo>/heist-game/`.
 * Any spelling is normalised to one leading and one trailing slash, so `heist-game`,
 * `/heist-game` and `//heist-game//` all build for `/heist-game/`.
 */
export function normalizeBase(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value || value === '.' || value === './') {
    return './';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value.endsWith('/') ? value : `${value}/`;
  }
  const path = value.replace(/^\.\//, '').split('/').filter(Boolean).join('/');
  return path ? `/${path}/` : '/';
}

const base = normalizeBase(process.env.HEIST_BASE);

/** The tokentails.com build (`npm run build:client`), served next to the client's shared icons. */
export const CLIENT_BASE = '/heist-game/';

/** The icon links index.html carries: the shared Token Tails set at the client's site root. */
const SHARED_ICON_LINKS =
  /[ \t]*<link rel="icon" href="\/favicon\.ico"[^>]*>\n[ \t]*<link rel="icon" href="\/icons\/icon-32\.png"[^>]*>\n([ \t]*)<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"[^>]*>/;

/**
 * Standalone exports (itch, Poki, Anitya, GitHub Pages, a plain `npm run build`) have no
 * `/favicon.ico` or `/icons/` at their site root, so every load would 404 and the tab icon would
 * vanish. Only the tokentails.com build keeps the shared links; every other base gets the game's
 * own paw icon back (a public file, so Vite prefixes it with the base like before).
 */
export function iconLinksFor(html: string, deployBase: string): string {
  if (deployBase === CLIENT_BASE) return html;
  return html.replace(SHARED_ICON_LINKS, (_match, indent: string) => `${indent}<link rel="icon" href="/assets/images/paw.png" />`);
}

const standaloneIcons = (deployBase: string): Plugin => ({
  name: 'heist-standalone-icons',
  // `pre`: before Vite's own HTML pass, which rewrites public-file URLs for the base.
  transformIndexHtml: { order: 'pre', handler: (html) => iconLinksFor(html, deployBase) },
});

export default defineConfig({
  // Only HEIST_PAYOUTS_URL (the win-screen payouts link), HEIST_DEPLOYMENTS_URL (its on-chain
  // total) and HEIST_GIVE_URL (the "rescue treat" button) are exposed to the page, as import.meta.env.
  envPrefix: ['VITE_', 'HEIST_PAYOUTS_URL', 'HEIST_DEPLOYMENTS_URL', 'HEIST_GIVE_URL'],
  base,
  plugins: [standaloneIcons(base)],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // three.js (about 70% of the script) in its own chunk: it changes far less often than the
        // game, so a redeploy only invalidates the smaller game chunk, and the two download in
        // parallel (the HTML preloads both).
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
      },
    },
  },
});
