/**
 * Bundle budget helpers (GDD 11.3, FULL-PLAN 7.2): first-load JS = the entry script plus its modulepreloads
 * in the built index.html (entry + three + runtime), never the lazy share / clip / editor / mediabunny /
 * encoder / gif chunks. Sizes are gzip bytes; 1 KB = 1000 bytes, like Vite's own report.
 */

export const BUDGET_KB = 450;
export const LAZY_RE = /(^|[\/_.-])(share|clip|editor|mediabunny|encoder|gif)/i;

/** Asset paths the HTML loads on first paint: module scripts, modulepreloads, stylesheets (query/hash dropped). */
export function firstLoadAssets(html) {
  const out = [];
  const add = (u) => {
    const clean = String(u).split(/[?#]/)[0];
    if (clean && !/^(https?:)?\/\//i.test(clean) && !out.includes(clean)) out.push(clean);
  };
  for (const m of String(html).matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["'][^>]*>/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<link\b[^>]*\brel=["'](?:modulepreload|stylesheet)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'](?:modulepreload|stylesheet)["'][^>]*>/gi)) add(m[1]);
  return out;
}

/** dist-relative path of an asset URL from index.html, given the build base ('/badcat-game/', './', '/'). */
export function distPath(url, base = '/') {
  let u = String(url);
  const b = String(base);
  if (b.startsWith('/') && b !== '/' && u.startsWith(b)) u = u.slice(b.length);
  return u.replace(/^\.\//, '').replace(/^\/+/, '');
}

/** Guess the base from the entry URL: everything before "<assetsDir>/". */
export function baseOf(urls, assetsDir = 'build') {
  for (const u of urls) {
    const i = u.indexOf(`${assetsDir}/`);
    if (i >= 0) return u.slice(0, i) || '/';
  }
  return '/';
}

export const isLazyName = (file) => LAZY_RE.test(String(file).split('/').pop() ?? '');

/**
 * `files`: [{ file, gzip, raw }] for every built JS/CSS file; `first`: dist paths from firstLoadAssets.
 * Returns { rows, firstJs, firstCss, lazyLeak, over, limit } (sizes in bytes).
 */
export function summarize(files, first, limitKb = BUDGET_KB) {
  const set = new Set(first);
  const rows = files
    .map((f) => ({ ...f, firstLoad: set.has(f.file), lazy: isLazyName(f.file) }))
    .sort((a, b) => Number(b.firstLoad) - Number(a.firstLoad) || b.gzip - a.gzip);
  const firstJsRows = rows.filter((r) => r.firstLoad && r.file.endsWith('.js') && !r.lazy);
  const firstJs = firstJsRows.reduce((s, r) => s + r.gzip, 0);
  const firstCss = rows.filter((r) => r.firstLoad && r.file.endsWith('.css')).reduce((s, r) => s + r.gzip, 0);
  // A lazy chunk preloaded by index.html is a regression worth naming even if the total still fits.
  const lazyLeak = rows.filter((r) => r.firstLoad && r.lazy).map((r) => r.file);
  const limit = limitKb * 1000;
  return { rows, firstJs, firstCss, lazyLeak, over: firstJs > limit, limit };
}

export const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;
