// Track C pipeline — a large scored proposal as one `fund run`.
//
//   source → extract → plan (c:plan) → fit → draft → check → revise (check errors only)
//   → review (c:review, scored) → iterate (fund loop until the score reaches the threshold)
//   → annexes (c:annexes --sync) → compliance → budget-lines (HUMAN while budget.csv is empty)
//   → budget (c:budget) → annex-files (HUMAN for missing files) → human-read → ready
//   → submit (HUMAN) → record-submission
//
// The automatable paperwork (annexes sync, compliance) runs before the first human step so one
// `fund run` does everything a machine can. done() reads files only. Nothing here submits.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scoreState, thresholdOf, analyzeBudget, renderBudgetSummary, annexStatus, parseAnnexes, buildPlan, num } from './track.mjs';

const NOT_DRAFT_FIXABLE = new Set(['status', 'deadline', 'frame', 'frontmatter', 'track', 'facts-file', 'C:plan', 'C:internal-deadline', 'C:budget', 'C:annexes', 'C:score']);
/** A whole number from call.md within [1, max], else the default (a typo must not break or unbound the loop). */
function intIn(v, max, dflt) { const n = num(v); return n !== null && Number.isInteger(n) && n >= 1 ? Math.min(n, max) : dflt; }
const DEFAULT_ITERATE_CAP = 2; // `fund loop` runs per pipeline; each is up to --rounds (3) autofix + review rounds

// ---------- invoke a fund command, capture its output into a one-line message ----------

async function call(ctx, argv) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  const grab = (...a) => lines.push(a.map(String).join(' '));
  console.log = grab; console.error = grab; console.warn = grab;
  let code;
  try { code = await ctx.invoke(argv); } catch (e) { lines.push(`error: ${e.message}`); code = 1; } finally { Object.assign(console, orig); }
  return { code: code ?? 0, lines: lines.join('\n').split('\n').map((l) => l.trim()).filter(Boolean) };
}

function outcome(res, argv, okText) {
  const cmd = `fund ${argv.join(' ')}`;
  if (res.code === 0) return { ok: true, message: okText || `${cmd} ok` };
  const bad = res.lines.filter((l) => /^(✗|!|error|usage|no |[a-z0-9-]+: )/i.test(l)).slice(0, 3);
  const nx = res.lines.filter((l) => l.startsWith('next:')).pop();
  return { ok: false, message: `${cmd} exited ${res.code}: ${(bad.length ? bad : res.lines.slice(-1)).join('; ')}${nx ? ` — ${nx}` : ''}` };
}

// ---------- detectors ----------

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const mtime = (f) => (existsSync(f) ? statSync(f).mtimeMs : null);
const fmOf = (ctx) => ctx.app?.call?.fm || {};

function bufferDays(fm) {
  const b = num(fm.internal_buffer_days);
  return b === null || b < 0 || !Number.isInteger(b) ? 7 : b;
}

function planState(ctx) {
  const fm = fmOf(ctx);
  if (!fm.deadline || fm.deadline === 'rolling' || Number.isNaN(Date.parse(fm.deadline))) return { done: true, skipped: true, reason: `skipped: deadline is "${fm.deadline || 'unset'}" — c:plan needs a fixed ISO deadline` };
  const text = read(join(ctx.dir, 'plan.md'));
  if (!text) return { done: false, reason: 'no plan.md yet' };
  let plan;
  try { plan = buildPlan({ deadline: fm.deadline, bufferDays: bufferDays(fm) }); } catch (e) { return { done: false, reason: e.message }; }
  const m = /Internal deadline: \*\*(\d{4}-\d{2}-\d{2})\*\*/.exec(text);
  if (m && m[1] !== plan.internal) return { done: false, reason: `plan.md is for internal deadline ${m[1]}, call.md now gives ${plan.internal}` };
  return { done: true, reason: `plan.md: internal deadline ${plan.internal}${plan.passed ? ' (passed — submit now)' : ''}` };
}

