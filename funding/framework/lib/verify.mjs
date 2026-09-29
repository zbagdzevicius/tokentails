// Deep, objective verification of applications — no AI, read-only except VERIFY.md.
// Groups: checks (core + track), pipeline (step verify() hooks and done evidence), links, facts,
// secrets (keys and personal data, masked), policy (program exclusions), portfolio (cross-app).
// Every result is { group, name, level: 'ok'|'warn'|'error', detail }.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { factsPath, loadSources } from './facts-refresh.mjs';

export const PROSE_FILES = ['call.md', 'draft.md', 'submission.md', 'proposal.md', 'fill.md', 'answers.md'];
export const LINK_FILES = ['call.md', 'draft.md', 'submission.md', 'proposal.md', 'fill.md'];
const GENERATED = new Set(['VERIFY.md', 'PLAN.md', 'WEEK.md']);
// .fund/ is engine state (state.json, loop.json, a relocated PLAN.md): it only echoes app files, so
// scanning it would report every finding twice. draft.v*.md backups ARE scanned: a leak there is real.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'cache', 'broadcast', '.fund']);
const FACT_MAX_AGE_DAYS = 90;
const ACTIVE_EXCLUDED = new Set(['submitted', 'lost', 'parked']);

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ---------- (c) links ----------

export function extractUrls(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/https?:\/\/[^\s<>"'`\]|]+/g)) {
    let u = m[0];
    // keep "(...)" that belongs to the URL (wiki/Cat_(film)); drop the ")" that closes a markdown link or aside
    for (;;) {
      const before = u;
      u = u.replace(/[.,;:!?*_]+$/, '');
      if (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1);
      if (u === before) break;
    }
    u = u.replace(/\).*$/, (tail) => ((u.match(/\(/g) || []).length ? tail : ''));
    if (/\{\{|…|\.\.\.|\$\{/.test(u)) continue;
    let host;
    try { host = new URL(u).hostname; } catch { continue; }
    if (/(^|\.)example\.(com|org|net)$/.test(host)) continue;
    out.add(u);
  }
  return [...out];
}

/** GET every URL (parallel, cached in `cache` across apps). Returns Map url → { level, detail }. */
export async function checkLinks(urls, { cache = new Map(), timeoutMs = Number(process.env.FUND_VERIFY_TIMEOUT_MS || 10000), fetchImpl = globalThis.fetch, concurrency = 8 } = {}) {
  const todo = urls.filter((u) => !cache.has(u));
  let i = 0;
  const one = async (url) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (fund verify link check)' } });
      try { await res.body?.cancel(); } catch { /* ignore */ }
      const s = res.status;
      if (s >= 200 && s < 300) return { level: 'ok', detail: `HTTP ${s}` };
      if (s >= 300 && s < 400) return { level: 'warn', detail: `redirects (HTTP ${s}) to ${res.headers.get('location') || '?'} — use the final URL` };
      if ([401, 403, 405, 429].includes(s)) return { level: 'warn', detail: `HTTP ${s} (blocks bots) — open it by hand` };
      return { level: 'error', detail: `dead link (HTTP ${s})` };
    } catch (e) {
      return { level: 'error', detail: e.name === 'AbortError' ? `no response in ${Math.round(timeoutMs / 1000)}s` : `unreachable (${e.cause?.code || e.message})` };
    } finally { clearTimeout(t); }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (i < todo.length) { const u = todo[i++]; cache.set(u, one(u)); await cache.get(u); }
  }));
  const out = new Map();
  for (const u of urls) out.set(u, await cache.get(u));
  return out;
}

// ---------- (d) facts ----------

