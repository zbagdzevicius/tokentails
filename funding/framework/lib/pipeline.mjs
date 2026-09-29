// Pipeline engine: plan → execute → verify. Interface fixed by lib/PIPELINE-CONTRACT.md.
//
// A pipeline is an ordered list of steps. Each step's done() looks only at the application folder
// (files, frontmatter, .fund/state.json) and says whether its evidence exists. runPipeline() runs
// auto/ai steps in order until a human step, a failure, --until or --max, re-checks done() after
// every run, and records timings in .fund/state.json. Nothing here submits, signs, sends or posts.

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAI as sessionsRunAI, usesOrc } from './commands/sessions.mjs';

// ---------- state ----------

const EMPTY_STATE = () => ({ version: 1, steps: {}, history: [] });
const HISTORY_CAP = 1000;

export function readState(dir) {
  const f = join(dir, '.fund', 'state.json');
  if (!existsSync(f)) return EMPTY_STATE();
  try {
    const s = JSON.parse(readFileSync(f, 'utf8'));
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    // Hand-edited or half-written files: keep only well-formed entries (an array "steps" would
    // silently drop every key on the next write; a null history entry would crash stats).
    const steps = {};
    if (isObj(s?.steps)) for (const [k, v] of Object.entries(s.steps)) if (isObj(v)) steps[k] = v;
    const history = Array.isArray(s?.history) ? s.history.filter((h) => isObj(h) && typeof h.step === 'string') : [];
    return { version: 1, steps, history };
  } catch {
    return EMPTY_STATE();
  }
}

export function writeState(dir, state) {
  mkdirSync(join(dir, '.fund'), { recursive: true });
  const out = { version: 1, steps: state.steps || {}, history: (state.history || []).slice(-HISTORY_CAP) };
  writeFileSync(join(dir, '.fund', 'state.json'), JSON.stringify(out, null, 2) + '\n');
}

export function markHumanDone(dir, stepId, note = '') {
  const state = readState(dir);
  const at = new Date().toISOString();
  const prev = state.steps[stepId] || {};
  state.steps[stepId] = { ...prev, status: 'done', human: true, doneAt: at, runs: (prev.runs || 0), last: note || 'marked done by a person' };
  state.history.push({ at, step: stepId, event: 'human-done', message: note || '' });
  writeState(dir, state);
  return state;
}

// ---------- file helpers (pure, used by done() detectors) ----------

const read = (ctx, name) => { const f = join(ctx.dir, name); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const mtime = (ctx, name) => { const f = join(ctx.dir, name); return existsSync(f) ? statSync(f).mtimeMs : null; };

function fileExists(ctx, name) { return existsSync(join(ctx.dir, name)); }
/** true when `a` exists and is newer than `b` (or `b` does not exist). */
function fileNewer(ctx, a, b) {
  const ta = mtime(ctx, a); const tb = mtime(ctx, b);
  if (ta == null) return false;
  return tb == null || ta > tb;
}
async function checkPasses(ctx) {
  try { return (await ctx.core.runChecks(ctx.slug, { tracks: ctx.tracks })).ok; } catch { return false; }
}

// Template lines in source.md (templates/source.md) that do not count as pasted call text.
const SOURCE_BOILERPLATE = [/^#/, /paste the full call text/i, /the extract prompt reads this file/i, /do not paste anything containing personal data/i];
const SOURCE_MIN_CHARS = 120;

function sourceText(ctx) {
  return read(ctx, 'source.md').split(/\r?\n/).filter((l) => l.trim() && !SOURCE_BOILERPLATE.some((re) => re.test(l.trim()))).join('\n').trim();
}

// Review rounds: "## Review — <ISO>" headings (written by `fund prompt review --run` and the engine).
function reviewRounds(ctx) {
  const text = read(ctx, 'review.md');
  const out = [];
  // "## Review — <ISO>" from the engine and `fund prompt review`, "## Review — <ISO> loop round N"
  // from `fund loop`: the first token after the dash is the timestamp.
  const re = /^## Review — (\S+)[^\n]*$/gm;
  let m; const marks = [];
  while ((m = re.exec(text))) marks.push({ at: m[1], index: m.index, end: re.lastIndex });
  marks.forEach((mk, i) => {
    const body = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].index : text.length);
    const t = Date.parse(mk.at);
    out.push({ at: mk.at, time: Number.isNaN(t) ? null : t, body, verdict: lastMatch(body, /(?<![A-Za-z])(FUND|BORDERLINE|REJECT)(?![A-Za-z])/g) });
  });
  return out;
}

function latestReview(ctx) { const r = reviewRounds(ctx); return r.length ? r[r.length - 1] : null; }

/** The latest review round, if it was written after draft.md last changed. */
function currentReview(ctx) {
  const r = latestReview(ctx);
  const d = mtime(ctx, 'draft.md');
  if (!r || r.time == null || d == null) return null;
  return r.time >= Math.floor(d) ? r : null;
}

function lastMatch(text, re) { let last = null; for (const m of text.matchAll(re)) last = m[1]; return last; }

function fitVerdict(ctx) {
  return lastMatch(read(ctx, 'fit.md'), /(?<![A-Za-z-])(NO-GO|GO-IF|GO)(?![A-Za-z])/g);
}

function humanMark(ctx, id) {
  const s = ctx.state?.steps?.[id];
  return s && s.status === 'done' && s.human ? s : null;
}

