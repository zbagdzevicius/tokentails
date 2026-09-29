// Track B — Quick rolling forms.
// A short online form is described once in form.md (one row per field), answered from pre-approved
// blocks, facts, call.md frontmatter or answers.md, and turned into a copy-paste sheet by b:fill.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE } from '../../lib/core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TYPES = ['text', 'longtext', 'url', 'select', 'number', 'email-role'];
const PROSE = new Set(['text', 'longtext']);
const CLOSED = new Set(['submitted', 'won', 'lost', 'parked']);
const STRICT = new Set(['in-review', 'ready']); // same statuses the core treats as strict
const PLACEHOLDER = /\b(TODO|TBD|XXX|FIXME|lorem ipsum)\b|\{\{[^}]+\}\}/;
const ROLE_LOCALS = new Set([
  'hello', 'hi', 'info', 'team', 'contact', 'grants', 'grant', 'funding', 'partners', 'partnerships',
  'bd', 'business', 'founders', 'support', 'press', 'media', 'admin', 'office', 'dev', 'developers', 'studio', 'games',
]);
// Core check names that are fixable by editing answers.md (vs. needing someone else to act).
const ANSWER_FIXABLE = new Set([
  'citations', 'banned-terms', 'limits', 'placeholders', 'empty-sections', 'draft', 'criteria',
  'B:required', 'B:limits', 'B:types', 'B:content', 'B:fresh',
]);

// ---------- parsing ----------

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function parseLimit(type, raw) {
  const v = (raw || '').trim();
  if (type === 'select') return { options: v && v !== '-' ? v.split('/').map((s) => s.trim()).filter(Boolean) : [] };
  if (!v || v === '-') return {};
  let m = /^(\d+)\s*w(?:ords?)?$/i.exec(v);
  if (m) return { words: Number(m[1]) };
  m = /^(\d+)\s*(?:c|chars?)?$/i.exec(v);
  if (m) return { chars: Number(m[1]) };
  return { error: `limit "${v}" must be N (chars) or Nw (words)` };
}

export function parseSource(raw) {
  const v = (raw || '').trim();
  let m;
  if (v === 'answer' || v === '') return { kind: 'answer' };
  if ((m = /^block:(?:([a-z0-9-]+)\/)?(.+)$/i.exec(v))) return { kind: 'block', frame: m[1] || null, heading: m[2].trim() };
  if ((m = /^fact:(F-\d{3})$/.exec(v))) return { kind: 'fact', id: m[1] };
  if ((m = /^fm:([A-Za-z0-9_-]+)$/.exec(v))) return { kind: 'fm', key: m[1] };
  return { kind: 'invalid', error: `source "${v}" must be block:<frame>/<Heading>, fact:F-###, answer or fm:<key>` };
}

const parseRequired = (v) => /^(yes|y|true|required|1|x|✓)$/i.test((v || '').trim());

// form.md: optional frontmatter, then "| id | label | type | limit | required | source | [criterion] |".
export function parseForm(text) {
  const { fm, body } = CORE.parseFrontmatter(text);
  const fields = [];
  const errors = [];
  let sawHeader = false;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const c = cells(line);
    if (c.every((x) => /^:?-{2,}:?$/.test(x) || x === '')) continue;
    // header row is "| id | label | ..." — a real field may itself be called "id", so match two cells
    if (c[0].toLowerCase() === 'id' && (c[1] || '').toLowerCase() === 'label') { sawHeader = true; continue; }
    if (c.length < 6) { errors.push(`row "${line.trim().slice(0, 60)}" has ${c.length} cells, needs 6`); continue; }
    const [id, label, typeRaw, limitRaw, req, srcRaw, crit] = c;
    const type = typeRaw.toLowerCase();
    const f = { id, label: label || id, type, limitRaw, required: parseRequired(req), sourceRaw: srcRaw, criteria: crit ? crit.split(',').map((s) => s.trim()).filter(Boolean) : [] };
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) errors.push(`field id "${id}" must be letters, digits, - or _`);
    if (fields.some((x) => x.id === id)) errors.push(`duplicate field id "${id}"`);
    if (!TYPES.includes(type)) errors.push(`${id}: type "${typeRaw}" is not one of ${TYPES.join(', ')}`);
    const lim = parseLimit(type, limitRaw);
    if (lim.error) errors.push(`${id}: ${lim.error}`);
    Object.assign(f, { chars: lim.chars ?? null, words: lim.words ?? null, options: lim.options || [] });
    f.source = parseSource(srcRaw);
    if (f.source.kind === 'invalid') errors.push(`${id}: ${f.source.error}`);
    fields.push(f);
  }
  if (!fields.length && !errors.length) {
    errors.push(sawHeader ? 'the field table has no rows — add one row per field on the live form'
      : 'no "| id | label | type | limit | required | source |" table found');
  }
  return { fm, fields, errors };
}

