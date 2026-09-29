// Generic scorer for hostile-review rounds in applications/<slug>/review.md (all tracks).
// Track C keeps its own scorer (tracks/c-proposals/track.mjs, `c:score`); this one is shared by
// `fund loop` and anything else that needs "how good is the latest review round".
//
// A round is a "## Review — <anything>" block. Its score table has one row per criterion:
//   | C1 | 7/10 | reason |      | C2 | 3.5/5 | reason |     | C3 | 70% | reason |
//   | C4 | 14 out of 20 | reason |     | C5 | 8 | reason |   (bare number → a scale is inferred)
// Weights come from the call's criteria table ("| C1 | Name | 25 | quote |", points or %);
// a missing weight counts as the mean of the known ones (all missing → equal weights).
// Dependency-free.

const num = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return v === '' || v == null || Number.isNaN(n) ? null : n;
};

/**
 * One score cell → { frac, scale? } (0..1) or { bare } (needs a scale) or null.
 * The score must START the cell ("7/10 (was 5)" is fine, "about 7/10" is not), so a number inside
 * a reason is never read as a score. strict: the whole cell must be the score (plus an optional
 * "(...)" note) — used for cells that are not the table's score column, e.g. reasons.
 */
export function parseScore(cell, { strict = false } = {}) {
  // "3,5/5" is a European decimal; "1,000" is not.
  const s = String(cell ?? '').replace(/[*_`]/g, '').trim().replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2').replace(/^score\s*[:=]\s*/i, '');
  if (!s) return null;
  const tail = strict ? String.raw`\s*(?:\([^)]*\))?\s*\.?\s*$` : '';
  let m = new RegExp(String.raw`^(-?\d+(?:\.\d+)?)\s*%` + tail).exec(s);
  if (m) return { frac: Number(m[1]) / 100 };
  m = new RegExp(String.raw`^(-?\d+(?:\.\d+)?)\s*(?:\/|out of|of)\s*(\d+(?:\.\d+)?)(?![\d.]*\d)` + tail, 'i').exec(s);
  if (m && Number(m[2]) > 0) return { frac: Number(m[1]) / Number(m[2]), scale: Number(m[2]) };
  m = new RegExp(String.raw`^(-?\d+(?:\.\d+)?)(?![\d/.%]|\s*(?:\/|out of|of)\s*\d)` + tail, 'i').exec(s);
  if (m) return { bare: Number(m[1]) };
  return null;
}

/** "25", "25%", "25 points", "~15 (uncertain)" → 25; "not stated" → null. */
export function parseWeight(w) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(w ?? ''));
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** Normalised weights: [{ id, name, weight, assumed, share }], shares sum to 1. */
export function weightsFor(criteria) {
  const raw = criteria.map((c) => parseWeight(c.weight));
  const known = raw.filter((x) => x !== null);
  const fill = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const w = raw.map((x) => (x !== null ? x : fill));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return criteria.map((c, i) => ({ id: c.id, name: c.name || c.id, weight: w[i], assumed: raw[i] === null, share: w[i] / sum }));
}

/** review.md → [{ title, body }] oldest first. Heading "## Review — x" (—, –, - or :). */
export function splitReviews(text) {
  const src = String(text ?? '');
  const heads = [...src.matchAll(/^##\s+Review\b[ \t]*[—–:-]?[ \t]*(.*)$/gim)];
  return heads.map((h, i) => ({
    title: h[1].trim() || `round ${i + 1}`,
    body: src.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : src.length),
  }));
}

const HEADER_CELL = /^(id|criterion|criteria|#|score|name|total|verdict)$/i;

function tableRows(body) {
  const rows = [];
  for (const line of String(body).split(/\r?\n/)) {
    if (!/^\s*\|/.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function matchId(cell, criteria) {
  const m = /\bC\s?(\d+)\b/i.exec(cell);
  if (m) return criteria.find((c) => c.id.toUpperCase() === `C${m[1]}`)?.id || null;
  const n = cell.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.length < 4) return null;
  const hit = criteria.find((c) => {
    const cn = String(c.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return cn && (cn === n || (cn.length >= 4 && n.includes(cn)) || cn.includes(n));
  });
  return hit?.id || null;
}

/**
 * Parse one round's score table. With criteria, only rows naming a known criterion (by id or
 * name) count. Without criteria (the call publishes none), every scored row counts and its first
 * cell becomes the id. Returns [{ id, cell, frac, reason }].
 */
export function parseRound(body, criteria = [], { scale } = {}) {
  const rows = [];
  for (const cells of tableRows(body)) {
    if (HEADER_CELL.test(cells[0].replace(/[*_`]/g, ''))) continue;
    const id = criteria.length ? matchId(cells[0], criteria) : cells[0].replace(/[*_`]/g, '').trim();
    if (!id || rows.some((r) => r.id === id)) continue;
    let at = 1;
    let parsed = null;
    // The first column after the id is the score column; any later cell (a name column before
    // the score, never a reason) counts only when it is nothing but a score.
    for (; at < cells.length; at++) { parsed = parseScore(cells[at], { strict: at > 1 }); if (parsed) break; }
    if (!parsed) continue;
    rows.push({ id, cell: cells[at], parsed, reason: cells.slice(at + 1).join(' | ').trim() });
  }
  // Bare numbers: if every explicit denominator equals that criterion's weight ("14/20", "17/25"),
  // a bare number is out of its own weight. Otherwise the most common denominator in the table,
  // then the call's score_scale, then a guess from the size of the numbers (≤1, ≤5, ≤10, else 100).
  const weightOf = (id) => parseWeight(criteria.find((c) => c.id === id)?.weight);
  const scaled = rows.filter((r) => r.parsed.scale);
  const byWeight = scaled.length > 1 && new Set(scaled.map((r) => r.parsed.scale)).size > 1 && scaled.every((r) => r.parsed.scale === weightOf(r.id));
  const denoms = scaled.map((r) => r.parsed.scale);
  const common = denoms.length ? [...denoms].sort((a, b) => denoms.filter((x) => x === b).length - denoms.filter((x) => x === a).length)[0] : null;
  const bares = rows.filter((r) => r.parsed.bare !== undefined).map((r) => r.parsed.bare);
  const maxBare = bares.length ? Math.max(...bares) : 0;
  const guess = maxBare <= 1 ? 1 : maxBare <= 5 ? 5 : maxBare <= 10 ? 10 : 100;
  for (const r of rows) {
    const p = r.parsed;
    const s = p.frac !== undefined ? null : (byWeight && weightOf(r.id)) || common || num(scale) || guess;
    r.frac = Math.max(0, Math.min(1, p.frac !== undefined ? p.frac : p.bare / s));
    delete r.parsed;
  }
  return rows;
}

/** Weighted 0..100 total of parsed rows. Unscored criteria count as 0 and are listed. */
export function weighted(rows, criteria) {
  const crit = criteria.length ? criteria : rows.map((r) => ({ id: r.id, name: r.id, weight: '' }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  let total = 0;
  const perCriterion = weightsFor(crit).map((w) => {
    const r = byId.get(w.id);
    const frac = r ? r.frac : 0;
    total += w.share * frac * 100;
    return {
      id: w.id, name: w.name, weight: w.weight, assumedWeight: w.assumed, share: w.share,
      scored: !!r, frac, score10: Math.round(frac * 100) / 10, reason: r?.reason || '', cell: r?.cell || '',
      lost: w.share * (1 - frac) * 100, // points of the 0..100 total this criterion is losing
    };
  });
  return { total: Math.round(total * 10) / 10, perCriterion, unscored: perCriterion.filter((p) => !p.scored).map((p) => p.id) };
}

/** Criteria losing the most weighted points, worst first (max 3, only those below full marks). */
export function weakestOf(perCriterion, n = 3) {
  return [...perCriterion].filter((p) => p.frac < 1).sort((a, b) => b.lost - a.lost || a.frac - b.frac).slice(0, n).map((p) => p.id);
}

/** Pass mark on 0..100 from call.md frontmatter "threshold" (70, 0.7, "14/20", "70%"), else null. */
export function thresholdOf(fm = {}) {
  const t = String(fm.threshold ?? '').trim();
  if (!t) return null;
  const frac = /^(\d+(?:[.,]\d+)?)\s*(?:\/|out of|of)\s*(\d+(?:\.\d+)?)$/i.exec(t);
  if (frac && Number(frac[2]) > 0) return (Number(frac[1].replace(',', '.')) / Number(frac[2])) * 100;
  const n = num(t.replace(/%$/, ''));
  if (n === null) return null;
  return n <= 1 ? n * 100 : n;
}

/**
 * Score the latest review round.
 * → { total, perCriterion, weakest, roundCount, trend, delta, unscored, skipped, title }
 *   total        0..100 of the newest round that has a score table (null if none)
 *   roundCount   rounds with a parseable score table
 *   trend        totals of those rounds, oldest first
 *   delta        latest minus previous total (null with < 2 rounds)
 *   skipped      title of the newest round when it has NO parseable table (so a broken round
 *                is visible instead of silently falling back to the previous score)
 */
export function scoreReview(reviewText, criteria = [], fm = {}) {
  const rounds = splitReviews(reviewText).map((r) => {
    const rows = parseRound(r.body, criteria, { scale: fm.score_scale });
    return { title: r.title, rows, ...weighted(rows, criteria) };
  });
  const scored = rounds.filter((r) => r.rows.length);
  const last = scored[scored.length - 1];
  const newest = rounds[rounds.length - 1];
  const trend = scored.map((r) => r.total);
  return {
    total: last ? last.total : null,
    perCriterion: last ? last.perCriterion : [],
    weakest: last ? weakestOf(last.perCriterion) : [],
    roundCount: scored.length,
    trend,
    delta: trend.length > 1 ? Math.round((trend[trend.length - 1] - trend[trend.length - 2]) * 10) / 10 : null,
    unscored: last ? last.unscored : [],
    skipped: newest && !newest.rows.length ? newest.title : null,
    title: last ? last.title : null,
  };
}

/** Convenience: score an app object from core.loadApp(). */
export function scoreApp(app) {
  return scoreReview(app.review, app.criteria, app.call.fm);
}