// Check results a revise pass can fix. The rest (deadline, status, frame, frontmatter, track,
// facts file) need a person, so they never trigger an AI rewrite.
const NOT_DRAFT_FIXABLE = new Set(['status', 'deadline', 'frame', 'frontmatter', 'track', 'facts-file']);

async function checkErrors(ctx) {
  try {
    const { results } = await ctx.core.runChecks(ctx.slug, { tracks: ctx.tracks });
    return results.filter((r) => r.level === 'error');
  } catch (e) {
    return [{ name: 'check', level: 'error', detail: `check threw: ${e.message}` }];
  }
}

const fixable = (errs) => errs.filter((e) => !NOT_DRAFT_FIXABLE.has(e.name));

/** Errors the strict gates (status ready) would raise now — previewed so the human read fixes them in one pass. */
async function strictErrors(ctx) {
  try {
    const { results } = await ctx.core.runChecks(ctx.slug, { tracks: ctx.tracks, status: 'ready' });
    return results.filter((r) => r.level === 'error');
  } catch (e) {
    return [{ name: 'check', level: 'error', detail: `check threw: ${e.message}` }];
  }
}
const briefErrors = (errs, n = 4) => errs.slice(0, n).map((e) => `${e.name} (${String(e.detail || '').split('\n')[0].slice(0, 140)})`).join('; ') + (errs.length > n ? `; +${errs.length - n} more` : '');
const fmtErrors = (errs) => errs.map((e) => `- ${e.name}: ${e.detail}`).join('\n');

function statusOf(ctx) { return ctx.app?.call?.fm?.status || 'researching'; }
const SUBMITTED = new Set(['submitted', 'won', 'lost']);

// ---------- AI plumbing ----------

// Through orc (a tracked Claude Code session) unless FUND_AI_CMD is set; see lib/commands/sessions.mjs.
function defaultRunAI(prompt, meta) { return sessionsRunAI(prompt, meta); }

/** Keep the old call.md/draft.md frontmatter keys the AI dropped (track, status, deadline...). */
function keepFrontmatter(ctx, file, text) {
  const { parseFrontmatter, stringifyFrontmatter } = ctx.core;
  const old = parseFrontmatter(read(ctx, file)).fm;
  const { fm, body } = parseFrontmatter(text);
  if (!Object.keys(old).length) return text;
  if (!Object.keys(fm).length) return stringifyFrontmatter(old) + text.replace(/^\s+/, '');
  const merged = { ...old, ...fm };
  for (const k of ['track', 'status', 'program']) if (old[k] !== undefined) merged[k] = old[k];
  return stringifyFrontmatter(merged) + body;
}

async function askAI(ctx, prompt) {
  const out = await ctx.runAI(prompt);
  const text = ctx.core.unwrapFence(String(out ?? ''));
  if (!text.trim()) throw new Error('AI returned nothing');
  return text;
}

function stamp() { return new Date().toISOString(); }

