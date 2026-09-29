// Track D — Community-governed funding (DAO treasury proposals; Nouns DAO first).
// The play: post a proposal candidate, find a sponsor, stop after the kill window without one.
// Dependency-free. Pure helpers are named exports so tests can drive them directly.

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 86400000;
const CLOSED = new Set(['submitted', 'won', 'lost', 'parked']);
const STRICT = new Set(['in-review', 'ready']);
export const DEFAULT_KILL_DAYS = 21;

const SPONSORS_HEADER = `# Sponsor log

One row per ask. Record the person's **role** (e.g. "Noun owner", "delegate", "Nouncil member"),
never an email address or phone number — \`fund check\` fails if it finds one.
Append rows with \`node bin/fund.mjs d:log <slug> --who "role" --channel X --ask Y --response Z\`.
A row counts as a sponsor when Response contains "yes" or "sponsor" (e.g. "yes", "will sponsor")
and no hedge or redirect ("no", "not", "declined", "pending", "maybe", "if", "another", "try").

| Date | Who (role, not personal contact) | Channel | Ask | Response |
|---|---|---|---|---|
`;

// ---------- time ----------

export function resolveNow(now) {
  let t;
  let src = now;
  if (now instanceof Date) t = now.getTime();
  else if (typeof now === 'number') t = now;
  else if (typeof now === 'string' && now) t = Date.parse(now);
  else if (process.env.FUND_NOW) { src = process.env.FUND_NOW; t = Date.parse(src); }
  else t = Date.now();
  if (!Number.isFinite(t)) throw new Error(`bad --now / FUND_NOW "${src}" (use an ISO date like 2026-10-20)`);
  return t;
}

// Strict calendar day: 'YYYY-MM-DD' that exists (no 2026-09-31, no "Sept 5"). Returns UTC ms or NaN.
export function parseDay(s) {
  const v = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return NaN;
  const t = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? t : NaN;
}

const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- tables ----------

function tableRows(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l.startsWith('|') || !l.endsWith('|')) continue;
    const cells = l.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue; // separator
    rows.push(cells);
  }
  return rows;
}

// ---------- budget ----------

// "3", "1.5", "12,000", "12,000.50", "$5,000", "Ξ3". Refuses "2,5" and "1.000,50" (decimal comma):
// read as US numbers they would silently become 25 and 1.0005.
export function parseAmount(raw) {
  const v = String(raw ?? '').replace(/[$Ξ\s]/g, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(v)) return NaN;
  return Number(v.replace(/,/g, ''));
}

// kill_after_days from call.md: a positive whole number, or empty for the default.
export function killDays(v) {
  if (v === '' || v == null) return { days: DEFAULT_KILL_DAYS, problem: null };
  const n = Number(v);
  if (Number.isInteger(n) && n > 0) return { days: n, problem: null };
  return { days: DEFAULT_KILL_DAYS, problem: `kill_after_days "${v}" in call.md is not a positive whole number of days` };
}