/** "2026-09-23" | "2026-09" (end of month) | "2025" (end of year) | "2025–26" (end of 2026) → Date | null */
export function parseFactDate(s) {
  s = String(s || '').trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59Z`);
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return new Date(Date.UTC(+m[1], +m[2], 0, 23, 59, 59));
  if ((m = /^(\d{4})\s*[–—-]\s*(\d{2}|\d{4})$/.exec(s))) { const y = m[2].length === 2 ? 2000 + +m[2] : +m[2]; return new Date(Date.UTC(y, 11, 31, 23, 59, 59)); }
  if ((m = /^(\d{4})$/.exec(s))) return new Date(Date.UTC(+m[1], 11, 31, 23, 59, 59));
  return null;
}

function citationsIn(dir, core, files = PROSE_FILES) {
  const byFile = {};
  for (const f of files) {
    const text = core.stripNonProse(read(join(dir, f)));
    const ids = [...new Set((text.match(/\[F-\d{3}\]/g) || []).map((x) => x.slice(1, -1)))];
    if (ids.length) byFile[f] = ids;
  }
  return byFile;
}

export function factChecks(app, core, { facts, sources, now }) {
  const r = [];
  const add = (name, level, detail) => r.push({ group: 'facts', name, level, detail });
  const byFile = citationsIn(app.dir, core);
  const all = [...new Set(Object.values(byFile).flat())].sort();
  if (!all.length) { add('facts', 'ok', 'no facts cited'); return r; }
  const strict = core.STRICT.has(app.call.fm.status || 'researching');

  // status outside draft.md (core already checks draft.md)
  const other = [...new Set(Object.entries(byFile).filter(([f]) => f !== 'draft.md').flatMap(([, ids]) => ids))];
  const missing = other.filter((id) => !facts.has(id));
  const retired = other.filter((id) => facts.get(id)?.status === 'retired');
  const soft = other.filter((id) => ['unverified', 'sei-era'].includes(facts.get(id)?.status));
  if (missing.length) add('facts-exist', 'error', `unknown fact id(s) outside draft.md: ${missing.join(', ')}`);
  if (retired.length) add('facts-retired', 'error', `retired fact(s) cited outside draft.md: ${retired.join(', ')}`);
  if (soft.length) add('facts-status', strict ? 'error' : 'warn', `unverified or SEI-era fact(s) in ${Object.keys(byFile).filter((f) => f !== 'draft.md' && byFile[f].some((id) => soft.includes(id))).join(', ')}: ${soft.join(', ')}`);
  if (!missing.length && !retired.length && !soft.length) add('facts-status', 'ok', `${all.length} cited fact(s) across ${Object.keys(byFile).join(', ')}`);

  // age
  const stale = [];
  const undated = [];
  for (const id of all) {
    const f = facts.get(id);
    if (!f) continue;
    const d = parseFactDate(f.date);
    if (!d || Number.isNaN(d.getTime())) { undated.push(id); continue; }
    const age = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (age > FACT_MAX_AGE_DAYS) stale.push(`${id} (${f.date}, ${age}d)`);
  }
  if (stale.length) add('facts-age', 'warn', `older than ${FACT_MAX_AGE_DAYS} days: ${stale.join(', ')} — re-check and update the date`);
  if (undated.length) add('facts-date', 'warn', `no parseable date: ${undated.join(', ')}`);
  if (!stale.length && !undated.length) add('facts-age', 'ok', `all cited facts dated within ${FACT_MAX_AGE_DAYS} days`);

  // machine sources
  const probed = all.filter((id) => sources[id]);
  const manual = all.filter((id) => !sources[id] && facts.get(id)?.status === 'unverified');
  if (manual.length) add('facts-probe', 'warn', `unverified and no machine source (verify by hand): ${manual.join(', ')}`);
  else add('facts-probe', 'ok', `${probed.length}/${all.length} cited fact(s) re-checkable by fund refresh${probed.length ? ` (${probed.join(', ')})` : ''}`);
  return r;
}

// ---------- (e) secrets and personal data ----------

const ROLE_LOCALS = new Set(['hello', 'hi', 'info', 'contact', 'team', 'support', 'admin', 'grants', 'grant', 'press', 'media', 'partners', 'partnerships', 'office', 'sales', 'security', 'legal', 'privacy', 'noreply', 'no-reply', 'donotreply', 'dev', 'developers', 'founders', 'careers', 'jobs', 'pr', 'billing', 'help', 'ops', 'finance', 'accounting', 'git', 'studio', 'apply', 'applications', 'funding', 'bd', 'business', 'marketing', 'community', 'feedback', 'abuse', 'webmaster', 'postmaster', 'hr', 'mail', 'enquiries', 'inquiries', 'invoices']);
const FILE_TLD = /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|mp4|webm|mov|css|js|mjs|json|md)$/i; // image@2x.png is a file, not a mailbox
const SAFE_EMAIL_DOMAINS = /(^|\.)(example\.(com|org|net)|test|invalid|localhost|users\.noreply\.github\.com)$/i;

export function mask(v) {
  v = String(v);
  if (v.length <= 6) return `${v[0]}${'*'.repeat(v.length - 1)}`;
  return `${v.slice(0, 4)}…(${v.length} chars)`;
}
function maskEmail(e) { const [l, d] = e.split('@'); return `${l[0]}***@${d}`; }

const SECRET_PATTERNS = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, () => 'PEM private key block'],
  ['stellar-secret', /\bS[A-Z2-7]{55}\b/g, mask],
  ['api-key', /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|rk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{30,})/g, mask],
  ['labelled-secret', /\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|passwd|private[_-]?key|mnemonic|seed[_ ]phrase)\b\s*[:=]\s*["']?([^\s"'`<>]{12,})/gi, (v, m) => `${m[0].split(/[:=]/)[0].trim()} = ${mask(m[1])}`],
  ['rpc-key-url', /https?:\/\/[^\s"'<>)]*(?:alchemy\.com\/v2|infura\.io\/v3|quiknode\.pro|ankr\.com\/[a-z0-9_]+|blastapi\.io|chainstack\.com|getblock\.io|nodereal\.io\/v1)\/[A-Za-z0-9_-]{16,}[^\s"'<>)]*/gi, (v) => `${v.replace(/^(https?:\/\/[^/]+).*$/, '$1')}/…(key in path)`],
  ['url-key-param', /https?:\/\/[^\s"'<>)]*[?&](?:api[_-]?key|apikey|key|token|access_token)=[A-Za-z0-9_-]{16,}/gi, (v) => `${v.replace(/^(https?:\/\/[^/?]+).*$/, '$1')}?…(key in query)`],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, mask],
];

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /(?<![\w+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\w])/g;
const PHONE_LABEL = /\b(?:phone|tel|mobile|whatsapp|telefonas)\s*[:.]?\s*(\+?\d[\d\s().-]{6,}\d)/gi;

export function scanText(text, file) {
  const hits = [];
  for (const [kind, re, show] of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) hits.push({ kind, file, line: lineOf(text, m.index), shown: show(m[0], m) });
  }
  for (const m of text.matchAll(EMAIL)) {
    const [local, domain] = m[0].split('@');
    if (FILE_TLD.test(domain) || SAFE_EMAIL_DOMAINS.test(domain) || ROLE_LOCALS.has(local.toLowerCase().replace(/[+].*$/, ''))) continue;
    hits.push({ kind: 'personal-email', file, line: lineOf(text, m.index), shown: maskEmail(m[0]) });
  }
  const phoneLines = new Set();
  for (const re of [PHONE, PHONE_LABEL]) {
    for (const m of text.matchAll(re)) {
      const raw = m[1] || m[0];
      const digits = raw.replace(/\D/g, '');
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 6);
      if (/^\s*(?:%|€|\$|£|eur|usd|gbp|k\b|m\b)/i.test(tail) || /^\+\d{1,3}(?:[\s.,]000)+$/.test(raw.trim())) continue; // "+20 000 000 EUR" is money
      if (digits.length < 8 || digits.length > 15) continue;
      const line = lineOf(text, m.index);
      if (phoneLines.has(line)) continue;
      phoneLines.add(line);
      hits.push({ kind: 'phone', file, line, shown: `+${digits.slice(0, 3)}…(${digits.length} digits)` });
    }
  }
  return hits;
}

function walk(dir, base = dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    let st;
    try { st = lstatSync(p); if (st.isSymbolicLink()) st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (lstatSync(p).isSymbolicLink()) continue; if (!SKIP_DIRS.has(f)) walk(p, base, out); continue; }
    out.push({ path: p, rel: relative(base, p), size: st.size, mtime: st.mtimeMs });
  }
  return out;
}