function writeReviewRound(ctx, text) {
  const demoted = text.replace(/^(#{1,2})(\s)/gm, '###$2');
  const prev = read(ctx, 'review.md');
  writeFileSync(join(ctx.dir, 'review.md'), `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}\n## Review — ${stamp()}\n\n${demoted.trim()}\n`);
}

function setStatus(ctx, from, to) {
  if (from.includes(statusOf(ctx))) ctx.core.updateFrontmatter(join(ctx.dir, 'call.md'), { status: to });
}

// ---------- the default steps ----------

const PLACEHOLDER_ROW = /replace with|verbatim quote|^\s*$/i;

function realCriteria(ctx) {
  return (ctx.app?.criteria || []).filter((c) => c.name && !PLACEHOLDER_ROW.test(c.quote || '') && !PLACEHOLDER_ROW.test(c.name));
}

function draftState(ctx) {
  const secs = ctx.app?.sections || [];
  if (!secs.length) return { done: false, reason: 'draft.md has no "## " sections' };
  const empty = secs.filter((s) => s.chars === 0 || /^(TODO|TBD)\b/i.test(s.text));
  if (empty.length) return { done: false, reason: `${empty.length}/${secs.length} section(s) empty or TODO: ${empty.slice(0, 3).map((s) => s.title).join(', ')}` };
  return { done: true, reason: `${secs.length} section(s), ${secs.reduce((n, s) => n + s.chars, 0)} chars` };
}

// ---------- agentic source: a Claude Code session fetches the call page ----------

function sourcePrompt(ctx) {
  const fm = ctx.app?.call?.fm || {};
  const file = join(ctx.dir, 'source.md');
  return `You are collecting the published text of a funding call so it can be analysed offline.

Program: ${fm.program || ctx.slug}
Call page: ${fm.url}

1. Fetch the call page with your web tools (WebFetch). Then fetch the pages it links to that belong to
   this same call: rules, guidelines, eligibility, evaluation criteria, FAQ, templates described in
   text. At most 8 pages. Skip login walls, forms and anything that needs an account.
2. Write everything you fetched to this exact file, replacing its contents:
   ${file}
   Format: markdown, starting with "# Source text — ${fm.program || ctx.slug}", then one
   "## <page title> (<url>)" section per page with the page's text as close to verbatim as you can
   (keep every number, date, limit, criterion and weight). No summaries instead of text.
3. Do not write, edit or delete any other file. Never submit, sign, register, apply, log in, send a
   message or post anything anywhere. Read only.
4. Leave out personal data (names, emails and phone numbers of individual people): write [redacted].
5. Reply with one line: "WROTE <pages> pages, <chars> chars" or "FAILED: <reason>".
`;
}

const sourceAgent = {
  title: 'Fetch the call text into source.md (a Claude Code session with web tools)',
  model: 'sonnet',
  /** Pure: may the engine fetch the call text itself? */
  when(ctx) {
    if (!usesOrc() || process.env.FUND_AGENT_SOURCE === '0') return false;
    if (!/^https?:\/\//.test(String(ctx.app?.call?.fm?.url || ''))) return false;
    if (sourceText(ctx)) return false; // not the template any more: a person pasted something
    return ctx.state?.steps?.source?.status !== 'failed'; // tried and failed once: a person does it
  },
  async run(ctx, step) {
    const fallback = `paste it yourself: ${instructionsOf(step, ctx)}`;
    let reply = '';
    try { reply = String(await ctx.runAI(sourcePrompt(ctx)) ?? ''); } catch (e) {
      return { ok: false, message: `fetch session failed (${String(e.message).split('\n')[0].slice(0, 200)}) — ${fallback}` };
    }
    const n = sourceText(ctx).length;
    if (n < SOURCE_MIN_CHARS) return { ok: false, message: `the session wrote ${n} chars to source.md${/FAILED/.test(reply) ? ` (${reply.trim().split('\n')[0].slice(0, 160)})` : ''} — ${fallback}` };
    return { ok: true, message: `fetched ${n} chars of call text from ${ctx.app.call.fm.url} into source.md — check it against the page` };
  },
};

/** Human steps with an `agent` whose when(ctx) holds become ai steps (same id, done(), instructions). */
async function applyAgents(steps, ctx) {
  const out = [];
  for (const s of steps) {
    let use = false;
    if (s.kind === 'human' && s.agent && typeof s.agent.run === 'function') {
      try { use = !!s.agent.when(ctx) && !(await s.done(ctx))?.done; } catch { use = false; }
    }
    out.push(use ? { ...s, kind: 'ai', title: s.agent.title || s.title, model: s.agent.model || s.model, run: (c) => s.agent.run(c, s), agentic: true } : s);
  }
  return out;
}

export const defaultSteps = [
  {
    id: 'source',
    title: 'Paste the call text into source.md',
    kind: 'human',
    estimate_h: 0.25,
    needs: [],
    optional: false,
    noOverride: true,
    instructions: 'Open the funder\'s call page, copy the full call text, FAQ and rules, and paste them into applications/<slug>/source.md (no personal data, no credentials). Then run: fund done <slug> source',
    // With orc as the AI backend, call.md has a url and source.md is still the template, resolvePipeline
    // turns this into an ai step: a Claude Code session fetches the page with its web tools. Once
    // that fails (state: source failed) the step stays human with the instructions above.
    agent: sourceAgent,
    done(ctx) {
      const n = sourceText(ctx).length;
      return n >= SOURCE_MIN_CHARS
        ? { done: true, reason: `source.md has ${n} chars of call text` }
        : { done: false, reason: n ? `source.md has only ${n} chars of call text (need ${SOURCE_MIN_CHARS}+)` : 'source.md still holds only the template' };
    },
  },
  {
    id: 'extract',
    title: 'Extract criteria, limits and rules into call.md',
    kind: 'ai',
    model: 'haiku', // per-step model (orc sessions only); FUND_AI_MODEL is the default for steps without one
    estimate_h: 0.1,
    needs: ['source'],
    optional: false,
    instructions: 'Check the extracted criteria table against source.md. If the call has no scoring criteria, set "criteria: none" in call.md.',
    done(ctx) {
      if (sourceText(ctx).length < SOURCE_MIN_CHARS) return { done: false, reason: 'source.md has no call text yet' };
      if (ctx.app?.call?.fm?.criteria === 'none') return { done: true, reason: 'criteria: none' };
      const n = realCriteria(ctx).length;
      return n ? { done: true, reason: `${n} criteria in call.md` } : { done: false, reason: 'call.md has no criteria table (or "criteria: none")' };
    },
    async run(ctx) {
      const text = keepFrontmatter(ctx, 'call.md', await askAI(ctx, ctx.core.renderPrompt('extract', ctx.slug)));
      const { fm, body } = ctx.core.parseFrontmatter(text);
      const n = ctx.core.parseCriteria(body).length;
      writeFileSync(join(ctx.dir, 'call.md'), text);
      if (!n && fm.criteria !== 'none') return { ok: false, message: 'wrote call.md but found no "| C1 |" criteria rows — add them, or set "criteria: none" if the call publishes none' };
      return { ok: true, message: `wrote call.md (${n ? `${n} criteria` : 'criteria: none'})` };
    },
    verify(ctx) { const n = realCriteria(ctx).length; return n || ctx.app?.call?.fm?.criteria === 'none' ? { level: 'ok', detail: `${n} criteria` } : { level: 'error', detail: 'no criteria table' }; },
  },
  {
    id: 'fit',
    title: 'Decide GO / NO-GO against the eligibility gates',
    kind: 'ai',
    model: 'haiku',
    estimate_h: 0.1,
    needs: ['extract'],
    optional: false,
    instructions: 'Read fit.md. On NO-GO: park it (fund status <slug> parked). To overrule the AI after checking the gates yourself: fund done <slug> fit --note "why"',
    done(ctx) {
      const v = fitVerdict(ctx);
      if (!v) return { done: false, reason: fileExists(ctx, 'fit.md') ? 'fit.md has no GO / NO-GO / GO-IF verdict' : 'no fit.md yet' };
      if (v === 'NO-GO') return { done: false, reason: 'fit.md says NO-GO — park it or overrule with fund done', nogo: true };
      return { done: true, reason: `verdict ${v}` };
    },
    async run(ctx) {
      if (fitVerdict(ctx) === 'NO-GO' && fileNewer(ctx, 'fit.md', 'call.md')) {
        return { ok: false, message: `fit.md already says NO-GO — park it (fund status ${ctx.slug} parked) or overrule (fund done ${ctx.slug} fit --note "why")` };
      }
      const text = await askAI(ctx, ctx.core.renderPrompt('fit', ctx.slug));
      writeFileSync(join(ctx.dir, 'fit.md'), `# Fit — ${stamp()}\n\n${text.trim()}\n`);
      const v = fitVerdict(ctx);
      if (!v) return { ok: false, message: 'wrote fit.md but found no GO / NO-GO / GO-IF verdict' };
      if (v === 'NO-GO') return { ok: false, message: `fit.md says NO-GO — park it (fund status ${ctx.slug} parked) or overrule (fund done ${ctx.slug} fit --note "why")` };
      return { ok: true, message: `wrote fit.md (${v})` };
    },
    verify(ctx) { const v = fitVerdict(ctx); return { level: v === 'GO' ? 'ok' : v === 'GO-IF' ? 'warn' : 'error', detail: v ? `verdict ${v}` : 'no verdict' }; },
  },
  {
    id: 'draft',
    title: 'Write the first full draft',
    kind: 'ai',
    model: 'opus',
    estimate_h: 0.25,
    needs: ['fit'],
    optional: false,
    done: (ctx) => draftState(ctx),
    async run(ctx) {
      const text = keepFrontmatter(ctx, 'draft.md', await askAI(ctx, ctx.core.renderPrompt('draft', ctx.slug)));
      const n = ctx.core.parseSections(ctx.core.parseFrontmatter(text).body).length;
      if (!n) return { ok: false, message: 'AI draft has no "## " sections — draft.md left unchanged' };
      writeFileSync(join(ctx.dir, 'draft.md'), text);
      setStatus(ctx, ['researching'], 'drafting');
      return { ok: true, message: `wrote draft.md (${n} sections)` };
    },
  },
  {
    id: 'check',
    title: 'Run fund check (facts, citations, limits, banned terms, criteria, track rules)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['draft'],
    optional: false,
    async done(ctx) {
      const errs = await checkErrors(ctx);
      return errs.length ? { done: false, reason: `${errs.length} error(s): ${errs.slice(0, 3).map((e) => e.name).join(', ')}` } : { done: true, reason: 'fund check passes' };
    },
    async run(ctx) {
      const errs = await checkErrors(ctx);
      if (!errs.length) return { ok: true, message: 'fund check passes' };
      const people = errs.filter((e) => NOT_DRAFT_FIXABLE.has(e.name));
      const hint = people.length ? ` — needs a person: ${people.map((e) => e.name).join(', ')}` : ' — the revise step will fix them';
      return { ok: false, message: `${errs.length} error(s): ${errs.map((e) => e.name).join(', ')}${hint}` };
    },
    async verify(ctx) { const errs = await checkErrors(ctx); return errs.length ? { level: 'error', detail: fmtErrors(errs) } : { level: 'ok', detail: 'fund check passes' }; },
  },
  {
    id: 'review',
    title: 'Hostile panel review (appended to review.md)',
    kind: 'ai',
    model: 'opus',
    estimate_h: 0.1,
    needs: ['check'],
    optional: false,
    done(ctx) {
      const r = currentReview(ctx);
      if (r) return { done: true, reason: `round ${r.at}${r.verdict ? ` — ${r.verdict}` : ''}` };
      return { done: false, reason: latestReview(ctx) ? 'draft.md changed after the latest review round' : 'no review round yet' };
    },
    async run(ctx) {
      writeReviewRound(ctx, await askAI(ctx, ctx.core.renderPrompt('review', ctx.slug)));
      const r = latestReview(ctx);
      return { ok: true, message: `appended review round${r?.verdict ? ` (${r.verdict})` : ''}` };
    },
    verify(ctx) { const r = currentReview(ctx); return !r ? { level: 'error', detail: 'no current review' } : { level: r.verdict === 'FUND' ? 'ok' : 'warn', detail: r.verdict || 'no verdict' }; },
  },
  {
    id: 'revise',
    title: 'Revise the draft to fix check errors and review findings',
    kind: 'ai',
    model: 'opus',
    estimate_h: 0.1,
    needs: ['draft'],
    optional: false,
    verifyAfterRun: false, // it succeeds by rewriting draft.md; check and review then re-judge it
    async done(ctx) {
      const cap = Number(ctx.app?.call?.fm?.review_rounds) || 2;
      const runs = ctx.state?.steps?.revise?.runs || 0;
      const errs = fixable(await checkErrors(ctx));
      const r = currentReview(ctx);
      const reviewProblem = r && r.verdict && r.verdict !== 'FUND';
      if (!errs.length && !reviewProblem) return { done: true, reason: 'no open check errors or review findings' };
      if (runs >= cap) return { done: true, reason: `${runs} revise round(s) done (cap ${cap}); what is left goes to the human read` };
      return { done: false, reason: [errs.length && `${errs.length} fixable check error(s)`, reviewProblem && `review verdict ${r.verdict}`].filter(Boolean).join(' + ') };
    },
    async run(ctx) {
      const errs = fixable(await checkErrors(ctx));
      const r = currentReview(ctx);
      const prompt = `${ctx.core.renderPrompt('draft', ctx.slug)}

Fix these problems. The checker and the latest hostile review found them. Keep what works, change
what they name, and output the complete new draft.md, frontmatter included.

Checker errors:
<<<
${errs.length ? fmtErrors(errs) : '(none)'}
>>>

Latest review:
<<<
${r ? r.body.trim() : '(none)'}
>>>
`;
      const text = keepFrontmatter(ctx, 'draft.md', await askAI(ctx, prompt));
      const n = ctx.core.parseSections(ctx.core.parseFrontmatter(text).body).length;
      if (!n) return { ok: false, message: 'AI revision has no "## " sections — draft.md left unchanged' };
      writeFileSync(join(ctx.dir, 'draft.md'), text);
      return { ok: true, message: `rewrote draft.md (${errs.length} check error(s)${r?.verdict ? `, review ${r.verdict}` : ''})` };
    },
  },
  {
    id: 'compliance',
    title: 'Compliance pass against the call\'s formal rules',
    kind: 'ai',
    model: 'sonnet',
    estimate_h: 0.1,
    needs: ['review', 'revise'],
    optional: false,
    done(ctx) {
      const text = read(ctx, 'compliance.md');
      if (!text.trim()) return { done: false, reason: 'no compliance.md yet' };
      if (fileNewer(ctx, 'draft.md', 'compliance.md')) return { done: false, reason: 'draft.md changed after compliance.md' };
      const fails = (text.match(/\bFAIL\b/g) || []).length;
      return { done: true, reason: fails ? `${fails} FAIL row(s) — fix during the human read` : 'all rows PASS' };
    },
    async run(ctx) {
      const text = await askAI(ctx, ctx.core.renderPrompt('compliance', ctx.slug));
      writeFileSync(join(ctx.dir, 'compliance.md'), `# Compliance — ${stamp()}\n\n${text.trim()}\n`);
      const fails = (text.match(/\bFAIL\b/g) || []).length;
      return { ok: true, message: `wrote compliance.md (${fails} FAIL)` };
    },
    verify(ctx) { const f = (read(ctx, 'compliance.md').match(/\bFAIL\b/g) || []).length; return { level: f ? 'warn' : 'ok', detail: `${f} FAIL row(s)` }; },
  },
  {
    id: 'human-read',
    title: 'Read the whole application once, as the panel would',
    kind: 'human',
    estimate_h: 0.5,
    needs: ['compliance'],
    optional: false,
    instructions: 'Read applications/<slug>/draft.md top to bottom next to call.md, the latest round in review.md and compliance.md. Fix anything false, vague or over a limit (then fund check <slug>). When you would sign it: fund done <slug> human-read',
    async done(ctx) {
      const m = humanMark(ctx, 'human-read');
      if (!m) {
        // Preview the strict gates `ready` will apply, so the person fixes them during this read.
        const strict = await strictErrors(ctx);
        return { done: false, reason: strict.length ? `waiting for a person to read it — also fix before ready (strict gates): ${briefErrors(strict)}` : 'waiting for a person to read it (strict gates already pass)' };
      }
      const d = mtime(ctx, 'draft.md');
      if (d != null && d > Date.parse(m.doneAt) + 1000) return { done: false, reason: `draft.md changed after your read (${m.doneAt}) — read the changes`, noOverride: true };
      return { done: true, reason: `read ${m.doneAt}` };
    },
  },
  {
    id: 'ready',
    title: 'Set status ready (strict checks must pass)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['human-read', 'check'],
    optional: false,
    async done(ctx) {
      const s = statusOf(ctx);
      if (SUBMITTED.has(s)) return { done: true, reason: `status ${s}` };
      if (s !== 'ready') return { done: false, reason: `status ${s}` };
      return (await checkPasses(ctx)) ? { done: true, reason: 'status ready, strict checks pass' } : { done: false, reason: 'status ready but fund check fails' };
    },
    async run(ctx) {
      const file = join(ctx.dir, 'call.md');
      const prev = statusOf(ctx);
      ctx.core.updateFrontmatter(file, { status: 'ready' });
      const errs = await checkErrors(ctx);
      if (errs.length) {
        ctx.core.updateFrontmatter(file, { status: prev });
        return { ok: false, message: `strict checks fail, status stays ${prev}: ${briefErrors(errs, 6)} — fix, then fund run ${ctx.slug}` };
      }
      try { ctx.core.buildTracker(); } catch { /* tracker is a convenience */ }
      return { ok: true, message: 'status → ready (strict checks pass)' };
    },
  },
  {
    id: 'submit',
    title: 'Submit on the funder\'s site',
    kind: 'human',
    estimate_h: 0.5,
    needs: ['ready'],
    optional: false,
    instructions: 'Open the funder\'s form (url in call.md), paste each section from draft.md (or the track\'s paste sheet), attach the annexes, press submit and keep the confirmation. Then: fund done <slug> submit',
    done(ctx) {
      const s = statusOf(ctx);
      if (SUBMITTED.has(s)) return { done: true, reason: `status ${s}` };
      return { done: false, reason: 'not submitted yet' };
    },
  },
  {
    id: 'record-submission',
    title: 'Record the submission (status submitted, date, tracker)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['submit'],
    optional: false,
    done(ctx) {
      const s = statusOf(ctx);
      return SUBMITTED.has(s) ? { done: true, reason: `status ${s}${ctx.app?.call?.fm?.submitted ? ` on ${ctx.app.call.fm.submitted}` : ''}` } : { done: false, reason: `status ${s}` };
    },
    async run(ctx) {
      ctx.core.updateFrontmatter(join(ctx.dir, 'call.md'), { status: 'submitted', submitted: ctx.now.toISOString().slice(0, 10), next: 'Wait for the decision; record panel feedback in review.md' });
      try { ctx.core.buildTracker(); } catch { /* tracker is a convenience */ }
      return { ok: true, message: 'status → submitted' };
    },
  },
];

// ---------- helpers for track pipelines ----------

function indexOrThrow(steps, id) {
  const i = steps.findIndex((s) => s.id === id);
  if (i === -1) throw new Error(`pipeline has no step "${id}" (have: ${steps.map((s) => s.id).join(', ')})`);
  return i;
}

export const helpers = {
  replace(steps, id, step) { const i = indexOrThrow(steps, id); const out = [...steps]; out[i] = step; return out; },
  insertAfter(steps, id, ...newSteps) { const i = indexOrThrow(steps, id); return [...steps.slice(0, i + 1), ...newSteps, ...steps.slice(i + 1)]; },
  insertBefore(steps, id, ...newSteps) { const i = indexOrThrow(steps, id); return [...steps.slice(0, i), ...newSteps, ...steps.slice(i)]; },
  remove(steps, id) {
    indexOrThrow(steps, id);
    // Steps that needed the removed one inherit its needs, so ordering stays intact.
    const gone = steps.find((s) => s.id === id);
    return steps.filter((s) => s.id !== id).map((s) => (s.needs?.includes(id) ? { ...s, needs: [...new Set([...s.needs.filter((n) => n !== id), ...(gone.needs || [])])] } : s));
  },
  fileExists,
  fileNewer,
  checkPasses,
  // extras (not in the contract's fixed list, safe to use)
  readFile: read,
  sourceText,
  reviewRounds,
  latestReview,
  currentReview,
  humanMark,
  checkErrors,
  strictErrors,
  keepFrontmatter,
  /** A generic ai step: render a prompt, write the unwrapped answer to `file`. */
  aiStep({ id, title, prompt, file, needs = [], estimate_h = 0.1, optional = false, done }) {
    return {
      id, title, kind: 'ai', estimate_h, needs, optional,
      done: done || ((ctx) => (read(ctx, file).trim() ? { done: true, reason: `${file} exists` } : { done: false, reason: `no ${file} yet` })),
      async run(ctx) {
        writeFileSync(join(ctx.dir, file), await askAI(ctx, ctx.core.renderPrompt(prompt, ctx.slug)));
        return { ok: true, message: `wrote ${file}` };
      },
    };
  },
};

// ---------- resolve ----------

const warned = new Set();
function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn(msg); } }

function cloneSteps(steps) { return steps.map((s) => ({ ...s, needs: [...(s.needs || [])] })); }

function validSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return 'did not return a non-empty array of steps';
  const ids = new Set();
  for (const s of steps) {
    if (!s || typeof s.id !== 'string') return 'a step has no id';
    if (ids.has(s.id)) return `duplicate step id "${s.id}"`;
    ids.add(s.id);
    if (!['auto', 'ai', 'human'].includes(s.kind)) return `step "${s.id}" has kind "${s.kind}"`;
    if (typeof s.done !== 'function') return `step "${s.id}" has no done()`;
    if (s.kind !== 'human' && typeof s.run !== 'function') return `step "${s.id}" (${s.kind}) has no run()`;
  }
  return null;
}