// eth_usd from call.md: empty, or a positive number ("2500", "2,500", "$2500").
export function ethUsdProblem(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[,$\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? null : `eth_usd "${v}" in call.md is not a positive number (USD per 1 ETH, e.g. 2500)`;
}

const CURRENCY = { ETH: 'ETH', 'Ξ': 'ETH', WETH: 'ETH', USD: 'USD', $: 'USD', USDC: 'USD' };

export function parseBudget(text) {
  const rows = [];
  const problems = [];
  for (const cells of tableRows(text)) {
    const [item = '', amountRaw = '', curRaw = ''] = cells;
    if (/^\**\s*amount\b/i.test(amountRaw)) continue; // header ("Item", "Line item", ...)
    if (/^\**\s*(grand\s+|sub-?)?total\b[^A-Za-z]*$/i.test(item)) continue; // hand-written totals are ignored; totals are computed
    // "Total (ETH)", "Subtotal art": would be counted twice. Refuse rather than guess.
    if (/^\**\s*(grand\s*|sub-?\s*)?totals?\b/i.test(item)) { problems.push(`${item}: looks like a hand-written total — delete the row, totals are computed`); continue; }
    const amount = parseAmount(amountRaw);
    const currency = CURRENCY[curRaw.toUpperCase()] || CURRENCY[curRaw];
    if (!item) { problems.push(`row with no item: "| ${cells.join(' | ')} |"`); continue; }
    if (!amountRaw || !Number.isFinite(amount) || amount < 0) { problems.push(`${item}: amount "${amountRaw}" is not a number (write 1.5 or 12,000.50 — a dot for decimals)`); continue; }
    if (!currency) { problems.push(`${item}: currency "${curRaw}" must be ETH or USD`); continue; }
    rows.push({ item, amount, currency });
  }
  return { rows, problems };
}

// Totals in native currencies plus both converted totals. ethUsd = USD per 1 ETH.
export function budgetTotals(rows, ethUsd) {
  const eth = rows.filter((r) => r.currency === 'ETH').reduce((a, r) => a + r.amount, 0);
  const usd = rows.filter((r) => r.currency === 'USD').reduce((a, r) => a + r.amount, 0);
  const rate = Number(String(ethUsd ?? '').replace(/[,$\s]/g, '')) || NaN;
  const hasRate = Number.isFinite(rate) && rate > 0;
  return {
    eth,
    usd,
    rate: hasRate ? rate : null,
    totalEth: hasRate ? eth + usd / rate : usd === 0 ? eth : null,
    totalUsd: hasRate ? usd + eth * rate : eth === 0 ? usd : null,
  };
}

export const fmtEth = (n) => (n == null ? '?' : `${Number(n.toFixed(3))}`);
export const fmtUsd = (n) => (n == null ? '?' : `$${Math.round(n).toLocaleString('en-US')}`);

const unitOf = (u) => (String(u || 'ETH').toUpperCase() === 'USD' ? 'USD' : 'ETH');

export function budgetTable(rows, totals, unit = 'ETH') {
  const lines = ['| Item | Amount | Currency | ETH | USD |', '|---|---:|---|---:|---:|'];
  for (const r of rows) {
    const asEth = r.currency === 'ETH' ? r.amount : totals.rate ? r.amount / totals.rate : null;
    const asUsd = r.currency === 'USD' ? r.amount : totals.rate ? r.amount * totals.rate : null;
    lines.push(`| ${r.item} | ${r.amount.toLocaleString('en-US')} | ${r.currency} | ${fmtEth(asEth)} | ${fmtUsd(asUsd)} |`);
  }
  lines.push(`| **Total** | | | **${fmtEth(totals.totalEth)} ETH** | **${fmtUsd(totals.totalUsd)}** |`);
  if (totals.rate) lines.push('', unitOf(unit) === 'USD'
    ? `_ETH figures at a planning rate of 1 ETH = ${fmtUsd(totals.rate)}; the ask is in USD (USDC)._`
    : `_USD figures at a planning rate of 1 ETH = ${fmtUsd(totals.rate)}; the onchain ask is in ETH._`);
  return lines.join('\n');
}

// Returns check results for min/max bounds. unit: 'ETH' (default) or 'USD'.
export function budgetBounds(totals, { min, max, unit = 'ETH' } = {}) {
  const u = String(unit || 'ETH').toUpperCase() === 'USD' ? 'USD' : 'ETH';
  const total = u === 'USD' ? totals.totalUsd : totals.totalEth;
  const fmt = u === 'USD' ? fmtUsd : (n) => `${fmtEth(n)} ETH`;
  if (total == null) return { level: 'error', detail: 'mixed ETH/USD rows need eth_usd in call.md to total' };
  const lo = min === '' || min == null ? null : Number(min);
  const hi = max === '' || max == null ? null : Number(max);
  if (lo != null && total < lo) return { level: 'error', detail: `total ${fmt(total)} is below min_budget ${fmt(lo)}` };
  if (hi != null && total > hi) return { level: 'error', detail: `total ${fmt(total)} is above max_budget ${fmt(hi)}` };
  const range = lo != null || hi != null ? ` (bounds ${lo != null ? fmt(lo) : '-'} to ${hi != null ? fmt(hi) : '-'})` : ' (no min/max set)';
  return { level: 'ok', detail: `total ${fmt(total)}${totals.rate ? ` ≈ ${u === 'USD' ? `${fmtEth(totals.totalEth)} ETH` : fmtUsd(totals.totalUsd)}` : ''}${range}` };
}

// ---------- sponsors ----------

export function parseSponsors(text) {
  return tableRows(text)
    .filter((c) => !/^date$/i.test(c[0] || ''))
    .map(([date = '', who = '', channel = '', ask = '', response = '']) => ({ date, who, channel, ask, response }));
}

// Conservative on purpose: a false "yes" silently disables the kill rule, a false "no" costs one re-log.
// Spec: a Response containing "yes" or "sponsor" counts, unless it is hedged or points elsewhere.
const POSITIVE = /\b(yes|yep|yeah|sponsor\w*)\b/i;
const HEDGED = /\b(no|nope|not|none|without|declin\w*|reject\w*|refus\w*|won'?t|cannot|can'?t|never|pending|maybe|perhaps|later|waiting|consider\w*|if|unless|once|after|tbd|another|other|else|elsewhere|try|ask(?:ed)?)\b|\?/i;
export function isSponsorResponse(response) {
  const r = String(response || '');
  return POSITIVE.test(r) && !HEDGED.test(r);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+|\b)\d[\d\s().-]{6,}\d\b/g;

// Finds email addresses and phone numbers. ISO dates, times and 0x addresses are not phones.
export function findPII(text) {
  const hits = [];
  const src = String(text || '');
  for (const m of src.match(EMAIL) || []) hits.push({ kind: 'email', value: m });
  const scrubbed = src
    .replace(EMAIL, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b/g, ' ')
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g, ' ') // 25.09.2026, 25/09/2026
    .replace(/\b0x[0-9a-fA-F]+\b/g, ' ');
  for (const m of scrubbed.match(PHONE) || []) {
    const digits = m.replace(/\D/g, '').length;
    if (digits >= 8 && digits <= 15) hits.push({ kind: 'phone', value: m.trim() });
  }
  return hits;
}

