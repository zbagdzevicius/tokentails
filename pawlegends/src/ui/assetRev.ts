/**
 * A per-build query for art URLs (`?v=<git sha>`), so a file that 404'd at the CDN edge before its deploy (Cloudflare
 * keeps the 404 for up to 4 hours: `cache-control: public, max-age=14400`) is fetched under a fresh URL by the build that
 * ships it. Empty outside a Vite build (unit tests).
 */
export function assetRev(): string {
  const b = typeof __PL_BUILD__ !== 'undefined' ? __PL_BUILD__ : null;
  return b?.sha ? `?v=${encodeURIComponent(b.sha)}` : '';
}