// BLOCKS.md: "## <frame>" then paragraphs starting with "**Heading.**".
export function parseBlocks(text) {
  const frames = new Map();
  let cur = null;
  let para = [];
  const flush = () => {
    if (!cur || !para.length) { para = []; return; }
    const p = para.join(' ').replace(/\s+/g, ' ').trim();
    const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(p);
    if (m) {
      const heading = m[1].trim().replace(/[.:]$/, '');
      frames.get(cur).set(heading.toLowerCase(), { heading, text: m[2].trim() });
    }
    para = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { flush(); cur = h[1].trim(); if (!frames.has(cur)) frames.set(cur, new Map()); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return frames;
}

// answers.md: "### <field id>" headings; HTML comments are guidance and are ignored.
// Any other heading ("## Notes", "#### x") ends the answer, so internal notes never reach the paste sheet.
export function answerSections(text) {
  const out = [];
  for (const part of String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/^### /m).slice(1)) {
    const nl = part.indexOf('\n');
    const id = (nl === -1 ? part : part.slice(0, nl)).replace(/<!--[\s\S]*?-->/g, '').trim();
    let body = nl === -1 ? '' : part.slice(nl + 1);
    const stray = /^#{1,6}\s/m.exec(body.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/#/g, ' ')));
    if (stray) body = body.slice(0, stray.index);
    out.push({ id, text: normalize(body) });
  }
  return out;
}

export function parseAnswers(text) {
  return new Map(answerSections(text).map((a) => [a.id, a.text]));
}

// Paragraphs are separated by a blank line; hard-wrapped lines are joined, but a line that starts a
// list item ("- ", "* ", "• ", "1. ", "2) ") keeps its line break so bullet lists paste as lists.
const LIST_ITEM = /^(?:[-*•]|\d+[.)])\s+/;
export function normalize(text) {
  return String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
      .reduce((acc, l) => (acc === '' ? l : `${acc}${LIST_ITEM.test(l) ? '\n' : ' '}${l}`), ''))
    .filter(Boolean)
    .join('\n\n');
}

export const toPaste = (s) => s.replace(/[ \t]*\[F-\d{3}\]/g, '').replace(/[ \t]+([.,;:!?)])/g, '$1').replace(/[ \t]{2,}/g, ' ')
  .split('\n').map((l) => l.trim()).join('\n').trim();