export function scanSecrets(dir) {
  const hits = [];
  for (const f of walk(dir)) {
    if (GENERATED.has(f.rel) || f.size > 2 * 1024 * 1024) continue;
    const buf = readFileSync(f.path);
    if (buf.subarray(0, 8192).includes(0)) continue;
    hits.push(...scanText(buf.toString('utf8'), f.rel));
  }
  return hits;
}

function secretChecks(app) {
  const hits = scanSecrets(app.dir);
  if (!hits.length) return [{ group: 'secrets', name: 'secrets-pii', level: 'ok', detail: 'no keys, tokens, personal emails or phone numbers' }];
  const lines = hits.slice(0, 12).map((h) => `${h.file}:${h.line} ${h.kind} ${h.shown}`);
  return [{ group: 'secrets', name: 'secrets-pii', level: 'error', detail: `${hits.length} finding(s) — remove them (use a role mailbox; keys never go in files):\n    - ${lines.join('\n    - ')}${hits.length > 12 ? `\n    - … ${hits.length - 12} more` : ''}` }];
}

// ---------- (f) policy ----------

export const EXCLUDED_PROGRAMS = [
  ['Blockchain for Good Alliance (BGA)', /\bBGA\b|blockchain\s+for\s+good\s+alliance|chainforgood/i],
  ['Mantle', /\bmantle\b/i],
  ['Stellar Community Fund (SCF)', /stellar\s+community\s+fund|\bSCF\b|communityfund\.stellar\.org/i],
  ['Giveth', /\bgiveth\b/i],
];
const TARGET_FIELDS = ['program', 'url', 'dao', 'target', 'funder', 'organizer', 'organiser', 'chain', 'profile'];

