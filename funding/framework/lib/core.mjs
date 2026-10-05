// Shared core for the funding framework. Dependency-free (Node >= 20).
// Tracks plug in through tracks/<dir>/track.mjs — see tracks/README.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PATHS = {
  facts: process.env.FUND_FACTS || join(ROOT, 'facts', 'FACTS.md'),
  blocks: join(ROOT, 'facts', 'BLOCKS.md'),
  frames: join(ROOT, 'facts', 'frames.json'),
  prompts: join(ROOT, 'prompts'),
  templates: join(ROOT, 'templates'),
  tracks: join(ROOT, 'tracks'),
  apps: process.env.FUND_APPS_DIR || join(ROOT, 'applications'),
  tracker: process.env.FUND_TRACKER || join(ROOT, 'TRACKER.md'),
};

export const STATUSES = ['researching', 'drafting', 'in-review', 'ready', 'submitted', 'won', 'lost', 'parked'];
export const CLOSED = new Set(['submitted', 'won', 'lost', 'parked']);
export const STRICT = new Set(['in-review', 'ready']);

// An empty "frame:" parses as [] (block-list start) or ""; both mean no frame.
export function frameOf(fm) {
  const f = Array.isArray(fm.frame) ? fm.frame[0] : fm.frame;
  return f ? String(f) : '';
}

// Injectable clock: FUND_NOW=2026-10-01 makes every date check deterministic.
export function now() { return process.env.FUND_NOW ? new Date(process.env.FUND_NOW) : new Date(); }

// Date-only deadlines ("2026-10-14") mean the end of that day, not midnight at its start.
export function parseDeadline(v) {
  if (v == null || v === '' || v === 'rolling') return null;
  const s = String(v).trim();
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59` : s);
}

// Strip a code fence an AI wrapped around a whole file (```markdown ... ```).
export function unwrapFence(text) {
  const m = /^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(text);
  return m ? m[1] + '\n' : text;
}

// ---------- frontmatter (small YAML subset: scalars, inline arrays, block lists) ----------

function parseScalar(v) {
  v = v.trim();
  if (v === '') return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => parseScalar(s)) : [];
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function parseFrontmatter(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && listKey) { fm[listKey].push(parseScalar(item[1])); continue; }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v.trim() === '') { fm[k] = []; listKey = k; } else { fm[k] = parseScalar(v); listKey = null; }
  }
  return { fm, body: text.slice(m[0].length) };
}

export function stringifyFrontmatter(fm) {
  const lines = Object.entries(fm).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map((x) => (/[,\[\]:]/.test(String(x)) ? `"${x}"` : x)).join(', ')}]`;
    if (typeof v === 'string' && (/[:#]/.test(v) || v === '')) return `${k}: "${v}"`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join('\n')}\n---\n`;
}

export function updateFrontmatter(file, patch) {
  const { fm, body } = parseFrontmatter(readFileSync(file, 'utf8'));
  writeFileSync(file, stringifyFrontmatter({ ...fm, ...patch }) + body);
}

// ---------- facts, frames, blocks ----------

export function loadFacts(file = PATHS.facts) {
  const facts = new Map();
  const problems = [];
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*F-\d{3}\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const [id, label, value, source, date, status] = cells;
    if (facts.has(id)) problems.push(`duplicate fact id ${id}`);
    if (!source) problems.push(`${id} has no source`);
    if (!['verified', 'unverified', 'sei-era', 'retired'].includes(status)) problems.push(`${id} has invalid status "${status}"`);
    facts.set(id, { id, label, value, source, date, status });
  }
  return { facts, problems };
}

export function loadFrames(file = PATHS.frames) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// ---------- applications ----------

export function appDir(slug) { return join(PATHS.apps, slug); }

export function listApps() {
  if (!existsSync(PATHS.apps)) return [];
  return readdirSync(PATHS.apps).filter((d) => existsSync(join(PATHS.apps, d, 'call.md'))).sort();
}

export function loadApp(slug) {
  const dir = appDir(slug);
  if (!existsSync(join(dir, 'call.md'))) throw new Error(`no application "${slug}" (expected ${join(dir, 'call.md')})`);
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const call = parseFrontmatter(read('call.md'));
  const draft = parseFrontmatter(read('draft.md'));
  return { slug, dir, call, draft, review: read('review.md'), sections: parseSections(draft.body), criteria: parseCriteria(call.body) };
}

/**
 * The worst-case filled length of a single-brace placeholder ({ARB_SPLIT}, {TEMPO_TX}, {DEMO_URL}):
 * a 0x address is 42 characters, a tx hash 66, a URL up to 60. Other placeholders count as written.
 */
export function placeholderWorstCase(name) {
  if (/(_TX|HASH)$/.test(name) || name === 'TX') return 66;
  if (/(ADDRESS|SPLIT|WALLET|ROUTER|CONTRACT)$/.test(name)) return 42;
  if (/URL$/.test(name)) return 60;
  return name.length + 2;
}
export const filledLength = (text) => text.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (_m, n) => 'x'.repeat(placeholderWorstCase(n))).length;

// Draft sections: "## Heading <!-- criterion: C1, C2 | limit: 1500 | words: 300 -->"
export function parseSections(body) {
  const out = [];
  const parts = body.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const headLine = nl === -1 ? part : part.slice(0, nl);
    let content = nl === -1 ? '' : part.slice(nl + 1);
    const meta = {};
    const annot = /<!--([\s\S]*?)-->/.exec(headLine) || /^\s*<!--([\s\S]*?)-->/.exec(content);
    if (annot) {
      for (const kv of annot[1].split('|')) {
        const m = /^\s*([a-z]+)\s*:\s*(.+?)\s*$/i.exec(kv);
        if (m) meta[m[1].toLowerCase()] = m[2];
      }
      if (!/<!--/.test(headLine)) content = content.replace(annot[0], '');
    }
    const title = headLine.replace(/<!--[\s\S]*?-->/, '').trim();
    const text = stripNonProse(content).trim();
    out.push({
      title,
      criteria: meta.criterion ? meta.criterion.split(',').map((s) => s.trim()) : [],
      limit: meta.limit ? Number(meta.limit) : null,
      words: meta.words ? Number(meta.words) : null,
      text,
      chars: text.length,
      // The length once fund fill puts real addresses, hashes and URLs in (limits are checked on this).
      filledChars: filledLength(text),
      wordCount: text ? text.split(/\s+/).length : 0,
    });
  }
  return out;
}