async function resolveSteps({ slug, core, tracks }) {
  let trackId = '';
  try { trackId = core.loadApp(slug).call.fm.track || ''; } catch { return cloneSteps(defaultSteps); }
  if (!tracks) { try { tracks = await core.loadTracks(); } catch { tracks = {}; } }
  const dir = trackId ? tracks?.[trackId]?.dir || null : null;
  const file = dir ? join(dir, 'pipeline.mjs') : null;
  if (!file || !existsSync(file)) return cloneSteps(defaultSteps);
  try {
    const mod = await import(pathToFileURL(file).href);
    if (typeof mod.default !== 'function') throw new Error('must default-export function pipeline(defaultSteps, helpers)');
    const steps = await mod.default(cloneSteps(defaultSteps), helpers);
    const bad = validSteps(steps);
    if (bad) throw new Error(bad);
    return steps;
  } catch (e) {
    warnOnce(`! track ${trackId} pipeline (${file}) failed: ${e.message} — using the default pipeline`);
    return cloneSteps(defaultSteps);
  }
}

export async function resolvePipeline({ slug, core, tracks }) {
  const steps = await resolveSteps({ slug, core, tracks });
  if (!steps.some((s) => s.agent)) return steps;
  let ctx;
  try {
    const dir = core.appDir(slug);
    ctx = { slug, dir, core, tracks, app: core.loadApp(slug), state: readState(dir), now: core.now(), flags: {} };
  } catch { return steps; }
  return applyAgents(steps, ctx);
}