/** Scored review rounds; `current` is the latest scored round when it is newer than draft.md. */
function scores(ctx) {
  const app = ctx.app;
  const { hist, skipped } = scoreState(app.review || '', app.criteria || [], app.call.fm);
  const latest = hist[hist.length - 1] || null;
  const d = mtime(join(ctx.dir, 'draft.md'));
  const at = latest ? Date.parse(String(latest.title).split(/\s+/)[0]) : NaN;
  const current = latest && d != null && !Number.isNaN(at) && at >= Math.floor(d) ? latest : null;
  return { hist, skipped, latest, current, threshold: thresholdOf(app.call.fm) };
}

const fmt = (n) => (n == null ? '?' : n.toFixed(1));
function weakest(latest) {
  return [...latest.items].sort((a, b) => b.gain - a.gain).slice(0, 2).map((i) => `${i.id} (+${i.gain.toFixed(1)})`).join(', ');
}

async function fixableErrors(ctx, h) {
  return (await h.checkErrors(ctx)).filter((e) => !NOT_DRAFT_FIXABLE.has(e.name));
}

function budgetFile(ctx) { return join(ctx.dir, 'budget.csv'); }
function budgetLines(ctx) {
  const text = read(budgetFile(ctx));
  return text.split(/\r?\n/).slice(1).filter((l) => l.replace(/,/g, '').trim()).length;
}

function annexesSynced(ctx) {
  const file = join(ctx.dir, 'annexes.md');
  if (!existsSync(file)) return { done: false, reason: 'no annexes.md — list one "- [ ] Name — file" per mandatory annex' };
  const items = parseAnnexes(read(file));
  if (!items.length) return { done: false, reason: 'annexes.md lists no annexes' };
  const off = items.filter((a) => a.file && a.ticked !== existsSync(join(ctx.dir, a.file)));
  return off.length ? { done: false, reason: `${off.length} tick(s) out of sync with the files: ${off.map((a) => a.file).join(', ')}` } : { done: true, reason: `${items.length} annex item(s), ticks match the files` };
}

// ---------- the pipeline ----------