// Masks a hit so it can be reported without repeating it.
export const maskPII = (h) => `${h.kind} "${h.value.slice(0, 2)}…${h.value.slice(-2)}"`;

// ---------- clock ----------

// posted: 'YYYY-MM-DD' or ''. Verdicts: NOT POSTED, CONTINUE, FIND SPONSOR, KILL.
export function clock({ posted, killAfterDays = DEFAULT_KILL_DAYS, sponsors = [], now } = {}) {
  const t = resolveNow(now);
  const kill = Number(killAfterDays) > 0 ? Number(killAfterDays) : DEFAULT_KILL_DAYS;
  const sponsorRows = sponsors.filter((s) => isSponsorResponse(s.response));
  const sponsored = sponsorRows.length > 0;
  const base = { killAfterDays: kill, sponsored, sponsorRows, asks: sponsors.length };
  if (!posted) return { ...base, posted: null, daysSince: null, daysLeft: kill, verdict: sponsored ? 'CONTINUE' : 'NOT POSTED' };
  const p = parseDay(posted);
  if (Number.isNaN(p)) throw new Error(`posted "${posted}" is not a real YYYY-MM-DD date — fix it with: node bin/fund.mjs d:post <slug> --date YYYY-MM-DD`);
  let daysSince = Math.floor((t - p) / DAY);
  if (daysSince === -1) daysSince = 0; // timezone slack: "today" in UTC+N is still yesterday in UTC
  const daysLeft = kill - daysSince;
  const verdict = sponsored ? 'CONTINUE' : daysLeft < 0 ? 'KILL' : 'FIND SPONSOR';
  return { ...base, posted: isoDay(p), killDate: isoDay(p + kill * DAY), daysSince, daysLeft, verdict };
}

// ---------- files ----------

const read = (dir, f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);