// AI replies often wrap the answers in a ```markdown fence or decorate the heading ("### `d`",
// "### d — Desc"). Drop fence lines and keep the first token of each heading as the field id.
export function parseAIAnswers(text) {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n')
    .split('\n').filter((l) => !/^\s*(```|~~~)/.test(l)).join('\n')
    .replace(/^###\s+[*_`]*([A-Za-z0-9][A-Za-z0-9_-]*)[*_`]*.*$/gm, '### $1')
    // "[F-015, F-016]" → "[F-015] [F-016]" (models often merge citations; the core only reads single ones)
    .replace(/\[(F-\d{3}(?:\s*[,;]\s*F-\d{3})+)\]/g, (m, ids) => ids.split(/\s*[,;]\s*/).map((id) => `[${id}]`).join(' '));
  return parseAnswers(clean);
}
const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// ---------- resolution ----------

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8').replace(/^\uFEFF/, '') : '');

export function resolve(slug, ctx = {}) {
  const app = ctx.app || CORE.loadApp(slug);
  const facts = ctx.facts || CORE.loadFacts().facts;
  const frames = ctx.frames || CORE.loadFrames();
  const blocks = parseBlocks(read(CORE.PATHS.blocks));
  const formFile = join(app.dir, 'form.md');
  const res = { app, formFile, exists: existsSync(formFile), fields: [], formErrors: [] };
  if (!res.exists) return res;
  const form = parseForm(read(formFile));
  res.form = form;
  res.formErrors = form.errors;
  const answerList = answerSections(read(join(app.dir, 'answers.md')));
  const answers = new Map(answerList.map((a) => [a.id, a.text]));
  res.answerWarnings = answerIdWarnings(answerList, form.fields);
  const frame = app.call.fm.frame || '';

  for (const f of form.fields) {
    const r = { ...f, value: '', via: '', problems: [], warnings: [] };
    const bad = (kind, msg) => r.problems.push({ kind, msg });
    const src = f.source;

    // 1. the declared source (always validated, so a broken reference is caught even when overridden)
    let fromSource = '';
    if (src.kind === 'block') {
      const fr = src.frame || frame;
      const b = fr ? blocks.get(fr)?.get(src.heading.toLowerCase()) : null;
      if (!fr) bad('ref', `block "${src.heading}" has no frame (set frame in call.md or write block:<frame>/${src.heading})`);
      else if (!blocks.has(fr)) bad('ref', `frame "${fr}" has no section in BLOCKS.md`);
      else if (!b) bad('ref', `block "${fr}/${src.heading}" not in BLOCKS.md (have: ${[...blocks.get(fr).values()].map((x) => x.heading).join(', ') || 'none'})`);
      else fromSource = b.text;
    } else if (src.kind === 'fact') {
      const fact = facts.get(src.id);
      if (!fact) bad('ref', `fact ${src.id} not in FACTS.md`);
      else if (fact.status === 'retired') bad('ref', `fact ${src.id} is retired`);
      else fromSource = `${fact.value} [${src.id}]`;
    } else if (src.kind === 'fm') {
      const v = app.call.fm[src.key] ?? form.fm[src.key];
      fromSource = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
    }

    // 2. answers.md overrides any source when it has a real (non-placeholder) answer
    const ans = answers.get(f.id) || '';
    if (ans && !PLACEHOLDER.test(ans)) { r.value = ans; r.via = src.kind === 'answer' ? 'answer' : `answer (overrides ${f.sourceRaw})`; }
    else if (fromSource) { r.value = fromSource; r.via = f.sourceRaw; }

    if (f.type !== 'longtext') r.value = r.value.replace(/\s+/g, ' ').trim();

    // "TODO: <what is missing>" is how b:answer's prompt tells the AI to give up — surface the reason
    // (a bare "TODO" stub has no reason and is simply empty)
    r.todo = ans && PLACEHOLDER.test(ans) ? todoReason(ans) : '';
    if (!r.value) {
      const hint = r.todo ? `answers.md "### ${f.id}" still has "TODO: ${r.todo.slice(0, 80)}" — finish it by hand`
        : src.kind === 'fm' ? `set "${src.key}:" in call.md frontmatter` : `write "### ${f.id}" in answers.md`;
      const state = r.todo ? 'unfinished' : 'empty';
      if (!r.problems.length) (f.required ? bad('missing', `required, ${state} — ${hint}`) : r.warnings.push(`optional, ${state} — ${hint}`));
    } else {
      // type rules run on the pasted text, so a fact:F-### source ("542,000 [F-001]") is a valid number
      const pv = toPaste(r.value);
      if (f.type === 'url' && !/^https?:\/\/\S+$/.test(pv)) bad('type', `"${pv}" is not an http(s) URL`);
      if (f.type === 'number' && !/^\d[\d,]*(\.\d+)?$/.test(pv)) bad('type', `"${pv}" is not a plain number`);
      if (f.type === 'email-role') {
        const m = /^([a-z0-9._+-]+)@[a-z0-9.-]+\.[a-z]{2,}$/i.exec(pv);
        if (!m) bad('type', `"${pv}" is not an email address`);
        else if (!ROLE_LOCALS.has(m[1].toLowerCase())) bad('type', `"${m[1]}@…" looks personal — use a role address (${[...ROLE_LOCALS].slice(0, 6).join(', ')}, …)`);
      }
      if (f.type === 'select' && f.options.length) {
        // tolerate the stray full stop, quotes or bold an AI tends to add around the option
        const bare = pv.replace(/^[\s"'`*]+|[\s"'`*.!]+$/g, '').toLowerCase();
        const hit = f.options.find((o) => o.toLowerCase() === bare);
        if (!hit) bad('type', `"${pv}" is not one of ${f.options.join(' / ')}`);
        else r.value = hit;
      }
      // non-prose fields skip the core content rules, but any fact they cite must still be usable
      if (!PROSE.has(f.type)) {
        const strict = STRICT.has(app.call.fm.status || 'researching');
        for (const id of new Set(r.value.match(/F-\d{3}/g) || [])) {
          const fact = facts.get(id);
          if (!fact) bad('ref', `cites unknown fact ${id}`);
          else if (fact.status === 'retired') bad('ref', `cites retired fact ${id}`);
          else if (['unverified', 'sei-era'].includes(fact.status)) {
            const msg = `${fact.status} fact ${id} — verify it in FACTS.md before pasting`;
            strict ? bad('soft', msg) : r.warnings.push(msg);
          }
        }
      }
      // content rules (prose only): citations, fact status, banned terms — reuses the core checks
      if (PROSE.has(f.type)) {
        const text = r.value;
        const section = { title: f.label, criteria: [], limit: null, words: null, text, chars: text.length, wordCount: countWords(text) };
        for (const c of CORE.coreChecks({ call: app.call, sections: [section], criteria: [] }, { facts, frames })) {
          if (c.level === 'ok') continue;
          const detail = c.detail.replace(/\n\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
          if (c.name === 'citations' || c.name === 'banned-terms') c.level === 'error' ? bad('content', `${c.name}: ${detail}`) : r.warnings.push(detail);
          else if (c.name === 'facts-exist' || c.name === 'facts-retired') bad('ref', detail);
          else if (c.name === 'facts-soft') c.level === 'error' ? bad('soft', detail) : r.warnings.push(detail);
          else if (c.name === 'placeholders' && c.level === 'error') bad('content', `placeholder text`);
        }
      }
    }

    r.paste = toPaste(r.value);
    // toPaste only strips well-formed [F-###]; anything else would be pasted into the live form
    const broken = r.paste.match(/\[[^\]\n]*\bF-?\d+[^\]\n]*\]|\bF-\d{2,}\b/g);
    if (broken) bad('content', `malformed citation ${[...new Set(broken)].map((x) => `"${x}"`).join(', ')} would be pasted — write one [F-###] per fact, e.g. [F-015] [F-016]`);
    r.charCount = r.paste.length;
    r.wordCount = countWords(r.paste);
    r.cites = [...new Set(r.value.match(/F-\d{3}/g) || [])];
    if (r.value && f.chars && r.charCount > f.chars) bad('limit', `${r.charCount}/${f.chars} chars (cut ${r.charCount - f.chars})`);
    if (r.value && f.words && r.wordCount > f.words) bad('limit', `${r.wordCount}/${f.words} words (cut ${r.wordCount - f.words})`);
    r.ok = r.problems.length === 0;
    res.fields.push(r);
  }
  res.ok = !res.formErrors.length && res.fields.every((x) => x.ok);
  return res;
}

