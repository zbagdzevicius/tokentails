/**
 * Par maths (GDD 4.5, 13.7): bronze = median of the recorded dev runs (5 expected), silver = the best run,
 * gold = floor(best x 1.15). Integer only, so par.json is stable across machines.
 */

/** Median of integer scores; an even count takes the lower of the two middle values (never a fraction). */
export function median(scores) {
  const xs = scores.filter((x) => Number.isFinite(x)).map((x) => Math.trunc(x)).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  return xs[(xs.length - 1) >> 1];
}

/** { bronze, silver, gold } for one room's run scores, or null with no usable score. */
export function parFrom(scores) {
  const xs = scores.filter((x) => Number.isFinite(x) && x >= 0).map((x) => Math.trunc(x));
  if (xs.length === 0) return null;
  const best = Math.max(...xs);
  return { bronze: median(xs), silver: best, gold: Math.floor((best * 115) / 100) };
}

/**
 * Merge freshly computed rooms into the existing par map. Rooms with new runs replace their entry; rooms
 * without runs keep theirs unless `prune`. Keys come out sorted so the JSON diff stays small.
 */
export function mergePar(existing, computed, { prune = false } = {}) {
  const out = {};
  const keys = new Set([...(prune ? [] : Object.keys(existing ?? {})), ...Object.keys(computed)]);
  for (const k of [...keys].sort()) out[k] = computed[k] ?? existing[k];
  return out;
}

/** Ghost file text: the base64url payload; blank lines and '#' comments are ignored. */
export function ghostPayloadOf(text) {
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#')) return t;
  }
  return null;
}

/** The `g` (or `rp`) parameter of a dare / replay link, from its query or its hash (#d=18&g=...). */
export function ghostFromLink(link) {
  const s = String(link).trim();
  if (/^[A-Za-z0-9_-]{8,}$/.test(s)) return s;
  let url;
  try {
    url = new URL(s, 'https://tokentails.com');
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const p of [url.searchParams, hash]) {
    const g = p.get('g') ?? p.get('rp');
    if (g) return g;
  }
  return null;
}
