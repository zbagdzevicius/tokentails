/**
 * Merge a fresh Pink Paw gallery (shared/pink-paw.ts `pinkPawGallery` / `parsePinkPawGalleryBody` output) into the
 * game's snapshot (public/pink-paw-cats.json, shape `PinkPawSnapshot` in src/platform/pink-paw.ts).
 *
 * The storefront knows names, ids and statuses; it does not know the toon coat. Known cats keep their stylised
 * coat, bio and same-origin photo; a new cat gets a neutral coat picked from its id (flagged so a human can
 * match it to the photo). Cats missing from the source are kept unchanged (the storefront caps and drops cats
 * without images, so absence is not adoption). Remote photos are never downloaded.
 */

const PATTERNS = new Set(['solid', 'tabby', 'tuxedo', 'bicolor', 'calico', 'colorpoint', 'tortie']);
const STATUSES = new Set(['WAITING', 'RECOVERING', 'ADOPTED']);
const HEX = /^#[0-9a-f]{6}$/i;
const PHOTO = /^pink-paw\/[a-z0-9][a-z0-9-]{0,60}\.(jpg|jpeg|webp|png)$/;
/** Neutral starter coats for a cat the snapshot has not seen yet (stylised, not a claim about the cat). */
const STARTER_COATS = [
  { pattern: 'tabby', base: '#9a9aa2', secondary: '#55555f', tertiary: '#efebe4', eyes: 1 },
  { pattern: 'solid', base: '#3b3438', secondary: '#241f22', tertiary: '#5b5358', eyes: 0 },
  { pattern: 'tabby', base: '#e39a4f', secondary: '#b46a2c', tertiary: '#f7e3c8', eyes: 0 },
  { pattern: 'tuxedo', base: '#2e2a2c', secondary: '#f4efe7', tertiary: '#f4efe7', eyes: 1 },
  { pattern: 'bicolor', base: '#f4efe7', secondary: '#7a6a5e', tertiary: '#f4efe7', eyes: 2 },
];

export const adoptUrlFor = (id, site = 'https://tokentails.com') => `${site.replace(/\/+$/, '')}/cats/${encodeURIComponent(id)}`;

function starterCoat(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STARTER_COATS[h % STARTER_COATS.length];
}

/** A snapshot cat with every field checked; null when unusable. */
export function cleanCat(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[0-9a-f]{24}$/i.test(c.id)) return null;
  if (typeof c.name !== 'string' || !c.name.trim() || !STATUSES.has(c.status) || !PATTERNS.has(c.pattern)) return null;
  if (![c.base, c.secondary, c.tertiary].every((x) => typeof x === 'string' && HEX.test(x))) return null;
  // Same limits as parsePinkPawSnapshot in src/platform/pink-paw.ts (lowercase ids, eyes 0..5).
  const eyes = Number.isInteger(c.eyes) && c.eyes >= 0 && c.eyes < 6 ? c.eyes : 0;
  const out = {
    id: c.id.toLowerCase(),
    name: c.name.trim(),
    status: c.status,
    pattern: c.pattern,
    base: c.base.toLowerCase(),
    secondary: c.secondary.toLowerCase(),
    tertiary: c.tertiary.toLowerCase(),
    eyes,
    bio: typeof c.bio === 'string' ? c.bio.trim().slice(0, 140) : '',
    adoptUrl: typeof c.adoptUrl === 'string' && /^https:\/\//.test(c.adoptUrl) ? c.adoptUrl : adoptUrlFor(c.id),
    photo: typeof c.photo === 'string' && PHOTO.test(c.photo) ? c.photo : null,
  };
  if (c.coatGuess === true) out.coatGuess = true;
  return out;
}

/** Snapshot re-emitted with every cat cleaned (the default `npm run sync:pinkpaw` with no source). */
export function normalizeSnapshot(snap) {
  const cats = (Array.isArray(snap?.cats) ? snap.cats : []).map(cleanCat).filter(Boolean);
  return {
    asOf: typeof snap?.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(snap.asOf) ? snap.asOf : '1970-01-01',
    shelter: typeof snap?.shelter === 'string' ? snap.shelter : 'Pink Paw (Rožinė pėdutė)',
    source: typeof snap?.source === 'string' ? snap.source : 'snapshot',
    cats,
  };
}

/**
 * New snapshot from `gallery` ({ atShelter, adopted } of { id, name, status }) and the previous snapshot.
 * Returns { snapshot, added, changed, missing } (ids) for the report.
 */
export function mergeGallery(prev, gallery, { asOf, source }) {
  const old = normalizeSnapshot(prev);
  const byId = new Map(old.cats.map((c) => [c.id, c]));
  const seen = new Set();
  const added = [];
  const changed = [];
  const cats = [];
  for (const g of [...(gallery.atShelter ?? []), ...(gallery.adopted ?? [])]) {
    if (!g || seen.has(String(g.id).toLowerCase())) continue;
    seen.add(String(g.id).toLowerCase());
    const id = String(g.id).toLowerCase();
    const was = byId.get(id);
    const status = STATUSES.has(g.status) ? g.status : (was?.status ?? 'WAITING');
    if (was) {
      const next = { ...was, name: g.name || was.name, status };
      if (next.status !== was.status || next.name !== was.name) changed.push(id);
      if (status === 'ADOPTED' && was.status !== 'ADOPTED' && /Waiting at Pink Paw\.?$/.test(next.bio)) next.bio = next.bio.replace(/Waiting at Pink Paw\.?$/, 'Found a home.');
      cats.push(next);
    } else {
      added.push(id);
      cats.push({
        id,
        name: g.name,
        status,
        ...starterCoat(g.id),
        bio: status === 'ADOPTED' ? 'Found a home.' : 'Waiting at Pink Paw.',
        adoptUrl: adoptUrlFor(id),
        photo: null,
        coatGuess: true,
      });
    }
  }
  const missing = [];
  for (const c of old.cats) {
    if (seen.has(c.id)) continue;
    missing.push(c.id);
    cats.push(c);
  }
  return { snapshot: { asOf, shelter: old.shelter, source, cats }, added, changed, missing };
}