const NEGATION_BEFORE = /\b(no|not|never|without|non|exclud\w*|zero|nor|free of|avoid\w*)\b[^.\n]{0,40}$/i;
const FUNDING_TYPES = [
  ['equity or VC investment', /\b(?:equity\s+(?:stake|investment|financing|round|in\s+exchange)|(?:takes?|taking|receives?|for|of)\s+(?:an?\s+)?(?:\d+(?:\.\d+)?\s*%\s+)?(?:of\s+)?(?:your\s+|the\s+)?equity|\d+(?:\.\d+)?\s*%\s+equity|SAFE\s+(?:note|agreement)|convertible\s+note|pre-?seed\s+investment|seed\s+investment|venture\s+(?:capital|investment)|in\s+exchange\s+for\s+\d+(?:\.\d+)?\s*%)(?![\w-])/gi, 'error'],
  ['token sale', /\b(?:token\s+sales?|token\s+launchpad|token\s+launch)\b/gi, 'error'],
  ['token sale', /\b(?:ICO|IDO|IEO)s?\b/g, 'error'], // case-sensitive: "favicon.ico" is not an ICO
  ['matching funds', /\b(?:matching\s+(?:funds?|grants?|funding|pool)|match(?:ed)?\s+funding)\b/gi, 'error'],
  ['listing or market maker', /\b(?:(?:exchange|CEX|DEX)\s+listings?|listing\s+fees?|market[\s-]mak(?:er|ers|ing))\b/gi, 'error'],
  ['free credits', /(?:\b(?:cloud|free|API|hosting|AWS|GCP|Azure|compute)\s+credits|\bcredits?\s+(?:program|programme|package|perks?)|[$€£]\s?\d[\d,.]*\s*[km]?\s+in\s+credits)\b/gi, 'error'],
];
const RELOCATION = /\b(?:on-?site|relocat(?:e|ion|ing)|in-person\s+(?:program|programme|attendance|residency|cohort|bootcamp)|attend\s+in\s+person|must\s+(?:be\s+)?(?:based|located|resident)\s+in|residency\s+(?:program|programme|requirement)|move\s+to\s+[A-Z]\w+\s+for)\b/gi;

function findUnnegated(text, re) {
  const hits = [];
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (NEGATION_BEFORE.test(before.split('\n').pop()) || /^[\s-]*free\b/i.test(after)) continue;
    hits.push({ match: m[0], line: lineOf(text, m.index) });
  }
  return hits;
}

