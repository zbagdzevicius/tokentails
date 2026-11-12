/**
 * Guard: every art path the game code names (`assets/...` in src/**\/*.ts and *.css) exists in public/, so a picture a
 * player can see never ships as a 404. A path built from a template (`assets/splash/${hero}-${w}.webp`) must match at
 * least one file; the per-hero splash, the Home promo slides and the store art are checked file by file.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HERO_IDS } from '../../src/data/heroes';

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

const publicFiles = walk(PUBLIC).map((f) => path.relative(PUBLIC, f).split(path.sep).join('/'));
const publicSet = new Set(publicFiles);

const HOLE = '\u0000';
/** Every `assets/…` path in one source file; template holes (`${…}`) become HOLE. */
function pathsIn(text: string): string[] {
  const t = text.replace(/\$\{[^}]*\}/g, HOLE);
  const re = new RegExp(`assets/[A-Za-z0-9_\\-./${HOLE}]+\\.(?:webp|png|jpe?g|svg|mp3|ogg|glb|json|woff2?)`, 'g');
  return [...t.matchAll(re)].map((m) => m[0]);
}

describe('asset paths', () => {
  const refs = new Map<string, string>();
  for (const f of walk(SRC).filter((f) => /\.(ts|css)$/.test(f) && !f.endsWith('.d.ts'))) {
    for (const p of pathsIn(fs.readFileSync(f, 'utf8'))) refs.set(p, path.relative(ROOT, f));
  }

  it('finds the art the code names', () => {
    expect(refs.size).toBeGreaterThan(30);
  });

  it('every literal assets/ path exists in public/', () => {
    const missing = [...refs].filter(([p]) => !p.includes(HOLE) && !publicSet.has(p)).map(([p, f]) => `${p} (${f})`);
    expect(missing).toEqual([]);
  });

  it('every templated assets/ path matches at least one file in public/', () => {
    const missing = [...refs]
      .filter(([p]) => p.includes(HOLE))
      .filter(([p]) => {
        const re = new RegExp(`^${p.split(HOLE).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
        return !publicFiles.some((f) => re.test(f));
      })
      .map(([p, f]) => `${p.split(HOLE).join('${…}')} (${f})`);
    expect(missing).toEqual([]);
  });

  it('every hero has its splash art at 360 and 720', () => {
    const missing = HERO_IDS.flatMap((h) => [360, 720].map((w) => `assets/splash/${h}-${w}.webp`)).filter((p) => !publicSet.has(p));
    expect(missing).toEqual([]);
  });

  it('the Home promo slides and the store art exist', () => {
    for (const p of ['assets/lobby/promo-pass.webp', 'assets/lobby/promo-cannon.webp', 'assets/lobby/promo-store.webp', 'assets/lobby/promo-store-lo.webp', 'assets/splash/backdrop-1600.webp']) {
      expect(publicSet.has(p), p).toBe(true);
    }
  });
});