// Criteria table rows in call.md: "| C1 | Name | Weight | Verbatim quote |"
export function parseCriteria(body) {
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/^\|\s*C\d+\s*\|/.test(line)) continue;
    const [id, name, weight, quote] = line.split('|').slice(1, -1).map((c) => c.trim());
    out.push({ id, name, weight, quote });
  }
  return out;
}

export function stripNonProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\]\([^)]*\)/g, ']');
}

// ---------- checks ----------

const METRIC = /(?:[$€£]\s?\d[\d,.]*\s?(?:k|m|b|million|thousand)?\b|\b\d[\d,.]*\s?(?:%|k\b|m\b|million|thousand|users|players|visitors|transactions|txs|invocations|wallets|followers|downloads|shelters|cats|installs|mau|dau|wau)|\b\d{1,3}(?:,\d{3})+\b)/i;
const CITE = /\[F-\d{3}\]/g;
// {{VAR}} template slots and the {VAR} fill-after-deploy slots used in drafts ({SPLIT_ADDRESS}, {DEMO_URL}, ...)
const PLACEHOLDER = /\b(TODO|TBD|XXX|FIXME|lorem ipsum)\b|\{\{[^}]+\}\}|\{[A-Z][A-Z0-9_]*\}/;

export function sentences(text) {
  const units = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let para = [];
    const flush = () => { if (para.length) units.push(para.join(' ')); para = []; };
    for (const l of lines) {
      if (/^([-*+]\s|\d+[.)]\s|\||>|#)/.test(l)) { flush(); units.push(l); } else para.push(l);
    }
    flush();
  }
  return units.flatMap((u) => u.split(/(?<=[.!?])\s+/)).map((s) => s.trim()).filter(Boolean);
}

export function findBanned(text, terms) {
  const hits = [];
  for (const t of terms) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'i');
    if (re.test(text)) hits.push(t);
  }
  return hits;
}

