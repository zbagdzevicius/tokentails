// Portfolio planning: rank every opportunity by expected value per framework hour, boost close
// deadlines, filter by verdict, and allocate a weekly capacity of human hours.
// Pure functions except loadPortfolio/savePortfolio. Used by `fund go` and `fund e:triage --apply`.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const VERDICTS = ['DO', 'COND', 'LATER', 'SKIP', 'CHECK'];
export const TRACKS = ['A', 'B', 'C', 'D', 'E'];
export const CLOSED_STATUSES = new Set(['submitted', 'won', 'lost']);
/** Default framework hours for a freshly triaged opportunity, by track. */
export const DEFAULT_HOURS = { A: 3, B: 0.75, C: 30, D: 27, E: 0.5 };
const TIER_LABEL = ['DO', 'COND (met)', 'LATER (date reached)'];
const DAY = 86400000;

export function portfolioPath() {
  return process.env.FUND_PORTFOLIO || join(ROOT, 'portfolio', 'opportunities.json');
}

export function loadPortfolio(file = portfolioPath()) {
  if (!existsSync(file)) return { version: 1, opportunities: [] };
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { throw new Error(`${file} is not valid JSON: ${e.message}`); }
  if (!doc || typeof doc !== 'object') throw new Error(`${file}: expected an object with "opportunities"`);
  if (!Array.isArray(doc.opportunities)) throw new Error(`${file}: "opportunities" must be an array`);
  return doc;
}