export function todoReason(text) {
  const m = /\b(?:TODO|TBD|XXX|FIXME)\b[\s:—-]*([^\n]*)/i.exec(String(text));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// answers.md sections that no field uses (a typo'd id silently drops the answer) or that repeat.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

export function answerIdWarnings(answerList, fields) {
  const ids = fields.map((f) => f.id);
  const out = [];
  const seen = new Map();
  for (const a of answerList) seen.set(a.id, (seen.get(a.id) || 0) + 1);
  for (const [id, n] of seen) {
    if (n > 1) out.push(`"### ${id}" appears ${n} times — only the last one is used`);
    if (ids.includes(id)) continue;
    const near = ids.find((x) => x.toLowerCase() === id.toLowerCase())
      || ids.filter((x) => !seen.has(x)).find((x) => editDistance(x.toLowerCase(), id.toLowerCase()) <= 2);
    out.push(`"### ${id}" matches no field in form.md${near ? ` — did you mean "### ${near}"?` : ''} (ignored)`);
  }
  return out;
}

// b: commands only touch Track B apps; a BOM or broken frontmatter makes call.md look trackless.
export function notTrackB(app) {
  if (app.call.fm.track === 'B') return '';
  const raw = read(join(app.dir, 'call.md'));
  const rawHasBom = existsSync(join(app.dir, 'call.md')) && readFileSync(join(app.dir, 'call.md'), 'utf8').startsWith('\uFEFF');
  if (rawHasBom) return `${app.slug}: call.md starts with a byte-order mark, so its frontmatter is unreadable — re-save it as UTF-8 without BOM`;
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(raw)) return `${app.slug}: call.md has no readable "---" frontmatter block — fix it (track: B, status, frame, deadline) and re-run`;
  return `${app.slug} is a Track ${app.call.fm.track || '?'} application (call.md track:), not Track B — b: commands only write Track B apps`;
}

// ---------- output ----------

const limitText = (f) => (f.chars ? `${f.charCount}/${f.chars} chars` : f.words ? `${f.wordCount}/${f.words} words` : `${f.charCount} chars`);

export function estimateMinutes(res) {
  let m = 3; // open the form, sign in, final read
  for (const f of res.fields) {
    m += f.type === 'longtext' ? 1 : 0.25;
    if (!f.ok) m += 4; // b:answer + human read
  }
  m += res.formErrors.length * 5;
  return Math.ceil(m);
}

function fence(text) {
  const f = text.includes('```') ? '~~~~' : '```';
  return `${f}text\n${text}\n${f}`;
}

export function renderFill(res) {
  const { app } = res;
  const fm = app.call.fm;
  const ready = res.fields.filter((f) => f.ok).length;
  const L = [
    `# ${fm.program || app.slug} — paste sheet`,
    '',
    `_Generated by \`node bin/fund.mjs b:fill ${app.slug}\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Edit answers.md or form.md and re-run; never edit this file._`,
    '',
    `Form: ${fm.url || '(no url in call.md)'} · frame: ${fm.frame || 'none'} · ${ready}/${res.fields.length} fields ready · about ${estimateMinutes(res)} min to submit`,
    '',
  ];
  const failing = res.fields.filter((f) => !f.ok);
  for (const w of res.answerWarnings || []) L.push(`> ! answers.md: ${w}`, '');
  if (res.formErrors.length || failing.length) {
    L.push('## Fix before pasting', '');
    for (const e of res.formErrors) L.push(`- form.md: ${e}`);
    for (const f of failing) for (const p of f.problems) L.push(`- **${f.label}** (\`${f.id}\`): ${p.msg}`);
    L.push('');
  }
  L.push('| # | Field | Type | Count | OK |', '|---|---|---|---|---|');
  res.fields.forEach((f, i) => L.push(`| ${i + 1} | ${f.label}${f.required ? ' *' : ''} | ${f.type} | ${limitText(f)} | ${f.ok ? '✓' : '✗'} |`));
  L.push('');
  res.fields.forEach((f, i) => {
    L.push(`## ${i + 1}. ${f.label}${f.required ? ' *' : ''}`, '');
    L.push(`\`${f.id}\` · ${f.type}${f.options.length ? ` (${f.options.join(' / ')})` : ''} · ${limitText(f)} · ${f.ok ? '✓' : '✗'} · from ${f.via || f.sourceRaw}${f.cites.length ? ` · facts ${f.cites.join(', ')}` : ''}`, '');
    L.push(f.paste ? fence(f.paste) : '_(empty)_', '');
    for (const w of f.warnings) L.push(`> ! ${w}`, '');
  });
  return L.join('\n');
}

// draft.md mirror: prose fields as "## " sections so `fund check` runs the core rules on the real text.
export function renderDraftMirror(res) {
  const fm = res.app.call.fm;
  const other = res.fields.filter((f) => !PROSE.has(f.type) && f.value).map((f) => `${f.id}: ${f.value}`);
  const L = [
    CORE.stringifyFrontmatter({ program: fm.program || res.app.slug, generated: 'b:fill' }),
    `# ${fm.program || res.app.slug} — form answers`,
    '',
    `Mirror of form.md + answers.md, regenerated by \`b:fill\` so \`fund check\` sees the real text. Edit answers.md, not this file.`,
    '',
  ];
  if (other.length) L.push('```fields', ...other, '```', '');
  for (const f of res.fields.filter((x) => PROSE.has(x.type) && x.value)) {
    const meta = [`field: ${f.id}`];
    if (f.criteria.length) meta.push(`criterion: ${f.criteria.join(', ')}`);
    L.push(`## ${f.label} <!-- ${meta.join(' | ')} -->`, f.value, '');
  }
  return L.join('\n');
}

const comparable = (s) => s.replace(/\r\n?/g, '\n').split('\n').filter((l) => !l.startsWith('_Generated by')).join('\n').trim();

// Which generated files differ from what b:fill would write for this resolution.
export function staleFiles(res) {
  const out = [];
  if (comparable(read(join(res.app.dir, 'fill.md'))) !== comparable(renderFill(res))) out.push('fill.md');
  if (comparable(read(join(res.app.dir, 'draft.md'))) !== comparable(renderDraftMirror(res))) out.push('draft.md');
  return out;
}

export function fill(slug, { write = true } = {}) {
  const res = resolve(slug);
  if (!res.exists) return res;
  if (write) {
    writeFileSync(join(res.app.dir, 'draft.md'), renderDraftMirror(res));
    writeFileSync(join(res.app.dir, 'fill.md'), renderFill(res));
  }
  return res;
}