export function policyChecks(app) {
  const r = [];
  const add = (name, level, detail) => r.push({ group: 'policy', name, level, detail });
  const fm = app.call.fm;
  const targets = [['slug', app.slug.replace(/-/g, ' ')], ...TARGET_FIELDS.map((k) => [k, [].concat(fm[k] ?? []).join(' ')])];
  const excluded = [];
  for (const [name, re] of EXCLUDED_PROGRAMS) for (const [field, v] of targets) if (v && re.test(v)) excluded.push(`${name} in ${field}`);
  if (excluded.length) add('excluded-program', 'error', `excluded by user decision: ${[...new Set(excluded)].join('; ')} — park or delete this application`);
  else add('excluded-program', 'ok', 'not BGA, Mantle, SCF or Giveth');

  // funding type: call + source describe the program; our own prose must not pitch a token sale
  const programText = { 'call.md': read(join(app.dir, 'call.md')), 'source.md': read(join(app.dir, 'source.md')) };
  const bad = [];
  for (const [label, re] of FUNDING_TYPES) {
    for (const [f, text] of Object.entries(programText)) for (const h of findUnnegated(text, re)) bad.push(`${f}:${h.line} ${label} ("${h.match}")`);
  }
  for (const f of ['draft.md', 'submission.md', 'proposal.md', 'fill.md', 'answers.md']) {
    for (const [, re] of FUNDING_TYPES.filter(([l]) => l === 'token sale')) for (const h of findUnnegated(read(join(app.dir, f)), re)) bad.push(`${f}:${h.line} token sale ("${h.match}")`);
  }
  if (bad.length) add('funding-type', 'error', `grants and accelerators only — found:\n    - ${[...new Set(bad)].slice(0, 10).join('\n    - ')}`);
  else add('funding-type', 'ok', 'no investment, token-sale, matching, listing or credits language');

  const reloc = [];
  for (const [f, text] of Object.entries(programText)) for (const h of findUnnegated(text, RELOCATION)) reloc.push(`${f}:${h.line} "${h.match}"`);
  if (reloc.length) add('remote-only', 'warn', `may require presence (remote-only rule): ${reloc.slice(0, 6).join('; ')} — confirm it can be done remotely`);
  else add('remote-only', 'ok', 'no relocation or in-person requirement found');
  return r;
}

// ---------- (g) portfolio consistency ----------

const NUM = /(?<![\w.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|m|b|million|thousand|billion)?(?![\w])/gi;
export function numbersIn(s) {
  const out = [];
  for (const m of String(s).matchAll(NUM)) {
    let n = Number(m[1].replace(/,/g, ''));
    const u = (m[2] || '').toLowerCase();
    if (u === 'k' || u === 'thousand') n *= 1e3; else if (u === 'm' || u === 'million') n *= 1e6; else if (u === 'b' || u === 'billion') n *= 1e9;
    if (Number.isFinite(n)) out.push({ n, raw: m[0].trim() });
  }
  return out;
}
function sig(n) { const s = String(Math.round(Math.abs(n))).replace(/0+$/, ''); return Math.max(1, s.length); }
/** prose number p is a faithful (rounded or floored) rendering of fact number f */
export function renders(p, f) {
  if (p === f) return true;
  if (!(f > 0) || !(p > 0)) return false;
  const s = sig(p);
  if (Number(f.toPrecision(s)) === p) return true;
  const mag = 10 ** (Math.floor(Math.log10(f)) + 1 - s);
  return Math.floor(f / mag) * mag === p;
}

export function factClaims(apps, core, facts) {
  const claims = []; // { app, file, id, raw, n, ok }
  for (const app of apps) {
    for (const f of PROSE_FILES.filter((x) => x !== 'call.md')) {
      const text = core.stripNonProse(read(join(app.dir, f))).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      for (const sen of core.sentences(text)) {
        const ids = [...new Set((sen.match(/\[F-\d{3}\]/g) || []).map((x) => x.slice(1, -1)))].filter((id) => facts.has(id));
        if (!ids.length) continue;
        const scrub = sen.replace(/\[F-\d{3}\]/g, '').replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, '').replace(/\b(19|20)\d{2}\b/g, '');
        for (const { n, raw } of numbersIn(scrub)) {
          if (n < 10) continue;
          let best = null;
          for (const id of ids) {
            const fv = numbersIn(facts.get(id).value).map((x) => x.n);
            if (fv.some((v) => renders(n, v))) { best = { id, ok: true }; break; }
            if (!best && fv.some((v) => n >= v / 2 && n <= v * 2)) best = { id, ok: false };
          }
          if (best) claims.push({ app: app.slug, file: f, id: best.id, raw, n, ok: best.ok });
        }
      }
    }
  }
  return claims;
}