export function savePortfolio(doc, file = portfolioPath()) {
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

// Date-only values mean the end of that day (same rule as core.parseDeadline).
export function parseDate(v) {
  if (v == null || v === '' || v === 'rolling') return null;
  const s = String(v).trim();
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59` : s);
  return Number.isNaN(t) ? NaN : t;
}

export function validatePortfolio(doc) {
  const problems = [];
  const ids = new Set();
  const slugs = new Set();
  for (const [i, o] of (doc.opportunities || []).entries()) {
    const at = `entry ${i} (${o.program || o.slug || '?'})`;
    if (o.id == null) problems.push(`${at}: no id`);
    else if (ids.has(o.id)) problems.push(`${at}: duplicate id ${o.id}`);
    ids.add(o.id);
    if (!o.slug || !/^[a-z0-9][a-z0-9-]*$/.test(o.slug)) problems.push(`${at}: bad slug "${o.slug}"`);
    else if (slugs.has(o.slug)) problems.push(`${at}: duplicate slug ${o.slug}`);
    slugs.add(o.slug);
    if (!TRACKS.includes(o.track)) problems.push(`${at}: track "${o.track}" not in ${TRACKS.join(', ')}`);
    if (!VERDICTS.includes(o.verdict)) problems.push(`${at}: verdict "${o.verdict}" not in ${VERDICTS.join(', ')}`);
    if (o.verdict === 'COND' && !o.condition) problems.push(`${at}: COND needs a condition`);
    if (Number.isNaN(parseDate(o.deadline))) problems.push(`${at}: unparseable deadline "${o.deadline}"`);
    if (o.after != null && Number.isNaN(parseDate(o.after))) problems.push(`${at}: unparseable after "${o.after}"`);
    if (o.success != null && !(o.success >= 0 && o.success <= 1)) problems.push(`${at}: success must be 0-1`);
    if (typeof o.framework_hours !== 'number' || o.framework_hours < 0) problems.push(`${at}: framework_hours must be a number >= 0`);
  }
  return problems;
}

/** Expected value in USD (capital midpoint × success); unknown inputs count as 0. */
export function expectedValue(o) {
  return (Number(o.capital_mid_usd) || 0) * (Number(o.success) || 0);
}

/** EV per framework hour; hours are floored at 0.25 so tiny tasks don't divide by ~0. */
export function evPerHour(o) {
  return expectedValue(o) / Math.max(Number(o.framework_hours) || 0, 0.25);
}

export function daysLeft(o, now) {
  const t = parseDate(o.deadline);
  return t == null || Number.isNaN(t) ? null : (t - now.getTime()) / DAY;
}

/** 1 for rolling or > 30 days out, rising linearly to 3 at the deadline. */
export function urgency(days) {
  if (days == null || days >= 30) return 1;
  return 1 + 2 * (1 - Math.max(days, 0) / 30);
}

/**
 * Decide where one opportunity sits this week.
 * → { bucket: 'eligible'|'waiting'|'dropped'|'skipped', tier?, reason }
 */
export function classify(o, now, app) {
  const days = daysLeft(o, now);
  if (days != null && days < 0) return { bucket: 'dropped', reason: `deadline passed ${Math.ceil(-days)}d ago` };
  if (app?.status && CLOSED_STATUSES.has(app.status)) return { bucket: 'dropped', reason: `application ${app.status}` };
  const c = classifyVerdict(o, now);
  // A parked application is never run by autopilot, whatever the verdict; a person unparks it.
  if (c.bucket === 'eligible' && app?.status === 'parked') return { bucket: 'waiting', parked: true, reason: `application parked (${c.reason}) — unpark it to activate` };
  return c;
}

function classifyVerdict(o, now) {
  switch (o.verdict) {
    case 'DO': return { bucket: 'eligible', tier: 0, reason: 'DO' };
    case 'COND':
      return o.condition_met === true
        ? { bucket: 'eligible', tier: 1, reason: 'condition met' }
        : { bucket: 'waiting', reason: `condition: ${o.condition}` };
    case 'LATER': {
      const after = parseDate(o.after);
      if (after == null) return { bucket: 'waiting', reason: 'LATER with no "after" date' };
      return after <= now.getTime()
        ? { bucket: 'eligible', tier: 2, reason: `after ${String(o.after).slice(0, 10)}` }
        : { bucket: 'waiting', reason: `after ${String(o.after).slice(0, 10)}` };
    }
    case 'CHECK': return { bucket: 'waiting', reason: 'CHECK: verify the program by hand, then set a verdict' };
    default: return { bucket: 'skipped', reason: o.verdict };
  }
}

/**
 * Rank opportunities. `apps` maps slug → { status, remaining_h?, next? } for existing applications.
 * Eligible entries sort by tier (DO, COND met, LATER reached), then by score = EV/hour × urgency.
 */
export function rank(opportunities, { now, apps = {} }) {
  const out = { ranked: [], waiting: [], dropped: [], skipped: [] };
  for (const o of opportunities) {
    const app = apps[o.slug];
    const c = classify(o, now, app);
    const days = daysLeft(o, now);
    const row = {
      ...o,
      ev: expectedValue(o),
      ev_per_hour: evPerHour(o),
      days_left: days,
      urgency: urgency(days),
      score: evPerHour(o) * urgency(days),
      tier: c.tier,
      reason: c.reason,
      parked: !!c.parked,
      app_exists: !!app,
      app_status: app?.status || '',
      need_h: app?.remaining_h != null ? app.remaining_h : Number(o.framework_hours) || 0,
      next: app?.next || '',
    };
    (c.bucket === 'eligible' ? out.ranked : out[c.bucket]).push(row);
  }
  out.ranked.sort((a, b) => a.tier - b.tier || b.score - a.score || (a.days_left ?? 1e9) - (b.days_left ?? 1e9));
  out.waiting.sort((a, b) => b.ev_per_hour - a.ev_per_hour);
  return out;
}

/**
 * Allocate `capacity` hours: pass 1 takes every ranked entry that fits whole, in rank order;
 * pass 2 gives what is left to the highest-ranked entry that did not fit (marked partial).
 * Mutates and returns rows with alloc_h and partial; returns { rows, used }.
 */
export function allocate(rows, capacity) {
  let left = capacity;
  for (const r of rows) { r.alloc_h = 0; r.partial = false; }
  for (const r of rows) {
    if (r.need_h <= left + 1e-9) { r.alloc_h = r.need_h; left -= r.need_h; }
  }
  if (left > 0.01) {
    const r = rows.find((x) => x.alloc_h === 0 && x.need_h > 0);
    if (r) { r.alloc_h = round(left); r.partial = true; left = 0; }
  }
  const used = round(rows.reduce((s, r) => s + r.alloc_h, 0));
  return { rows, used };
}

export function weekPlan(opportunities, { now, capacity = 20, apps = {} }) {
  const r = rank(opportunities, { now, apps });
  const { used } = allocate(r.ranked, capacity);
  return { ...r, capacity, used, now };
}

export const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const money = (n) => (n >= 1000 ? `$${round(n / 1000, 1)}k` : `$${Math.round(n)}`);
export function dueLabel(row) {
  if (row.deadline == null || row.deadline === 'rolling') return 'rolling';
  const d = row.days_left;
  return `${String(row.deadline).slice(0, 10)}${d == null ? '' : ` (${Math.floor(d)}d)`}`;
}

// ---------- exclusions for triaged rows (user decisions, 2026-09-25; Game3, Taiko, Solana added 2026-09-28) ----------

const EXCLUDED_PROGRAMS = /\b(BGA|Blockchain for Good|Mantle|SCF|Stellar Community Fund|Giveth|Game3|Taiko|Solana|Superteam)\b/i;
const NOT_REMOTE = /\b(in[- ]person|on[- ]site|onsite|relocat\w*|residency|residencies|must attend|not remote|non-remote)\b/i;
const NOT_GRANT = /\b(venture capital|VC round|VC fund|(?<!no |non-|without |zero |0% )equity(?![- ]free)|SAFE note|token sale|presale|exchange listing|token listing|market maker|matching fund\w*|free credits|(?:cloud|compute|api|aws|gcp|azure|hosting|infra\w*) credits|in credits|credits program|investment round|for a stake)\b/i;

/** → reason string if a triaged row must not become an application, else null. */
export function exclusionReason(row) {
  const id = [row.program, row.source, row.url].filter(Boolean).join(' ');
  const all = [id, row.reason].filter(Boolean).join(' ');
  if (EXCLUDED_PROGRAMS.test(id)) return `excluded program (${EXCLUDED_PROGRAMS.exec(id)[0]})`;
  if (row.remote === false || NOT_REMOTE.test(all)) return 'not remote';
  if (NOT_GRANT.test(all)) return `not a grant or accelerator (${NOT_GRANT.exec(all)[0]})`;
  return null;
}

/**
 * Extract the fenced ```json array from an AI answer. The prompt asks for it as the LAST part, so the
 * last fenced block that parses as an array wins (an echoed example earlier never shadows it);
 * falls back to a bare [...] block.
 */
export function parseTriageJson(text) {
  text = String(text ?? '');
  const fences = [...text.matchAll(/```json[ \t]*\r?\n([\s\S]*?)\r?\n?```/gi)].map((m) => m[1]).reverse();
  const candidates = [...fences];
  const bare = /\[\s*\{[\s\S]*\}\s*\]/.exec(text);
  if (bare) candidates.push(bare[0]);
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (Array.isArray(v)) return v;
    } catch { /* try the next candidate */ }
  }
  throw new Error('no fenced ```json array found in the triage answer');
}