// ---------- form.md generation ----------

export function parseFieldSpec(spec) {
  const out = [];
  const errors = [];
  for (const raw of String(spec || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const parts = raw.split(':');
    const [id, label = id, type = 'text', limit = '', required = 'yes'] = parts.map((p) => p.trim());
    const source = parts.slice(5).join(':').trim() || 'answer';
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) { errors.push(`"${raw}": bad id "${id}"`); continue; }
    if (!TYPES.includes(type.toLowerCase())) { errors.push(`"${raw}": type "${type}" is not one of ${TYPES.join(', ')}`); continue; }
    const lim = parseLimit(type.toLowerCase(), limit);
    if (lim.error) { errors.push(`"${raw}": ${lim.error}`); continue; }
    const src = parseSource(source);
    if (src.kind === 'invalid') { errors.push(`"${raw}": ${src.error}`); continue; }
    out.push({ id, label, type: type.toLowerCase(), limit, required: parseRequired(required) ? 'yes' : 'no', source });
  }
  return { fields: out, errors };
}

const esc = (s) => String(s).replace(/\|/g, '\\|');
export const formRow = (f) => `| ${f.id} | ${esc(f.label)} | ${f.type} | ${esc(f.limit || '')} | ${f.required} | ${f.source} |`;
export const FORM_HEADER = '| id | label | type | limit | required | source |\n|---|---|---|---|---|---|';

export function stubAnswers(ids, existing) {
  const have = parseAnswers(existing);
  const add = ids.filter((id) => !have.has(id));
  return add.map((id) => `\n### ${id}\n\nTODO\n`).join('');
}

// Replace or append "### id" sections in answers.md.
export function mergeAnswers(text, updates) {
  const chunks = text.split(/^(?=### )/m);
  const done = new Set();
  const out = chunks.map((ch) => {
    if (!ch.startsWith('### ')) return ch;
    const id = ch.slice(4, ch.indexOf('\n') === -1 ? undefined : ch.indexOf('\n')).replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!updates.has(id)) return ch;
    done.add(id);
    return `### ${id}\n\n${updates.get(id)}\n\n`;
  });
  let s = out.join('');
  for (const [id, body] of updates) if (!done.has(id)) s = `${s.replace(/\s*$/, '\n')}\n### ${id}\n\n${body}\n`;
  return s;
}

// ---------- batch ----------

export async function batch({ write = true } = {}) {
  const rows = [];
  const done = [];
  const skipped = [];
  for (const slug of CORE.listApps()) {
    const app = CORE.loadApp(slug);
    if (app.call.fm.track !== track.id) {
      // a form.md next to a trackless call.md is almost always a Track B app with broken frontmatter
      if (!app.call.fm.track && existsSync(join(app.dir, 'form.md'))) skipped.push({ slug, why: notTrackB(app) });
      continue;
    }
    const status = app.call.fm.status || 'researching';
    if (CLOSED.has(status)) { done.push({ slug, program: app.call.fm.program || slug, status }); continue; }
    const res = fill(slug, { write });
    const { results } = await CORE.runChecks(slug, { tracks: { [track.id]: track } });
    const errs = results.filter((r) => r.level === 'error');
    const blockers = [
      ...(!res.exists ? ['no form.md'] : []),
      ...res.formErrors.map((e) => `form.md: ${e}`),
      ...res.fields.flatMap((f) => f.problems.filter((p) => p.kind === 'ref' || p.kind === 'soft').map((p) => `${f.id}: ${p.msg}`)),
      ...errs.filter((r) => !ANSWER_FIXABLE.has(r.name) && !r.name.startsWith('B:')).map((r) => `${r.name}: ${r.detail.split('\n')[0]}`),
    ];
    const needs = res.fields.filter((f) => !f.ok && !f.problems.some((p) => p.kind === 'ref' || p.kind === 'soft'));
    const bucket = blockers.length ? 'blocked' : needs.length || errs.length ? 'needs answers' : 'ready to paste';
    const next = bucket === 'ready to paste'
      ? `paste applications/${slug}/fill.md, then: node bin/fund.mjs status ${slug} submitted`
      : bucket === 'needs answers'
        ? `node bin/fund.mjs b:answer ${slug} --run && node bin/fund.mjs b:fill ${slug}`
        : `fix ${blockers[0].slice(0, 110)}, then: node bin/fund.mjs b:fill ${slug}`;
    rows.push({
      slug, program: app.call.fm.program || slug, status, deadline: app.call.fm.deadline || 'rolling', bucket,
      ready: res.fields.filter((f) => f.ok).length, total: res.fields.length,
      minutes: res.exists ? estimateMinutes(res) : 10,
      todo: needs.map((f) => f.id), blockers, next,
    });
  }
  const rank = { 'ready to paste': 0, 'needs answers': 1, blocked: 2 };
  const dl = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? Infinity : t; };
  rows.sort((a, b) => rank[a.bucket] - rank[b.bucket] || dl(a.deadline) - dl(b.deadline) || a.minutes - b.minutes || a.slug.localeCompare(b.slug));
  const total = rows.filter((r) => r.bucket !== 'blocked').reduce((s, r) => s + r.minutes, 0);
  const md = [
    '# Track B batch',
    '',
    `_Generated by \`node bin/fund.mjs b:batch\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC._`,
    '',
    `${rows.filter((r) => r.bucket === 'ready to paste').length} ready · ${rows.filter((r) => r.bucket === 'needs answers').length} need answers · ${rows.filter((r) => r.bucket === 'blocked').length} blocked · about ${total} min for everything not blocked`,
    '',
    '| Readiness | Program | Fields | Est. min | Deadline | Next |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.bucket} | ${r.program} (\`${r.slug}\`) | ${r.ready}/${r.total} | ${r.minutes} | ${r.deadline} | ${esc(r.next)}${r.todo.length ? ` — fields: ${r.todo.join(', ')}` : ''} |`),
    '',
  ];
  if (done.length) md.push('Closed: ' + done.map((d) => `${d.program} (${d.status})`).join(', '), '');
  if (skipped.length) md.push('Skipped (unreadable call.md): ' + skipped.map((x) => `\`${x.slug}\``).join(', '), '');
  const file = join(CORE.PATHS.apps, 'B-BATCH.md');
  if (write) writeFileSync(file, md.join('\n'));
  return { rows, done, skipped, file, total };
}