export function loadDao(dir, fm) {
  const budgetText = read(dir, 'budget.md');
  const sponsorsText = read(dir, 'sponsors.md');
  const budget = budgetText == null ? null : parseBudget(budgetText);
  const totals = budget ? budgetTotals(budget.rows, fm.eth_usd) : null;
  return { budgetText, sponsorsText, budget, totals, sponsors: sponsorsText == null ? [] : parseSponsors(sponsorsText) };
}

// Raw draft sections with markdown kept (tables, lists), annotations removed.
export function rawSections(draftBody) {
  return String(draftBody || '').split(/^## /m).slice(1).map((part) => {
    const nl = part.indexOf('\n');
    const head = nl === -1 ? part : part.slice(0, nl);
    const content = nl === -1 ? '' : part.slice(nl + 1);
    return { title: head.replace(/<!--[\s\S]*?-->/g, '').trim(), content: content.replace(/<!--[\s\S]*?-->\n?/g, '').trim() };
  });
}

function draftTitle(draftBody) {
  const m = /^#\s+(.+)$/m.exec(String(draftBody || ''));
  return m ? m[1].replace(/\s+[—-]\s+application draft\s*$/i, '').trim() : '';
}

// Leads with the budget_unit currency; the other one is shown as a conversion when a rate is set.
export function askText(totals, unit = 'ETH') {
  if (!totals) return null;
  const rate = totals.rate ? ` at 1 ETH = ${fmtUsd(totals.rate)}` : '';
  if (totals.totalEth == null || (unitOf(unit) === 'USD' && totals.totalUsd != null)) {
    return `${fmtUsd(totals.totalUsd)}${totals.rate ? ` (about ${fmtEth(totals.totalEth)} ETH${rate})` : ''}`;
  }
  return `${fmtEth(totals.totalEth)} ETH${totals.rate ? ` (about ${fmtUsd(totals.totalUsd)}${rate})` : ''}`;
}

const article = (w) => (/^[aeiou]/i.test(String(w)) ? 'an' : 'a');

export function sponsorAsk({ dao, totals, clk, forumUrl, unit = 'ETH' }) {
  const ask = askText(totals, unit);
  const askLine = ask ? `The ask is ${ask}.` : 'The budget is still being finalised.';
  if (clk.sponsored) return `**Sponsored.** This candidate has a sponsor. ${askLine}`;
  const close = clk.killDate ? `on ${clk.killDate}` : `${clk.killAfterDays} days after posting`;
  const why = /nouns/i.test(dao) ? `this proliferates ${dao}` : `this is a good use of the ${dao} treasury`;
  return [
    `**Looking for a sponsor.** We do not hold enough ${dao} voting power to put this onchain ourselves, so this`,
    `candidate needs a sponsor. ${askLine} If you are ${article(dao)} ${dao} voter or delegate and ${why},`,
    `please sponsor the candidate${forumUrl ? ` or reply on the thread (${forumUrl})` : ' or reply on the thread'} with what`,
    `would change your mind. We will withdraw the candidate ${close} if it has no sponsor by then.`,
  ].join(' ');
}

// Fact tags are for our checker, not for forum readers; drop them unless keepCites.
export const stripCites = (t) => t.replace(/[ \t]*\[F-\d{3}\]/g, '');

export function buildProposal(app, { now, keepCites = false } = {}) {
  const fm = app.call.fm;
  const dao = fm.dao || String(fm.program || 'the DAO').replace(/\s+(DAO\s+)?proposal$/i, '').trim() || 'the DAO';
  const d = loadDao(app.dir, fm);
  const clk = clock({ posted: fm.posted, killAfterDays: fm.kill_after_days, sponsors: d.sponsors, now });
  const title = fm.proposal_title || draftTitle(app.draft.body) || app.slug;
  const sections = rawSections(String(app.draft.body || '').replace(/\r\n?/g, '\n'));
  const out = [`# ${title}`, ''];
  let budgetPlaced = false;
  const table = d.budget?.rows.length ? budgetTable(d.budget.rows, d.totals, fm.budget_unit) : '_No budget rows yet — fill budget.md._';
  for (const s of sections) {
    out.push(`## ${s.title}`, '', s.content, '');
    if (/budget/i.test(s.title)) { out.push(table, ''); budgetPlaced = true; }
  }
  if (!budgetPlaced) out.push('## Budget', '', table, '');
  out.push('---', '', sponsorAsk({ dao, totals: d.budget?.rows.length ? d.totals : null, clk, forumUrl: fm.forum_url, unit: fm.budget_unit }), '');
  let text = out.join('\n').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (!keepCites) text = stripCites(text);
  return { text, totals: d.totals, clk, sections: sections.length };
}