// ---------- ctx ----------

export function makeCtx({ slug, core, runAI, invoke, tracks, flags = {} }) {
  const dir = core.appDir(slug);
  const ctx = {
    slug, dir, core, tracks, flags,
    runAI: runAI || defaultRunAI,
    invoke: invoke || (async (argv) => (await import('../bin/fund.mjs')).main(argv)),
    now: core.now(),
    app: null,
    state: readState(dir),
    refresh() {
      ctx.app = core.loadApp(slug);
      ctx.state = readState(dir);
      ctx.now = core.now();
      return ctx;
    },
  };
  ctx.refresh();
  return ctx;
}

// ---------- evaluate ----------

export async function evaluate(steps, ctx) {
  const rows = [];
  const doneIds = new Set();
  const known = new Set(steps.map((s) => s.id));
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  for (const step of steps) {
    ctx.refresh?.();
    let r;
    try { r = (await step.done(ctx)) || { done: false, reason: 'done() returned nothing' }; } catch (e) { r = { done: false, reason: `done() threw: ${e.message}` }; }
    let done = !!r.done;
    let reason = r.reason || '';
    const mark = humanMark(ctx, step.id);
    if (!done && mark && step.kind !== 'auto' && !step.noOverride && !r.noOverride) {
      done = true;
      reason = `marked done by a person ${mark.doneAt}${mark.last && mark.last !== 'marked done by a person' ? ` — ${mark.last}` : ''}`;
    }
    const blockedBy = (step.needs || []).filter((n) => known.has(n) && !doneIds.has(n) && !byId[n].optional);
    // Evidence only counts once everything it builds on is done (a template draft "passes" check).
    const evidence = done; // detection (or a person's mark) says done, before the needs gate
    if (done && blockedBy.length) { reason = `${reason} — but waits for ${blockedBy.join(', ')}`; done = false; }
    if (done) doneIds.add(step.id);
    // done() may itself say the step cannot proceed (Track D's KILL verdict): blocked, no needs to wait for.
    rows.push({ step, done, reason, blocked: !done && (blockedBy.length > 0 || !!r.blocked), blockedBy: done ? [] : blockedBy, status: '', extra: r, evidence });
  }
  let nextGiven = false;
  for (const row of rows) {
    if (row.done) row.status = 'done';
    else if (row.blocked) row.status = 'blocked';
    else if (row.step.kind === 'human') row.status = 'human';
    else if (!nextGiven) { row.status = 'next'; nextGiven = true; }
    else row.status = 'pending';
  }
  return rows;
}

