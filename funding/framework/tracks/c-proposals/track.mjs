// Track C — Large written proposals (Creative Europe, SDF Marketing, Women TechEU, Eurostars, EIC).
// 20–70 page proposals scored against weighted rubrics. This track makes the
// draft -> hostile review -> revise loop fast and measurable:
//   c:plan    backward schedule from the deadline, with an internal deadline
//   c:review  hostile review in a machine-scorable format, appended to review.md
//   c:score   weighted score of the latest review round vs the call threshold, with trend
//   c:budget  validate budget.csv, compute the grant request and co-financing
//   c:annexes report missing annex files
//   c:unwrap  strip the ``` fence an AI puts around call.md / draft.md (all c: commands do it first)
// Dependency-free: Node built-ins only. Pure helpers are exported for tests.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 86400000;
const CLOSED = new Set(['submitted', 'won', 'lost', 'parked']);
const STRICT = new Set(['in-review', 'ready']);

// ---------- small utils ----------

/**
 * Lenient number for human-written frontmatter: 70, "70", "70%", "200,000", "€200 000", "EUR 200000".
 * Returns null for anything else (booleans, words, empty).
 */
export function num(v) {
  if (v === undefined || v === null || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/^(?:eur|€)\s*/i, '').replace(/\s*(?:eur|€)$/i, '')
    .replace(/[\s_€]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(/%$/, '');
  return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
}
/** A share: 0.6, "0.6", 60, "60%" -> 0.6. "1%" -> 0.01 (an explicit % always means percent). */
export function fracOf(v) {
  const n = num(v);
  if (n === null) return null;
  return /%\s*$/.test(String(v)) || n > 1 ? n / 100 : n;
}
const eur = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
const pct = (f) => `${(f * 100).toFixed(1)}%`;
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const norm = (s) => String(s).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function tzOffsetMinutes(iso) {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(String(iso).trim());
  if (!m) return 0; // Z or no offset -> UTC
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}
// Calendar date of an instant, as seen in the call's own timezone.
export function dateIn(ms, offsetMin = 0) {
  return new Date(ms + offsetMin * 60000).toISOString().slice(0, 10);
}
/**
 * AI CLIs often answer "Here is the file:\n```markdown\n---\n...\n```". Written with --out, that
 * breaks the frontmatter (call.md loses `track:` so no Track C check runs) or hides the whole
 * draft inside a code block (core checks then see no prose). Returns the unwrapped text, or null
 * when the text is fine as it is.
 */
export function unwrapFence(text) {
  const t = String(text).replace(/^﻿/, '');
  if (/^\s*---\r?\n/.test(t)) return null; // frontmatter first: already a proper file
  const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const lines = t.split(/\r?\n/);
  const FENCE = /^(`{3,}|~{3,})(.*)$/;
  const blocks = [];
  // A fence line with an info string ("```js") inside the answer opens a nested block the AI meant
  // to keep; only a bare fence closes, innermost first. Matching the first bare fence instead would
  // cut the file at the end of the first nested code block. An unclosed fence runs to the end
  // (the AI's output was cut off).
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;
    const ch = open[1][0];
    let depth = 1;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const f = FENCE.exec(lines[j]);
      if (!f || f[1][0] !== ch) continue;
      if (f[2].trim()) depth++;
      else if (depth > 1) depth--;
      else if (f[1].length >= open[1].length) { depth = 0; break; }
    }
    blocks.push(lines.slice(i + 1, j).join(eol));
    i = j;
  }
  const pick = blocks.find((b) => /^\s*---\r?\n/.test(b)) || blocks.find((b) => /^## /m.test(b));
  return pick ? `${pick.replace(/^\s+/, '').replace(/\s*$/, '')}${eol}` : null;
}
function parseToday(t) {
  if (t === undefined || t === null || t === true) return Date.now();
  const ms = Date.parse(/T/.test(t) ? t : `${t}T12:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`bad --today "${t}" (use YYYY-MM-DD)`);
  return ms;
}

// ---------- plan ----------

// Days before the internal deadline, sized for a 20–70 page proposal.
export const MILESTONES = [
  { key: 'rubric', name: 'Rubric extracted (criteria, weights, limits, annexes) into call.md', offset: 42, cmd: 'fund prompt extract {{SLUG}} --run --out applications/{{SLUG}}/call.md && fund c:plan {{SLUG}}' },
  { key: 'fit', name: 'Fit check: GO / NO-GO / GO-IF recorded', offset: 40, cmd: 'fund prompt fit {{SLUG}} --run --out applications/{{SLUG}}/fit.md' },
  { key: 'v1', name: 'v1 draft complete (every criterion mapped)', offset: 28, cmd: 'fund prompt draft {{SLUG}} --run --out applications/{{SLUG}}/draft.md && fund c:unwrap {{SLUG}} && fund check {{SLUG}}' },
  { key: 'r1', name: 'Hostile review round 1 + score', offset: 24, cmd: 'fund c:review {{SLUG}} && fund c:score {{SLUG}}' },
  { key: 'v2', name: 'v2 draft (fix the lowest-scoring criteria)', offset: 17, cmd: 'fund c:score {{SLUG}}' },
  { key: 'r2', name: 'Hostile review round 2 (score >= threshold)', offset: 13, cmd: 'fund c:review {{SLUG}} && fund c:score {{SLUG}}' },
  { key: 'human', name: 'Human read end to end (voice, claims, numbers)', offset: 8, cmd: 'fund check {{SLUG}}' },
  { key: 'compliance', name: 'Compliance pass: limits, annexes, budget, declarations', offset: 3, cmd: 'fund prompt compliance {{SLUG}} --run && fund c:annexes {{SLUG}} && fund c:budget {{SLUG}}' },
  { key: 'submit', name: 'Submit (internal deadline)', offset: 0, cmd: 'fund status {{SLUG}} submitted' },
];

/**
 * Backward schedule. If the full schedule would start before today, it is compressed
 * linearly so the first milestone lands today.
 */
export function buildPlan({ deadline, bufferDays = 7, today = Date.now(), start = null }) {
  const dl = Date.parse(deadline);
  if (Number.isNaN(dl)) throw new Error(`deadline "${deadline}" is not an ISO date — c:plan needs a fixed deadline`);
  const off = tzOffsetMinutes(deadline);
  const internal = dl - bufferDays * DAY;
  const span = MILESTONES[0].offset;
  const available = (internal - today) / DAY;
  const startMs = start ? parseToday(start) : null;
  // plan_start stretches (or shrinks) the schedule so the first milestone lands on that date,
  // but never earlier than today.
  if (startMs !== null && startMs >= internal) throw new Error(`plan_start "${start}" is on or after the internal deadline ${dateIn(internal, off)} — move it earlier or remove it`);
  const from = startMs !== null ? Math.max(startMs, today) : null;
  const factor = available <= 0 ? 0 : from !== null ? Math.max(0, (internal - from) / DAY) / span : available < span ? available / span : 1;
  const milestones = MILESTONES.map((m) => {
    const ms = internal - Math.round(m.offset * factor) * DAY;
    return { ...m, ms, date: dateIn(ms, off) };
  });
  return {
    deadline: dateIn(dl, off),
    internal: dateIn(internal, off),
    internalMs: internal,
    bufferDays,
    compressed: factor < 1,
    factor,
    passed: available <= 0,
    milestones,
  };
}

// "- [x] 2026-12-23 — Name" -> Set of ticked milestone names.
export function parsePlanTicks(text) {
  const done = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*[-*]\s+\[[xX]\]\s+\d{4}-\d{2}-\d{2}\s+[—–-]+\s+(.+?)\s*(?:`.*)?$/.exec(line);
    if (m) done.add(m[1].trim());
  }
  return done;
}