// ---------- checks ----------

function checkBudget({ app }) {
  const fm = app.call.fm;
  const strict = STRICT.has(fm.status);
  const { budget, totals } = loadDao(app.dir, fm);
  if (!budget) return { name: 'budget', level: strict ? 'error' : 'warn', detail: 'no budget.md — copy tracks/d-dao/templates/budget.md' };
  const problems = [...budget.problems, ethUsdProblem(fm.eth_usd)].filter(Boolean);
  if (problems.length) return { name: 'budget', level: 'error', detail: problems.join('; ') };
  if (!budget.rows.length) return { name: 'budget', level: strict ? 'error' : 'warn', detail: 'budget.md has no "| Item | Amount | Currency |" rows' };
  const b = budgetBounds(totals, { min: fm.min_budget, max: fm.max_budget, unit: fm.budget_unit });
  return { name: 'budget', ...b, detail: `${budget.rows.length} row(s), ${b.detail}` };
}

function checkClock({ app, now }) {
  const fm = app.call.fm;
  const { sponsors } = loadDao(app.dir, fm);
  const kd = killDays(fm.kill_after_days);
  if (kd.problem) return { name: 'kill-window', level: 'error', detail: `${kd.problem} — set it to e.g. ${DEFAULT_KILL_DAYS}` };
  let c;
  try { c = clock({ posted: fm.posted, killAfterDays: fm.kill_after_days, sponsors, now }); } catch (e) { return { name: 'kill-window', level: 'error', detail: e.message }; }
  if (c.posted && c.daysSince < 0) return { name: 'kill-window', level: 'warn', detail: `posted ${c.posted} is in the future — fix it with: node bin/fund.mjs d:post ${app.slug} --date YYYY-MM-DD` };
  if (c.verdict === 'NOT POSTED') return { name: 'kill-window', level: 'ok', detail: `not posted; clock starts at d:post (${c.killAfterDays}-day window)` };
  if (c.verdict === 'KILL' && !CLOSED.has(fm.status)) {
    return { name: 'kill-window', level: 'error', detail: `${c.daysSince} days since posting, window was ${c.killAfterDays}, no sponsor — run: node bin/fund.mjs status ${app.slug} parked --next "No sponsor in kill window"` };
  }
  return { name: 'kill-window', level: 'ok', detail: `${c.verdict}: day ${c.daysSince} of ${c.killAfterDays}${c.sponsored ? ', sponsor found' : ''}` };
}

function checkPII({ app }) {
  const text = read(app.dir, 'sponsors.md');
  if (text == null) return { name: 'sponsors-pii', level: 'warn', detail: 'no sponsors.md — copy tracks/d-dao/templates/sponsors.md' };
  const hits = findPII(text);
  if (hits.length) return { name: 'sponsors-pii', level: 'error', detail: `sponsors.md holds personal contact data (${hits.map(maskPII).join(', ')}); log roles, not contacts` };
  return { name: 'sponsors-pii', level: 'ok', detail: `${parseSponsors(text).length} ask(s) logged, no emails or phones` };
}

// Stale = what d:export would write now differs from proposal.md. Content, not mtimes, so that
// `fund status` / `next` edits to call.md do not make an unchanged proposal look stale.
function checkProposal({ app }) {
  const status = app.call.fm.status;
  const p = join(app.dir, 'proposal.md');
  if (!existsSync(p)) {
    if (status === 'ready') return { name: 'proposal', level: 'error', detail: `status is ready but proposal.md is missing — run: node bin/fund.mjs d:export ${app.slug}` };
    return { name: 'proposal', level: 'ok', detail: 'not exported yet' };
  }
  const norm = (t) => t.replace(/\r\n?/g, '\n').trim();
  const have = norm(readFileSync(p, 'utf8'));
  const fresh = [false, true].some((keepCites) => norm(buildProposal(app, { keepCites }).text) === have);
  if (!fresh) return { name: 'proposal', level: status === 'ready' ? 'error' : 'warn', detail: `proposal.md differs from draft.md + budget.md + call.md — run: node bin/fund.mjs d:export ${app.slug}` };
  return { name: 'proposal', level: 'ok', detail: 'proposal.md up to date' };
}