// ---------- checks ----------

function checkApp({ app, facts, frames }) {
  const out = [];
  const add = (name, level, detail = '') => out.push({ name, level, detail });
  const res = resolve(app.slug, { app, facts, frames });
  if (!res.exists) { add('form', 'error', `no form.md — run: node bin/fund.mjs b:new-form ${app.slug} --fields "id:Label:text:140:yes;..."`); return out; }
  if (res.formErrors.length) add('form', 'error', res.formErrors.join('; '));
  else if (!res.fields.length) add('form', 'error', 'form.md has no fields');
  else add('form', 'ok', `${res.fields.length} field(s)`);

  const by = (kind) => res.fields.flatMap((f) => f.problems.filter((p) => p.kind === kind).map((p) => `${f.id}: ${p.msg}`));
  const report = (name, kind, okText) => { const l = by(kind); add(name, l.length ? 'error' : 'ok', l.length ? l.join('; ') : okText); };
  report('sources', 'ref', 'all blocks and facts exist');
  report('required', 'missing', `${res.fields.filter((f) => f.required).length} required field(s) resolved`);
  if (res.answerWarnings.length) add('answers', 'warn', res.answerWarnings.join('; '));
  const optional = res.fields.flatMap((f) => f.warnings.filter((w) => w.startsWith('optional')).map(() => f.id));
  if (optional.length) add('optional', 'warn', `empty: ${optional.join(', ')}`);
  report('limits', 'limit', `${res.fields.filter((f) => f.chars || f.words).length} limited field(s) within bounds`);
  report('types', 'type', 'url, number, select and email-role values valid');
  const content = [...by('content'), ...by('soft')];
  const soft = res.fields.flatMap((f) => f.warnings.filter((w) => !w.startsWith('optional')).map((w) => `${f.id}: ${w}`));
  if (content.length) add('content', 'error', content.join('; '));
  else if (soft.length) add('content', 'warn', soft.join('; '));
  else add('content', 'ok', 'numbers cited, no banned terms');

  // freshness: fill.md and the draft.md mirror must match what b:fill would write now. Compared by
  // content, not mtime, so a changed call.md value (ask, contact), block, fact or a git checkout is caught.
  const status = app.call.fm.status || 'researching';
  const strict = status === 'ready';
  const stale = staleFiles(res);
  if (stale.includes('fill.md') && !existsSync(join(app.dir, 'fill.md'))) add('fresh', strict ? 'error' : 'warn', `no fill.md — run: node bin/fund.mjs b:fill ${app.slug}`);
  else if (stale.length) add('fresh', strict ? 'error' : 'warn', `${stale.join(' and ')} out of date with form.md, answers.md, call.md, blocks or facts — run: node bin/fund.mjs b:fill ${app.slug}`);
  else add('fresh', 'ok', 'fill.md is current');
  return out;
}

// ---------- commands ----------

const log = (...a) => console.log(...a);
let scaffoldQuiet = false; // b:new-form prints its own next step

async function cmdFill({ args }) {
  const slug = args[0];
  if (!slug) { console.error('usage: b:fill <slug>'); return 2; }
  const wrong = notTrackB(CORE.loadApp(slug));
  if (wrong) { console.error(wrong); return 1; }
  const res = fill(slug);
  if (!res.exists) { console.error(`${slug}: no form.md\nnext: node bin/fund.mjs b:new-form ${slug} --fields "id:Label:text:140:yes;..."`); return 1; }
  for (const f of res.fields) log(`  ${f.ok ? '✓' : '✗'} ${f.id.padEnd(14)} ${limitText(f).padEnd(18)} ${f.ok ? f.via : f.problems.map((p) => p.msg).join('; ')}`);
  for (const e of res.formErrors) log(`  ✗ form.md        ${e}`);
  for (const w of res.answerWarnings) log(`  ! answers.md     ${w}`);
  const failing = res.fields.filter((f) => !f.ok);
  log(`\nwrote applications/${slug}/fill.md and draft.md — ${res.fields.length - failing.length}/${res.fields.length} fields ready, about ${estimateMinutes(res)} min to submit`);
  const dl = res.app.call.fm.deadline;
  const t = dl && dl !== 'rolling' ? Date.parse(dl) : NaN;
  if (!Number.isNaN(t) && t < Date.now() && !CLOSED.has(res.app.call.fm.status)) {
    log(`! deadline ${dl} has passed — confirm the form is still open, then update deadline: in call.md (or: node bin/fund.mjs status ${slug} parked)`);
  }
  if (res.ok) {
    log(`next: node bin/fund.mjs check ${slug}   then paste fill.md and run: node bin/fund.mjs status ${slug} submitted`);
    return 0;
  }
  log(`${failing.length + res.formErrors.length} failure(s)`);
  const aiFixable = failing.some((f) => (PROSE.has(f.type) || f.type === 'select') && f.source.kind !== 'fm' && !f.todo
    && !f.problems.some((p) => p.kind === 'ref'));
  const fix = res.formErrors.length ? `fix applications/${slug}/form.md (or: node bin/fund.mjs b:new-form ${slug} --fields "...")`
    : aiFixable ? `node bin/fund.mjs b:answer ${slug} --run   (or edit applications/${slug}/answers.md)`
      : `edit applications/${slug}/answers.md or call.md`;
  log(`next: ${fix}, then node bin/fund.mjs b:fill ${slug}`);
  return 1;
}

