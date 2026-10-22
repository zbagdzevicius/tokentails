import { createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';

/** The Back on Track mix segments and manifest live in the Next.js public folder (CDN-synced). */
const MUSIC_DIR = fileURLToPath(new URL('../client/public/music', import.meta.url));
const MUSIC_TYPES: Record<string, string> = { m4a: 'audio/mp4', json: 'application/json' };

/**
 * Dev and preview serve /music/* from ../client/public/music (production serves it from Vercel and
 * the CDN), with byte ranges so the browser can seek like it does in production.
 */
function serveMusic(): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/music/')) return next();
    const file = resolve(MUSIC_DIR, decodeURIComponent(url.slice('/music/'.length)));
    const type = MUSIC_TYPES[file.split('.').pop() ?? ''];
    let size = -1;
    try {
      if (file.startsWith(MUSIC_DIR + sep) && type) size = statSync(file).size;
    } catch {
      /* missing */
    }
    if (size < 0) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
      if (start > end || start >= size) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.setHeader('Content-Length', String(size));
    createReadStream(file).pipe(res);
  };
  return {
    name: 'rave-music',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

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
  plugins: [serveMusic()],
  // RAVE_API_URL: the Token Tails backend whose public payout index is read (GET /shelter/payouts).
  envPrefix: ['VITE_', 'RAVE_API_URL'],
  base: normalizeBase(process.env.RAVE_BASE),
  server: {
    port: 5180,
    strictPort: false,
    host: '127.0.0.1',
    allowedHosts: ['.trycloudflare.com'],
    // The USDC tab imports ../shelter-rail/src/sdk.mjs (CHECKOUT-SPEC.md section 10); the build can already.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../shelter-rail/src', '../client/public/music'] },
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