// The template ships example criteria; they must be replaced with the DAO's own words before review.
export const TEMPLATE_QUOTE = /replace with the DAO'?s own wording/i;
function checkCriteriaQuotes({ app }) {
  const left = app.criteria.filter((c) => TEMPLATE_QUOTE.test(c.quote || '')).map((c) => c.id);
  if (!left.length) return { name: 'criteria-quotes', level: 'ok', detail: `${app.criteria.length} criteria quoted` };
  const strict = STRICT.has(app.call.fm.status);
  return { name: 'criteria-quotes', level: strict ? 'error' : 'warn', detail: `${left.join(', ')} still hold the template text — paste the DAO's guidance into source.md, then: node bin/fund.mjs prompt extract ${app.slug} --run --out applications/${app.slug}/call.md` };
}

// ---------- commands ----------

// Turns thrown input errors (bad --now, bad posted date) into a one-line message and exit 2.
const guard = (fn) => async (ctx) => {
  try { return await fn(ctx); } catch (e) {
    if (/^(bad |posted )/.test(e.message)) { console.error(`error: ${e.message}`); return 2; }
    throw e;
  }
};

function need(slug, usage) {
  if (!slug) { console.error(`usage: ${usage}`); return false; }
  return true;
}

// Loads the app and refuses anything that is not a Track D application (including a call.md whose
// frontmatter no longer parses, which would otherwise be rewritten by d:post). Returns null on refusal.
function loadD(core, slug) {
  if (!existsSync(join(core.appDir(slug), 'call.md'))) { console.error(`no application "${slug}" — create it: node bin/fund.mjs new ${slug} --track D`); return null; }
  const app = core.loadApp(slug);
  const t = app.call.fm.track;
  if (t !== 'D') { console.error(`${slug} is not a Track D application (call.md frontmatter track: ${t === undefined ? 'missing — is the opening --- line intact?' : JSON.stringify(t)})`); return null; }
  return app;
}

function printClock(slug, c) {
  const lines = [`\n${slug}`];
  lines.push(`  posted        ${c.posted || 'not yet'}`);
  lines.push(`  days since    ${c.daysSince ?? '-'}`);
  lines.push(`  days left     ${c.daysLeft}${c.killDate ? ` (window closes ${c.killDate})` : ''} of ${c.killAfterDays}`);
  lines.push(`  asks logged   ${c.asks}`);
  lines.push(`  sponsor       ${c.sponsored ? `yes — ${c.sponsorRows.map((r) => `${r.who} (${r.date})`).join(', ')}` : 'none'}`);
  lines.push(`  verdict       ${c.verdict}`);
  console.log(lines.join('\n'));
}

const NEXT = {
  'NOT POSTED': (s) => `next: node bin/fund.mjs d:export ${s}, paste proposal.md to the forum, then node bin/fund.mjs d:post ${s} --url <thread-url>`,
  'FIND SPONSOR': (s) => `next: node bin/fund.mjs d:log ${s} --who "role" --channel X --ask Y --response Z   (after asking a voter or delegate)`,
  CONTINUE: (s) => `next: node bin/fund.mjs status ${s} ready --next "Sponsor found; get it onchain"`,
  KILL: (s) => `next: node bin/fund.mjs status ${s} parked --next "No sponsor in kill window"`,
};

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

