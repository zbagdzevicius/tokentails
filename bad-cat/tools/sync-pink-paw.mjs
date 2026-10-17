#!/usr/bin/env node
/**
 * npm run sync:pinkpaw (GDD 4.6): refresh public/pink-paw-cats.json.
 *
 *   node tools/sync-pink-paw.mjs                    re-emit the existing snapshot (normalised), no network
 *   node tools/sync-pink-paw.mjs <file.json>        a saved GET /cat/sale body (or GET /shelter/rozine-pedute/gallery)
 *   node tools/sync-pink-paw.mjs --url <url>        fetch it (only when given explicitly; never production by default)
 *   options: --as-of YYYY-MM-DD (default today), --dry
 *
 * Mapping is shared/pink-paw.ts itself (pinkPawGallery / parsePinkPawGalleryBody, loaded through Vite): HEAVEN
 * cats never shown, https images required, names capitalised, ADOPTED cats go to the alumni list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { viteLoader, PKG_ROOT } from './lib/vite-load.mjs';
import { argValue, hasFlag, positionals } from './lib/args.mjs';
import { mergeGallery, normalizeSnapshot } from './lib/pink-paw-sync.mjs';

const OUT = path.join(PKG_ROOT, 'public', 'pink-paw-cats.json');
const SHARED = path.resolve(PKG_ROOT, '..', 'shared', 'pink-paw.ts');
const file = positionals(['--url', '--as-of'])[0];
const url = argValue('--url');
const dry = hasFlag('--dry');
const today = new Date();
const asOfArg = argValue('--as-of');
const asOf = asOfArg && /^\d{4}-\d{2}-\d{2}$/.test(asOfArg)
  ? asOfArg
  : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { cats: [] };
let next;
if (!file && !url) {
  next = normalizeSnapshot(prev);
  console.log(`no source given: re-emitting the existing snapshot (${next.cats.length} cats, as of ${next.asOf})`);
} else {
  let body;
  let source;
  if (url) {
    if (!/^https?:\/\//.test(url)) throw new Error('--url must be http(s)');
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    body = await res.json();
    source = `${new URL(url).pathname} (${asOf})`;
  } else {
    body = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    source = `${path.basename(file)} (${asOf})`;
  }
  const v = await viteLoader();
  let gallery;
  try {
    const shared = await v.load(SHARED);
    gallery = shared.parsePinkPawGalleryBody(body) ?? shared.pinkPawGallery(body);
    source = `GET /cat/sale mapping (shared/pink-paw.ts) from ${source}; refresh: npm run sync:pinkpaw`;
  } finally {
    await v.close();
  }
  if (!gallery.atShelter.length && !gallery.adopted.length) {
    console.error('the source has no showable Pink Paw cats; snapshot left unchanged');
    process.exit(1);
  }
  const r = mergeGallery(prev, gallery, { asOf, source });
  next = r.snapshot;
  console.log(`${gallery.atShelter.length} at the shelter, ${gallery.adopted.length} adopted; ${r.added.length} new (coat guessed: match it to the photo), ${r.changed.length} changed, ${r.missing.length} kept (not in the source)`);
}
const text = `${JSON.stringify(next, null, 2)}\n`;
if (dry) console.log(text);
else if (fs.readFileSync(OUT, 'utf8') === text) console.log('public/pink-paw-cats.json already up to date');
else {
  fs.writeFileSync(OUT, text);
  console.log(`wrote public/pink-paw-cats.json (${next.cats.length} cats)`);
}