export function portfolioChecks(core, { facts, now, slugs }) {
  const all = core.listApps().map((s) => { try { return core.loadApp(s); } catch { return null; } }).filter(Boolean);
  const out = []; // { slugs: [], group, name, level, detail }

  // same fact, different numbers
  const claims = factClaims(all, core, facts);
  const byFact = new Map();
  for (const c of claims) { if (!byFact.has(c.id)) byFact.set(c.id, []); byFact.get(c.id).push(c); }
  for (const [id, cs] of byFact) {
    const bad = cs.filter((c) => !c.ok);
    if (!bad.length) continue;
    const distinct = new Set(cs.map((c) => c.n));
    const appsInvolved = new Set(cs.map((c) => c.app));
    const where = [...new Map(cs.map((c) => [`${c.app}:${c.raw}`, `${c.raw} in ${c.app}/${c.file}`])).values()].join('; ');
    const conflict = appsInvolved.size > 1 && distinct.size > 1;
    out.push({
      slugs: [...new Set(bad.map((c) => c.app))], group: 'portfolio', name: 'fact-numbers',
      level: conflict ? 'error' : 'warn',
      detail: `${id} written differently${conflict ? ' across applications' : ' from FACTS.md'}: ${where} (FACTS: ${facts.get(id).value}) — use the FACTS value`,
    });
  }

  // overlapping deliverables between active applications
  const status = (a) => a.call.fm.status || 'researching';
  const delivs = all.filter((a) => !ACTIVE_EXCLUDED.has(status(a))).map((a) => {
    const raw = a.call.fm.deliverables ?? a.draft.fm.deliverables ?? [];
    const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((x) => String(x).trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
    return { slug: a.slug, list: new Set(list) };
  }).filter((d) => d.list.size);
  for (let i = 0; i < delivs.length; i++) for (let j = i + 1; j < delivs.length; j++) {
    const shared = [...delivs[i].list].filter((x) => delivs[j].list.has(x));
    if (shared.length) out.push({ slugs: [delivs[i].slug, delivs[j].slug], group: 'portfolio', name: 'double-funding', level: 'warn', detail: `${delivs[i].slug} and ${delivs[j].slug} both promise: ${shared.join(', ')} — split the scope or disclose the other grant` });
  }

  // submitted applications edited afterwards
  for (const a of all.filter((x) => status(x) === 'submitted' && x.call.fm.submitted)) {
    const cutoff = core.parseDeadline(String(a.call.fm.submitted).slice(0, 10));
    if (!cutoff || Number.isNaN(cutoff)) continue;
    const changed = walk(a.dir).filter((f) => !GENERATED.has(f.rel) && !f.rel.startsWith('.fund') && f.mtime > cutoff).map((f) => f.rel);
    if (changed.length) out.push({ slugs: [a.slug], group: 'portfolio', name: 'changed-after-submit', level: 'warn', detail: `submitted ${a.call.fm.submitted}, but changed since: ${changed.slice(0, 6).join(', ')}${changed.length > 6 ? ' …' : ''} — the funder has the old version` });
  }
  void now;
  return slugs ? out.filter((x) => x.slugs.some((s) => slugs.includes(s))) : out;
}

// ---------- (b) pipeline ----------

export async function pipelineChecks(slug, { core, tracks, flags = {}, invoke, loadPipeline }) {
  const r = [];
  const add = (name, level, detail) => r.push({ group: 'pipeline', name, level, detail });
  let P;
  try { P = loadPipeline ? await loadPipeline() : await import('./pipeline.mjs'); }
  catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && /pipeline\.mjs/.test(e.message)) { add('pipeline', 'ok', 'pipeline engine not installed — skipped'); return r; }
    add('pipeline', 'error', `lib/pipeline.mjs failed to load: ${e.message}`); return r;
  }
  let steps, ctx;
  try {
    steps = await P.resolvePipeline({ slug, core, tracks });
    const noAI = () => { throw new Error('verify never calls AI'); };
    // verify is read-only: hooks get no AI and no way to run other commands
    const noInvoke = async (argv) => { throw new Error(`verify never runs other commands (asked for: fund ${[].concat(argv || []).join(' ')})`); };
    void invoke;
    ctx = P.makeCtx({ slug, core, runAI: noAI, invoke: noInvoke, tracks, flags: { ...flags, verify: true } });
  } catch (e) { add('pipeline', 'error', `could not resolve the pipeline: ${e.message}`); return r; }
  const state = (P.readState ? P.readState(core.appDir(slug)) : ctx.state) || { steps: {} };
  const reload = () => { try { ctx.app = core.loadApp(slug); } catch { /* keep */ } };
  let held = 0;
  let hooks = 0;
  let pending = 0;
  for (const step of steps || []) {
    // done() decides whether there is finished work to re-check; verify() only re-checks finished work.
    let d = null;
    if (typeof step.done === 'function') {
      try { reload(); d = await step.done(ctx); } catch (e) { add(`evidence:${step.id}`, 'error', `done() threw: ${e.message}`); continue; }
    }
    const rec = state.steps?.[step.id];
    if (rec?.status === 'done' && d && !d.done) {
      add(`evidence:${step.id}`, step.kind === 'human' ? 'warn' : 'error', `marked done${rec.doneAt ? ` ${String(rec.doneAt).slice(0, 10)}` : ''} but evidence is gone: ${d.reason || 'done() is false'} — re-run: fund run ${slug} --until ${step.id}`);
      continue;
    }
    if (!d?.done) { pending++; continue; }
    held++;
    if (typeof step.verify === 'function') {
      hooks++;
      try {
        reload();
        const v = await step.verify(ctx);
        if (v && v.level && v.level !== 'ok') add(`step:${step.id}`, ['warn', 'error'].includes(v.level) ? v.level : 'error', v.detail || '');
      } catch (e) { add(`step:${step.id}`, 'error', `verify() threw: ${e.message}`); }
    }
  }
  const known = new Set((steps || []).map((s) => s.id));
  const orphans = Object.entries(state.steps || {}).filter(([id, rec]) => rec?.status === 'done' && !known.has(id)).map(([id]) => id);
  if (orphans.length) add('state', 'warn', `.fund/state.json marks unknown step(s) done: ${orphans.join(', ')} — the pipeline no longer has them (renamed or removed); fund plan ${slug}`);
  add('pipeline', 'ok', `${held} done step(s) backed by evidence (${hooks} re-verified), ${pending} still to do — fund plan ${slug}`);
  return r;
}