// ---------- WEEK.md ----------

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function weekMarkdown(plan, { ran = [], queue = [], dry = false, notes = [] } = {}) {
  const d = plan.now.toISOString().slice(0, 10);
  const L = [
    `# Week plan — ${d}`,
    '',
    `_Generated by \`node bin/fund.mjs go --hours ${plan.capacity}\`${dry ? ' (dry run: nothing was executed)' : ''}. Edit \`portfolio/opportunities.json\`, not this file._`,
    '',
    `**Hours:** ${plan.used} of ${plan.capacity} allocated · ${plan.ranked.length} active · ${plan.waiting.length} waiting · ${plan.dropped.length} dropped · ${plan.skipped.length} skipped`,
    '',
    '## Ranked (EV per framework hour, deadline-boosted)',
    '',
    '| # | Program | Verdict | EV | EV/h | Deadline | Hours this week | Status | Next step |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  plan.ranked.forEach((r, i) => {
    const hours = r.alloc_h ? `${r.alloc_h}${r.partial ? ` of ${r.need_h} (partial)` : ''}` : `0 (needs ${r.need_h})`;
    const status = r.app_exists ? r.app_status || 'exists' : 'no app yet';
    const next = r.app_exists ? r.next || `node bin/fund.mjs run ${r.slug}` : 'node bin/fund.mjs go --scaffold';
    L.push(`| ${i + 1} | ${cell(r.program)} | ${TIER_LABEL[r.tier]} | ${r.ev ? money(r.ev) : '?'} | ${r.ev ? money(r.ev_per_hour) : '?'} | ${dueLabel(r)} | ${hours} | ${status} | ${cell(next)} |`);
  });
  if (!plan.ranked.length) L.push('| — | nothing eligible this week | | | | | | | |');

  L.push('', '## What autopilot ran', '');
  if (!ran.length) L.push('- nothing (no active application had capacity, or --dry)');
  for (const x of ran) L.push(`- \`${x.command}\` → ${x.code === 0 ? 'ok' : `exit ${x.code}`}${x.note ? ` — ${cell(x.note)}` : ''}`);
  for (const n of notes) L.push(`- ${n}`);

  L.push('', '## Human queue (only what needs a person)', '');
  if (!queue.length) L.push('_Empty._');
  else {
    L.push('| # | Deadline | Application | Step | Do this | Then run |', '|---|---|---|---|---|---|');
    queue.forEach((q, i) => L.push(`| ${i + 1} | ${cell(q.due || 'rolling')} | ${cell(q.slug)} | ${cell(q.step)} | ${cell(q.instructions || q.title)} | \`${cell(q.command)}\` |`));
  }

  L.push('', '## Waiting', '');
  if (!plan.waiting.length) L.push('_None._');
  for (const w of plan.waiting) L.push(`- **${w.program}** (${w.verdict}, ${w.ev ? money(w.ev_per_hour) + '/h' : 'EV ?'}, ${dueLabel(w)}) — ${w.reason}`);
  if (plan.dropped.length) {
    L.push('', '## Dropped', '');
    for (const w of plan.dropped) L.push(`- ${w.program} — ${w.reason}`);
  }
  L.push('', `**Hours used vs capacity:** ${plan.used} / ${plan.capacity}`, '');
  return L.join('\n');
}