export function renderPlan(slug, program, plan, ticks = new Set()) {
  const lines = [
    `# Plan — ${program}`,
    '',
    `_Generated by \`fund c:plan ${slug}\`. Tick milestones here; regenerating keeps your ticks._`,
    '',
    `- Official deadline: **${plan.deadline}**`,
    `- Internal deadline: **${plan.internal}** (${plan.bufferDays} days buffer, \`internal_buffer_days\` in call.md)`,
    plan.factor < 1 ? `- Schedule compressed to ${Math.round(plan.factor * 100)}% of the standard length: less time than a full cycle needs.` : plan.factor > 1 ? `- Schedule stretched to ${Math.round(plan.factor * 100)}% of the standard length (\`plan_start\` in call.md).` : '- Standard schedule length.',
    '',
    '## Milestones',
    '',
    ...plan.milestones.map((m) => `- [${ticks.has(m.name) ? 'x' : ' '}] ${m.date} — ${m.name}  \`${m.cmd.replaceAll('{{SLUG}}', slug)}\``),
    '',
  ];
  return lines.join('\n');
}

/**
 * Milestones the files already prove done, so nobody ticks them by hand:
 * rubric = call.md has criteria AND source.md holds pasted call text (not the template's
 * "Paste the full call text" line, so criteria carried over from last year do not count);
 * v1 = every criterion mapped and no empty section;
 * r1 = one scored review round; r2 = two rounds and the latest meets the threshold (which also
 * proves the v2 redraft); fit = fit.md written by "fund prompt fit <slug> --run --out .../fit.md".
 */
export function autoDone(app) {
  const done = new Set();
  const byKey = Object.fromEntries(MILESTONES.map((m) => [m.key, m.name]));
  if (read(join(app.dir, 'fit.md')).trim()) done.add(byKey.fit);
  if (!app.criteria.length) return done;
  if (!/Paste the full/i.test(read(join(app.dir, 'source.md')))) done.add(byKey.rubric);
  const covered = new Set(app.sections.flatMap((s) => s.criteria));
  if (app.sections.length && app.sections.every((s) => s.chars > 0) && app.criteria.every((c) => covered.has(c.id))) done.add(byKey.v1);
  const hist = scoreHistory(app.review, app.criteria, app.call.fm);
  if (hist.length >= 1) done.add(byKey.r1);
  const t = thresholdOf(app.call.fm);
  if (hist.length >= 2 && t !== null && hist[hist.length - 1].total >= t) { done.add(byKey.v2); done.add(byKey.r2); }
  return done;
}

export function dueThisWeek(plan, ticks, today = Date.now()) {
  const todayStr = dateIn(today);
  const weekEnd = dateIn(today + 7 * DAY);
  const open = plan.milestones.filter((m) => !ticks.has(m.name));
  return {
    overdue: open.filter((m) => m.date < todayStr),
    week: open.filter((m) => m.date >= todayStr && m.date < weekEnd),
    next: open.find((m) => m.date >= todayStr) || null,
  };
}

// ---------- scores ----------