export default function pipeline(defaultSteps, h) {
  const by = Object.fromEntries(defaultSteps.map((s) => [s.id, s]));

  const plan = {
    id: 'plan',
    title: 'Backward schedule to the internal deadline (c:plan)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['extract'],
    optional: false,
    done: (ctx) => planState(ctx),
    async run(ctx) {
      const argv = ['c:plan', ctx.slug];
      const res = await call(ctx, argv);
      const line = res.lines.find((l) => /internal deadline/.test(l));
      return outcome(res, argv, line || 'wrote plan.md');
    },
    verify(ctx) { const s = planState(ctx); return { level: s.done ? (s.skipped ? 'warn' : 'ok') : 'error', detail: s.reason }; },
  };

  const revise = {
    ...by.revise,
    title: 'Fix the check errors the checker found (scores are handled by iterate)',
    async done(ctx) {
      const cap = Number(fmOf(ctx).review_rounds) || 2;
      const runs = ctx.state?.steps?.revise?.runs || 0;
      const errs = await fixableErrors(ctx, h);
      if (!errs.length) return { done: true, reason: 'no draft-fixable check errors' };
      if (runs >= cap) return { done: true, reason: `${runs} revise round(s) done (cap ${cap}); ${errs.length} error(s) left for the human read` };
      return { done: false, reason: `${errs.length} fixable check error(s): ${errs.slice(0, 3).map((e) => e.name).join(', ')}` };
    },
  };

  const review = {
    id: 'review',
    title: 'Hostile review in a scorable table (c:review), scored against the threshold',
    kind: 'ai',
    estimate_h: 0.1,
    needs: ['check'],
    optional: false,
    done(ctx) {
      if (!(ctx.app?.criteria || []).length) return { done: false, reason: 'call.md has no criteria table to score against' };
      const s = scores(ctx);
      if (s.skipped) return { done: false, reason: `newest review round "${s.skipped}" has no score table` };
      if (s.current) return { done: true, reason: `scored ${fmt(s.current.total)}/100${s.threshold != null ? ` vs threshold ${s.threshold}` : ''}` };
      return { done: false, reason: s.latest ? 'draft.md changed after the latest scored review' : 'no scored review round yet' };
    },
    async run(ctx) {
      const argv = ['c:review', ctx.slug];
      const res = await call(ctx, argv);
      const line = res.lines.find((l) => /weighted total/.test(l));
      return outcome(res, argv, line ? `review appended — ${line}` : 'review appended to review.md');
    },
    verify(ctx) {
      const s = scores(ctx);
      if (!s.latest) return { level: 'error', detail: 'no scored review round' };
      if (s.threshold == null) return { level: 'warn', detail: `${fmt(s.latest.total)}/100, no threshold in call.md` };
      return { level: s.latest.total >= s.threshold ? 'ok' : 'warn', detail: `${fmt(s.latest.total)}/100 vs threshold ${s.threshold}` };
    },
  };

  const hasLoop = (ctx) => existsSync(join(ctx.core.ROOT, 'lib', 'commands', 'loop.mjs'));

  const iterate = {
    id: 'iterate',
    title: 'Redraft the weakest criteria and re-review until the score reaches the threshold (fund loop)',
    kind: 'ai',
    estimate_h: 0.2,
    needs: ['review'],
    optional: false,
    instructions: 'Runs `fund loop <slug>` (autofix → scored review, up to 3 rounds per run, 2 runs). If the score is still short, improve the weakest criteria by hand or add facts, then fund run <slug>.',
    done(ctx) {
      const s = scores(ctx);
      if (!s.latest) return { done: false, reason: 'no scored review yet' };
      if (s.threshold == null) return { done: true, reason: `no threshold in call.md — nothing to iterate against (${fmt(s.latest.total)}/100)` };
      if (s.latest.total >= s.threshold) return { done: true, reason: `score ${fmt(s.latest.total)} ≥ threshold ${s.threshold}` };
      const cap = intIn(fmOf(ctx).iterate_rounds, 10, DEFAULT_ITERATE_CAP);
      const runs = ctx.state?.steps?.iterate?.runs || 0;
      if (runs >= cap) return { done: true, reason: `${runs} iterate run(s) done (cap ${cap}); score ${fmt(s.latest.total)} < ${s.threshold} — improve ${weakest(s.latest)} by hand; fund check blocks ready until it passes` };
      return { done: false, reason: `score ${fmt(s.latest.total)} < threshold ${s.threshold}; most points in ${weakest(s.latest)}` };
    },
    async run(ctx) {
      const s = scores(ctx);
      if (hasLoop(ctx)) {
        const argv = ['loop', ctx.slug, '--rounds', String(intIn(fmOf(ctx).loop_rounds, 10, 3))];
        if (s.threshold != null) argv.push('--target', String(s.threshold));
        const res = await call(ctx, argv);
        const stop = res.lines.find((l) => l.startsWith('stopped:'));
        return outcome(res, argv, `fund loop ${stop ? `— ${stop}` : 'done'}`);
      }
      // Fallback without `fund loop`: one AI redraft of the section carrying the most missing points.
      const worst = s.latest ? [...s.latest.items].sort((a, b) => b.gain - a.gain)[0] : null;
      const sec = worst ? (ctx.app.sections || []).find((x) => x.criteria.includes(worst.id)) : null;
      const out = ctx.core.unwrapFence(String(await ctx.runAI(ctx.core.renderPrompt('draft', ctx.slug, { section: sec?.title }))));
      const text = h.keepFrontmatter(ctx, 'draft.md', out);
      if (!ctx.core.parseSections(ctx.core.parseFrontmatter(text).body).length) return { ok: false, message: 'AI redraft has no "## " sections — draft.md left unchanged' };
      writeFileSync(join(ctx.dir, 'draft.md'), text);
      return { ok: true, message: `redrafted ${sec ? `"${sec.title}"` : 'the draft'}; review runs again next` };
    },
  };

  const annexes = {
    id: 'annexes',
    title: 'Tick the annexes whose files exist (c:annexes --sync)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['extract'],
    optional: false,
    done: (ctx) => annexesSynced(ctx),
    async run(ctx) {
      const argv = ['c:annexes', ctx.slug, '--sync'];
      const res = await call(ctx, argv);
      const line = res.lines.find((l) => /annex\(es\)/.test(l));
      return outcome(res, argv, line || 'annexes.md synced');
    },
  };

  const compliance = { ...by.compliance, needs: ['iterate'] };

  const budgetLinesStep = {
    id: 'budget-lines',
    title: 'Put the cost lines in budget.csv (and funding_rate / max_grant in call.md)',
    kind: 'human',
    estimate_h: 1,
    needs: [],
    optional: false,
    noOverride: true,
    instructions: 'Fill applications/<slug>/budget.csv, one cost line per row: category,item,cost_eur,eligible (yes/no). Set funding_rate and max_grant in call.md. Budget figures stay out of draft prose. Then: fund run <slug>',
    done(ctx) {
      if (!existsSync(budgetFile(ctx))) return { done: false, reason: 'no budget.csv', noOverride: true };
      const n = budgetLines(ctx);
      return n ? { done: true, reason: `${n} cost line(s) in budget.csv` } : { done: false, reason: 'budget.csv has no cost lines yet', noOverride: true };
    },
  };

  const budget = {
    id: 'budget',
    title: 'Validate budget.csv, compute the grant, write budget-summary.md (c:budget)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['budget-lines'],
    optional: false,
    done(ctx) {
      const b = analyzeBudget(read(budgetFile(ctx)), fmOf(ctx));
      if (b.errors.length) return { done: false, reason: `budget: ${b.errors.slice(0, 2).join('; ')}` };
      const want = renderBudgetSummary(ctx.slug, fmOf(ctx).program || ctx.slug, b);
      const have = read(join(ctx.dir, 'budget-summary.md'));
      return have.trim() === want.trim() ? { done: true, reason: `request ${Math.round(b.requested)} EUR of ${Math.round(b.eligibleTotal)} eligible` } : { done: false, reason: have ? 'budget-summary.md out of date' : 'no budget-summary.md yet' };
    },
    async run(ctx) {
      const argv = ['c:budget', ctx.slug];
      const res = await call(ctx, argv);
      return outcome(res, argv, res.lines[0] || 'wrote budget-summary.md');
    },
    verify(ctx) {
      const b = analyzeBudget(read(budgetFile(ctx)), fmOf(ctx));
      return b.errors.length ? { level: 'error', detail: b.errors.join('; ') } : b.warnings.length ? { level: 'warn', detail: b.warnings.join('; ') } : { level: 'ok', detail: 'budget valid' };
    },
  };

  const annexFiles = {
    id: 'annex-files',
    title: 'Add the annex files that are still missing',
    kind: 'human',
    estimate_h: 1,
    needs: ['annexes'],
    optional: false,
    noOverride: true,
    instructions: 'Add every missing annex file under applications/<slug>/ at the path annexes.md names, and tick the no-file items (e.g. "PIC registered") by hand. Then: fund run <slug> (it re-syncs the ticks)',
    done(ctx) {
      const st = annexStatus(ctx.dir, read(join(ctx.dir, 'annexes.md')));
      if (st.complete) return { done: true, reason: `${st.items.length} annex(es) ticked and present` };
      if (!st.items.length) return { done: false, reason: 'annexes.md lists no annexes', noOverride: true };
      const noFile = st.unticked.filter((a) => !a.file).map((a) => a.name);
      return { done: false, noOverride: true, reason: [st.missing.length && `missing: ${st.missing.map((a) => a.file).join(', ')}`, noFile.length && `tick by hand: ${noFile.join(', ')}`].filter(Boolean).join('; ') || 'annexes not complete' };
    },
  };

  const humanRead = {
    ...by['human-read'],
    needs: ['compliance', 'budget', 'annex-files'],
    instructions: 'Read applications/<slug>/draft.md end to end as the panel would, next to call.md, the latest scored round in review.md (fund c:score <slug>), compliance.md and budget-summary.md. Fix anything false, vague or over a limit. When you would sign it: fund done <slug> human-read',
  };

  const submit = {
    ...by.submit,
    title: 'Upload the proposal to the funder\'s portal and submit',
    instructions: 'In the funder\'s portal (url in call.md) paste or upload draft.md\'s sections, the budget-summary.md figures and every file in annexes.md. Press submit yourself before the internal deadline in plan.md and keep the confirmation. Then: fund done <slug> submit',
  };

  return [by.source, by.extract, plan, by.fit, by.draft, by.check, revise, review, iterate, annexes, compliance, budgetLinesStep, budget, annexFiles, humanRead, by.ready, submit, by['record-submission']];
}
