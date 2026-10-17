/**
 * Load the game's TypeScript modules from Node tools through Vite in middleware mode (no port, no HMR
 * socket), so tools reuse the exact sources the game ships. Never touches the dev server on 5174.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Starts a middleware-mode Vite server; returns { load(id), close() }. */
export async function viteLoader() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: PKG_ROOT,
    configFile: path.join(PKG_ROOT, 'vite.config.ts'),
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return {
    server,
    load: (id) => server.ssrLoadModule(id),
    close: () => server.close(),
  };
}