/** The first row a person or the engine can act on now, or null when everything is done. */
export function firstActionable(rows) { return rows.find((r) => !r.done && !r.blocked) || null; }

// ---------- run ----------

const CLOSED_FOR_RUN = new Set(['parked', 'won', 'lost']);

/** A monitor pipeline (Track E) keeps running while its app is parked: some step opts in with runWhenParked. */
export function isMonitor(steps) { return (steps || []).some((s) => s.runWhenParked); }
const PER_CALL_GUARD = 3; // no step runs more than this many times in one runPipeline call

function simulate(steps, rows, { until, max, noAi }) {
  const done = new Set(rows.filter((r) => r.done).map((r) => r.step.id));
  // Steps whose evidence already exists but wait for an upstream step (an existing draft behind a
  // missing fit.md) will be detected as done once unblocked — they do not run, so do not list them.
  const evidence = new Set(rows.filter((r) => !r.done && r.evidence).map((r) => r.step.id));
  const known = new Set(steps.map((s) => s.id));
  const opt = new Set(steps.filter((s) => s.optional).map((s) => s.id));
  const ran = [];
  if (until && done.has(until)) return { ran, stoppedAt: until, reason: 'until' };
  for (;;) {
    const step = steps.find((s) => !done.has(s.id) && (s.needs || []).every((n) => !known.has(n) || done.has(n) || opt.has(n)));
    if (!step) return { ran, stoppedAt: null, reason: done.size === steps.length ? 'complete' : 'blocked' };
    if (evidence.has(step.id)) { done.add(step.id); if (until && step.id === until) return { ran, stoppedAt: until, reason: 'until' }; continue; }
    if (step.kind === 'human') return { ran, stoppedAt: step.id, reason: 'human' };
    if (noAi && step.kind === 'ai') return { ran, stoppedAt: step.id, reason: 'no-ai' };
    if (max != null && ran.length >= max) return { ran, stoppedAt: step.id, reason: 'max' };
    ran.push({ id: step.id, ok: null, message: `would run (${step.kind})`, seconds: 0 });
    done.add(step.id);
    if (until && step.id === until) return { ran, stoppedAt: until, reason: 'until' };
  }
}