/** Parse one score cell. Returns { frac } (0..1), { bare } (needs a scale), or null. */
export function parseScore(cell) {
  // "3,5/5" is a European decimal, not "5/5": read the comma as a point (but not "1,000").
  const s = String(cell).replace(/[*_`]/g, '').trim().replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
  let m = /(-?\d+(?:\.\d+)?)\s*%/.exec(s);
  if (m) return { frac: Number(m[1]) / 100 };
  m = /(-?\d+(?:\.\d+)?)\s*(?:\/|out of|of)\s*(\d+(?:\.\d+)?)/i.exec(s);
  if (m && Number(m[2]) > 0) return { frac: Number(m[1]) / Number(m[2]), scale: Number(m[2]) };
  m = /^(-?\d+(?:\.\d+)?)(?![\d/])/.exec(s);
  if (m) return { bare: Number(m[1]) };
  return null;
}

/** Parse a criterion weight like "25", "25%", "25 points", "~15 (uncertain)". */
export function parseWeight(w) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(w ?? ''));
  return m ? Number(m[1]) : null;
}

/** Normalised weights; criteria without a numeric weight get the mean of the known ones. */
export function weightsFor(criteria) {
  const raw = criteria.map((c) => parseWeight(c.weight));
  const known = raw.filter((x) => x !== null && x > 0);
  const fill = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const w = raw.map((x) => (x !== null && x > 0 ? x : fill));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return criteria.map((c, i) => ({ id: c.id, name: c.name, raw: w[i], assumed: raw[i] === null || raw[i] <= 0, share: w[i] / sum }));
}

function matchCriterion(cell, criteria) {
  const idm = /\bC(\d+)\b/i.exec(cell);
  if (idm) {
    const id = `C${idm[1]}`;
    return criteria.find((c) => c.id.toUpperCase() === id) || null;
  }
  const n = norm(cell);
  if (!n) return null;
  let best = null;
  let bestScore = 0;
  for (const c of criteria) {
    const cn = norm(c.name);
    // Substring matches need a real word on both sides: "a", "id" or "#" must not match a name.
    if (cn && (cn === n || (cn.length >= 4 && n.includes(cn)) || (n.length >= 4 && cn.includes(n)))) return c;
    const toks = cn.split(' ').filter((t) => t.length > 3);
    if (!toks.length) continue;
    const hit = toks.filter((t) => n.includes(t)).length / toks.length;
    if (hit > bestScore) { bestScore = hit; best = c; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Split review.md into rounds: [{ title, body }]. Heading: "## Review — <anything>" (—, – or -). */
export function splitReviews(text) {
  const out = [];
  const re = /^##\s+Review\b[ \t]*[—–:-]?[ \t]*(.*)$/gim;
  const heads = [...String(text).matchAll(re)];
  heads.forEach((h, i) => {
    const start = h.index + h[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    out.push({ title: h[1].trim() || `round ${i + 1}`, body: text.slice(start, end) });
  });
  return out;
}

/** Parse the score table of one review round against the call's criteria. */
export function parseRoundScores(body, criteria, { scale: fmScale } = {}) {
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    const crit = matchCriterion(cells[0], criteria);
    if (!crit || rows.some((r) => r.id === crit.id)) continue;
    let parsed = null;
    let at = 1;
    for (; at < cells.length; at++) { parsed = parseScore(cells[at]); if (parsed) break; }
    if (!parsed) continue;
    rows.push({ id: crit.id, name: crit.name, cell: cells[at], parsed, reason: cells.slice(at + 1).join(' | ') });
  }
  // Resolve bare numbers. If the explicit denominators are the criteria weights ("14/20", "17/25",
  // as c:review asks for), a bare number is out of its own criterion's weight. Otherwise use the
  // most common explicit denominator in this table, then the call's score_scale, then a guess.
  const weightOf = (id) => parseWeight(criteria.find((c) => c.id === id)?.weight);
  const scaled = rows.filter((r) => r.parsed.scale);
  const byWeight = scaled.length > 0 && new Set(scaled.map((r) => r.parsed.scale)).size > 1 && scaled.every((r) => r.parsed.scale === weightOf(r.id));
  const denoms = scaled.map((r) => r.parsed.scale);
  const common = denoms.length ? [...denoms].sort((a, b) => denoms.filter((x) => x === b).length - denoms.filter((x) => x === a).length)[0] : null;
  for (const r of rows) {
    if (r.parsed.frac !== undefined) { r.frac = r.parsed.frac; continue; }
    const n = r.parsed.bare;
    const own = byWeight ? weightOf(r.id) : null;
    const scale = own || common || num(fmScale) || (n <= 1 ? 1 : n <= 5 && rows.every((x) => x.parsed.bare === undefined || x.parsed.bare <= 5) ? 5 : n <= 10 ? 10 : 100);
    r.frac = n / scale;
  }
  for (const r of rows) r.frac = Math.max(0, Math.min(1, r.frac));
  return rows;
}

/** Weighted total on a 0..100 scale. Unscored criteria count as 0 and are listed. */
export function weightedTotal(rows, criteria) {
  const weights = weightsFor(criteria);
  const byId = new Map(rows.map((r) => [r.id, r]));
  let total = 0;
  const items = weights.map((w) => {
    const r = byId.get(w.id);
    const frac = r ? r.frac : 0;
    total += w.share * frac * 100;
    return { ...w, frac, scored: !!r, reason: r?.reason || '', cell: r?.cell || '', gain: w.share * (1 - frac) * 100 };
  });
  return { total, items, unscored: items.filter((i) => !i.scored).map((i) => i.id) };
}

export function thresholdOf(fm) {
  const frac = /^\s*(\d+(?:[.,]\d+)?)\s*(?:\/|out of|of)\s*(\d+(?:\.\d+)?)\s*$/i.exec(String(fm.threshold ?? ''));
  if (frac && Number(frac[2]) > 0) return (Number(frac[1].replace(',', '.')) / Number(frac[2])) * 100;
  const t = num(fm.threshold);
  if (t === null) return null;
  return t <= 1 ? t * 100 : t;
}

/** All rounds scored, oldest first. */
export function scoreHistory(reviewText, criteria, fm = {}) {
  return scoreState(reviewText, criteria, fm).hist;
}

/**
 * Scored rounds plus `skipped`: the title of the newest round when it has no parseable score
 * table. Without this, a failed round silently falls back to the previous round's score.
 */
export function scoreState(reviewText, criteria, fm = {}) {
  const all = splitReviews(reviewText).map((r) => {
    const rows = parseRoundScores(r.body, criteria, { scale: fm.score_scale });
    return { title: r.title, rows, ...weightedTotal(rows, criteria) };
  });
  const last = all[all.length - 1];
  return { hist: all.filter((r) => r.rows.length > 0), skipped: last && !last.rows.length ? last.title : null };
}

/** AI review text made safe to append: its own "#"/"##" headings would start fake rounds. */
export function demoteHeadings(text) {
  return String(text).replace(/^#{1,2}(?=\s)/gm, '###');
}

// ---------- budget ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export const BUDGET_COLUMNS = ['category', 'item', 'cost_eur', 'eligible'];

/**
 * Validate a budget and compute the grant.
 * fm: funding_rate (0..1 or %), max_grant, optional cofinancing_min (0..1), optional requested_grant.
 */
export function analyzeBudget(csvText, fm = {}) {
  const errors = [];
  const warnings = [];
  const rows = parseCsv(csvText);
  if (!rows.length) return { errors: [`budget.csv is empty — its first line must be ${BUDGET_COLUMNS.join(',')}`], warnings, lines: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(BUDGET_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const missingCols = BUDGET_COLUMNS.filter((c) => idx[c] < 0);
  if (missingCols.length) return { errors: [`budget.csv header must include ${BUDGET_COLUMNS.join(',')} (missing: ${missingCols.join(', ')})`], warnings, lines: [] };

  const lines = [];
  rows.slice(1).forEach((r, i) => {
    const n = i + 2;
    const category = (r[idx.category] || '').trim();
    const item = (r[idx.item] || '').trim();
    const rawCost = (r[idx.cost_eur] || '').trim().replace(/[€\s_]/g, '').replace(/,(?=\d{3}\b)/g, '');
    const rawElig = (r[idx.eligible] || '').trim().toLowerCase();
    const cost = /^-?\d+(?:\.\d+)?$/.test(rawCost) ? Number(rawCost) : NaN; // not "0x10", "1e5" or "Infinity"
    if (!category) errors.push(`line ${n}: empty category`);
    if (!item) errors.push(`line ${n}: empty item`);
    if (rawCost === '' || !Number.isFinite(cost)) { errors.push(`line ${n}: cost_eur "${r[idx.cost_eur] ?? ''}" is not a number`); return; }
    if (cost < 0) errors.push(`line ${n}: negative cost`);
    let eligible;
    if (['yes', 'y', 'true', '1'].includes(rawElig)) eligible = true;
    else if (['no', 'n', 'false', '0'].includes(rawElig)) eligible = false;
    else { errors.push(`line ${n}: eligible must be yes or no, got "${r[idx.eligible] ?? ''}"`); return; }
    lines.push({ line: n, category, item, cost, eligible });
  });

  const eligibleTotal = lines.filter((l) => l.eligible).reduce((a, l) => a + l.cost, 0);
  const ineligibleTotal = lines.filter((l) => !l.eligible).reduce((a, l) => a + l.cost, 0);
  const rate = fracOf(fm.funding_rate);
  const maxGrant = num(fm.max_grant);
  if (rate === null || rate <= 0) errors.push(`call.md funding_rate ${fm.funding_rate === undefined ? 'is not set' : `"${fm.funding_rate}" is not a share`} (e.g. 0.6 or 60%)`);
  else if (rate > 1) errors.push(`call.md funding_rate "${fm.funding_rate}" is above 100%`);
  if (maxGrant === null || maxGrant <= 0) warnings.push('call.md max_grant is not set — cap not checked');

  const computed = rate ? Math.floor(eligibleTotal * rate) : 0;
  const asked = num(fm.requested_grant);
  const requested = asked !== null ? asked : computed;
  if (asked !== null && rate && asked > computed) errors.push(`requested_grant ${eur(asked)} exceeds eligible × funding_rate = ${eur(computed)}`);
  const overCap = maxGrant > 0 && requested > maxGrant;
  if (overCap) errors.push(`requested grant ${eur(requested)} exceeds max_grant ${eur(maxGrant)} — cut eligible costs to ${eur(maxGrant / (rate || 1))} or set requested_grant: ${maxGrant}`);
  const grant = overCap ? maxGrant : requested;
  const own = eligibleTotal - grant;
  const ownShare = eligibleTotal ? own / eligibleTotal : 0;
  let minOwn = fracOf(fm.cofinancing_min);
  if (minOwn === null && rate) minOwn = 1 - rate;
  if (minOwn !== null && eligibleTotal && ownShare + 1e-9 < minOwn) errors.push(`own co-financing ${pct(ownShare)} is below the required ${pct(minOwn)}`);
  if (!lines.length && !errors.length) warnings.push('budget.csv has no cost lines yet');
  else if (lines.length && !lines.some((l) => l.eligible)) errors.push('no eligible cost lines');

  const byCategory = {};
  for (const l of lines) {
    const c = (byCategory[l.category] ||= { eligible: 0, ineligible: 0 });
    c[l.eligible ? 'eligible' : 'ineligible'] += l.cost;
  }
  return { errors, warnings, lines, byCategory, eligibleTotal, ineligibleTotal, rate, maxGrant, requested, grant, own, ownShare, minOwn, overCap };
}

export function renderBudgetSummary(slug, program, b) {
  const cats = Object.entries(b.byCategory || {});
  return [
    `# Budget summary — ${program}`,
    '',
    `_Generated by \`fund c:budget ${slug}\` from budget.csv. Do not edit; edit budget.csv._`,
    '',
    '| Category | Eligible | Ineligible |',
    '|---|---:|---:|',
    ...cats.map(([c, v]) => `| ${c} | ${eur(v.eligible)} | ${eur(v.ineligible)} |`),
    `| **Total** | **${eur(b.eligibleTotal || 0)}** | **${eur(b.ineligibleTotal || 0)}** |`,
    '',
    '| Figure | Value |',
    '|---|---:|',
    `| Eligible costs | ${eur(b.eligibleTotal || 0)} |`,
    `| Funding rate | ${b.rate ? pct(b.rate) : 'not set'} |`,
    `| Requested grant | ${eur(b.requested || 0)} |`,
    `| Max grant | ${b.maxGrant ? eur(b.maxGrant) : 'not set'} |`,
    `| Grant after cap | ${eur(b.grant || 0)} |`,
    `| Own co-financing | ${eur(b.own || 0)} (${pct(b.ownShare || 0)} of eligible; minimum ${b.minOwn !== null && b.minOwn !== undefined ? pct(b.minOwn) : 'not set'}) |`,
    `| Ineligible costs borne by the applicant | ${eur(b.ineligibleTotal || 0)} |`,
    '',
    b.errors.length ? `**Errors**\n\n${b.errors.map((e) => `- ${e}`).join('\n')}\n` : '**Valid.**\n',
    b.warnings.length ? `**Warnings**\n\n${b.warnings.map((e) => `- ${e}`).join('\n')}\n` : '',
  ].join('\n');
}

// ---------- annexes ----------

/** A file reference: one token with a dot or slash ("budget.csv", "annexes/gdd.pdf"), or anything in backticks. */
function asFile(tail) {
  const t = tail.trim();
  const tick = /^`([^`]+)`$/.exec(t);
  if (tick) return tick[1].trim();
  return /^\S+$/.test(t) && /[./\\]/.test(t) ? t : null;
}

/**
 * "- [ ] Name — file" (— or – or -- or " - "; the file part is optional). Only the text after the
 * LAST separator can be a file, and only when it looks like a path, so
 * "PIC — registered on the Portal" is a no-file item and "Declaration — signed — doh.pdf" keeps
 * "Declaration — signed" as its name.
 */
export function parseAnnexes(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const rest = m[2];
    const seps = [...rest.matchAll(/\s+(?:—|–|--|-)\s+/g)];
    const sep = seps[seps.length - 1];
    const file = sep ? asFile(rest.slice(sep.index + sep[0].length)) : null;
    const name = (file ? rest.slice(0, sep.index) : rest).trim();
    out.push({ ticked: m[1].toLowerCase() === 'x', name, file });
  }
  return out;
}

export function annexStatus(dir, text) {
  const items = parseAnnexes(text).map((a) => ({ ...a, exists: a.file ? existsSync(join(dir, a.file)) : null }));
  return {
    items,
    missing: items.filter((a) => a.file && !a.exists),
    unticked: items.filter((a) => !a.ticked),
    complete: items.length > 0 && items.every((a) => a.ticked && (a.file ? a.exists : true)),
  };
}

// ---------- review prompt suffix ----------

export function reviewSuffix(app) {
  const t = thresholdOf(app.call.fm);
  return [
    '',
    'FORMAT REQUIREMENT (machine-scored — follow exactly):',
    'Section 1 must be a markdown table with one row per criterion, using the criterion ID in the first column:',
    '| ID | Score | Reason |',
    '|---|---|---|',
    ...app.criteria.map((c) => `| ${c.id} | <score>/${parseWeight(c.weight) || 10} | <one line> |  (${c.name})`),
    'Score each criterion out of its weight shown above. Do not add a total row.',
    t !== null ? `The funding threshold is ${t} out of 100. Be at least as harsh as a panel that rejects most applicants.` : '',
  ].join('\n');
}

// ---------- context helpers ----------

/** Unwrap AI code fences in call.md and draft.md in place. Returns the files it fixed. */
export function unwrapFiles(dir) {
  const fixed = [];
  for (const f of ['call.md', 'draft.md']) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    const u = unwrapFence(readFileSync(p, 'utf8'));
    if (u !== null) { writeFileSync(p, u); fixed.push(f); }
  }
  return fixed;
}

function ctx(core, slug) {
  const fixed = existsSync(join(core.appDir(slug), 'call.md')) ? unwrapFiles(core.appDir(slug)) : [];
  for (const f of fixed) console.log(`  unwrapped the AI's code fence around applications/${slug}/${f}`);
  const app = core.loadApp(slug);
  const fm = app.call.fm;
  return { app, fm, program: fm.program || slug, status: fm.status || 'researching', fixed };
}