export default {
  id: 'D',
  name: 'Community-governed funding (DAO proposals)',
  defaultFrame: 'payout-rail',
  checks: [checkCriteriaQuotes, checkBudget, checkClock, checkPII, checkProposal],
  commands: {
    'd:export': {
      help: 'write proposal.md (sections, ETH+USD budget, sponsor ask) ready to paste [--cites]',
      run: guard(async ({ args, flags, core }) => {
        const slug = args[0];
        if (!need(slug, 'd:export <slug>')) return 2;
        const app = loadD(core, slug);
        if (!app) return 2;
        if (!app.sections.length) { console.error(`applications/${slug}/draft.md has no "## " sections — nothing to export. Write the draft first: node bin/fund.mjs prompt draft ${slug} --run --out applications/${slug}/draft.md`); return 1; }
        // A proposal with a dropped or out-of-bounds budget line states the wrong ask; refuse to write it.
        const b = checkBudget({ app });
        if (b.level === 'error') { console.error(`not exported: budget.md — ${b.detail}\nfix budget.md (or min_budget/max_budget/eth_usd in call.md), then: node bin/fund.mjs d:export ${slug}`); return 1; }
        const { text, totals, clk, sections } = buildProposal(app, { now: flags.now, keepCites: !!flags.cites });
        writeFileSync(join(app.dir, 'proposal.md'), text);
        // Kill window is d:clock's job (and honours --now); everything else must pass before pasting.
        const failing = (await core.runChecks(slug)).results.filter((r) => r.level === 'error' && r.name !== 'D:kill-window').map((r) => r.name);
        if (failing.length) {
          console.log(`wrote applications/${slug}/proposal.md, but fund check still fails (${failing.join(', ')}) — do not paste it yet`);
          console.log(`next: node bin/fund.mjs check ${slug}`);
          return 1;
        }
        const hasRows = totals && (totals.eth || totals.usd);
        console.log(`wrote applications/${slug}/proposal.md: ${sections} section(s), ask ${hasRows ? askText(totals, app.call.fm.budget_unit) : 'no budget rows yet'}, ${text.length} chars`);
        console.log(clk.posted ? `next: node bin/fund.mjs d:clock ${slug}` : `next: node bin/fund.mjs check ${slug}, paste proposal.md at ${app.call.fm.forum_url || app.call.fm.url || 'the forum'}, then node bin/fund.mjs d:post ${slug} --url <thread-url>`);
        return 0;
      }),
    },
    'd:post': {
      help: 'start the kill clock: set posted (today or --date) and forum_url (--url); re-running keeps the original date',
      run: guard(async ({ args, flags, core }) => {
        const slug = args[0];
        if (!need(slug, 'd:post <slug> [--url <thread-url>] [--date YYYY-MM-DD] [--dry-run]')) return 2;
        const app = loadD(core, slug);
        if (!app) return 2;
        const now = resolveNow(flags.now);
        const prev = app.call.fm.posted ? String(app.call.fm.posted) : '';
        if (flags.date !== undefined && typeof flags.date !== 'string') { console.error('--date needs a value: --date YYYY-MM-DD'); return 2; }
        if (flags.url !== undefined && (typeof flags.url !== 'string' || !/^https?:\/\/\S+$/.test(flags.url))) { console.error(`--url needs the thread link (http/https), got ${JSON.stringify(flags.url)}`); return 2; }
        // Re-running d:post (e.g. to add the thread URL) must not restart the kill clock; only --date moves it.
        const date = typeof flags.date === 'string' ? flags.date.trim() : prev && !Number.isNaN(parseDay(prev)) ? prev : isoDay(now);
        const t = parseDay(date);
        if (Number.isNaN(t)) { console.error(`bad --date "${date}" — use a real YYYY-MM-DD date`); return 2; }
        // one day of slack for timezones ahead of UTC
        if (t > now + DAY) { console.error(`--date ${date} is in the future; the clock starts on the day you actually post`); return 2; }
        const kd = killDays(app.call.fm.kill_after_days);
        if (kd.problem) { console.error(`${kd.problem} — fix it before starting the clock`); return 2; }
        const patch = { posted: date, next: `Find a sponsor by day ${kd.days}` };
        if (typeof flags.url === 'string') patch.forum_url = flags.url;
        const moved = prev && prev !== date ? ` (moved from ${prev})` : prev ? ' (clock already running, date kept)' : '';
        if (flags['dry-run']) { console.log(`dry run — would set ${JSON.stringify(patch)} in applications/${slug}/call.md${moved}`); }
        else { core.updateFrontmatter(join(app.dir, 'call.md'), patch); console.log(`${slug}: posted ${date}${moved}${patch.forum_url ? ` at ${patch.forum_url}` : ''}`); }
        // posted + forum_url change the proposal's closing line (withdraw date, thread link).
        console.log(`autopilot: fund run ${slug} re-exports proposal.md and tracks the sponsor clock`);
        console.log(`next: node bin/fund.mjs d:export ${slug} (adds the withdraw date and thread link; paste it over the forum post), then ask a voter or delegate and record it with d:log ${slug}; check daily with d:clock ${slug}`);
        return 0;
      }),
    },
    'd:clock': {
      help: 'days since posted, days left in kill window, sponsor status, verdict',
      run: guard(async ({ args, flags, core }) => {
        const slug = args[0];
        if (!need(slug, 'd:clock <slug> [--now ISO] [--json]')) return 2;
        const app = loadD(core, slug);
        if (!app) return 2;
        const fm = app.call.fm;
        const { sponsors } = loadDao(app.dir, fm);
        const c = clock({ posted: fm.posted, killAfterDays: fm.kill_after_days, sponsors, now: flags.now });
        const next = NEXT[c.verdict](slug);
        // --json prints one parseable document (next included), nothing else on stdout.
        if (flags.json) console.log(JSON.stringify({ slug, ...c, next: next.replace(/^next: /, '') }, null, 2));
        else { printClock(slug, c); console.log(next); }
        return c.verdict === 'KILL' ? 1 : 0;
      }),
    },
    'd:log': {
      help: 'append a sponsor ask: --who "role" --channel X --ask Y --response Z',
      run: guard(async ({ args, flags, core }) => {
        const slug = args[0];
        const usage = 'd:log <slug> --who "role" --channel X --ask Y [--response Z] [--date YYYY-MM-DD]';
        if (!need(slug, usage)) return 2;
        for (const k of ['who', 'channel', 'ask']) if (typeof flags[k] !== 'string' || !flags[k].trim()) { console.error(`missing --${k}\nusage: ${usage}`); return 2; }
        if (flags.date !== undefined && (typeof flags.date !== 'string' || Number.isNaN(parseDay(flags.date)))) { console.error(`bad --date ${JSON.stringify(flags.date)} — use a real YYYY-MM-DD date`); return 2; }
        const row = {
          date: typeof flags.date === 'string' ? flags.date : isoDay(resolveNow(flags.now)),
          who: esc(flags.who), channel: esc(flags.channel), ask: esc(flags.ask),
          response: esc(typeof flags.response === 'string' ? flags.response : 'pending'),
        };
        const hits = findPII(Object.values(row).join(' | '));
        if (hits.length) { console.error(`refused: ${hits.map(maskPII).join(', ')} — log the person's role, not their contact details`); return 1; }
        const app = loadD(core, slug);
        if (!app) return 2;
        const dir = app.dir;
        const file = join(dir, 'sponsors.md');
        if (!existsSync(file)) writeFileSync(file, SPONSORS_HEADER);
        const cur = readFileSync(file, 'utf8');
        const eol = cur.includes('\r\n') ? '\r\n' : '\n'; // keep the file's own line endings
        appendFileSync(file, `${cur.endsWith('\n') ? '' : eol}| ${row.date} | ${row.who} | ${row.channel} | ${row.ask} | ${row.response} |${eol}`);
        console.log(`logged ask to ${row.who} via ${row.channel}: ${row.response}${isSponsorResponse(row.response) ? ' (counts as sponsor)' : ''}`);
        if (isSponsorResponse(row.response)) console.log(`autopilot: fund run ${slug} re-exports proposal.md with the sponsor and sets status ready`);
        console.log(`next: node bin/fund.mjs d:clock ${slug}`);
        return 0;
      }),
    },
  },
};

export { SPONSORS_HEADER };