// Each check returns { name, level: 'error'|'warn'|'ok', detail }.
export function coreChecks(app, { facts, frames }) {
  const r = [];
  const add = (name, level, detail = '') => r.push({ name, level, detail });
  const status = app.call.fm.status || 'researching';
  const strict = STRICT.has(status);

  // status
  if (!STATUSES.includes(status)) add('status', 'error', `"${status}" is not one of ${STATUSES.join(', ')}`);
  else add('status', 'ok', status);

  // deadline
  const dl = app.call.fm.deadline;
  if (dl && dl !== 'rolling') {
    const t = parseDeadline(dl);
    if (Number.isNaN(t)) add('deadline', 'error', `unparseable deadline "${dl}"`);
    else {
      const days = (t - now().getTime()) / 86400000;
      if (days < 0 && !CLOSED.has(status)) add('deadline', 'error', `passed ${Math.abs(days).toFixed(1)} days ago`);
      else if (days >= 0 && days < 3 && !CLOSED.has(status)) add('deadline', 'warn', `${days.toFixed(1)} days left`);
      else add('deadline', 'ok', days < 0 ? 'closed' : `${days.toFixed(1)} days left`);
    }
  } else add('deadline', 'ok', dl || 'none set');

  // frame
  const frameName = frameOf(app.call.fm);
  const frame = frameName ? frames.frames?.[frameName] : null;
  if (frameName && !frame) add('frame', 'error', `unknown frame "${frameName}" (see facts/frames.json)`);
  else add('frame', 'ok', frameName || 'none');

  if (!app.sections.length) {
    add('draft', STRICT.has(status) ? 'error' : 'warn', 'draft.md has no "## " sections');
    return r;
  }

  const allText = app.sections.map((s) => s.text).join('\n');

  // citations: every sentence with a metric-like number cites a fact
  const uncited = [];
  const cited = new Set();
  for (const s of app.sections) {
    for (const sen of sentences(s.text)) {
      const ids = sen.match(CITE) || [];
      ids.forEach((id) => cited.add(id.slice(1, -1)));
      const scrubbed = sen.replace(CITE, '').replace(/\b(19|20)\d{2}\b/g, '');
      if (METRIC.test(scrubbed) && ids.length === 0) uncited.push(`${s.title}: "${sen.slice(0, 90)}"`);
    }
  }
  if (uncited.length) add('citations', 'error', `${uncited.length} sentence(s) with numbers but no [F-###]:\n    - ${uncited.slice(0, 8).join('\n    - ')}`);
  else add('citations', 'ok', `${cited.size} fact(s) cited`);

  // cited facts exist and are usable
  const missing = [...cited].filter((id) => !facts.has(id));
  if (missing.length) add('facts-exist', 'error', `unknown fact id(s): ${missing.join(', ')}`);
  const retired = [...cited].filter((id) => facts.get(id)?.status === 'retired');
  if (retired.length) add('facts-retired', 'error', `retired fact(s) cited: ${retired.join(', ')}`);
  const soft = [...cited].filter((id) => ['unverified', 'sei-era'].includes(facts.get(id)?.status));
  if (soft.length) add('facts-soft', strict ? 'error' : 'warn', `unverified or SEI-era fact(s): ${soft.join(', ')} — verify, or label the chain`);
  if (!missing.length && !retired.length && !soft.length) add('facts-exist', 'ok', 'all cited facts verified');

  // banned terms (global + frame)
  const banned = [...(frames.global_banned || []), ...(frame?.banned || [])];
  const hits = findBanned(allText, banned);
  if (hits.length) add('banned-terms', 'error', `found: ${hits.join(', ')}`);
  else add('banned-terms', 'ok', `${banned.length} term(s) screened`);

  // chain: the draft names every chain its call.md targets (a body copied from another program's
  // draft keeps the old chain's text, e.g. "Why Tempo" in a Team1 Avalanche draft)
  const targets = [].concat(app.call.fm.chain || []).map((c) => String(c).trim()).filter(Boolean);
  const unnamed = targets.filter((c) => !new RegExp(`\\b${c.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(allText));
  // Advisory (a warning at every status): the AI revise loop cannot be relied on to fix chain facts.
  if (unnamed.length) add('chain', 'warn', `the draft never names its call's chain(s): ${unnamed.join(', ')} — rewrite it for that chain before submitting`);
  else if (targets.length) add('chain', 'ok', targets.join(', '));

  // limits
  const worst = (s) => Math.max(s.chars, s.filledChars ?? s.chars);
  const over = app.sections.filter((s) => (s.limit && worst(s) > s.limit) || (s.words && s.wordCount > s.words));
  if (over.length) add('limits', 'error', over.map((s) => `${s.title}: ${s.limit ? `${worst(s)}/${s.limit} chars${worst(s) > s.chars ? ' once placeholders are filled' : ''}` : ''}${s.words ? ` ${s.wordCount}/${s.words} words` : ''}`).join('; '));
  else add('limits', 'ok', `${app.sections.filter((s) => s.limit || s.words).length} limited section(s) within bounds`);

  // criteria coverage
  if (app.call.fm.criteria === 'none') add('criteria', 'ok', 'call publishes no scoring criteria (criteria: none)');
  else if (app.criteria.length) {
    const covered = new Set(app.sections.flatMap((s) => s.criteria));
    const uncovered = app.criteria.filter((c) => !covered.has(c.id)).map((c) => `${c.id} ${c.name}`);
    const unknown = [...covered].filter((id) => !app.criteria.some((c) => c.id === id));
    if (uncovered.length) add('criteria', strict ? 'error' : 'warn', `not addressed: ${uncovered.join('; ')}`);
    else add('criteria', 'ok', `all ${app.criteria.length} criteria mapped`);
    if (unknown.length) add('criteria-ids', 'error', `sections reference unknown criteria: ${unknown.join(', ')}`);
  } else add('criteria', 'warn', 'call.md has no "| C1 | ..." criteria table — run the extract prompt');

  // placeholders
  const ph = app.sections.filter((s) => PLACEHOLDER.test(s.text)).map((s) => s.title);
  if (ph.length) add('placeholders', strict ? 'error' : 'warn', `in: ${ph.join(', ')}`);
  else add('placeholders', 'ok');

  // empty sections
  const empty = app.sections.filter((s) => s.chars === 0).map((s) => s.title);
  if (empty.length) add('empty-sections', strict ? 'error' : 'warn', empty.join(', '));

  return r;
}

// ---------- tracks ----------

export async function loadTracks() {
  const tracks = {};
  if (!existsSync(PATHS.tracks)) return tracks;
  for (const d of readdirSync(PATHS.tracks)) {
    const f = join(PATHS.tracks, d, 'track.mjs');
    if (!existsSync(f)) continue;
    const mod = (await import(pathToFileURL(f).href)).default;
    if (!mod?.id) throw new Error(`${f} must default-export { id, name, ... }`);
    tracks[mod.id] = { ...mod, dir: join(PATHS.tracks, d) };
  }
  return tracks;
}

// ctxExtra.status judges the app as if call.md had that status (e.g. 'ready' previews the strict
// gates before a person reads it); nothing is written.
export async function runChecks(slug, ctxExtra = {}) {
  const app = loadApp(slug);
  if (ctxExtra.status) app.call = { ...app.call, fm: { ...app.call.fm, status: ctxExtra.status } };
  const { facts, problems } = loadFacts();
  const frames = loadFrames();
  const results = coreChecks(app, { facts, frames });
  if (!Object.keys(app.call.fm).length) results.unshift({ name: 'frontmatter', level: 'error', detail: 'call.md has no YAML frontmatter (an AI answer may have replaced it — see unwrapFence / c:unwrap)' });
  else if (!app.call.fm.track) results.unshift({ name: 'track', level: 'error', detail: 'call.md has no "track:" — track checks cannot run' });
  if (problems.length) results.unshift({ name: 'facts-file', level: 'error', detail: problems.join('; ') });
  const tracks = ctxExtra.tracks || (await loadTracks());
  const track = tracks[app.call.fm.track];
  if (app.call.fm.track && !track) results.push({ name: 'track', level: 'error', detail: `unknown track "${app.call.fm.track}"` });
  for (const chk of track?.checks || []) {
    try {
      const out = await chk({ app, facts, frames, core: CORE });
      for (const o of [].concat(out || [])) results.push({ name: `${track.id}:${o.name}`, level: o.level, detail: o.detail || '' });
    } catch (e) {
      results.push({ name: `${track.id}:check`, level: 'error', detail: `check threw: ${e.message}` });
    }
  }
  return { app, results, ok: !results.some((x) => x.level === 'error') };
}

// ---------- scaffolding ----------

function copyDir(src, dst, vars) {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    const s = join(src, f);
    const d = join(dst, f);
    if (statSync(s).isDirectory()) { copyDir(s, d, vars); continue; }
    if (/\.(md|json|txt|yml|yaml)$/.test(f)) writeFileSync(d, render(readFileSync(s, 'utf8'), vars));
    else copyFileSync(s, d);
  }
}

export function render(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

let lastHint = null;
/** The next-step line a track's onScaffold returned (or its nextHint), for the CLI to print. */
export function scaffoldHint() { return lastHint; }

export async function scaffold(slug, opts) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug must be lowercase letters, digits and dashes');
  const dir = appDir(slug);
  if (existsSync(join(dir, 'call.md')) && !opts.force) throw new Error(`${slug} already exists (use --force)`);
  const tracks = await loadTracks();
  const track = tracks[opts.track];
  if (!track) throw new Error(`unknown track "${opts.track}" — available: ${Object.keys(tracks).join(', ') || 'none'}`);
  const vars = {
    SLUG: slug,
    PROGRAM: opts.program || slug,
    TRACK: track.id,
    TRACK_NAME: track.name,
    FRAME: opts.frame || track.defaultFrame || '',
    DEADLINE: opts.deadline || 'rolling',
    URL: opts.url || '',
    CREATED: new Date().toISOString().slice(0, 10),
  };
  copyDir(PATHS.templates, dir, vars);
  const tdir = join(track.dir, 'templates');
  if (existsSync(tdir)) copyDir(tdir, dir, vars);
  lastHint = null;
  if (track.onScaffold) {
    const h = await track.onScaffold({ slug, dir, vars, core: CORE });
    if (typeof h === 'string') lastHint = h;
  }
  if (!lastHint && track.nextHint) lastHint = typeof track.nextHint === 'function' ? track.nextHint(slug) : track.nextHint;
  return dir;
}

// ---------- prompts ----------

function promptDirs() {
  const dirs = [PATHS.prompts];
  if (existsSync(PATHS.tracks)) for (const d of readdirSync(PATHS.tracks)) { const p = join(PATHS.tracks, d, 'prompts'); if (existsSync(p)) dirs.push(p); }
  return dirs;
}

export function listPrompts() {
  return [...new Set(promptDirs().flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'))))];
}

export function renderPrompt(name, slug, { section } = {}) {
  const file = promptDirs().map((d) => join(d, `${name}.md`)).find((f) => existsSync(f)) || join(PATHS.prompts, `${name}.md`);
  if (!existsSync(file)) throw new Error(`no prompt "${name}" — available: ${listPrompts().join(', ')}`);
  const app = slug ? loadApp(slug) : null;
  const frames = loadFrames();
  const frameName = app ? frameOf(app.call.fm) : '';
  const frame = frameName ? frames.frames?.[frameName] : null;
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const vars = {
    FACTS: read(PATHS.facts),
    BLOCKS: read(PATHS.blocks),
    CALL: app ? read(join(app.dir, 'call.md')) : '',
    DRAFT: app ? read(join(app.dir, 'draft.md')) : '',
    FRAME: frame ? `${frameName}: ${frame.label}\nLead with: ${frame.lead.join('; ')}\nNever mention: ${[...(frames.global_banned || []), ...frame.banned].join(', ')}` : '(no frame set)',
    SECTION: section || '(all sections)',
    PROGRAM: app?.call.fm.program || '',
    SOURCE: app ? read(join(app.dir, 'source.md')) : '',
  };
  return render(readFileSync(file, 'utf8'), vars);
}

// ---------- tracker ----------

export function buildTracker() {
  const rows = listApps().map((slug) => {
    const { call } = loadApp(slug);
    const f = call.fm;
    let due = String(f.deadline || 'rolling');
    const t = parseDeadline(due);
    if (t != null && !Number.isNaN(t)) due = `${due.slice(0, 10)} (${Math.round((t - now().getTime()) / 86400000)}d)`;
    return { slug, program: f.program || slug, track: f.track || '', status: f.status || '', due, next: f.next || '', url: f.url || '' };
  });
  const order = (s) => ['ready', 'in-review', 'drafting', 'researching', 'submitted', 'won', 'lost', 'parked'].indexOf(s);
  rows.sort((a, b) => order(a.status) - order(b.status) || a.due.localeCompare(b.due));
  const lines = [
    '# Funding tracker',
    '',
    '_Generated by `node bin/fund.mjs tracker` — edit each application\'s `call.md` frontmatter, not this file._',
    '',
    '| Program | Track | Status | Deadline | Next action | Folder |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.url ? `[${r.program}](${r.url})` : r.program} | ${r.track} | ${r.status} | ${r.due} | ${r.next} | \`applications/${r.slug}\` |`),
    '',
  ];
  writeFileSync(PATHS.tracker, lines.join('\n'));
  return rows;
}

export const CORE = {
  ROOT, PATHS, STATUSES, STRICT, CLOSED, now, parseDeadline, unwrapFence, scaffoldHint, parseFrontmatter, stringifyFrontmatter, updateFrontmatter, loadFacts, loadFrames,
  loadApp, listApps, appDir, parseSections, parseCriteria, stripNonProse, sentences, findBanned, placeholderWorstCase, filledLength,
  coreChecks, runChecks, loadTracks, scaffold, render, renderPrompt, listPrompts, buildTracker,
};