async function cmdBatch() {
  const { rows, done, skipped, total } = await batch();
  for (const x of skipped) console.error(`! skipped ${x.why}`);
  if (!rows.length) { log('no open Track B applications\nnext: node bin/fund.mjs new <slug> --track B --program "Name" --url URL'); return 0; }
  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  log(`${w('READINESS', 15)} ${w('PROGRAM', 28)} ${w('FIELDS', 7)} ${w('MIN', 4)} NEXT`);
  for (const r of rows) log(`${w(r.bucket, 15)} ${w(r.program, 28)} ${w(`${r.ready}/${r.total}`, 7)} ${w(r.minutes, 4)} ${r.next}`);
  if (done.length) log(`closed: ${done.map((d) => d.slug).join(', ')}`);
  log(`\nwrote applications/B-BATCH.md — about ${total} min for everything not blocked`);
  const first = rows[0];
  log(`next: ${first.next}`);
  return 0;
}

async function cmdNewForm({ args, flags }) {
  const slug = args[0];
  if (!slug || typeof flags.fields !== 'string' || !flags.fields.trim()) {
    console.error('usage: b:new-form <slug> --fields "id:label:type:limit:required[:source];..." [--force] [--print] [--program "Name" --url URL --frame F --deadline D]');
    return 2;
  }
  const { fields, errors } = parseFieldSpec(flags.fields);
  if (errors.length) { for (const e of errors) console.error(`  ✗ ${e}`); return 1; }
  if (!fields.length) { console.error('  ✗ --fields has no fields'); return 1; }
  const dir = CORE.appDir(slug);
  if (existsSync(join(dir, 'call.md'))) {
    const wrong = notTrackB(CORE.loadApp(slug));
    if (wrong) { console.error(wrong); return 1; }
  }
  const formFile = join(dir, 'form.md');
  if (flags.print) { log(`${FORM_HEADER}\n${fields.map(formRow).join('\n')}`); return 0; }
  let fresh = false;
  if (!existsSync(join(dir, 'call.md'))) {
    fresh = true;
    scaffoldQuiet = true;
    try { await CORE.scaffold(slug, { track: track.id, program: flags.program, frame: flags.frame, deadline: flags.deadline, url: flags.url }); }
    finally { scaffoldQuiet = false; }
    log(`created applications/${slug} (track ${track.id})`);
    flags.force = true; // replace the template form with the given fields
  }
  let added = fields;
  if (existsSync(formFile) && !flags.force) {
    const cur = readFileSync(formFile, 'utf8');
    const have = new Set(parseForm(cur).fields.map((f) => f.id));
    added = fields.filter((f) => !have.has(f.id));
    const skipped = fields.filter((f) => have.has(f.id)).map((f) => f.id);
    if (skipped.length) log(`kept existing: ${skipped.join(', ')} (use --force to replace form.md)`);
    const lines = cur.replace(/\s*$/, '').split('\n');
    let last = -1;
    lines.forEach((l, i) => { if (l.trim().startsWith('|')) last = i; });
    if (last === -1) lines.push('', FORM_HEADER, ...added.map(formRow));
    else lines.splice(last + 1, 0, ...added.map(formRow));
    writeFileSync(formFile, lines.join('\n') + '\n');
  } else {
    const program = CORE.loadApp(slug).call.fm.program || slug;
    writeFileSync(formFile, `# ${program} — form spec\n\nOne row per form field. type: ${TYPES.join(' | ')}. limit: N chars or Nw words (select: option/option). source: block:<frame>/<Heading> | fact:F-### | answer | fm:<call.md key>.\n\n${FORM_HEADER}\n${fields.map(formRow).join('\n')}\n`);
  }
  const answersFile = join(dir, 'answers.md');
  const cur = (!fresh && read(answersFile)) || `# Answers — ${slug}\n\nOne "### <field id>" per field. Cite every number with [F-###]. An answer here overrides the field's source.\n`;
  const stubs = stubAnswers(added.filter((f) => f.source === 'answer').map((f) => f.id), cur);
  writeFileSync(answersFile, cur.replace(/\s*$/, '\n') + stubs);
  log(`form.md: ${added.length} field(s) written; answers.md: ${(stubs.match(/^### /gm) || []).length} stub(s) added`);
  log(`next: node bin/fund.mjs b:answer ${slug} --run   then node bin/fund.mjs b:fill ${slug}`);
  return 0;
}