export async function runPipeline(steps, ctx, { until, max, noAi, dry } = {}) {
  ctx.refresh?.();
  if (until && !steps.some((s) => s.id === until)) throw new Error(`no step "${until}" — steps: ${steps.map((s) => s.id).join(', ')}`);
  max = max == null || max === '' ? null : Number(max);
  const status = ctx.app?.call?.fm?.status;
  if (CLOSED_FOR_RUN.has(status) && !(status === 'parked' && isMonitor(steps))) return { ran: [], stoppedAt: null, reason: 'closed', message: `status is ${status} — nothing to run` };

  let rows = await evaluate(steps, ctx);
  if (dry) return { ...simulate(steps, rows, { until, max, noAi }), rows, dry: true };

  const ran = [];
  const failed = new Map(); // id → message, cleared after any success
  const count = {};
  const untilIdx = until ? steps.findIndex((s) => s.id === until) : -1;
  // failures: steps that failed in this run and are still not done at the end — reported even when
  // the run then stopped at a human step, so an AI outage is never hidden behind "waiting for a person".
  const finish = (stoppedAt, reason, message = '') => {
    const failures = [];
    for (const r of ran) if (!r.ok && !rows.find((x) => x.step.id === r.id)?.done && !failures.some((f) => f.id === r.id)) failures.push(r);
    return { ran, stoppedAt, reason, message, rows, failures: failures.filter((f) => !(reason === 'failed' && f.id === stoppedAt)) };
  };

  for (;;) {
    if (until && rows.find((r) => r.step.id === until)?.done) return finish(until, 'until', `${until} is done`);
    const cand = rows.find((r) => !r.done && !r.blocked && !failed.has(r.step.id));
    if (!cand) {
      if (rows.every((r) => r.done)) return finish(null, 'complete', 'every step is done');
      if (failed.size) { const [id, msg] = [...failed][failed.size - 1]; return finish(id, 'failed', msg); }
      const b = rows.find((r) => !r.done);
      return finish(b?.step.id || null, 'blocked', b ? (b.blockedBy.length ? `${b.step.id} waits for ${b.blockedBy.join(', ')}` : `${b.step.id}: ${b.reason}`) : '');
    }
    const step = cand.step;
    if (untilIdx !== -1 && steps.indexOf(step) > untilIdx) return finish(step.id, 'until', `${until} cannot run yet (${rows[untilIdx].reason})`);
    if (step.kind === 'human') return finish(step.id, 'human', cand.reason);
    if (noAi && step.kind === 'ai') return finish(step.id, 'no-ai', `${step.id} needs AI (--no-ai)`);
    if (max != null && ran.length >= max) return finish(step.id, 'max', `stopped after ${max} step(s)`);
    count[step.id] = (count[step.id] || 0) + 1;
    if (count[step.id] > PER_CALL_GUARD) { failed.set(step.id, `${step.id} ran ${PER_CALL_GUARD} times in one run without finishing — needs a person`); rows = await evaluate(steps, ctx); continue; }

    // execute
    const state = readState(ctx.dir);
    const startedAt = new Date().toISOString();
    const prev = state.steps[step.id] || {};
    state.steps[step.id] = { ...prev, status: 'running', startedAt, runs: (prev.runs || 0) + 1 };
    delete state.steps[step.id].human;
    state.history.push({ at: startedAt, step: step.id, event: 'start', message: '' });
    writeState(ctx.dir, state);

    const t0 = performance.now();
    let res;
    // Every AI call of this step is attributable: label "<slug>/<step>", the step's model.
    const baseAI = ctx.runAI;
    ctx.runAI = (prompt, meta = {}) => baseAI(prompt, { label: `${ctx.slug}/${step.id}`, ...(step.model ? { model: step.model } : {}), ...meta });
    try {
      ctx.refresh?.();
      res = (await step.run(ctx)) || { ok: false, message: 'run() returned nothing' };
    } catch (e) {
      res = { ok: false, message: `threw: ${e.message}` };
    } finally {
      ctx.runAI = baseAI;
    }
    let ok = !!res.ok;
    let message = res.message || '';
    // Objective verification: a step is done only when its evidence exists.
    if (ok && step.verifyAfterRun !== false) {
      ctx.refresh?.();
      let d;
      try { d = await step.done(ctx); } catch (e) { d = { done: false, reason: `done() threw: ${e.message}` }; }
      if (!d?.done) { ok = false; message = `${message ? `${message}; ` : ''}but done() still says: ${d?.reason || 'not done'}`; }
    }
    const seconds = Math.round(performance.now() - t0) / 1000; // ms precision: a 40 ms AI stub is not "0 s"

    const after = readState(ctx.dir);
    const at = new Date().toISOString();
    after.steps[step.id] = { ...(after.steps[step.id] || {}), status: ok ? 'done' : 'failed', startedAt, doneAt: at, seconds, last: message };
    after.history.push({ at, step: step.id, event: ok ? 'done' : 'fail', message, seconds });
    writeState(ctx.dir, after);

    ran.push({ id: step.id, ok, message, seconds });
    if (ok) failed.clear(); else failed.set(step.id, message);
    rows = await evaluate(steps, ctx);
  }
}