// ---------- orchestration ----------

export async function verifyApp(slug, opts) {
  const { core, tracks, offline, linkCache, facts, sources, now, fetchImpl, timeoutMs, portfolio } = opts;
  const results = [];
  let app;
  try {
    const { app: a, results: rs } = await core.runChecks(slug, { tracks });
    app = a;
    for (const x of rs) results.push({ group: 'checks', ...x });
  } catch (e) {
    return { slug, ok: false, results: [{ group: 'checks', name: 'load', level: 'error', detail: e.message }] };
  }
  results.push(...(await pipelineChecks(slug, opts)));

  // links
  const urlsByFile = {};
  for (const f of LINK_FILES) { const u = extractUrls(read(join(app.dir, f))); if (u.length) urlsByFile[f] = u; }
  const urls = [...new Set(Object.values(urlsByFile).flat())];
  if (!urls.length) results.push({ group: 'links', name: 'links', level: 'ok', detail: 'no URLs' });
  else if (offline) results.push({ group: 'links', name: 'links', level: 'ok', detail: `skipped (--offline): ${urls.length} URL(s)` });
  else {
    const res = await checkLinks(urls, { cache: linkCache, fetchImpl, timeoutMs });
    const where = (u) => Object.keys(urlsByFile).filter((f) => urlsByFile[f].includes(u)).join(', ');
    const bad = urls.filter((u) => res.get(u).level !== 'ok');
    for (const u of bad) results.push({ group: 'links', name: 'link', level: res.get(u).level, detail: `${u} (${where(u)}): ${res.get(u).detail}` });
    results.push({ group: 'links', name: 'links', level: 'ok', detail: `${urls.length - bad.length}/${urls.length} URL(s) respond 2xx` });
  }

  results.push(...factChecks(app, core, { facts, sources, now }));
  results.push(...secretChecks(app));
  results.push(...policyChecks(app));
  const mine = (portfolio || []).filter((p) => p.slugs.includes(slug));
  for (const p of mine) results.push({ group: p.group, name: p.name, level: p.level, detail: p.detail });
  if (!mine.length) results.push({ group: 'portfolio', name: 'portfolio', level: 'ok', detail: 'consistent with the other applications' });
  return { slug, ok: !results.some((x) => x.level === 'error'), results };
}