export function answerPrompt(res, { all = false } = {}) {
  const fm = res.app.call.fm;
  const frames = CORE.loadFrames();
  const frame = frames.frames?.[fm.frame];
  const targets = res.fields.filter((f) => (PROSE.has(f.type) || f.type === 'select') && f.source.kind !== 'fm'
    && (all ? f.source.kind === 'answer' || !f.ok : !f.ok && !f.problems.some((p) => p.kind === 'ref')));
  const todo = targets.map((f) => {
    const lim = f.chars ? `max ${f.chars} characters` : f.words ? `max ${f.words} words` : 'no limit';
    const why = f.ok ? 'rewrite' : f.problems.map((p) => p.msg).join('; ');
    const opts = f.options.length ? `; must be exactly one of: ${f.options.join(' / ')}` : '';
    const cur = f.value ? `\n  current: ${f.value.replace(/\n+/g, ' ')}` : '';
    return `- ${f.id} — "${f.label}" (${f.type}, ${lim}${opts}; ${why})${cur}`;
  }).join('\n');
  const tpl = readFileSync(join(HERE, 'prompts', 'answer.md'), 'utf8');
  const vars = {
    PROGRAM: fm.program || res.app.slug,
    URL: fm.url || '',
    FRAME: frame ? `${fm.frame}: ${frame.label}\nLead with: ${frame.lead.join('; ')}\nNever mention: ${[...(frames.global_banned || []), ...frame.banned].join(', ')}` : '(no frame set)',
    FACTS: read(CORE.PATHS.facts),
    BLOCKS: read(CORE.PATHS.blocks),
    FORM: read(res.formFile),
    ANSWERS: read(join(res.app.dir, 'answers.md')),
    SOURCE: read(join(res.app.dir, 'source.md')),
    TODO: todo || '(none)',
  };
  return { prompt: CORE.render(tpl, vars), targets };
}

async function cmdAnswer({ args, flags, runAI }) {
  const slug = args[0];
  if (!slug) { console.error('usage: b:answer <slug> [--all] [--run] [--out FILE]'); return 2; }
  const wrong = notTrackB(CORE.loadApp(slug));
  if (wrong) { console.error(wrong); return 1; }
  const res = resolve(slug);
  if (!res.exists) { console.error(`${slug}: no form.md\nnext: node bin/fund.mjs b:new-form ${slug} --fields "..."`); return 1; }
  const { prompt, targets } = answerPrompt(res, { all: !!flags.all });
  if (!targets.length) { log(`${slug}: no answer fields need work (use --all to redraft every answer)\nnext: node bin/fund.mjs b:fill ${slug}`); return 0; }
  if (!flags.run) {
    if (flags.out && flags.out !== true) writeFileSync(flags.out, prompt); else process.stdout.write(prompt);
    console.error(`\n${targets.length} field(s): ${targets.map((f) => f.id).join(', ')}\nnext: node bin/fund.mjs b:answer ${slug} --run   (pipes to $FUND_AI_CMD)`);
    return 0;
  }
  const out = runAI(prompt, { label: `${slug}/answer`, model: 'sonnet' });
  const got = parseAIAnswers(out);
  const updates = new Map(targets.filter((f) => got.get(f.id)).map((f) => [f.id, got.get(f.id)]));
  const file = join(res.app.dir, 'answers.md');
  writeFileSync(file, mergeAnswers(read(file), updates));
  const missed = targets.filter((f) => !updates.has(f.id)).map((f) => f.id);
  const gaveUp = [...updates].filter(([, v]) => PLACEHOLDER.test(v));
  const real = [...updates.keys()].filter((id) => !gaveUp.some(([g]) => g === id));
  log(`answers.md: updated ${real.join(', ') || 'nothing'}${missed.length ? `; AI skipped ${missed.join(', ')}` : ''}`);
  for (const [id, v] of gaveUp) log(`  ! ${id}: AI could not answer from the facts — TODO: ${todoReason(v) || '(no reason given)'}`);
  if (gaveUp.length) log(`next: answer ${gaveUp.map(([id]) => `"### ${id}"`).join(', ')} by hand in applications/${slug}/answers.md (add the fact to FACTS.md first if it is a number), then node bin/fund.mjs b:fill ${slug}`);
  else if (!real.length) log(`next: re-run node bin/fund.mjs b:answer ${slug} --run, or write the answers by hand in applications/${slug}/answers.md`);
  else log(`next: node bin/fund.mjs b:fill ${slug}   (then read every answer before pasting)`);
  return real.length ? 0 : 1;
}

const track = {
  id: 'B',
  // fund loop rewrites draft.md; here draft.md is a mirror b:fill generates from answers.md.
  noLoop: 'draft.md is generated from answers.md by b:fill; improve an answer with fund b:answer <slug> --run (or edit answers.md), then fund run <slug>',
  name: 'Quick rolling forms',
  defaultFrame: 'game-studio',
  checks: [checkApp],
  // `fund new` prints the core's generic "extract" hint; Track B's loop starts from form.md instead.
  onScaffold: ({ slug }) => {
    if (scaffoldQuiet) return;
    console.log(`Track B: match form.md to the live form (or: node bin/fund.mjs b:new-form ${slug} --fields "id:Label:text:140:yes;..."),`
      + ` set ask:/contact: in call.md, then: node bin/fund.mjs b:answer ${slug} --run && node bin/fund.mjs b:fill ${slug}`);
  },
  commands: {
    'b:fill': { help: '<slug> — resolve form.md into a paste sheet (fill.md), enforce limits', run: cmdFill },
    'b:batch': { help: 'fill + check every Track B form, rank by readiness, write applications/B-BATCH.md', run: cmdBatch },
    'b:new-form': { help: '<slug> --fields "id:label:type:limit:required[:source];..." — create or extend form.md', run: cmdNewForm },
    'b:answer': { help: '<slug> [--run] [--all] — AI drafts missing/over-limit answers into answers.md', run: cmdAnswer },
  },
};

export default track;