function bufferOf(fm, flags = {}) {
  const raw = flags.buffer ?? fm.internal_buffer_days;
  if (raw === undefined || raw === null || raw === '') return 7;
  const b = num(raw);
  if (b === null || b < 0 || !Number.isInteger(b)) throw new Error(`buffer "${raw}" must be a whole number of days >= 0 (--buffer or internal_buffer_days)`);
  return b;
}

// bin/fund.mjs gives a flag the next word as its value, so "c:annexes --sync my-app" arrives as
// { sync: 'my-app' } with no slug. Put the slug back and turn the flag into `true`.
const BOOL_FLAGS = ['sync', 'strict', 'print', 'json'];
function need(args, usage, flags = {}) {
  if (!args[0]) {
    const k = BOOL_FLAGS.find((f) => typeof flags[f] === 'string');
    if (k) { args.unshift(flags[k]); flags[k] = true; }
  }
  if (!args[0]) { console.error(`usage: ${usage}`); return false; }
  return true;
}

// ---------- commands ----------

function cmdPlan({ args, flags, core }) {
  if (!need(args, 'c:plan <slug> [--buffer N] [--start YYYY-MM-DD] [--today YYYY-MM-DD]')) return 2;
  const slug = args[0];
  const { app, fm, program } = ctx(core, slug);
  if (!Object.keys(fm).length) {
    console.error(`${slug}: call.md has no "---" frontmatter (deadline, track, threshold...) — restore it from git or re-run: fund new ${slug} --track C --force`);
    return 1;
  }
  const status = fm.status || 'researching';
  if (CLOSED.has(status)) {
    // Submitted, decided or parked: there is nothing left to schedule, whatever the date says.
    console.log(`${slug}: status is ${status} — nothing left to schedule`);
    console.log(`next: ${status === 'submitted' ? `fund status ${slug} won (or lost) when the decision arrives, then record the panel's feedback as a round in review.md` : 'fund tracker'}`);
    return 0;
  }
  if (!fm.deadline || fm.deadline === 'rolling') {
    console.error(`${slug}: deadline is "${fm.deadline || 'unset'}" — set an ISO deadline in call.md (use the expected date and say so in "next")`);
    return 1;
  }
  const today = parseToday(flags.today);
  const plan = buildPlan({ deadline: fm.deadline, bufferDays: bufferOf(fm, flags), today, start: flags.start ?? fm.plan_start ?? null });
  const file = join(app.dir, 'plan.md');
  const ticks = new Set([...parsePlanTicks(read(file)), ...autoDone(app)]);
  writeFileSync(file, renderPlan(slug, program, plan, ticks));
  const due = dueThisWeek(plan, ticks, today);
  console.log(`${slug}: internal deadline ${plan.internal} (official ${plan.deadline}, buffer ${plan.bufferDays}d)${plan.factor !== 1 ? ` — schedule at ${Math.round(plan.factor * 100)}% of standard length` : ''}`);
  console.log(`wrote applications/${slug}/plan.md`);
  if (plan.passed) console.log('  ✗ internal deadline has passed — submit now or move the buffer');
  if (!plan.passed) for (const m of due.overdue) console.log(`  ✗ overdue ${m.date}  ${m.name}`);
  if (due.week.length) for (const m of due.week) console.log(`  → this week ${m.date}  ${m.name}`);
  else console.log(`  nothing due this week${due.next ? `; next: ${due.next.date} ${due.next.name}` : ''}`);
  if (plan.passed) {
    // Nothing on the schedule helps any more: submit if the official deadline is still open, else park.
    const open = Date.parse(fm.deadline) > today;
    console.log(`next: ${open ? `fund check ${slug} && fund status ${slug} submitted` : `fund status ${slug} parked --next "missed ${plan.deadline}; watch for the next call"`}`);
    return 1;
  }
  const focus = due.overdue[0] || due.week[0] || due.next;
  console.log(`next: ${focus ? focus.cmd.replaceAll('{{SLUG}}', slug) : `fund status ${slug} submitted`}`);
  return 0;
}

function printScore(slug, fm, hist) {
  const t = thresholdOf(fm);
  const latest = hist[hist.length - 1];
  console.log(`${slug}: latest review "${latest.title}"`);
  console.log('  ID   Score   Weight   Points  Gap   Criterion');
  for (const i of latest.items) {
    const w = i.share * 100;
    console.log(`  ${i.id.padEnd(4)} ${(i.scored ? `${Math.round(i.frac * 100)}%` : '—').padEnd(7)} ${w.toFixed(1).padStart(5)}${i.assumed ? '*' : ' '}  ${(w * i.frac).toFixed(1).padStart(6)}  ${i.gain.toFixed(1).padStart(4)}  ${i.name}`);
  }
  if (latest.items.some((i) => i.assumed)) console.log('  * weight not numeric in call.md — assumed the mean of the others');
  if (latest.unscored.length) console.log(`  ! unscored (counted as 0): ${latest.unscored.join(', ')}`);
  const verdict = t === null ? '(no threshold in call.md)' : latest.total >= t ? `PASS (threshold ${t})` : `BELOW threshold ${t} by ${(t - latest.total).toFixed(1)}`;
  console.log(`  weighted total: ${latest.total.toFixed(1)} / 100  ${verdict}`);
  if (hist.length > 1) {
    const trend = hist.map((h) => h.total.toFixed(1)).join(' → ');
    const d = latest.total - hist[hist.length - 2].total;
    console.log(`  trend: ${trend}  (${d >= 0 ? '+' : ''}${d.toFixed(1)} since last round)`);
  } else console.log(`  trend: ${latest.total.toFixed(1)} (first round)`);
  const work = [...latest.items].sort((a, b) => b.gain - a.gain).slice(0, 3);
  console.log('  work on next (most points available):');
  for (const w of work) console.log(`    ${w.id} ${w.name} — +${w.gain.toFixed(1)} available${w.reason ? `: ${w.reason}` : ''}`);
  return work;
}

function cmdScore({ args, flags, core }) {
  if (!need(args, 'c:score <slug> [--json]', flags)) return 2;
  const slug = args[0];
  const { app, fm } = ctx(core, slug);
  if (!app.criteria.length) { console.error(`${slug}: call.md has no criteria table — run: fund prompt extract ${slug} --run --out applications/${slug}/call.md`); return 1; }
  const { hist, skipped } = scoreState(app.review, app.criteria, fm);
  if (!hist.length) {
    console.error(`${slug}: no scored "## Review — ..." round in review.md${skipped ? ` (round "${skipped}" has no "| C1 | 7/10 | reason |" table)` : ''}`);
    console.log(`next: fund c:review ${slug}`);
    return 1;
  }
  if (flags.json) {
    console.log(JSON.stringify({ threshold: thresholdOf(fm), skipped, rounds: hist.map((h) => ({ title: h.title, total: h.total, items: h.items })) }, null, 2));
    return 0;
  }
  if (skipped) console.log(`  ! newest round "${skipped}" has no parseable score table — scoring the previous round instead; edit it into "| C1 | 7/10 | reason |" rows or re-run fund c:review ${slug}`);
  const work = printScore(slug, fm, hist);
  console.log(`next: ${nextAfterScore(slug, app, fm, hist[hist.length - 1], work)}`);
  return 0;
}

// Below threshold: redraft the section carrying the most missing points. At or above: move on to paperwork.
function nextAfterScore(slug, app, fm, latest, work) {
  const t = thresholdOf(fm);
  if (t !== null && latest.total >= t) return `fund c:budget ${slug} && fund c:annexes ${slug} --sync`;
  const sec = app.sections.find((s) => s.criteria.includes(work[0].id));
  // c:unwrap sits in the chain because AI CLIs usually fence the file; without it C:fence stops the chain.
  return `fund prompt draft ${slug}${sec ? ` --section "${sec.title}"` : ''} --run --out applications/${slug}/draft.md && fund c:unwrap ${slug} && fund check ${slug} && fund c:review ${slug}`;
}

function cmdReview({ args, flags, core, runAI }) {
  if (!need(args, 'c:review <slug> [--print]', flags)) return 2;
  const slug = args[0];
  const { app, fm } = ctx(core, slug);
  if (!app.criteria.length) {
    // Without criteria the review cannot be scored; do not spend an AI call on it.
    console.error(`${slug}: call.md has no "| C1 | Name | Weight | Quote |" criteria table, so a review could not be scored`);
    console.log(`next: fund prompt extract ${slug} --run --out applications/${slug}/call.md && fund c:plan ${slug}`);
    return 1;
  }
  const prompt = core.renderPrompt('review', slug) + reviewSuffix(app);
  if (flags.print) { process.stdout.write(prompt); return 0; }
  const out = runAI(prompt, { label: `${slug}/review`, model: 'opus' });
  const stamp = new Date().toISOString();
  appendFileSync(join(app.dir, 'review.md'), `\n\n## Review — ${stamp}\n\n${demoteHeadings(String(out).trim())}\n`);
  console.log(`appended review round to applications/${slug}/review.md`);
  const fresh = core.loadApp(slug);
  const hist = scoreHistory(fresh.review, fresh.criteria, fm);
  if (hist.length && hist[hist.length - 1].title === stamp) {
    const work = printScore(slug, fm, hist);
    console.log(`next: ${nextAfterScore(slug, fresh, fm, hist[hist.length - 1], work)}`);
  } else {
    console.log('  ! the new round has no parseable score table — edit it into "| C1 | 7/10 | reason |" rows');
    console.log(`next: fund c:score ${slug}`);
  }
  return 0;
}

function cmdBudget({ args, core }) {
  if (!need(args, 'c:budget <slug>')) return 2;
  const slug = args[0];
  const { app, fm, program } = ctx(core, slug);
  const file = join(app.dir, 'budget.csv');
  if (!existsSync(file)) {
    console.error(`${slug}: no budget.csv — create it with header ${BUDGET_COLUMNS.join(',')}`);
    return 1;
  }
  const b = analyzeBudget(readFileSync(file, 'utf8'), fm);
  writeFileSync(join(app.dir, 'budget-summary.md'), renderBudgetSummary(slug, program, b));
  console.log(`${slug}: ${b.lines.length} line(s), eligible ${eur(b.eligibleTotal || 0)}, ineligible ${eur(b.ineligibleTotal || 0)}`);
  if (b.rate) console.log(`  requested ${eur(b.requested)} (${pct(b.rate)} of eligible)${b.maxGrant ? ` vs cap ${eur(b.maxGrant)}` : ''}; own co-financing ${eur(b.own)} (${pct(b.ownShare)})`);
  for (const e of b.errors) console.log(`  ✗ ${e}`);
  for (const w of b.warnings) console.log(`  ! ${w}`);
  console.log(`wrote applications/${slug}/budget-summary.md`);
  const where = [b.errors.some((e) => !/^line \d|budget\.csv|no eligible/.test(e)) && 'call.md', b.errors.some((e) => /^line \d|budget\.csv|no eligible|exceeds max_grant/.test(e)) && 'budget.csv'].filter(Boolean).join(' / ');
  console.log(`next: ${b.errors.length ? `fix ${where}, then fund c:budget ${slug}` : `fund c:annexes ${slug}`}`);
  return b.errors.length ? 1 : 0;
}

function cmdAnnexes({ args, flags, core }) {
  if (!need(args, 'c:annexes <slug> [--sync] [--strict]', flags)) return 2;
  const slug = args[0];
  const { app, status } = ctx(core, slug);
  const file = join(app.dir, 'annexes.md');
  if (!existsSync(file)) { console.error(`${slug}: no annexes.md — list annexes as "- [ ] Name — file"`); return 1; }
  let text = readFileSync(file, 'utf8');
  if (flags.sync) {
    // Tick every item whose file now exists; untick items whose file vanished. Keep the file's line endings.
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    text = text.split(/\r?\n/).map((line) => {
      const [a] = parseAnnexes(line);
      if (!a || !a.file) return line;
      const has = existsSync(join(app.dir, a.file));
      return line.replace(/\[( |x|X)\]/, has ? '[x]' : '[ ]');
    }).join(eol);
    writeFileSync(file, text);
  }
  const st = annexStatus(app.dir, text);
  console.log(`${slug}: ${st.items.length} annex(es), ${st.items.filter((a) => a.ticked).length} ticked, ${st.missing.length} file(s) missing`);
  for (const a of st.items) {
    const mark = a.file ? (a.exists ? (a.ticked ? '✓' : '!') : '✗') : a.ticked ? '✓' : '!';
    console.log(`  ${mark} ${a.name}${a.file ? `  (${a.file}${a.exists ? '' : ' — missing'})` : ''}${a.ticked ? '' : '  [not ticked]'}`);
  }
  console.log(`next: ${!st.items.length ? `add one "- [ ] Name — file" line per mandatory annex to annexes.md, then fund c:annexes ${slug} --sync` : st.complete ? `fund check ${slug}` : st.missing.length ? `add ${st.missing[0].file}, then fund c:annexes ${slug} --sync` : `tick the remaining items in annexes.md, then fund check ${slug}`}`);
  // Informational while drafting; a hard failure once ready (or with --strict, for CI).
  return st.complete || !(flags.strict || status === 'ready') ? 0 : 1;
}

function cmdUnwrap({ args, core }) {
  if (!need(args, 'c:unwrap <slug>')) return 2;
  const slug = args[0];
  core.loadApp(slug); // clear error for an unknown slug
  const fixed = unwrapFiles(core.appDir(slug));
  console.log(fixed.length ? `${slug}: unwrapped ${fixed.join(', ')}` : `${slug}: call.md and draft.md are not fenced`);
  console.log(`next: fund check ${slug}`);
  return 0;
}

// ---------- checks ----------

function checkPlan({ app }) {
  const fm = app.call.fm;
  const status = fm.status || 'researching';
  const out = [];
  let buffer;
  try { buffer = bufferOf(fm); } catch (e) { return [{ name: 'plan', level: 'error', detail: e.message }]; }
  const planFile = join(app.dir, 'plan.md');
  const hasDeadline = fm.deadline && fm.deadline !== 'rolling' && !Number.isNaN(Date.parse(fm.deadline));
  const plan = hasDeadline ? buildPlan({ deadline: fm.deadline, bufferDays: buffer }) : null;
  if (!existsSync(planFile)) out.push({ name: 'plan', level: STRICT.has(status) ? 'error' : 'warn', detail: `no plan.md — run: fund c:plan ${app.slug}` });
  else {
    // plan.md records the internal deadline it was built for; a moved deadline or buffer makes it stale.
    const m = /Internal deadline: \*\*(\d{4}-\d{2}-\d{2})\*\*/.exec(readFileSync(planFile, 'utf8'));
    if (plan && m && m[1] !== plan.internal && !CLOSED.has(status)) out.push({ name: 'plan', level: 'warn', detail: `plan.md is for internal deadline ${m[1]}, call.md now gives ${plan.internal} — run: fund c:plan ${app.slug}` });
    else out.push({ name: 'plan', level: 'ok', detail: 'plan.md present' });
  }

  if (plan) {
    const days = (plan.internalMs - Date.now()) / DAY;
    if (CLOSED.has(status)) out.push({ name: 'internal-deadline', level: 'ok', detail: status });
    else if (days < 0) out.push({ name: 'internal-deadline', level: 'error', detail: `internal deadline ${plan.internal} passed ${Math.abs(days).toFixed(1)} days ago — submit now` });
    else if (days < 7) out.push({ name: 'internal-deadline', level: 'warn', detail: `${days.toFixed(1)} days to internal deadline ${plan.internal}` });
    else out.push({ name: 'internal-deadline', level: 'ok', detail: `${plan.internal} (${days.toFixed(0)} days)` });
  }
  return out;
}

// A draft written by "--run --out draft.md" that the AI wrapped in ``` has broken frontmatter and
// fence lines in its prose; when the fence falls inside one section, the core strips that section
// as a code block, so its citations and limits pass vacuously.
function checkFence({ app }) {
  const file = join(app.dir, 'draft.md');
  if (!existsSync(file) || unwrapFence(readFileSync(file, 'utf8')) === null) return [];
  return { name: 'fence', level: 'error', detail: `draft.md is the AI's answer wrapped in a code fence (broken frontmatter, prose may go unchecked) — run: fund c:unwrap ${app.slug}` };
}

function checkBudget({ app }) {
  const status = app.call.fm.status || 'researching';
  const file = join(app.dir, 'budget.csv');
  if (!existsSync(file)) return { name: 'budget', level: STRICT.has(status) ? 'error' : 'warn', detail: 'no budget.csv' };
  const b = analyzeBudget(readFileSync(file, 'utf8'), app.call.fm);
  if (b.errors.length) return { name: 'budget', level: 'error', detail: b.errors.join('; ') };
  if (b.warnings.length) return { name: 'budget', level: 'warn', detail: b.warnings.join('; ') };
  return { name: 'budget', level: 'ok', detail: `request ${eur(b.requested)} of ${eur(b.eligibleTotal)} eligible` };
}

function checkAnnexes({ app }) {
  const status = app.call.fm.status || 'researching';
  const file = join(app.dir, 'annexes.md');
  const ready = status === 'ready';
  if (!existsSync(file)) return { name: 'annexes', level: ready ? 'error' : 'warn', detail: 'no annexes.md' };
  const st = annexStatus(app.dir, readFileSync(file, 'utf8'));
  if (!st.items.length) return { name: 'annexes', level: ready ? 'error' : 'warn', detail: 'annexes.md lists no annexes — add one "- [ ] Name — file" line per mandatory annex' };
  if (st.complete) return { name: 'annexes', level: 'ok', detail: `${st.items.length} annex(es) ticked and present` };
  const detail = `${st.unticked.length} unticked, ${st.missing.length} file(s) missing${st.missing.length ? `: ${st.missing.map((a) => a.file).join(', ')}` : ''}`;
  return { name: 'annexes', level: ready ? 'error' : 'warn', detail };
}

function checkScore({ app }) {
  const fm = app.call.fm;
  const status = fm.status || 'researching';
  const ready = status === 'ready';
  const t = thresholdOf(fm);
  if (!app.criteria.length) return { name: 'score', level: ready ? 'error' : 'warn', detail: 'no criteria to score against' };
  const { hist, skipped } = scoreState(app.review, app.criteria, fm);
  if (!hist.length) return { name: 'score', level: ready ? 'error' : 'warn', detail: `no scored review round — run: fund c:review ${app.slug}` };
  if (skipped) return { name: 'score', level: ready ? 'error' : 'warn', detail: `newest round "${skipped}" has no score table — fix it or run: fund c:review ${app.slug}` };
  const latest = hist[hist.length - 1];
  if (t === null) return { name: 'score', level: ready ? 'error' : 'warn', detail: `${latest.total.toFixed(1)}/100, but call.md has no threshold` };
  if (latest.total >= t) return { name: 'score', level: 'ok', detail: `${latest.total.toFixed(1)}/100 >= ${t}` };
  return { name: 'score', level: ready ? 'error' : 'warn', detail: `${latest.total.toFixed(1)}/100 < ${t} — run: fund c:score ${app.slug}` };
}

export default {
  id: 'C',
  name: 'Large written proposals',
  defaultFrame: 'eu-cultural',
  checks: [checkFence, checkPlan, checkBudget, checkAnnexes, checkScore],
  commands: {
    'c:plan': { help: 'backward schedule to an internal deadline; writes plan.md, prints what is due this week', run: cmdPlan },
    'c:review': { help: 'hostile review in scorable format, appended to review.md (--print to only render)', run: cmdReview },
    'c:score': { help: 'weighted score of the latest review vs threshold, trend, what to fix next', run: cmdScore },
    'c:budget': { help: 'validate budget.csv, compute grant vs max_grant and co-financing', run: cmdBudget },
    'c:annexes': { help: 'report missing annex files from annexes.md (--sync ticks present files)', run: cmdAnnexes },
    'c:unwrap': { help: 'strip the code fence an AI put around call.md / draft.md (every c: command also does this)', run: cmdUnwrap },
  },
};