export async function verify({ slugs, core, tracks, offline = false, flags = {}, invoke, factsFile, sourcesFile, fetchImpl, timeoutMs, loadPipeline, write = true } = {}) {
  const now = core.now();
  if (Number.isNaN(now.getTime())) throw new Error(`FUND_NOW="${process.env.FUND_NOW}" is not a date (use e.g. 2026-10-01 or 2026-10-01T12:00:00Z)`);
  const { facts } = core.loadFacts(factsPath(factsFile));
  let sources = {};
  let sourcesError = null;
  try { sources = loadSources(sourcesFile); } catch (e) { sourcesError = e.message; }
  const portfolio = portfolioChecks(core, { facts, now });
  const linkCache = new Map();
  const out = [];
  for (const slug of slugs) {
    const v = await verifyApp(slug, { core, tracks, offline, flags, invoke, linkCache, facts, sources, now, fetchImpl, timeoutMs, portfolio, loadPipeline });
    if (sourcesError) { v.results.push({ group: 'facts', name: 'facts-sources', level: 'error', detail: sourcesError }); v.ok = false; }
    if (write && existsSync(core.appDir(slug))) writeFileSync(join(core.appDir(slug), 'VERIFY.md'), renderVerifyMd(v, { now, offline }));
    out.push(v);
  }
  return { apps: out, portfolio };
}

const ICON = { ok: '✓', warn: '!', error: '✗' };
export const GROUPS = ['checks', 'pipeline', 'links', 'facts', 'secrets', 'policy', 'portfolio'];

export function nextCommand(v) {
  const errs = v.results.filter((r) => r.level === 'error');
  if (!errs.length) return `fund next ${v.slug}`;
  const g = errs[0].group;
  if (g === 'checks') return `fund check ${v.slug}   (then fund verify ${v.slug})`;
  // Stale evidence of auto/ai steps (a draft edit outdated submission.md or the review) is re-built by the engine.
  if (g === 'pipeline') return /^evidence:/.test(errs[0].name) ? `fund run ${v.slug}   (re-runs the stale steps; then fund verify ${v.slug})` : `fund plan ${v.slug}`;
  return `fix the ✗ ${g} item(s) in applications/${v.slug}/, then fund verify ${v.slug}`;
}

export function renderVerifyMd(v, { now, offline } = {}) {
  const errs = v.results.filter((r) => r.level === 'error');
  const warns = v.results.filter((r) => r.level === 'warn');
  const oks = v.results.filter((r) => r.level === 'ok');
  const item = (r) => `- ${ICON[r.level]} **${r.group} / ${r.name}** — ${String(r.detail || '').replace(/\n\s*/g, '\n  ')}`;
  return [
    `# Verify — ${v.slug}`,
    '',
    `_Generated by \`fund verify\` at ${(now || new Date()).toISOString()}${offline ? ' (offline: links not fetched)' : ''}. Do not edit; re-run to refresh._`,
    '',
    `**${errs.length ? 'FAIL' : 'PASS'}** — ${errs.length} error(s), ${warns.length} warning(s), ${oks.length} passed.`,
    '',
    ...(errs.length ? ['## Errors', '', ...errs.map(item), ''] : []),
    ...(warns.length ? ['## Warnings', '', ...warns.map(item), ''] : []),
    '## Passed',
    '',
    ...oks.map(item),
    '',
    `Next: \`${nextCommand(v)}\``,
    '',
  ].join('\n');
}

export function printVerify(v) {
  const errs = v.results.filter((r) => r.level === 'error').length;
  const warns = v.results.filter((r) => r.level === 'warn').length;
  console.log(`\n${v.slug}  ${errs ? `✗ FAIL (${errs} error(s), ${warns} warning(s))` : `✓ PASS${warns ? ` (${warns} warning(s))` : ''}`}`);
  for (const g of GROUPS) {
    const rs = v.results.filter((r) => r.group === g);
    if (!rs.length) continue;
    const bad = rs.filter((r) => r.level !== 'ok');
    if (!bad.length) { console.log(`  ✓ ${g.padEnd(10)} ${rs.length} passed`); continue; }
    for (const r of bad) console.log(`  ${ICON[r.level]} ${g.padEnd(10)} ${r.name.padEnd(20)} ${r.detail}`);
  }
}