// ---------- shared presentation (used by plan/run/queue commands) ----------

export function fill(text, slug) { return String(text || '').replace(/<slug>/g, slug); }

/** A step's instructions; `instructions` may be a function (ctx) => string for app-specific commands. */
export function instructionsOf(step, ctx, slug = ctx?.slug) {
  let t = step?.instructions;
  if (typeof t === 'function') { try { t = t(ctx); } catch (e) { t = `(instructions failed: ${e.message})`; } }
  return fill(t || '', slug);
}

/**
 * The command that moves a human step forward — the one to print after "next:" / "then:".
 *   1. step.command (string with <slug>, or (ctx) => string): the action itself (fund a:record …)
 *   2. a noOverride step (fund done alone cannot stand in for the evidence): `fund done <slug> <id>`
 *      when its instructions end with that (it re-checks the evidence), else `fund run <slug>`
 *   3. otherwise `fund done <slug> <id>`
 */
export function humanCommand(slug, row, ctx) {
  const step = row.step || row;
  if (step.command) {
    let c = step.command;
    if (typeof c === 'function') { try { c = c(ctx || { slug, app: null }); } catch { c = ''; } }
    if (c) return fill(c, slug);
  }
  const doneCmd = `fund done ${slug} ${step.id}`;
  if (step.noOverride || row.extra?.noOverride) {
    const text = typeof step.instructions === 'function' ? instructionsOf(step, ctx, slug) : fill(step.instructions || '', slug);
    return text.includes(doneCmd) ? doneCmd : `fund run ${slug}`;
  }
  return doneCmd;
}

export function nextCommand(slug, row, ctx) {
  if (!row) return 'fund queue   # nothing left to do here';
  if (row.step.kind === 'human') return humanCommand(slug, row, ctx);
  return `fund run ${slug}`;
}
